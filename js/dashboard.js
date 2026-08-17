/* ============================================================
   dashboard.js — KPIs, gráficas y actividad reciente
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await App.mount({ active: 'dashboard', title: 'Dashboard', subtitle: 'Resumen general' });
  if (!user) return;

  const all = await Storage.Casos.getAll();
  // Un Agente solo ve las estadísticas de los casos que él mismo creó (igual que en el listado de Casos)
  const casos = user.rol === 'Agente' ? all.filter(c => c.creadoPor === user.id) : all;

  renderKPIs(casos);
  renderGroupBars('by-campaña', casos, 'campaña');
  renderGroupBars('by-zona', casos, 'zona');
  renderGroupBars('by-gerente', casos, 'gerenteZona');
  renderGroupBars('by-agente', casos, 'usuarioCreador');
  renderEsteMes('by-mes', casos, 'usuarioCreador');
  renderSaldosPorMoneda(casos);
  renderDonut(casos);
  renderEstancados(casos);
  renderActivity();

  document.getElementById('btn-reporte-mensual').addEventListener('click', () => PdfExport.exportReporteMensual(casos, user));
});

const DIAS_ESTANCADO = 5;

function renderEstancados(casos) {
  const el = document.getElementById('estancados-panel');
  if (!el) return;
  const ahora = Date.now();
  const estancados = casos
    .filter(c => c.estado !== 'Cerrado' && c.estado !== 'Resuelto')
    .map(c => ({ ...c, dias: Math.floor((ahora - new Date(c.ultimaModificacion).getTime()) / 86400000) }))
    .filter(c => c.dias >= DIAS_ESTANCADO)
    .sort((a, b) => b.dias - a.dias);

  if (!estancados.length) {
    el.innerHTML = `<p class="text-muted text-sm">Ningún caso lleva ${DIAS_ESTANCADO} días o más sin actividad. 👍</p>`;
    return;
  }
  el.innerHTML = estancados.slice(0, 8).map(c => `
    <a href="detalle-caso.html?id=${c.id}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--paper-border);text-decoration:none;color:inherit;">
      <div style="min-width:0;">
        <div style="font-size:12.8px;font-weight:600;">${Utils.escapeHtml(c.numero)} · ${Utils.escapeHtml(c.codigoEBA || '—')}</div>
        <div style="font-size:11px;color:var(--text-400);">${Utils.escapeHtml(c.usuarioCreador)} · <span class="badge ${({'Nuevo':'st-nuevo','En investigación':'st-investigacion','Pendiente de información':'st-pendiente','En seguimiento':'st-seguimiento','Escalado':'st-escalado'})[c.estado] || ''}">${Utils.escapeHtml(c.estado)}</span></div>
      </div>
      <div style="flex-shrink:0;font-size:12px;font-weight:700;color:var(--red);white-space:nowrap;">${c.dias} días</div>
    </a>`).join('');
}

function renderEsteMes(containerId, casos, field) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const now = new Date();
  const esteMes = casos.filter(c => {
    const f = new Date(c.fechaCreacion);
    return f.getFullYear() === now.getFullYear() && f.getMonth() === now.getMonth();
  });
  renderGroupBars(containerId, esteMes, field);
}

function renderSaldosPorMoneda(casos) {
  const el = document.getElementById('saldos-moneda');
  if (!el) return;
  const map = {};
  casos.forEach(c => {
    if (!c.saldoPendiente || c.estado === 'Cerrado') return;
    const cod = c.moneda?.codigo || 'GTQ';
    const sim = c.moneda?.simbolo || 'Q';
    if (!map[cod]) map[cod] = { simbolo: sim, total: 0, casos: 0 };
    map[cod].total += parseFloat(c.saldoPendiente) || 0;
    map[cod].casos += 1;
  });
  const entries = Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  if (!entries.length) { el.innerHTML = '<p class="text-muted text-sm">Sin saldos pendientes en casos abiertos.</p>'; return; }
  el.innerHTML = entries.map(([cod, d]) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--paper-border);">
      <div>
        <div style="font-size:13px;font-weight:700;">${cod}</div>
        <div style="font-size:11px;color:var(--text-400);">${d.casos} caso(s) abierto(s)</div>
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;">${d.simbolo} ${d.total.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>`).join('');
}

function renderKPIs(casos) {
  const counts = {
    total: casos.length,
    nuevo: casos.filter(c => c.estado === 'Nuevo').length,
    investigacion: casos.filter(c => c.estado === 'En investigación').length,
    pendiente: casos.filter(c => c.estado === 'Pendiente de información' || c.estado === 'En seguimiento').length,
    escalado: casos.filter(c => c.estado === 'Escalado').length,
    resuelto: casos.filter(c => c.estado === 'Resuelto').length,
    cerrado: casos.filter(c => c.estado === 'Cerrado').length
  };
  const cards = [
    { key: 'total', label: 'Total de casos' },
    { key: 'nuevo', label: 'Casos nuevos' },
    { key: 'investigacion', label: 'En investigación' },
    { key: 'pendiente', label: 'Pendientes' },
    { key: 'escalado', label: 'Escalados' },
    { key: 'resuelto', label: 'Resueltos' },
    { key: 'cerrado', label: 'Cerrados' }
  ];
  document.getElementById('kpi-grid').innerHTML = cards.map(c => `
    <div class="kpi-card ${c.key}">
      <div class="kpi-num">${counts[c.key]}</div>
      <div class="kpi-label">${c.label}</div>
    </div>`).join('');
}

function renderGroupBars(containerId, casos, field) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const map = {};
  casos.forEach(c => {
    const key = c[field] || 'Sin asignar';
    map[key] = (map[key] || 0) + 1;
  });
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(1, ...entries.map(e => e[1]));

  if (!entries.length) { el.innerHTML = '<p class="text-muted text-sm">Sin datos todavía.</p>'; return; }

  el.innerHTML = entries.map(([label, val]) => `
    <div class="bar-row">
      <div class="bar-label" title="${Utils.escapeHtml(label)}">${Utils.escapeHtml(label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(val / max) * 100}%"></div></div>
      <div class="bar-val">${val}</div>
    </div>`).join('');
}

function renderDonut(casos) {
  const canvas = document.getElementById('estado-donut');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 180;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const colors = {
    'Nuevo': '#4C8DFF', 'En investigación': '#8B7CF6', 'Pendiente de información': '#F5A623',
    'En seguimiento': '#8B7CF6', 'Escalado': '#EF5D5D', 'Resuelto': '#33C481', 'Cerrado': '#8B93A7'
  };
  const map = {};
  casos.forEach(c => { map[c.estado] = (map[c.estado] || 0) + 1; });
  const total = casos.length || 1;
  const entries = Object.entries(map);

  let start = -Math.PI / 2;
  const cx = size / 2, cy = size / 2, rOuter = 78, rInner = 50;
  ctx.clearRect(0, 0, size, size);
  entries.forEach(([estado, val]) => {
    const angle = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rOuter, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = colors[estado] || '#8B93A7';
    ctx.fill();
    start += angle;
  });
  // agujero central
  const bg = getComputedStyle(document.body).getPropertyValue('--paper-100').trim() || '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-900').trim() || '#141B31';
  ctx.font = '700 20px Space Grotesk, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(total), cx, cy + 3);
  ctx.font = '600 9px Inter, sans-serif';
  ctx.fillStyle = '#8991A8';
  ctx.fillText('CASOS', cx, cy + 16);

  document.getElementById('donut-legend').innerHTML = entries.map(([estado, val]) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${colors[estado] || '#8B93A7'}"></span>
      ${Utils.escapeHtml(estado)} · <b style="color:var(--text-900);margin-left:2px;">${val}</b>
    </div>`).join('');
}

const ACT_ICONS = {
  caso: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  usuario: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'
};

async function renderActivity() {
  const registros = await Storage.Auditoria.getAll(8);
  const el = document.getElementById('activity-list');
  if (!registros.length) {
    el.innerHTML = `<div class="empty-state"><p>Todavía no hay actividad registrada.</p></div>`;
    return;
  }
  el.innerHTML = registros.map(r => `
    <div class="activity-item">
      <div class="act-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${ACT_ICONS[r.tipo] || ACT_ICONS.caso}</svg></div>
      <div>
        <div class="act-text">${Utils.escapeHtml(r.accion)}</div>
        <div class="act-time">${Utils.formatDateTime(r.fecha)}</div>
      </div>
    </div>`).join('');
}
