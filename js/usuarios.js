/* ============================================================
   usuarios.js — Gestión de usuarios y roles (sólo Supervisor)
   ============================================================ */

let U_ALL = [];
let U_CURRENT_USER = null;
let U_EDIT_ID = null;

document.addEventListener('DOMContentLoaded', async () => {
  U_CURRENT_USER = await App.mount({ active: 'usuarios', title: 'Usuarios', subtitle: 'Roles y accesos', allowedRoles: ['Supervisor'] });
  if (!U_CURRENT_USER) return;

  await loadUsuarios();
  renderUsuarios();

  document.getElementById('search-usuarios').addEventListener('input', Utils.debounce(renderUsuarios, 180));
  document.getElementById('btn-new-user').addEventListener('click', () => openUserModal());
  document.getElementById('user-form').addEventListener('submit', handleSaveUser);
  document.getElementById('modal-user-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-user-backdrop') Utils.closeModal('modal-user-backdrop');
  });
});

async function loadUsuarios() { U_ALL = await Storage.Usuarios.getAll(); }

function renderUsuarios() {
  const q = (document.getElementById('search-usuarios').value || '').toLowerCase();
  const rows = U_ALL.filter(u => !q || u.nombre.toLowerCase().includes(q) || u.usuario.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));

  const tbody = document.getElementById('usuarios-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h4>Sin usuarios</h4><p>Crea el primer usuario del sistema.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(u => `
    <tr>
      <td>
        <div class="flex gap-10" style="align-items:center;">
          <div class="user-avatar" style="background:var(--paper-200);color:var(--text-900);border-color:var(--paper-border);">${Utils.initials(u.nombre)}</div>
          <div><div class="cell-strong">${Utils.escapeHtml(u.nombre)}</div><div class="text-muted text-sm">@${Utils.escapeHtml(u.usuario)}</div></div>
        </div>
      </td>
      <td>${Utils.escapeHtml(u.pais || '—')}</td>
      <td>${Utils.escapeHtml(u.email || '—')}</td>
      <td><span class="badge ${u.rol === 'Supervisor' ? 'st-escalado' : 'st-nuevo'}">${Utils.escapeHtml(u.rol)}</span></td>
      <td><span class="badge ${u.activo ? 'st-resuelto' : 'st-cerrado'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" data-edit="${u.id}">Editar</button>
          <button class="btn btn-ghost btn-sm" data-reset="${u.usuario}" data-nombre="${Utils.escapeHtml(u.nombre)}">Restablecer contraseña</button>
          ${u.id !== U_CURRENT_USER.id ? `<button class="btn ${u.activo ? 'btn-danger' : 'btn-accent'} btn-sm" data-toggle="${u.id}">${u.activo ? 'Desactivar' : 'Activar'}</button>` : ''}
        </div>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openUserModal(b.dataset.edit)));
  tbody.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => toggleUser(b.dataset.toggle)));
  tbody.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => handleResetPassword(b.dataset.reset, b.dataset.nombre)));
}

async function handleResetPassword(usuarioLogin, nombre) {
  const nueva = await Utils.promptDialog({
    title: `Restablecer contraseña de ${nombre}`,
    message: `Escribe la nueva contraseña temporal para @${usuarioLogin}. Comunícasela por un medio seguro — la próxima vez que entre, puede cambiarla ella misma desde "Mi cuenta".`,
    placeholder: 'Mínimo 6 caracteres',
    confirmText: 'Restablecer'
  });
  if (!nueva) return;
  if (nueva.length < 6) { Utils.toast('La contraseña debe tener al menos 6 caracteres.', 'error'); return; }
  try {
    await Storage.Usuarios.restablecerPassword(usuarioLogin, nueva);
    Utils.toast(`Contraseña de ${nombre} restablecida correctamente`, 'success');
  } catch (err) {
    Utils.toast('No se pudo restablecer: ' + (err.message || err), 'error');
  }
}

function openUserModal(id) {
  U_EDIT_ID = id || null;
  const form = document.getElementById('user-form');
  form.reset();
  document.querySelectorAll('#user-form .field').forEach(f => f.classList.remove('invalid'));
  document.getElementById('modal-user-title').textContent = id ? 'Editar usuario' : 'Nuevo usuario';
  const passField = document.getElementById('f-password');
  const passFieldWrap = passField.closest('.field');
  const passHint = document.getElementById('f-password-hint');
  passField.required = !id;
  if (id) {
    passField.disabled = true;
    passFieldWrap.style.display = 'none';
    if (passHint) { passHint.style.display = 'block'; passHint.textContent = 'Para cambiar la contraseña, usa el botón "Restablecer contraseña" en la lista de usuarios.'; }
  } else {
    passField.disabled = false;
    passFieldWrap.style.display = '';
    passField.placeholder = '••••••••';
    if (passHint) passHint.style.display = 'none';
  }

  if (id) {
    const u = U_ALL.find(x => x.id === id);
    form.elements.nombre.value = u.nombre;
    form.elements.usuario.value = u.usuario;
    form.elements.email.value = u.email || '';
    form.elements.pais.value = u.pais || '';
    form.elements.rol.value = u.rol;
    form.elements.usuario.disabled = true;
  } else {
    form.elements.usuario.disabled = false;
  }
  Utils.openModal('modal-user-backdrop');
}

async function handleSaveUser(e) {
  e.preventDefault();
  const form = e.target;
  const nombre = form.elements.nombre.value.trim();
  const usuario = form.elements.usuario.value.trim();
  const email = form.elements.email.value.trim();
  const pais = form.elements.pais.value.trim();
  const rol = form.elements.rol.value;
  const password = form.elements.password.disabled ? '' : form.elements.password.value;

  let valid = true;
  const markInvalid = (name) => { form.elements[name].closest('.field').classList.add('invalid'); valid = false; };
  const clearInvalid = (name) => form.elements[name].closest('.field').classList.remove('invalid');
  [['nombre', nombre], ['usuario', usuario]].forEach(([n, v]) => v ? clearInvalid(n) : markInvalid(n));
  if (!U_EDIT_ID && !password) markInvalid('password'); else clearInvalid('password');
  if (!valid) { Utils.toast('Completa los campos obligatorios.', 'error'); return; }

  if (!U_EDIT_ID) {
    const existing = await Storage.Usuarios.getByUsuario(usuario);
    if (existing) { Utils.toast('Ese nombre de usuario ya existe.', 'error'); return; }
    await Storage.Usuarios.create({ nombre, usuario, email, pais, rol, password });
    Utils.toast('Usuario creado correctamente', 'success');
  } else {
    const data = { nombre, email, pais, rol };
    if (password) data.password = password;
    await Storage.Usuarios.update(U_EDIT_ID, data);
    Utils.toast('Usuario actualizado', 'success');
  }
  Utils.closeModal('modal-user-backdrop');
  await loadUsuarios();
  renderUsuarios();
}

async function toggleUser(id) {
  const u = U_ALL.find(x => x.id === id);
  const activar = !u.activo;
  const ok = await Utils.confirmDialog({
    title: activar ? 'Activar usuario' : 'Desactivar usuario',
    message: activar ? `${u.nombre} podrá iniciar sesión nuevamente.` : `${u.nombre} no podrá iniciar sesión mientras esté inactivo. No se eliminará ninguna información.`,
    confirmText: activar ? 'Activar' : 'Desactivar', danger: !activar
  });
  if (!ok) return;
  await Storage.Usuarios.update(id, { activo: activar });
  await loadUsuarios();
  renderUsuarios();
  Utils.toast(activar ? 'Usuario activado' : 'Usuario desactivado', 'success');
}
