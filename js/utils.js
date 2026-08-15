/* ============================================================
   utils.js — Funciones auxiliares reutilizables en todo el sistema
   ============================================================ */

const Utils = (() => {

  /** Genera un ID único simple (suficiente para LocalStorage; una API real usaría UUID/auto-increment) */
  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Formatea un ISO string a fecha corta legible (dd/mm/aaaa) */
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /** Formatea un ISO string a fecha + hora legible */
  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /** Devuelve el ISO string del momento actual */
  function nowISO() { return new Date().toISOString(); }

  /** Debounce genérico para buscadores / inputs */
  function debounce(fn, wait = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  /** Escapa HTML para evitar inyección al pintar texto de usuario */
  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /** Convierte un tamaño en bytes a texto legible */
  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0, val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  /** Iniciales de un nombre completo, para avatares */
  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
  }

  /** Convierte un File a base64 (para "guardar" evidencias en LocalStorage como demo) */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------------- Toasts ----------------
  function ensureToastStack() {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
  };

  function toast(message, type = 'info', duration = 3800) {
    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${ICONS[type] || ICONS.info}<div>${escapeHtml(message)}</div><span class="t-close">✕</span>`;
    el.querySelector('.t-close').onclick = () => removeToast(el);
    stack.appendChild(el);
    const timer = setTimeout(() => removeToast(el), duration);
    el.dataset.timer = timer;
  }
  function removeToast(el) {
    if (!el || !el.parentNode) return;
    clearTimeout(el.dataset.timer);
    el.style.animation = 'toastOut .2s ease forwards';
    setTimeout(() => el.remove(), 200);
  }

  // ---------------- Modal genérico de confirmación ----------------
  function confirmDialog({ title = '¿Confirmar acción?', message = '', confirmText = 'Confirmar', danger = false } = {}) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop open';
      backdrop.innerHTML = `
        <div class="modal" style="max-width:400px;">
          <div class="modal-head"><h3>${escapeHtml(title)}</h3></div>
          <div class="modal-body"><p style="font-size:13.5px;color:var(--text-600);line-height:1.6;margin:0;">${escapeHtml(message)}</p></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-accent'}" data-act="ok">${escapeHtml(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop || e.target.dataset.act === 'cancel') { backdrop.remove(); resolve(false); }
        if (e.target.dataset.act === 'ok') { backdrop.remove(); resolve(true); }
      });
    });
  }

  /** Igual que confirmDialog, pero con un campo de texto obligatorio (ej. "motivo"). Devuelve el texto o null si se cancela. */
  function promptDialog({ title = 'Escribe un motivo', message = '', placeholder = '', confirmText = 'Confirmar', required = true } = {}) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop open';
      backdrop.innerHTML = `
        <div class="modal" style="max-width:440px;">
          <div class="modal-head"><h3>${escapeHtml(title)}</h3></div>
          <div class="modal-body">
            ${message ? `<p style="font-size:13px;color:var(--text-600);line-height:1.6;margin:0 0 12px;">${escapeHtml(message)}</p>` : ''}
            <textarea data-role="prompt-input" placeholder="${escapeHtml(placeholder)}" style="width:100%;min-height:90px;padding:10px 12px;border-radius:8px;border:1px solid var(--paper-border);background:var(--paper-0);color:var(--text-900);font-size:13px;font-family:inherit;"></textarea>
            <div data-role="prompt-err" style="display:none;color:var(--red);font-size:11.5px;margin-top:6px;">Este campo es obligatorio.</div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
            <button class="btn btn-accent" data-act="ok">${escapeHtml(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);
      const textarea = backdrop.querySelector('[data-role="prompt-input"]');
      const errEl = backdrop.querySelector('[data-role="prompt-err"]');
      textarea.focus();
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop || e.target.dataset.act === 'cancel') { backdrop.remove(); resolve(null); }
        if (e.target.dataset.act === 'ok') {
          const val = textarea.value.trim();
          if (required && !val) { errEl.style.display = 'block'; textarea.style.borderColor = 'var(--red)'; return; }
          backdrop.remove();
          resolve(val);
        }
      });
    });
  }

  // ---------------- Modal helpers (abrir/cerrar por id) ----------------
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  // ---------------- Loader de página completa ----------------
  function showLoader() {
    let l = document.getElementById('global-loader');
    if (!l) {
      l = document.createElement('div');
      l.id = 'global-loader';
      l.className = 'loader-overlay';
      l.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(l);
    }
    l.style.display = 'flex';
  }
  function hideLoader() {
    const l = document.getElementById('global-loader');
    if (l) l.style.display = 'none';
  }

  return {
    uid, formatDate, formatDateTime, nowISO, debounce, escapeHtml, formatBytes, initials,
    fileToBase64, toast, confirmDialog, promptDialog, openModal, closeModal, showLoader, hideLoader
  };
})();
