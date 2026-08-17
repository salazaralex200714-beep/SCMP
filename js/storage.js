/* ============================================================
   storage.js — Capa de persistencia (versión Supabase)
   ------------------------------------------------------------
   Toda la aplicación sigue hablando con los datos ÚNICAMENTE a
   través de este módulo (Storage.Casos, Storage.Usuarios, etc.)
   con exactamente los mismos nombres de función y de campos que
   antes — por eso el resto de pantallas (casos.js, dashboard.js…)
   casi no tuvieron que cambiar. Por dentro, ahora todo esto habla
   con la base de datos real en Supabase en vez de LocalStorage.
   ============================================================ */

const Storage = (() => {

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const ESTADOS = ['Nuevo', 'En investigación', 'Pendiente de información', 'En seguimiento', 'Escalado', 'Resuelto', 'Cerrado'];
  const ESTADOS_EDITABLES = ['En investigación', 'Pendiente de información', 'En seguimiento', 'Escalado'];
  const PRIORIDADES = ['Alta', 'Media', 'Baja'];

  const PAISES_MONEDA = {
    'Guatemala': { codigo: 'GTQ', simbolo: 'Q' },
    'Nicaragua': { codigo: 'NIO', simbolo: 'C$' },
    'Honduras': { codigo: 'HNL', simbolo: 'L' },
    'El Salvador': { codigo: 'USD', simbolo: '$' },
    'República Dominicana': { codigo: 'DOP', simbolo: 'RD$' },
    'Panamá': { codigo: 'PAB', simbolo: 'B/.' }
  };
  function monedaDePais(pais) { return PAISES_MONEDA[pais] || { codigo: 'GTQ', simbolo: 'Q' }; }

  function emailDeUsuario(usuario) { return `${usuario.toLowerCase()}@scmp.local`; }

  // ---------------- Traducción entre columnas de la BD (snake_case) y el formato que usa la app (camelCase) ----------------
  function perfilAUsuario(p) {
    if (!p) return null;
    return { id: p.id, nombre: p.nombre, usuario: p.usuario, rol: p.rol, pais: p.pais, email: p.email, activo: p.activo, creado: p.creado_en };
  }
  function filaACaso(c, evidencias = [], timeline = [], notas = []) {
    return {
      id: c.id, numero: c.numero, cliente: c.cliente, telefono: c.telefono, saldoPendiente: c.saldo_pendiente,
      zona: c.zona, gerenteZona: c.gerente_zona, codigoEBA: c.codigo_rep, pdActual: c.pd_actual,
      campaña: c.campana, sector: c.sector, fechaContacto: c.fecha_contacto, telefonoEBA: c.telefono_rep,
      estado: c.estado, prioridad: c.prioridad, usuarioCreador: c.usuario_creador, creadoPor: c.creado_por,
      fechaCreacion: c.fecha_creacion, ultimaModificacion: c.ultima_modificacion, fechaCierre: c.fecha_cierre,
      versionRepresentante: c.version_representante, versionEBA: c.version_eba, observaciones: c.observaciones,
      analisis: c.analisis, conclusion: c.conclusion, accionTomada: c.accion_tomada,
      moneda: { codigo: c.moneda_codigo, simbolo: c.moneda_simbolo },
      archivado: c.archivado,
      comentarioGerenteDivision: c.comentario_gerente_division,
      telefonosAdicionales: c.telefonos_adicionales || [],
      telefonoGerenteZona: c.telefono_gerente_zona,
      evidencias: evidencias.map(e => ({ id: e.id, nombre: e.nombre, tamaño: e.tamano, tipo: e.tipo, storagePath: e.storage_path, fecha: e.fecha })),
      timeline: timeline.map(t => ({ id: t.id, usuario: t.usuario, fecha: t.fecha, accion: t.accion, estadoAnterior: t.estado_anterior, estadoNuevo: t.estado_nuevo })),
      notasInternas: notas.map(n => ({ id: n.id, usuario: n.usuario, fecha: n.fecha, texto: n.texto }))
    };
  }
  async function cargarRelacionadosDeCaso(casoId) {
    const [ev, tl, nt] = await Promise.all([
      sb.from('evidencias').select('*').eq('caso_id', casoId).order('fecha', { ascending: true }),
      sb.from('timeline').select('*').eq('caso_id', casoId).order('fecha', { ascending: true }),
      sb.from('notas_internas').select('*').eq('caso_id', casoId).order('fecha', { ascending: true })
    ]);
    return { evidencias: ev.data || [], timeline: tl.data || [], notas: nt.data || [] };
  }
  async function casoCompletoDesdeFila(fila) {
    const { evidencias, timeline, notas } = await cargarRelacionadosDeCaso(fila.id);
    return filaACaso(fila, evidencias, timeline, notas);
  }

  // ================= SESIÓN =================
  const Session = {
    async get() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const uid = data.session.user.id;
      const { data: perfil } = await sb.from('perfiles').select('*').eq('id', uid).maybeSingle();
      return perfilAUsuario(perfil);
    },
    async clear() { await sb.auth.signOut(); return true; },
    async isAuthenticated() { return !!(await Session.get()); }
  };

  // ================= USUARIOS =================
  const Usuarios = {
    async getAll() {
      const { data } = await sb.from('perfiles').select('*').order('nombre', { ascending: true });
      return (data || []).map(perfilAUsuario);
    },
    async getById(id) {
      const { data } = await sb.from('perfiles').select('*').eq('id', id).maybeSingle();
      return perfilAUsuario(data);
    },
    async getByUsuario(usuario) {
      const { data } = await sb.from('perfiles').select('*').ilike('usuario', usuario).maybeSingle();
      return perfilAUsuario(data);
    },
    async create({ nombre, usuario, email, pais, rol, password }) {
      // Se usa un cliente temporal (sin guardar sesión) para no cerrar la sesión
      // del Supervisor que está creando el usuario.
      const temp = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: 'scmp-temp-signup' }
      });
      const { data, error } = await temp.auth.signUp({
        email: emailDeUsuario(usuario),
        password,
        options: { data: { nombre, usuario, rol, pais } }
      });
      if (error) throw error;
      // El correo real (opcional) se guarda aparte, ya con el perfil creado por el trigger.
      // La cuenta se activa aquí, en el mismo paso — solo el flujo oficial (con un
      // Supervisor autenticado de por medio) llega a activarla; una cuenta creada
      // llamando la API directamente (sin pasar por este flujo) se queda inactiva.
      const patchInicial = { activo: true };
      if (email) patchInicial.email = email;
      await sb.from('perfiles').update(patchInicial).eq('id', data.user.id);
      await Auditoria.log({ tipo: 'usuario', refId: data.user?.id, accion: `Usuario "${nombre}" creado` });
      return Usuarios.getById(data.user.id);
    },
    async update(id, data) {
      const patch = {};
      if (data.nombre !== undefined) patch.nombre = data.nombre;
      if (data.email !== undefined) patch.email = data.email;
      if (data.pais !== undefined) patch.pais = data.pais;
      if (data.rol !== undefined) patch.rol = data.rol;
      if (data.activo !== undefined) patch.activo = data.activo;
      if (Object.keys(patch).length) {
        const { error } = await sb.from('perfiles').update(patch).eq('id', id);
        if (error) throw error;
      }
      // Cambiar la contraseña solo es posible para el propio usuario (limitación normal
      // de Supabase Auth por seguridad: un Supervisor no puede leer ni fijar la contraseña
      // de otra persona sin un backend propio).
      if (data.password) {
        const { data: sess } = await sb.auth.getSession();
        if (sess.session && sess.session.user.id === id) {
          const { error } = await sb.auth.updateUser({ password: data.password });
          if (error) throw error;
        }
      }
      await Auditoria.log({ tipo: 'usuario', refId: id, accion: `Usuario actualizado` });
      return Usuarios.getById(id);
    },
    async remove(id) { return Usuarios.update(id, { activo: false }); },
    // Solo un Supervisor puede usar esto (la base de datos lo verifica también, doblemente seguro).
    async restablecerPassword(usuarioLogin, nuevaPassword) {
      const { error } = await sb.rpc('reset_user_password', { target_usuario: usuarioLogin, nueva_password: nuevaPassword });
      if (error) throw error;
      await Auditoria.log({ tipo: 'usuario', accion: `Contraseña restablecida para "${usuarioLogin}" por un Supervisor` });
      return true;
    }
  };

  // ================= CASOS =================
  async function nextCaseNumber() {
    const { data } = await sb.from('casos').select('numero').order('numero', { ascending: false }).limit(1);
    const ultimo = data && data[0] ? parseInt((data[0].numero || '').replace('SCMP-', ''), 10) : 0;
    return `SCMP-${String((isNaN(ultimo) ? 0 : ultimo) + 1).padStart(4, '0')}`;
  }

  const Casos = {
    async getAll() {
      const { data, error } = await sb.from('casos').select('*').eq('archivado', false).order('fecha_creacion', { ascending: false });
      if (error) throw error;
      return Promise.all((data || []).map(casoCompletoDesdeFila));
    },
    async getAllIncludingArchived() {
      const { data, error } = await sb.from('casos').select('*').order('fecha_creacion', { ascending: false });
      if (error) throw error;
      return Promise.all((data || []).map(casoCompletoDesdeFila));
    },
    async getById(id) {
      const { data, error } = await sb.from('casos').select('*').eq('id', id).maybeSingle();
      if (error || !data) return null;
      return casoCompletoDesdeFila(data);
    },
    nextCaseNumber, // ahora es async (ver casos.js)

    async create(data, usuario) {
      const numero = await nextCaseNumber();
      const creadorFull = await Usuarios.getById(usuario.id);
      const moneda = monedaDePais(creadorFull?.pais);

      const fila = {
        numero, estado: 'En investigación',
        cliente: data.cliente, telefono: data.telefono, saldo_pendiente: data.saldoPendiente || null,
        zona: data.zona, gerente_zona: data.gerenteZona, codigo_rep: data.codigoEBA, pd_actual: data.pdActual,
        campana: data.campaña, sector: data.sector, fecha_contacto: data.fechaContacto || null, telefono_rep: data.telefonoEBA,
        prioridad: data.prioridad || 'Media',
        usuario_creador: usuario.nombre, creado_por: usuario.id,
        moneda_codigo: moneda.codigo, moneda_simbolo: moneda.simbolo,
        version_representante: '', version_eba: '', observaciones: '', analisis: '', conclusion: '', accion_tomada: '',
        comentario_gerente_division: data.comentarioGerenteDivision || '',
        telefonos_adicionales: data.telefonosAdicionales || [],
        telefono_gerente_zona: data.telefonoGerenteZona || null,
        archivado: false
      };
      const { data: creado, error } = await sb.from('casos').insert(fila).select().single();
      if (error) throw error;

      await sb.from('timeline').insert({ caso_id: creado.id, usuario: usuario.nombre, accion: 'Caso creado', estado_anterior: null, estado_nuevo: 'En investigación' });
      await Auditoria.log({ tipo: 'caso', refId: creado.id, accion: `Caso ${creado.numero} creado por ${usuario.nombre}` });
      return casoCompletoDesdeFila(creado);
    },

    async update(id, data, usuario, opts = {}) {
      const { data: actual } = await sb.from('casos').select('*').eq('id', id).maybeSingle();
      if (!actual) return null;

      const patch = { ultima_modificacion: new Date().toISOString() };
      const map = {
        cliente: 'cliente', telefono: 'telefono', saldoPendiente: 'saldo_pendiente', zona: 'zona',
        gerenteZona: 'gerente_zona', codigoEBA: 'codigo_rep', pdActual: 'pd_actual', campaña: 'campana',
        sector: 'sector', fechaContacto: 'fecha_contacto', telefonoEBA: 'telefono_rep', estado: 'estado',
        prioridad: 'prioridad', versionRepresentante: 'version_representante', versionEBA: 'version_eba',
        observaciones: 'observaciones', analisis: 'analisis', conclusion: 'conclusion', accionTomada: 'accion_tomada',
        archivado: 'archivado', comentarioGerenteDivision: 'comentario_gerente_division',
        telefonosAdicionales: 'telefonos_adicionales', telefonoGerenteZona: 'telefono_gerente_zona'
      };
      Object.entries(data).forEach(([k, v]) => { if (map[k]) patch[map[k]] = v; });

      let estadoNuevo = data.estado;
      let estadoCambio = !!(data.estado && data.estado !== actual.estado);

      // Avance automático por etapas: cada acción real del caso (guardar comparativa,
      // guardar análisis) empuja el estado hacia adelante — nunca lo retrocede si el
      // caso ya iba más avanzado (ej. si ya estaba Escalado, no vuelve a Pendiente).
      const RANGO_ETAPA = { 'Nuevo': 0, 'En investigación': 1, 'Pendiente de información': 2, 'En seguimiento': 3, 'Escalado': 4, 'Resuelto': 5, 'Cerrado': 5 };
      if (!estadoCambio && opts.avanzarA && (RANGO_ETAPA[actual.estado] ?? 0) < RANGO_ETAPA[opts.avanzarA]) {
        estadoNuevo = opts.avanzarA;
        patch.estado = estadoNuevo;
        estadoCambio = true;
        opts.accionLabel = opts.accionLabel || `Estado actualizado automáticamente a "${estadoNuevo}"`;
      }

      if (estadoCambio && (estadoNuevo === 'Cerrado' || estadoNuevo === 'Resuelto') && !actual.fecha_cierre) {
        patch.fecha_cierre = new Date().toISOString();
      }

      const { data: actualizado, error } = await sb.from('casos').update(patch).eq('id', id).select().single();
      if (error) throw error;

      if (estadoCambio) {
        await sb.from('timeline').insert({ caso_id: id, usuario: usuario.nombre, accion: opts.accionLabel || 'Cambio de estado', estado_anterior: actual.estado, estado_nuevo: estadoNuevo });
      } else if (opts.timelineNote) {
        await sb.from('timeline').insert({ caso_id: id, usuario: usuario.nombre, accion: opts.timelineNote, estado_anterior: actual.estado, estado_nuevo: actual.estado });
      }
      await Auditoria.log({ tipo: 'caso', refId: id, accion: `Caso ${actualizado.numero} modificado por ${usuario.nombre}` });
      return casoCompletoDesdeFila(actualizado);
    },

    async addEvidencia(id, evidencia, usuario) {
      const { data: ev, error } = await sb.from('evidencias').insert({
        caso_id: id, nombre: evidencia.nombre, tamano: evidencia.tamaño, tipo: evidencia.tipo, storage_path: evidencia.storagePath
      }).select().single();
      if (error) throw error;
      await sb.from('timeline').insert({ caso_id: id, usuario: usuario.nombre, accion: `Evidencia agregada: ${evidencia.nombre}` });
      await Casos.update(id, {}, usuario, {});
      return ev;
    },
    async removeEvidencia(id, evId) {
      const { data: ev } = await sb.from('evidencias').select('storage_path').eq('id', evId).maybeSingle();
      if (ev?.storage_path) await sb.storage.from('evidencias').remove([ev.storage_path]);
      const { error } = await sb.from('evidencias').delete().eq('id', evId);
      if (error) throw error;
      return true;
    },

    async addNota(id, texto, usuario) {
      const { data, error } = await sb.from('notas_internas').insert({ caso_id: id, usuario: usuario.nombre, texto }).select().single();
      if (error) throw error;
      await Casos.update(id, {}, usuario, {});
      return data;
    },

    async archive(id, usuario) {
      return Casos.update(id, { estado: 'Cerrado', archivado: true }, usuario, { timelineNote: 'Caso archivado' });
    },

    // Sube el archivo de evidencia al Storage de Supabase y devuelve la ruta guardada
    async subirArchivoEvidencia(casoId, file) {
      const ruta = `${casoId}/${Date.now()}_${file.name}`;
      const { error } = await sb.storage.from('evidencias').upload(ruta, file);
      if (error) throw error;
      return ruta;
    },
    async urlEvidencia(storagePath) {
      const { data, error } = await sb.storage.from('evidencias').createSignedUrl(storagePath, 3600);
      if (error) return null;
      return data.signedUrl;
    }
  };

  // ================= AUDITORÍA =================
  const Auditoria = {
    async log({ tipo, refId, accion }) {
      const user = await Session.get();
      await sb.from('auditoria').insert({ tipo, ref_id: refId || null, accion, usuario: user?.nombre || 'Sistema' });
      return true;
    },
    async getAll(limit = 50) {
      const { data } = await sb.from('auditoria').select('*').order('fecha', { ascending: false }).limit(limit);
      return data || [];
    }
  };

  // ================= CATÁLOGO DE REPRESENTANTES (REP) =================
  const CatalogoRep = {
    async buscar(codigo) {
      if (!codigo) return null;
      const { data } = await sb.from('catalogo_rep').select('*').ilike('codigo_rep', codigo.trim()).maybeSingle();
      if (!data) return null;
      return {
        codigoRep: data.codigo_rep, zona: data.zona, gerenteZona: data.gerente_zona, telefonoRep: data.telefono_rep,
        sector: data.sector, pdActual: data.pd_actual, saldoLocal: data.saldo_local, nombreRep: data.nombre_rep,
        telefonoGerenteZona: data.telefono_gerente_zona, campaña: data.campana
      };
    },
    async getAll() {
      const { data } = await sb.from('catalogo_rep').select('*').order('codigo_rep', { ascending: true });
      return (data || []).map(d => ({
        codigoRep: d.codigo_rep, zona: d.zona, gerenteZona: d.gerente_zona, telefonoRep: d.telefono_rep,
        sector: d.sector, pdActual: d.pd_actual, saldoLocal: d.saldo_local, nombreRep: d.nombre_rep,
        telefonoGerenteZona: d.telefono_gerente_zona, campaña: d.campana, actualizado: d.actualizado_en
      }));
    },
    async upsertMuchos(filas) {
      // filas: [{ codigoRep, zona, gerenteZona, telefonoRep, sector, pdActual, saldoLocal, nombreRep, telefonoGerenteZona, campaña }, ...]
      const payload = filas.filter(f => f.codigoRep).map(f => ({
        codigo_rep: String(f.codigoRep).trim(), zona: f.zona || null, gerente_zona: f.gerenteZona || null,
        telefono_rep: f.telefonoRep || null, sector: f.sector || null, pd_actual: f.pdActual || null,
        saldo_local: f.saldoLocal || null, nombre_rep: f.nombreRep || null,
        telefono_gerente_zona: f.telefonoGerenteZona || null, campana: f.campaña || null, actualizado_en: new Date().toISOString()
      }));
      if (!payload.length) return 0;
      const { error } = await sb.from('catalogo_rep').upsert(payload, { onConflict: 'codigo_rep' });
      if (error) throw error;
      await Auditoria.log({ tipo: 'catalogo', accion: `Catálogo de REP actualizado: ${payload.length} registro(s)` });
      return payload.length;
    },
    async eliminar(codigo) {
      const { error } = await sb.from('catalogo_rep').delete().eq('codigo_rep', codigo);
      if (error) throw error;
      return true;
    }
  };

  return { ESTADOS, ESTADOS_EDITABLES, PRIORIDADES, PAISES_MONEDA, monedaDePais, Session, Usuarios, Casos, Auditoria, CatalogoRep };
})();
