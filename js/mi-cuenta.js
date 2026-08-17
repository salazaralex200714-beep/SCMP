/* ============================================================
   mi-cuenta.js — Cualquier usuario ve sus datos y cambia su
   propia contraseña sin depender de un Supervisor.
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await App.mount({ active: 'mi-cuenta', title: 'Mi cuenta' });
  if (!user) return;

  const full = await Storage.Usuarios.getById(user.id);
  if (!full) return;

  const row = (label, val) => `<div class="field"><label>${label}</label><div style="padding:6px 0;font-size:13.5px;font-weight:600;">${Utils.escapeHtml(val || '—')}</div></div>`;
  document.getElementById('mis-datos').innerHTML =
    row('Nombre', full.nombre) + row('Usuario', full.usuario) +
    row('Rol', full.rol) + row('País', full.pais) +
    row('Correo', full.email);

  document.getElementById('mi-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const errBox = document.getElementById('mp-error');
    errBox.style.display = 'none';

    const actual = f.actual.value;
    const nueva = f.nueva.value;
    const confirmar = f.confirmar.value;

    if (nueva.length < 6) {
      errBox.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
      errBox.style.display = 'block';
      return;
    }
    if (nueva !== confirmar) {
      errBox.textContent = 'Las contraseñas nuevas no coinciden.';
      errBox.style.display = 'block';
      return;
    }

    // Verificamos la contraseña actual iniciando sesión con ella en un cliente
    // aparte (para no afectar la sesión activa), y usamos ese mismo cliente
    // para aplicar el cambio — así no hay salto entre sesiones.
    const temp = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'scmp-temp-verify' }
    });
    const { error: errVerif } = await temp.auth.signInWithPassword({ email: `${full.usuario}@scmp.local`, password: actual });
    if (errVerif) {
      errBox.textContent = 'Tu contraseña actual no es correcta.';
      errBox.style.display = 'block';
      return;
    }

    const { error: errUpdate } = await temp.auth.updateUser({ password: nueva });
    await temp.auth.signOut();

    if (errUpdate) {
      errBox.textContent = 'No se pudo actualizar la contraseña: ' + (errUpdate.message || errUpdate);
      errBox.style.display = 'block';
      return;
    }
    Utils.toast('Contraseña actualizada correctamente', 'success');
    f.reset();
  });

  // ---------------- Pregunta de seguridad ----------------
  const selectPregunta = document.getElementById('ps-pregunta-select');
  const customBox = document.getElementById('ps-pregunta-custom-box');
  selectPregunta.addEventListener('change', () => {
    customBox.style.display = selectPregunta.value === 'otra' ? 'block' : 'none';
  });

  document.getElementById('pregunta-seguridad-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const psErr = document.getElementById('ps-error');
    psErr.style.display = 'none';

    const pregunta = selectPregunta.value === 'otra' ? document.getElementById('ps-pregunta-custom').value.trim() : selectPregunta.value;
    const respuesta = f.elements.respuesta.value.trim();

    if (!pregunta || !respuesta) {
      psErr.textContent = 'Completa la pregunta y la respuesta.';
      psErr.style.display = 'block';
      return;
    }

    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await sb.rpc('guardar_pregunta_seguridad', { p_pregunta: pregunta, p_respuesta: respuesta });
    if (error) {
      psErr.textContent = 'No se pudo guardar: ' + (error.message || error);
      psErr.style.display = 'block';
      return;
    }
    Utils.toast('Pregunta de seguridad guardada', 'success');
    f.reset();
    customBox.style.display = 'none';
  });
});
