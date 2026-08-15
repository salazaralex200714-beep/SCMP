/* ============================================================
   auditoria.js — Bitácora completa de acciones del sistema
   ============================================================ */

let AUD_ALL = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await App.mount({ active: 'auditoria', title: 'Auditoría', allowedRoles: ['Supervisor'] });
  if (!user) return;

  AUD_ALL = await Storage.Auditoria.getAll(500);
  render();

  document.getElementById('f-tipo').addEventListener('change', render);
  document.getElementById('f-buscar').addEventListener('input', Utils.debounce(render, 200));
});

const TIPO_LABEL = { caso: 'Caso', usuario: 'Usuario' };

function render() {
  const tipo = document.getElementById('f-tipo').value;
  const q = (document.getElementById('f-buscar').value || '').toLowerCase();

  let rows = [...AUD_ALL];
  if (tipo) rows = rows.filter(r => r.tipo === tipo);
  if (q) rows = rows.filter(r => (r.accion || '').toLowerCase().includes(q) || (r.usuario || '').toLowerCase().includes(q));

  const tbody = document.getElementById('auditoria-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><h4>Sin registros</h4><p>Todavía no hay actividad que coincida con este filtro.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${Utils.formatDateTime(r.fecha)}</td>
      <td class="cell-strong">${Utils.escapeHtml(r.usuario)}</td>
      <td><span class="badge ${r.tipo === 'usuario' ? 'st-escalado' : 'st-nuevo'}">${TIPO_LABEL[r.tipo] || r.tipo}</span></td>
      <td>${Utils.escapeHtml(r.accion)}</td>
    </tr>`).join('');
}
