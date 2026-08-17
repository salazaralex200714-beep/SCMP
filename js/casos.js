/* ============================================================
   casos.js — Listado / historial de casos con filtros, búsqueda
   instantánea, orden por columnas, paginación y alta de casos.
   ============================================================ */

let CURRENT_USER = null;
let CURRENT_USER_FULL = null;
let COMPARATIVA_DIRTY = false;
let CURRENT_CASO = null;
let ALL_CASOS = [];
let VIEW = [];
let PAGE = 1;
const PAGE_SIZE = 8;
let SORT = { field: 'fechaCreacion', dir: 'desc' };
let FILTERS = { estado: '', prioridad: '', zona: '', campaña: '', gerenteZona: '', usuarioCreador: '', fecha: '', q: '' };

document.addEventListener('DOMContentLoaded', async () => {
  // casos.js sirve tanto a casos.html (listado) como a detalle-caso.html (ficha),
  // para no duplicar lógica de acceso a datos ni de guardia de sesión/rol.
  if (document.getElementById('casos-tbody')) return initListPage();
  if (document.getElementById('detail-root')) return initDetailPage();
});

async function initListPage() {
  CURRENT_USER = await App.mount({ active: 'casos', title: 'Casos', subtitle: 'Listado e historial' });
  if (!CURRENT_USER) return;
  CURRENT_USER_FULL = await Storage.Usuarios.getById(CURRENT_USER.id);

  const params = new URLSearchParams(location.search);
  if (params.get('q')) FILTERS.q = params.get('q');

  await loadCasos();
  buildFilterOptions();
  bindEvents();
  applyFiltersAndRender();

  if (params.get('nuevo') === '1') await openCaseModal();
}

async function loadCasos(includeArchived = false) {
  const all = includeArchived ? await Storage.Casos.getAllIncludingArchived() : await Storage.Casos.getAll();
  // Un Agente sólo puede consultar los casos que él mismo creó
  ALL_CASOS = CURRENT_USER.rol === 'Agente'
    ? all.filter(c => c.creadoPor === CURRENT_USER.id)
    : all;
}

function buildFilterOptions() {
  const setOptions = (id, values) => {
    const el = document.getElementById(id);
    const unique = [...new Set(values.filter(Boolean))].sort();
    el.innerHTML = `<option value="">${el.dataset.placeholder}</option>` + unique.map(v => `<option value="${Utils.escapeHtml(v)}">${Utils.escapeHtml(v)}</option>`).join('');
  };
  setOptions('f-zona', ALL_CASOS.map(c => c.zona));
  setOptions('f-campaña', ALL_CASOS.map(c => c.campaña));
  setOptions('f-gerente', ALL_CASOS.map(c => c.gerenteZona));
  setOptions('f-agente', ALL_CASOS.map(c => c.usuarioCreador));
}

function bindEvents() {
  document.getElementById('search-input').addEventListener('input', Utils.debounce((e) => {
    FILTERS.q = e.target.value.trim().toLowerCase();
    PAGE = 1; applyFiltersAndRender();
  }, 200));

  ['estado', 'prioridad', 'zona', 'campaña', 'gerente', 'fecha'].forEach(key => {
    const el = document.getElementById(`f-${key}`);
    if (!el) return;
    el.addEventListener('change', () => {
      const map = { gerente: 'gerenteZona' };
      FILTERS[map[key] || key] = el.value;
      PAGE = 1; applyFiltersAndRender();
    });
  });
  const agenteEl = document.getElementById('f-agente');
  if (agenteEl) agenteEl.addEventListener('change', () => { FILTERS.usuarioCreador = agenteEl.value; PAGE = 1; applyFiltersAndRender(); });

  const archivedToggle = document.getElementById('f-show-archived');
  if (archivedToggle) archivedToggle.addEventListener('change', async () => {
    await loadCasos(archivedToggle.checked);
    buildFilterOptions();
    PAGE = 1; applyFiltersAndRender();
  });

  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    FILTERS = { estado: '', prioridad: '', zona: '', campaña: '', gerenteZona: '', usuarioCreador: '', fecha: '', q: '' };
    document.querySelectorAll('.filter-bar select, .filter-bar input').forEach(el => el.value = '');
    document.getElementById('search-input').value = '';
    PAGE = 1; applyFiltersAndRender();
  });

  document.querySelectorAll('.data-table thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      SORT.dir = (SORT.field === field && SORT.dir === 'asc') ? 'desc' : 'asc';
      SORT.field = field;
      applyFiltersAndRender();
    });
  });

  document.getElementById('btn-new-case').addEventListener('click', () => { openCaseModal(); });

  // Menú de exportación
  document.getElementById('btn-export').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('export-menu').classList.toggle('open-menu');
  });
  document.addEventListener('click', () => document.getElementById('export-menu').classList.remove('open-menu'));
  document.getElementById('exp-todos').addEventListener('click', () => ExcelExport.exportCasos(ALL_CASOS, 'SCMP_todos_los_casos'));
  document.getElementById('exp-filtrados').addEventListener('click', () => ExcelExport.exportCasos(VIEW, 'SCMP_casos_filtrados'));
  document.getElementById('exp-pdf-todos').addEventListener('click', () => PdfExport.exportListado(ALL_CASOS, 'Listado completo de casos', CURRENT_USER));
  document.getElementById('exp-pdf-filtrados').addEventListener('click', () => PdfExport.exportListado(VIEW, 'Listado de casos filtrados', CURRENT_USER));

  document.getElementById('case-form').addEventListener('submit', handleCreateCase);
  document.getElementById('modal-case-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-case-backdrop') Utils.closeModal('modal-case-backdrop');
  });

  // Búsqueda automática en el catálogo de REP al escribir el código
  document.getElementById('f-codigo-rep').addEventListener('blur', async (e) => {
    const codigo = e.target.value.trim();
    const hint = document.getElementById('rep-catalogo-hint');
    if (!codigo) { hint.textContent = ''; return; }
    const encontrado = await Storage.CatalogoRep.buscar(codigo);
    const form = document.getElementById('case-form');
    if (encontrado) {
      if (encontrado.zona) form.elements.zona.value = encontrado.zona;
      if (encontrado.gerenteZona) form.elements.gerenteZona.value = encontrado.gerenteZona;
      if (encontrado.telefonoGerenteZona) form.elements.telefonoGerenteZona.value = encontrado.telefonoGerenteZona;
      if (encontrado.telefonoRep) form.elements.telefonoEBA.value = encontrado.telefonoRep;
      if (encontrado.sector) form.elements.sector.value = encontrado.sector;
      if (encontrado.campaña) form.elements.campaña.value = encontrado.campaña;
      if (encontrado.pdActual) form.elements.pdActual.value = encontrado.pdActual;
      if (encontrado.saldoLocal) {
        const saldoLimpio = String(encontrado.saldoLocal).replace(/[^\d.]/g, '');
        if (saldoLimpio) form.elements.saldoPendiente.value = saldoLimpio;
      }
      hint.textContent = '✓ Datos completados automáticamente desde el catálogo de REP.';
      hint.style.color = 'var(--green)';
    } else {
      hint.textContent = 'Código no encontrado en el catálogo — puedes llenar los datos manualmente.';
      hint.style.color = 'var(--text-400)';
    }
  });

  // Teléfonos adicionales (lista dinámica)
  document.getElementById('btn-add-telefono').addEventListener('click', () => addTelefonoAdicionalInput());
}

