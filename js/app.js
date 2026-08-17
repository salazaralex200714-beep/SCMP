/* ============================================================
   app.js — Shell de la aplicación (sidebar + topbar), guardia de
   autenticación por rol y modo oscuro. Se incluye en todas las
   pantallas internas (no en login.html).
   ============================================================ */

const App = (() => {

  const NAV = [
    {
      group: 'General', items: [
        { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', roles: ['Supervisor', 'Agente'],
          icon: '<path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6ZM13 3v6h8V3h-8Z"/>' },
        { id: 'casos', label: 'Casos', href: 'casos.html', roles: ['Supervisor', 'Agente'],
          icon: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>' },
        { id: 'catalogo', label: 'Catálogo de REP', href: 'catalogo.html', roles: ['Supervisor', 'Agente'],
          icon: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/>' }
      ]
    },
    {
      group: 'Administración', items: [
        { id: 'usuarios', label: 'Usuarios', href: 'usuarios.html', roles: ['Supervisor'],
          icon: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M15.5 13.2c2.9.4 5 2.2 5.9 6.8h-3.4"/>' },
        { id: 'auditoria', label: 'Auditoría', href: 'auditoria.html', roles: ['Supervisor'],
          icon: '<path d="M9 12h6M9 16h6M9 8h2"/><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>' }
      ]
    },
    {
      group: 'Cuenta', items: [
        { id: 'mi-cuenta', label: 'Mi cuenta', href: 'mi-cuenta.html', roles: ['Supervisor', 'Agente'],
          icon: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>' }
      ]
    }
  ];

  async function guard() {
    const user = await Storage.Session.get();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    return user;
  }

  async function currentUser() { return Storage.Session.get(); }

  function svgIcon(inner, extra = '') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;
  }

  function renderSidebar(activeId, user) {
    const groupsHtml = NAV.map(g => {
      const items = g.items.filter(it => it.roles.includes(user.rol));
      if (!items.length) return '';
      return `
        <div class="nav-group">
          <div class="nav-label">${g.group}</div>
          ${items.map(it => `
            <a class="nav-item ${it.id === activeId ? 'active' : ''}" href="${it.href}">
              ${svgIcon(it.icon)}
              <span>${it.label}</span>
            </a>`).join('')}
        </div>`;
    }).join('');

    return `
      <div class="brand">
        <div class="brand-mark">S</div>
        <div class="brand-text">
          <div class="t1">S.C.M.P.</div>
          <div class="t2">Control de Malas Prácticas</div>
        </div>
      </div>
      ${groupsHtml}
      <div class="sidebar-foot">
        <div class="user-chip">
          <div class="user-avatar">${Utils.initials(user.nombre)}</div>
          <div class="user-meta">
            <div class="u-name">${Utils.escapeHtml(user.nombre)}</div>
            <div class="u-role">${Utils.escapeHtml(user.rol)}</div>
          </div>
        </div>
        <button class="logout-btn" id="btn-logout">
          ${svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>')}
          Cerrar sesión
        </button>
      </div>`;
  }

  function renderTopbar({ title, subtitle }) {
    return `
      <button class="icon-btn hamburger" id="btn-hamburger" data-tooltip="Menú">
        ${svgIcon('<path d="M3 6h18M3 12h18M3 18h18"/>')}
      </button>
      <div class="breadcrumbs"><b>${Utils.escapeHtml(title || '')}</b>${subtitle ? ' · ' + Utils.escapeHtml(subtitle) : ''}</div>
      <div class="topbar-search">
        ${svgIcon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')}
        <input id="global-search" type="text" placeholder="Buscar caso, cliente, EBA…">
      </div>
      <div class="topbar-actions">
        <button class="icon-btn theme-toggle" id="btn-theme" data-tooltip="Cambiar tema">
          <span class="ico-moon">${svgIcon('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>')}</span>
          <span class="ico-sun">${svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')}</span>
        </button>
        <button class="icon-btn" data-tooltip="Notificaciones">
          ${svgIcon('<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>')}
        </button>
      </div>`;
  }

  function initTheme() {
    const saved = localStorage.getItem('scmp_theme');
    if (saved === 'dark') document.body.classList.add('dark');
    const btn = document.getElementById('btn-theme');
    if (btn) {
      btn.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('scmp_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
      });
    }
  }

  function initShellEvents(user) {
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      const ok = await Utils.confirmDialog({ title: 'Cerrar sesión', message: '¿Deseas cerrar tu sesión en S.C.M.P.?', confirmText: 'Cerrar sesión', danger: true });
      if (ok) { await Storage.Session.clear(); window.location.href = 'login.html'; }
    });
    const hamburger = document.getElementById('btn-hamburger');
    const sidebar = document.querySelector('.sidebar');
    if (hamburger && sidebar) hamburger.addEventListener('click', () => sidebar.classList.toggle('open'));

    const search = document.getElementById('global-search');
    if (search) search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && search.value.trim()) {
        window.location.href = `casos.html?q=${encodeURIComponent(search.value.trim())}`;
      }
    });
  }

  /** Punto de entrada: construye sidebar + topbar y aplica la guardia de rol */
  async function mount({ active, title, subtitle, allowedRoles }) {
    const user = await guard();
    if (!user) return null;
    if (allowedRoles && !allowedRoles.includes(user.rol)) {
      Utils.toast('No tienes permisos para ver esta sección.', 'error');
      window.location.href = 'dashboard.html';
      return null;
    }
    document.getElementById('sidebar').innerHTML = renderSidebar(active, user);
    document.getElementById('topbar').innerHTML = renderTopbar({ title, subtitle });
    initTheme();
    initShellEvents(user);
    return user;
  }

  // Red de seguridad: si algo falla en cualquier parte del sistema sin que
  // el propio código lo capture, esto evita que quede en silencio.
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Error no manejado:', e.reason);
    if (typeof Utils !== 'undefined' && Utils.toast) {
      Utils.toast(`Ocurrió un error inesperado: ${e.reason?.message || e.reason}`, 'error');
    }
  });

  return { mount, guard, currentUser };
})();
