/* ============================================================
   login.js — Autenticación real con Supabase Auth.
   Cada "usuario" (ej. acano) se guarda internamente con un correo
   ficticio (acano@scmp.local) — la persona solo ve y escribe su
   usuario normal, nunca ese correo.
   ============================================================ */

const INTENTOS_MAX = 5;
const BLOQUEO_MIN = 5;
const K_INTENTOS = 'scmp_login_attempts';

function leerIntentos() {
  try { return JSON.parse(localStorage.getItem(K_INTENTOS) || '{}'); } catch (e) { return {}; }
}
function guardarIntentos(map) { localStorage.setItem(K_INTENTOS, JSON.stringify(map)); }

function estaBloqueado(usuario) {
  const map = leerIntentos();
  const reg = map[usuario.toLowerCase()];
  if (!reg || !reg.bloqueadoHasta) return 0;
  const restanteMs = reg.bloqueadoHasta - Date.now();
  return restanteMs > 0 ? Math.ceil(restanteMs / 60000) : 0;
}
function registrarIntentoFallido(usuario) {
  const map = leerIntentos();
  const key = usuario.toLowerCase();
  const reg = map[key] || { fallos: 0, bloqueadoHasta: null };
  reg.fallos += 1;
  if (reg.fallos >= INTENTOS_MAX) {
    reg.bloqueadoHasta = Date.now() + BLOQUEO_MIN * 60000;
    reg.fallos = 0;
  }
  map[key] = reg;
  guardarIntentos(map);
}
function limpiarIntentos(usuario) {
  const map = leerIntentos();
  delete map[usuario.toLowerCase()];
  guardarIntentos(map);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Si ya hay sesión activa, saltar directo al dashboard
  if (await Storage.Session.isAuthenticated()) {
    window.location.href = 'dashboard.html';
    return;
  }

  const form = document.getElementById('login-form');
  const userField = document.getElementById('f-usuario');
  const passField = document.getElementById('f-password');
  const errBox = document.getElementById('login-error');
  const submitBtn = document.getElementById('btn-submit');
  const togglePass = document.getElementById('toggle-pass');

  togglePass.addEventListener('click', () => {
    const isPass = passField.type === 'password';
    passField.type = isPass ? 'text' : 'password';
    togglePass.textContent = isPass ? 'Ocultar' : 'Mostrar';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    const usuario = userField.value.trim();
    const password = passField.value;

    if (!usuario || !password) {
      errBox.textContent = 'Ingresa tu usuario y contraseña.';
      errBox.style.display = 'block';
      return;
    }

    const minRestantes = estaBloqueado(usuario);
    if (minRestantes > 0) {
      errBox.textContent = `Demasiados intentos fallidos. Intenta de nuevo en ${minRestantes} minuto(s).`;
      errBox.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Ingresando…';

    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await sb.auth.signInWithPassword({
      email: `${usuario.toLowerCase()}@scmp.local`,
      password
    });

    if (error || !data.session) {
      registrarIntentoFallido(usuario);
      const minAhora = estaBloqueado(usuario);
      errBox.textContent = minAhora > 0
        ? `Demasiados intentos fallidos. Intenta de nuevo en ${minAhora} minuto(s).`
        : 'Usuario o contraseña incorrectos, o el usuario está inactivo.';
      errBox.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ingresar';
      return;
    }

    // Verificar que el usuario siga activo
    const perfil = await Storage.Usuarios.getById(data.session.user.id);
    if (!perfil || !perfil.activo) {
      await sb.auth.signOut();
      errBox.textContent = 'Tu usuario está inactivo. Contacta a tu Supervisor.';
      errBox.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ingresar';
      return;
    }

    limpiarIntentos(usuario);

    Utils.toast(`Bienvenido, ${perfil.nombre.split(' ')[0]}`, 'success', 1600);
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 350);
  });

  // ---------------- Olvidaste tu contraseña (pregunta de seguridad) ----------------
  const toggleBtn = document.getElementById('btn-toggle-forgot');
  const step1 = document.getElementById('forgot-step1-form');
  const step2 = document.getElementById('forgot-step2-form');
  let usuarioRecuperando = '';

  toggleBtn.addEventListener('click', () => {
    const abierto = step1.style.display !== 'none' || step2.style.display !== 'none';
    step1.style.display = abierto ? 'none' : 'block';
    step2.style.display = 'none';
    toggleBtn.textContent = abierto ? '¿Olvidaste tu contraseña?' : 'Cancelar';
  });

  step1.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err1 = document.getElementById('fg1-error');
    err1.style.display = 'none';
    const usuarioFg = document.getElementById('fg-usuario').value.trim();
    if (!usuarioFg) { err1.textContent = 'Escribe tu usuario.'; err1.style.display = 'block'; return; }

    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: pregunta, error } = await sb.rpc('obtener_pregunta_seguridad', { p_usuario: usuarioFg });

    if (error || !pregunta) {
      err1.textContent = 'No encontramos una pregunta de seguridad configurada para ese usuario. Pídele a tu Supervisor que te ayude a restablecer tu contraseña, o configúrala tú mismo/a en "Mi cuenta" la próxima vez que entres.';
      err1.style.display = 'block';
      return;
    }

    usuarioRecuperando = usuarioFg;
    document.getElementById('fg-pregunta-texto').textContent = pregunta;
    step1.style.display = 'none';
    step2.style.display = 'block';
  });

  step2.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err2 = document.getElementById('fg2-error');
    const ok2 = document.getElementById('fg2-success');
    err2.style.display = 'none'; ok2.style.display = 'none';

    const respuesta = document.getElementById('fg-respuesta').value.trim();
    const nueva = document.getElementById('fg-nueva').value;
    const confirmar = document.getElementById('fg-confirmar').value;

    if (!respuesta || !nueva || !confirmar) { err2.textContent = 'Completa todos los campos.'; err2.style.display = 'block'; return; }
    if (nueva.length < 6) { err2.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; err2.style.display = 'block'; return; }
    if (nueva !== confirmar) { err2.textContent = 'Las contraseñas nuevas no coinciden.'; err2.style.display = 'block'; return; }

    const btn2 = document.getElementById('btn-fg2-submit');
    btn2.disabled = true; btn2.textContent = 'Verificando…';

    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: exito, error } = await sb.rpc('restablecer_password', {
      p_usuario: usuarioRecuperando, p_respuesta: respuesta, p_nueva_password: nueva
    });

    btn2.disabled = false; btn2.textContent = 'Restablecer contraseña';

    if (error || !exito) {
      err2.textContent = 'La respuesta no es correcta. Inténtalo de nuevo.';
      err2.style.display = 'block';
      return;
    }
    ok2.textContent = '✓ Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.';
    ok2.style.display = 'block';
    step2.reset();
  });
});