function addTelefonoAdicionalInput(valor = '') {
  const box = document.getElementById('telefonos-adicionales-list');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
  row.innerHTML = `<input type="text" class="telefono-adicional-input" value="${Utils.escapeHtml(valor)}" placeholder="Ej. 5555-1234" style="flex:1;">
    <button type="button" class="btn btn-ghost btn-sm" data-remove-tel>✕</button>`;
  row.querySelector('[data-remove-tel]').addEventListener('click', () => row.remove());
  box.appendChild(row);
}

function applyFiltersAndRender() {
  let rows = [...ALL_CASOS];

  if (FILTERS.q) {
    rows = rows.filter(c =>
      (c.numero || '').toLowerCase().includes(FILTERS.q) ||
      (c.codigoEBA || '').toLowerCase().includes(FILTERS.q) ||
      (c.zona || '').toLowerCase().includes(FILTERS.q) ||
      (c.campaña || '').toLowerCase().includes(FILTERS.q) ||
      (c.versionRepresentante || '').toLowerCase().includes(FILTERS.q) ||
      (c.versionEBA || '').toLowerCase().includes(FILTERS.q) ||
      (c.observaciones || '').toLowerCase().includes(FILTERS.q) ||
      (c.analisis || '').toLowerCase().includes(FILTERS.q) ||
      (c.conclusion || '').toLowerCase().includes(FILTERS.q) ||
      (c.accionTomada || '').toLowerCase().includes(FILTERS.q)
    );
  }
  ['estado', 'prioridad', 'zona', 'campaña', 'gerenteZona', 'usuarioCreador'].forEach(f => {
    if (FILTERS[f]) rows = rows.filter(c => c[f] === FILTERS[f]);
  });
  if (FILTERS.fecha) rows = rows.filter(c => (c.fechaCreacion || '').slice(0, 10) === FILTERS.fecha);

  rows.sort((a, b) => {
    let va = a[SORT.field] || '', vb = b[SORT.field] || '';
    if (SORT.field.toLowerCase().includes('fecha')) { va = new Date(va || 0).getTime(); vb = new Date(vb || 0).getTime(); }
    if (va < vb) return SORT.dir === 'asc' ? -1 : 1;
    if (va > vb) return SORT.dir === 'asc' ? 1 : -1;
    return 0;
  });

  VIEW = rows;
  renderActiveFilterChips();
  renderTable();
}

function renderActiveFilterChips() {
  const labels = { estado: 'Estado', prioridad: 'Prioridad', zona: 'Zona', campaña: 'Campaña', gerenteZona: 'Gerente', usuarioCreador: 'Agente', fecha: 'Fecha' };
  const chips = Object.entries(FILTERS).filter(([k, v]) => v && k !== 'q').map(([k, v]) => `
    <div class="chip-filter">${labels[k]}: ${Utils.escapeHtml(v)} <span class="x" data-clear="${k}">✕</span></div>`).join('');
  const box = document.getElementById('active-chips');
  box.innerHTML = chips;
  box.querySelectorAll('[data-clear]').forEach(x => x.addEventListener('click', () => {
    const key = x.dataset.clear;
    FILTERS[key] = '';
    const idMap = { gerenteZona: 'f-gerente', usuarioCreador: 'f-agente' };
    const el = document.getElementById(idMap[key] || `f-${key}`);
    if (el) el.value = '';
    applyFiltersAndRender();
  }));
}

const PRI_CLASS = { Alta: 'row-alta', Media: 'row-media', Baja: 'row-baja' };
const ST_CLASS = {
  'Nuevo': 'st-nuevo', 'En investigación': 'st-investigacion', 'Pendiente de información': 'st-pendiente',
  'En seguimiento': 'st-seguimiento', 'Escalado': 'st-escalado', 'Resuelto': 'st-resuelto', 'Cerrado': 'st-cerrado'
};

function esCasoEstancado(c) {
  if (c.estado === 'Cerrado' || c.estado === 'Resuelto') return false;
  const dias = Math.floor((Date.now() - new Date(c.ultimaModificacion).getTime()) / 86400000);
  return dias >= 5;
}

function renderTable() {
  const tbody = document.getElementById('casos-tbody');
  const total = VIEW.length;
  const start = (PAGE - 1) * PAGE_SIZE;
  const pageRows = VIEW.slice(start, start + PAGE_SIZE);

  document.querySelectorAll('.data-table thead th[data-sort]').forEach(th => {
    th.querySelector('.sort-arrow')?.remove();
    if (th.dataset.sort === SORT.field) th.insertAdjacentHTML('beforeend', `<span class="sort-arrow">${SORT.dir === 'asc' ? '▲' : '▼'}</span>`);
  });

  if (!pageRows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>
      <h4>No se encontraron casos</h4><p>Ajusta los filtros o crea un nuevo caso.</p>
    </div></td></tr>`;
  } else {
    tbody.innerHTML = pageRows.map(c => `
      <tr class="${PRI_CLASS[c.prioridad] || ''}" data-id="${c.id}" style="cursor:pointer;">
        <td class="mono cell-strong">${esCasoEstancado(c) ? '<span data-tooltip="5+ días sin actividad" style="color:var(--red);margin-right:4px;">⚠</span>' : ''}${Utils.escapeHtml(c.numero)}${c.archivado ? ' <span class="badge st-cerrado" style="margin-left:4px;">Archivado</span>' : ''}</td>
        <td class="mono cell-strong">${Utils.escapeHtml(c.codigoEBA || '—')}</td>
        <td>${Utils.escapeHtml(c.zona || '—')}</td>
        <td>${Utils.escapeHtml(c.campaña || '—')}</td>
        <td>${Utils.escapeHtml(c.gerenteZona || '—')}</td>
        <td><span class="badge ${ST_CLASS[c.estado] || ''}">${Utils.escapeHtml(c.estado)}</span></td>
        <td><span class="${'pri-' + (c.prioridad || '').toLowerCase()}" style="font-weight:700;">${Utils.escapeHtml(c.prioridad || '—')}</span></td>
        <td>${Utils.formatDate(c.fechaCreacion)}</td>
        <td>${Utils.escapeHtml(c.usuarioCreador || '—')}</td>
      </tr>`).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => window.location.href = `detalle-caso.html?id=${tr.dataset.id}`);
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (PAGE > totalPages) PAGE = totalPages;
  document.getElementById('pag-info').textContent = total ? `Mostrando ${start + 1}–${Math.min(start + PAGE_SIZE, total)} de ${total} casos` : 'Sin resultados';
  const btnsBox = document.getElementById('pag-btns');
  let btns = '';
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7 && p !== 1 && p !== totalPages && Math.abs(p - PAGE) > 1) {
      if (p === 2 || p === totalPages - 1) btns += `<span style="padding:0 4px;">…</span>`;
      continue;
    }
    btns += `<div class="page-btn ${p === PAGE ? 'active' : ''}" data-page="${p}">${p}</div>`;
  }
  btnsBox.innerHTML = btns;
  btnsBox.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => { PAGE = parseInt(b.dataset.page); renderTable(); }));
}

// ---------------- Alta de caso ----------------
async function openCaseModal() {
  document.getElementById('case-form').reset();
  document.getElementById('f-numero-preview').textContent = await Storage.Casos.nextCaseNumber();
  document.querySelectorAll('#case-form .field').forEach(f => f.classList.remove('invalid'));
  document.getElementById('telefonos-adicionales-list').innerHTML = '';
  document.getElementById('rep-catalogo-hint').textContent = '';
  const moneda = Storage.monedaDePais(CURRENT_USER_FULL?.pais);
  const hint = document.getElementById('saldo-moneda-hint');
  hint.textContent = CURRENT_USER_FULL?.pais
    ? `Se registrará en ${moneda.codigo} (${moneda.simbolo}), según tu país: ${CURRENT_USER_FULL.pais}.`
    : `Se registrará en ${moneda.codigo} (${moneda.simbolo}) — no tienes un país asignado, pídele a tu Supervisor que te lo configure en Usuarios.`;
  Utils.openModal('modal-case-backdrop');
}

async function handleCreateCase(e) {
  e.preventDefault();
  const form = e.target;
  const required = ['zona', 'gerenteZona', 'codigoEBA', 'campaña', 'fechaContacto'];
  let valid = true;
  required.forEach(name => {
    const input = form.elements[name];
    const field = input.closest('.field');
    if (!input.value.trim()) { field.classList.add('invalid'); valid = false; }
    else field.classList.remove('invalid');
  });
  if (!valid) { Utils.toast('Completa los campos obligatorios.', 'error'); return; }

  const codigoEBA = form.elements.codigoEBA.value.trim();
  const duplicado = ALL_CASOS.find(c => c.codigoEBA?.toLowerCase() === codigoEBA.toLowerCase() && c.estado !== 'Cerrado' && !c.archivado);
  if (duplicado) {
    const seguir = await Utils.confirmDialog({
      title: 'Posible caso duplicado',
      message: `Ya existe un caso abierto (${duplicado.numero}, estado "${duplicado.estado}") con el código REP "${codigoEBA}". ¿Quieres crear otro caso de todas formas?`,
      confirmText: 'Crear de todas formas'
    });
    if (!seguir) return;
  }

  const data = {
    saldoPendiente: form.elements.saldoPendiente.value.trim(),
    zona: form.elements.zona.value.trim(),
    gerenteZona: form.elements.gerenteZona.value.trim(),
    telefonoGerenteZona: form.elements.telefonoGerenteZona.value.trim(),
    codigoEBA: form.elements.codigoEBA.value.trim(),
    pdActual: form.elements.pdActual.value.trim(),
    campaña: form.elements.campaña.value.trim(),
    sector: form.elements.sector.value.trim(),
    fechaContacto: form.elements.fechaContacto.value,
    telefonoEBA: form.elements.telefonoEBA.value.trim(),
    prioridad: form.elements.prioridad.value || 'Media',
    telefonosAdicionales: Array.from(document.querySelectorAll('.telefono-adicional-input')).map(i => i.value.trim()).filter(Boolean),
    versionRepresentante: '', versionEBA: '', observaciones: '', analisis: '', conclusion: '', accionTomada: ''
  };

  const btnCrear = document.querySelector('#modal-case-backdrop .btn-accent[type="submit"], #modal-case-backdrop button[type="submit"]');
  try {
    const nuevo = await Storage.Casos.create(data, CURRENT_USER);
    Utils.closeModal('modal-case-backdrop');
    Utils.toast(`Caso ${nuevo.numero} creado correctamente`, 'success');
    setTimeout(() => window.location.href = `detalle-caso.html?id=${nuevo.id}`, 500);
  } catch (err) {
    Utils.toast(`No se pudo crear el caso: ${err.message || err}`, 'error');
  }
}

/* ============================================================
   DETALLE DE CASO (detalle-caso.html)
   ============================================================ */

const EV_ICONS = {
  image: '<path d="M4 5h16v14H4z"/><circle cx="9" cy="10" r="1.6"/><path d="M4 16l5-5 4 4 3-3 4 4"/>',
  pdf: '<path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/>',
  doc: '<path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/><path d="M9 13h6M9 16h6"/>',
  audio: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  file: '<path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/>'
};
function kindFromMime(type) {
  if (!type) return 'file';
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.includes('word') || type.includes('excel') || type.includes('sheet')) return 'doc';
  return 'file';
}

async function initDetailPage() {
  CURRENT_USER = await App.mount({ active: 'casos', title: 'Detalle de caso', subtitle: 'Cargando…' });
  if (!CURRENT_USER) return;

  window.addEventListener('beforeunload', (e) => {
    if (COMPARATIVA_DIRTY) { e.preventDefault(); e.returnValue = ''; return ''; }
  });

  const id = new URLSearchParams(location.search).get('id');
  CURRENT_CASO = id ? await Storage.Casos.getById(id) : null;

  if (!CURRENT_CASO) {
    document.getElementById('detail-root').innerHTML = `<div class="empty-state">
      <h4>Caso no encontrado</h4><p>Puede que haya sido movido o el enlace sea incorrecto.</p>
      <a href="casos.html" class="btn btn-ghost" style="margin-top:14px;">Volver a Casos</a>
    </div>`;
    return;
  }
  if (CURRENT_USER.rol === 'Agente' && CURRENT_CASO.creadoPor !== CURRENT_USER.id) {
    Utils.toast('Sólo puedes consultar los casos que tú creaste.', 'error');
    window.location.href = 'casos.html';
    return;
  }

  document.querySelector('.breadcrumbs').innerHTML = `<a href="casos.html" style="color:var(--text-400);">Casos</a> <span style="margin:0 4px;color:var(--text-400);">/</span> <b>${Utils.escapeHtml(CURRENT_CASO.numero)}</b>`;

  const canEdit = CURRENT_USER.rol === 'Supervisor' || (CURRENT_CASO.creadoPor === CURRENT_USER.id && CURRENT_CASO.estado !== 'Cerrado');
  const isSupervisor = CURRENT_USER.rol === 'Supervisor';

  renderDetailHeader(canEdit, isSupervisor);
  renderGeneralTab(canEdit, isSupervisor);
  renderComparativaTab(canEdit);
  renderEvidenciasTab(canEdit);
  renderNotasTab(canEdit);
  renderTimelineTab();
  renderAnalisisTab(canEdit);
  bindDetailTabs();
  bindDetailActions(canEdit, isSupervisor);

  const closeForm = document.getElementById('close-case-form');
  if (closeForm) closeForm.addEventListener('submit', handleCloseCase);
  const closeBackdrop = document.getElementById('modal-close-backdrop');
  if (closeBackdrop) closeBackdrop.addEventListener('click', (e) => { if (e.target.id === 'modal-close-backdrop') Utils.closeModal('modal-close-backdrop'); });
}

function renderDetailHeader(canEdit, isSupervisor) {
  const c = CURRENT_CASO;
  document.getElementById('detail-header').innerHTML = `
    <div class="flex-between" style="flex-wrap:wrap;gap:14px;">
      <div>
        <div class="flex gap-10" style="align-items:center;">
          <h1 class="page-title" style="margin:0;">${Utils.escapeHtml(c.numero)}</h1>
          <span class="badge ${ST_CLASS[c.estado] || ''}">${Utils.escapeHtml(c.estado)}</span>
          <span class="${'pri-' + (c.prioridad || '').toLowerCase()}" style="font-weight:700;font-size:12.5px;">Prioridad ${Utils.escapeHtml(c.prioridad)}</span>
        </div>
        <p class="page-sub">${Utils.escapeHtml(c.codigoEBA)} · ${Utils.escapeHtml(c.zona || '—')} · creado por ${Utils.escapeHtml(c.usuarioCreador)} el ${Utils.formatDate(c.fechaCreacion)}</p>
      </div>
      <div class="flex gap-10">
        ${isSupervisor && c.estado !== 'Cerrado' && c.estado !== 'Escalado' ? `
        <button class="btn btn-ghost" id="btn-escalate-case" data-tooltip="Escalar caso con motivo" style="color:var(--red);border-color:var(--red-soft);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
          Escalar caso
        </button>` : ''}
        ${isSupervisor && c.estado !== 'Cerrado' ? `
        <button class="btn btn-ghost" id="btn-close-case" data-tooltip="Cerrar caso con motivo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
          Cerrar caso
        </button>` : ''}
        <button class="btn btn-ghost" id="btn-export-excel-one">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg>
          Excel
        </button>
        <button class="btn btn-primary" id="btn-export-pdf">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/></svg>
          Exportar PDF
        </button>
        ${isSupervisor ? `
        <div class="dropdown">
          <button class="icon-btn" id="btn-more-actions" data-tooltip="Más acciones">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>
          </button>
          <div class="dropdown-menu" id="more-actions-menu">
            ${!c.archivado ? `<button id="btn-archive-case">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 13h4"/></svg>
              Archivar caso
            </button>` : `<span class="text-muted text-sm" style="padding:8px 10px;display:block;">Caso archivado</span>`}
          </div>
        </div>` : ''}
      </div>
    </div>
    ${c.archivado ? `<div class="card card-pad" style="margin-top:14px;background:var(--grey-soft);border:none;"><span class="text-sm text-muted">Este caso está <b>archivado</b>. Sigue disponible aquí y en las exportaciones, pero no aparece en el listado activo de Casos.</span></div>` : ''}`;
}

function renderGeneralTab(canEdit, isSupervisor) {
  const c = CURRENT_CASO;
  const row = (label, val) => `<div class="field"><label>${label}</label><div style="padding:9px 0;font-size:13.5px;font-weight:600;">${Utils.escapeHtml(val || '—')}</div></div>`;
  const editable = (label, name, val, type = 'text') => `<div class="field"><label>${label}</label><input type="${type}" name="${name}" value="${Utils.escapeHtml(val || '')}"></div>`;
  const telefonos = (c.telefonosAdicionales || []);

  document.getElementById('tab-general').innerHTML = `
    <form id="general-form">
      <div class="grid-2">
        <div class="card card-pad">
          <div class="panel-title">Información general ${isSupervisor ? '<span class="text-muted text-sm" style="font-weight:400;">— editable por Supervisor</span>' : ''}</div>
          <div class="grid-2">
            ${isSupervisor ? editable('Saldo pendiente', 'saldoPendiente', c.saldoPendiente, 'number') : row('Saldo pendiente', c.saldoPendiente ? `${c.moneda?.simbolo || 'Q'} ${c.saldoPendiente}` : '—')}
            ${isSupervisor ? editable('Zona', 'zona', c.zona) : row('Zona', c.zona)}
            ${isSupervisor ? editable('Gerente de zona', 'gerenteZona', c.gerenteZona) : row('Gerente de zona', c.gerenteZona)}
            ${isSupervisor ? editable('Teléfono de gerente de zona', 'telefonoGerenteZona', c.telefonoGerenteZona) : row('Teléfono de gerente de zona', c.telefonoGerenteZona)}
            ${row('Código REP', c.codigoEBA)}
            ${isSupervisor ? editable('PD Actual', 'pdActual', c.pdActual, 'number') : row('PD Actual', c.pdActual ? c.pdActual + ' días' : '—')}
            ${isSupervisor ? editable('Campaña', 'campaña', c.campaña) : row('Campaña', c.campaña)}
            ${isSupervisor ? editable('Sector', 'sector', c.sector) : row('Sector', c.sector)}
            ${isSupervisor ? editable('Fecha de contacto', 'fechaContacto', c.fechaContacto, 'date') : row('Fecha de contacto', Utils.formatDate(c.fechaContacto))}
            ${isSupervisor ? editable('Teléfono REP', 'telefonoEBA', c.telefonoEBA) : row('Teléfono REP', c.telefonoEBA)}
          </div>
          <div class="field"><label>Números de contacto adicionales</label>
            ${telefonos.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;padding-top:4px;">${telefonos.map(t => `<span class="chip">${Utils.escapeHtml(t)}</span>`).join('')}</div>` : `<div style="padding:9px 0;font-size:13.5px;color:var(--text-400);">—</div>`}
          </div>
        </div>
        <div class="card card-pad">
          <div class="panel-title">Información administrativa</div>
          <div class="grid-2">
            ${row('Estado', c.estado)}${row('Prioridad', c.prioridad)}
            ${row('Usuario creador', c.usuarioCreador)}${row('Fecha de creación', Utils.formatDateTime(c.fechaCreacion))}
            ${row('Última modificación', Utils.formatDateTime(c.ultimaModificacion))}${row('Fecha de cierre', c.fechaCierre ? Utils.formatDateTime(c.fechaCierre) : '—')}
          </div>
        </div>
      </div>
      ${isSupervisor ? `<button type="submit" class="btn btn-accent" style="margin-top:16px;">Guardar información</button>` : ''}
    </form>`;

  if (isSupervisor) {
    document.getElementById('general-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const data = {
        saldoPendiente: f.saldoPendiente.value.trim(), zona: f.zona.value.trim(), gerenteZona: f.gerenteZona.value.trim(),
        telefonoGerenteZona: f.telefonoGerenteZona.value.trim(), pdActual: f.pdActual.value.trim(),
        campaña: f.campaña.value.trim(), sector: f.sector.value.trim(), fechaContacto: f.fechaContacto.value,
        telefonoEBA: f.telefonoEBA.value.trim()
      };
      try {
        CURRENT_CASO = await Storage.Casos.update(CURRENT_CASO.id, data, CURRENT_USER, { timelineNote: 'Información general/administrativa editada por un Supervisor' });
        Utils.toast('Información actualizada', 'success');
        renderTimelineTab();
      } catch (err) {
        Utils.toast(`No se pudo guardar: ${err.message || err}`, 'error');
      }
    });
  }
}

function renderComparativaTab(canEdit) {
  const c = CURRENT_CASO;
  COMPARATIVA_DIRTY = false;
  const dis = canEdit ? '' : 'disabled';
  document.getElementById('tab-comparativa').innerHTML = `
    <form id="comparativa-form" novalidate>
      <div class="versus-grid">
        <div class="versus-col rep">
          <div class="versus-head"><div class="versus-avatar">R</div><div><b>Versión de la Representante <span style="color:var(--red);">*</span></b><span>Hechos según la representante</span></div></div>
          <textarea name="versionRepresentante" ${dis} placeholder="Describe la versión de los hechos proporcionada por la representante…">${Utils.escapeHtml(c.versionRepresentante)}</textarea>
          <div class="err-msg" data-err="versionRepresentante">Este campo es obligatorio.</div>
        </div>
        <div class="versus-divider"><div class="vs-badge">VS</div></div>
        <div class="versus-col eba">
          <div class="versus-head"><div class="versus-avatar">E</div><div><b>Versión de la Empresaria / EBA <span style="color:var(--red);">*</span></b><span>Hechos según la EBA</span></div></div>
          <textarea name="versionEBA" ${dis} placeholder="Describe la versión de los hechos proporcionada por la EBA…">${Utils.escapeHtml(c.versionEBA)}</textarea>
          <div class="err-msg" data-err="versionEBA">Este campo es obligatorio.</div>
        </div>
      </div>

      <div class="versus-col gerente">
        <div class="versus-head"><div class="versus-avatar">G</div><div><b>Comentario de gerente de división</b><span>Observación del gerente a cargo</span></div></div>
        <textarea name="comentarioGerenteDivision" ${dis} placeholder="Escribe aquí la observación del gerente de división…">${Utils.escapeHtml(c.comentarioGerenteDivision)}</textarea>
      </div>

      ${canEdit ? `<button type="submit" class="btn btn-accent">Guardar comparativa</button>` : `<p class="text-muted text-sm">${c.estado === 'Cerrado' ? 'Este caso está cerrado — solo un Supervisor puede editarlo.' : 'Sólo el creador del caso o un supervisor pueden editar esta sección.'}</p>`}
    </form>`;

  if (canEdit) {
    const form = document.getElementById('comparativa-form');
    form.querySelectorAll('textarea').forEach(t => t.addEventListener('input', () => { COMPARATIVA_DIRTY = true; }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const required = ['versionRepresentante', 'versionEBA'];
      let valid = true;
      required.forEach(name => {
        const el = f.elements[name];
        const wrap = el.closest('.field') || el.closest('.versus-col');
        if (!el.value.trim()) { wrap.classList.add('invalid'); valid = false; }
        else wrap.classList.remove('invalid');
      });
      if (!valid) { Utils.toast('Completa las dos versiones antes de guardar.', 'error'); return; }

      const data = {
        versionRepresentante: f.versionRepresentante.value,
        versionEBA: f.versionEBA.value,
        comentarioGerenteDivision: f.comentarioGerenteDivision.value
      };
      CURRENT_CASO = await Storage.Casos.update(CURRENT_CASO.id, data, CURRENT_USER, {
        timelineNote: 'Comparativa de versiones actualizada',
        accionLabel: 'Comparativa guardada — estado avanzado a "Pendiente de información"',
        avanzarA: 'Pendiente de información'
      });
      COMPARATIVA_DIRTY = false;
      Utils.toast('Comparativa guardada', 'success');
      renderTimelineTab();
      const isSupervisorNow = CURRENT_USER.rol === 'Supervisor';
      renderDetailHeader(canEdit, isSupervisorNow);
      bindDetailActions(canEdit, isSupervisorNow);
    });
  }
}

function renderAnalisisTab(canEdit) {
  const c = CURRENT_CASO;
  const dis = canEdit ? '' : 'disabled';
  document.getElementById('tab-analisis').innerHTML = `
    <form id="analisis-form" novalidate>
      <div class="grid-2">
        <div class="field field-required"><label>Observaciones</label><textarea name="observaciones" ${dis} style="min-height:80px;">${Utils.escapeHtml(c.observaciones)}</textarea><div class="err-msg">Este campo es obligatorio.</div></div>
        <div class="field field-required"><label>Análisis</label><textarea name="analisis" ${dis} style="min-height:80px;">${Utils.escapeHtml(c.analisis)}</textarea><div class="err-msg">Este campo es obligatorio.</div></div>
        <div class="field field-required"><label>Conclusión</label><textarea name="conclusion" ${dis} style="min-height:80px;">${Utils.escapeHtml(c.conclusion)}</textarea><div class="err-msg">Este campo es obligatorio.</div></div>
        <div class="field field-required"><label>Acción tomada</label><textarea name="accionTomada" ${dis} style="min-height:80px;">${Utils.escapeHtml(c.accionTomada)}</textarea><div class="err-msg">Este campo es obligatorio.</div></div>
      </div>
      ${canEdit ? `<button type="submit" class="btn btn-accent">Guardar análisis</button>` : `<p class="text-muted text-sm">${c.estado === 'Cerrado' ? 'Este caso está cerrado — solo un Supervisor puede editarlo.' : 'Sólo el creador del caso o un supervisor pueden editar esta sección.'}</p>`}
    </form>`;

  if (canEdit) {
    document.getElementById('analisis-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const required = ['observaciones', 'analisis', 'conclusion', 'accionTomada'];
      let valid = true;
      required.forEach(name => {
        const el = f.elements[name];
        const wrap = el.closest('.field');
        if (!el.value.trim()) { wrap.classList.add('invalid'); valid = false; }
        else wrap.classList.remove('invalid');
      });
      if (!valid) { Utils.toast('Completa todos los campos antes de guardar.', 'error'); return; }

      const data = {
        observaciones: f.observaciones.value,
        analisis: f.analisis.value,
        conclusion: f.conclusion.value,
        accionTomada: f.accionTomada.value
      };
      CURRENT_CASO = await Storage.Casos.update(CURRENT_CASO.id, data, CURRENT_USER, {
        timelineNote: 'Análisis y resolución actualizados',
        accionLabel: 'Análisis y resolución guardados — estado avanzado a "En seguimiento"',
        avanzarA: 'En seguimiento'
      });
      Utils.toast('Análisis guardado', 'success');
      renderTimelineTab();
      const isSupervisorNow = CURRENT_USER.rol === 'Supervisor';
      renderDetailHeader(canEdit, isSupervisorNow);
      bindDetailActions(canEdit, isSupervisorNow);
    });
  }
}

function renderEvidenciasTab(canEdit) {
  const c = CURRENT_CASO;
  document.getElementById('tab-evidencias').innerHTML = `
    ${canEdit ? `
    <div class="dropzone" id="dropzone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
      <div>Arrastra archivos aquí o <b style="color:var(--accent-dark);">haz clic para buscar</b></div>
      <div class="text-sm" style="margin-top:4px;">Imágenes, PDF, Word, Excel, audio o video</div>
      <input type="file" id="file-input" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,audio/*,video/*">
    </div>` : ''}
    <div class="evidence-list" id="evidence-list"></div>`;
  renderEvidenceList(canEdit);

  if (canEdit) {
    const dz = document.getElementById('dropzone');
    const input = document.getElementById('file-input');
    dz.addEventListener('click', () => input.click());
    ['dragover', 'dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.toggle('drag', evt === 'dragover');
    }));
    dz.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    input.addEventListener('change', (e) => handleFiles(e.target.files));
  }
}

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) {
      Utils.toast(`"${file.name}" excede 50MB.`, 'error');
      continue;
    }
    try {
      const storagePath = await Storage.Casos.subirArchivoEvidencia(CURRENT_CASO.id, file);
      await Storage.Casos.addEvidencia(CURRENT_CASO.id, {
        nombre: file.name, tamaño: file.size, tipo: file.type, storagePath
      }, CURRENT_USER);
    } catch (err) {
      Utils.toast(`No se pudo subir "${file.name}": ${err.message || err}`, 'error');
    }
  }
  CURRENT_CASO = await Storage.Casos.getById(CURRENT_CASO.id);
  Utils.toast('Evidencia(s) agregada(s)', 'success');
  renderEvidenceList(true);
  renderTimelineTab();
  const canEditNow = CURRENT_USER.rol === 'Supervisor' || CURRENT_CASO.creadoPor === CURRENT_USER.id;
  renderDetailHeader(canEditNow, CURRENT_USER.rol === 'Supervisor');
  bindDetailActions(canEditNow, CURRENT_USER.rol === 'Supervisor');
}

async function renderEvidenceList(canEdit) {
  const list = CURRENT_CASO.evidencias || [];
  const el = document.getElementById('evidence-list');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><p>Todavía no se han subido evidencias.</p></div>`;
    return;
  }
  el.innerHTML = list.map(ev => {
    const kind = kindFromMime(ev.tipo);
    const thumb = kind === 'image'
      ? `<img class="ev-thumb" id="thumb-${ev.id}" alt="">`
      : `<div class="ev-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${EV_ICONS[kind]}</svg></div>`;
    return `
    <div class="evidence-item">
      ${thumb}
      <div class="ev-meta">
        <div class="ev-name">${Utils.escapeHtml(ev.nombre)}</div>
        <div class="ev-sub">${Utils.formatBytes(ev.tamaño)} · ${Utils.formatDate(ev.fecha)}</div>
      </div>
      <div class="ev-actions">
        <a class="icon-btn" style="width:30px;height:30px;" id="dl-${ev.id}" href="#" target="_blank" data-tooltip="Descargar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 16V4M7 9l5 5 5-5"/><path d="M4 20h16"/></svg>
        </a>
        ${canEdit ? `<button class="icon-btn" style="width:30px;height:30px;" data-del="${ev.id}" data-tooltip="Eliminar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>` : ''}
      </div>
    </div>`;
  }).join('');

  // Los archivos viven en Supabase Storage (privado), así que cada enlace
  // necesita una URL firmada temporal — se piden todas en paralelo.
  list.forEach(async (ev) => {
    if (!ev.storagePath) return;
    const url = await Storage.Casos.urlEvidencia(ev.storagePath);
    if (!url) return;
    const dl = document.getElementById(`dl-${ev.id}`);
    if (dl) dl.href = url;
    const thumb = document.getElementById(`thumb-${ev.id}`);
    if (thumb) thumb.src = url;
  });

  el.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await Utils.confirmDialog({ title: 'Eliminar evidencia', message: 'Esta acción quitará el archivo del caso.', confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    await Storage.Casos.removeEvidencia(CURRENT_CASO.id, btn.dataset.del, CURRENT_USER);
    CURRENT_CASO = await Storage.Casos.getById(CURRENT_CASO.id);
    renderEvidenceList(true);
    Utils.toast('Evidencia eliminada', 'success');
  }));
}

function renderNotasTab(canEdit) {
  const c = CURRENT_CASO;
  const notas = c.notasInternas || [];
  document.getElementById('tab-notas').innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <p class="text-sm text-muted" style="margin-top:0;">Espacio de comunicación interna entre Supervisor y Agente sobre este caso. No forma parte de la comparativa oficial ni se incluye en las exportaciones.</p>
      ${canEdit ? `
      <form id="nota-form">
        <textarea name="texto" placeholder="Escribe una nota para quien más esté trabajando este caso…" style="width:100%;min-height:70px;padding:10px 12px;border-radius:8px;border:1px solid var(--paper-border);background:var(--paper-0);color:var(--text-900);font-size:13px;font-family:inherit;margin-bottom:10px;"></textarea>
        <button type="submit" class="btn btn-accent btn-sm">Agregar nota</button>
      </form>` : ''}
    </div>
    <div id="notas-list"></div>`;

  const listEl = document.getElementById('notas-list');
  if (!notas.length) {
    listEl.innerHTML = `<p class="text-muted text-sm">Todavía no hay notas internas en este caso.</p>`;
  } else {
    listEl.innerHTML = [...notas].reverse().map(n => `
      <div class="card card-pad" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;">
          <b style="font-size:12.5px;">${Utils.escapeHtml(n.usuario)}</b>
          <span class="text-muted" style="font-size:11px;">${Utils.formatDateTime(n.fecha)}</span>
        </div>
        <div style="font-size:13px;line-height:1.5;white-space:pre-wrap;">${Utils.escapeHtml(n.texto)}</div>
      </div>`).join('');
  }

  if (canEdit) {
    document.getElementById('nota-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = e.target.elements.texto.value.trim();
      if (!texto) { Utils.toast('Escribe una nota antes de agregarla.', 'error'); return; }
      await Storage.Casos.addNota(CURRENT_CASO.id, texto, CURRENT_USER);
      CURRENT_CASO = await Storage.Casos.getById(CURRENT_CASO.id);
      Utils.toast('Nota agregada', 'success');
      renderNotasTab(canEdit);
      renderTimelineTab();
      renderDetailHeader(canEdit, CURRENT_USER.rol === 'Supervisor');
      bindDetailActions(canEdit, CURRENT_USER.rol === 'Supervisor');
    });
  }
}

const TL_ICON = '<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>';
function renderTimelineTab() {
  const items = [...(CURRENT_CASO.timeline || [])].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  document.getElementById('tab-timeline').innerHTML = `
    <div class="card card-pad">
      <div class="panel-title">Línea de tiempo</div>
      <div class="timeline">
        ${items.map(t => `
          <div class="tl-item">
            <div class="tl-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${TL_ICON}</svg></div>
            <div class="tl-head">${Utils.escapeHtml(t.accion)}</div>
            <div class="tl-sub">${Utils.escapeHtml(t.usuario)} · ${Utils.formatDateTime(t.fecha)}</div>
            ${t.estadoAnterior && t.estadoNuevo && t.estadoAnterior !== t.estadoNuevo ? `
              <div class="tl-change"><span class="badge ${ST_CLASS[t.estadoAnterior] || ''}">${t.estadoAnterior}</span> → <span class="badge ${ST_CLASS[t.estadoNuevo] || ''}">${t.estadoNuevo}</span></div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

function bindDetailTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

function bindDetailActions(canEdit, isSupervisor) {
  document.getElementById('btn-export-excel-one').addEventListener('click', () => ExcelExport.exportUnCaso(CURRENT_CASO));
  document.getElementById('btn-export-pdf').addEventListener('click', () => PdfExport.exportCaso(CURRENT_CASO, CURRENT_USER));

  if (isSupervisor) {
    const escalateBtn = document.getElementById('btn-escalate-case');
    if (escalateBtn) escalateBtn.addEventListener('click', async () => {
      const motivo = await Utils.promptDialog({
        title: 'Escalar caso',
        message: `¿Escalar el caso ${CURRENT_CASO.numero}? Escribe brevemente el motivo de la escalación.`,
        placeholder: 'Ej. Se requiere intervención de un nivel superior…',
        confirmText: 'Escalar caso'
      });
      if (motivo === null) return;
      CURRENT_CASO = await Storage.Casos.update(CURRENT_CASO.id, { estado: 'Escalado' }, CURRENT_USER, { accionLabel: `Caso escalado — Motivo: ${motivo}` });
      Utils.toast(`${CURRENT_CASO.numero} escalado`, 'success');
      refreshDetailAfterChange(canEdit, isSupervisor);
    });

    const closeBtn = document.getElementById('btn-close-case');
    if (closeBtn) closeBtn.addEventListener('click', openCloseCaseModal);

    const moreBtn = document.getElementById('btn-more-actions');
    if (moreBtn) {
      moreBtn.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('more-actions-menu').classList.toggle('open-menu'); });
      document.addEventListener('click', () => document.getElementById('more-actions-menu')?.classList.remove('open-menu'));
    }
    const archiveBtn = document.getElementById('btn-archive-case');
    if (archiveBtn) archiveBtn.addEventListener('click', handleArchiveCase);
  }
}

function refreshDetailAfterChange(canEdit, isSupervisor) {
  renderDetailHeader(canEdit, isSupervisor);
  renderGeneralTab(canEdit, isSupervisor);
  renderTimelineTab();
  bindDetailActions(canEdit, isSupervisor);
}

// ---------------- Cerrar caso (con motivo) ----------------
function openCloseCaseModal() {
  document.getElementById('close-case-form').reset();
  Utils.openModal('modal-close-backdrop');
}

async function handleCloseCase(e) {
  e.preventDefault();
  const c = CURRENT_CASO;
  const faltantes = [];
  if (!c.versionRepresentante?.trim() || !c.versionEBA?.trim()) faltantes.push('la comparativa de versiones');
  if (!c.observaciones?.trim() || !c.analisis?.trim() || !c.conclusion?.trim() || !c.accionTomada?.trim()) faltantes.push('el análisis y resolución');
  if (!c.evidencias || !c.evidencias.length) faltantes.push('al menos una evidencia');
  if (faltantes.length) {
    Utils.toast(`No se puede cerrar el caso: falta completar ${[...new Set(faltantes)].join(' y ')}.`, 'error');
    return;
  }

  const motivo = e.target.elements.motivoCierre.value.trim();
  CURRENT_CASO = await Storage.Casos.update(
    CURRENT_CASO.id,
    { estado: 'Cerrado', accionTomada: motivo ? [CURRENT_CASO.accionTomada, motivo].filter(Boolean).join('\n') : CURRENT_CASO.accionTomada },
    CURRENT_USER,
    { accionLabel: motivo ? `Caso cerrado — Motivo: ${motivo}` : 'Caso cerrado' }
  );
  Utils.closeModal('modal-close-backdrop');
  Utils.toast(`${CURRENT_CASO.numero} cerrado correctamente`, 'success');
  const canEdit = CURRENT_USER.rol === 'Supervisor' || (CURRENT_CASO.creadoPor === CURRENT_USER.id && CURRENT_CASO.estado !== 'Cerrado');
  renderAnalisisTab(canEdit);
  refreshDetailAfterChange(canEdit, true);
}

// ---------------- Archivar caso (borrado lógico) ----------------
async function handleArchiveCase() {
  document.getElementById('more-actions-menu').classList.remove('open-menu');
  const ok = await Utils.confirmDialog({
    title: 'Archivar caso',
    message: `${CURRENT_CASO.numero} se marcará como Cerrado y Archivado. No se eliminará ninguna información: seguirá disponible en detalle y exportaciones, pero dejará de aparecer en el listado activo de Casos.`,
    confirmText: 'Archivar caso', danger: true
  });
  if (!ok) return;
  CURRENT_CASO = await Storage.Casos.archive(CURRENT_CASO.id, CURRENT_USER);
  Utils.toast(`${CURRENT_CASO.numero} archivado`, 'success');
  const canEdit = CURRENT_USER.rol === 'Supervisor' || (CURRENT_CASO.creadoPor === CURRENT_USER.id && CURRENT_CASO.estado !== 'Cerrado');
  refreshDetailAfterChange(canEdit, true);
}
