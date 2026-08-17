/* ============================================================
   catalogo.js — Catálogo de representantes (REP), solo Supervisor.
   ============================================================ */

let CAT_PENDIENTE = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await App.mount({ active: 'catalogo', title: 'Catálogo de REP' });
  if (!user) return;

  const hint = document.getElementById('catalogo-scope-hint');
  hint.textContent = user.rol === 'Supervisor'
    ? 'Estás viendo el catálogo combinado de todos los gestores.'
    : 'Este es tu catálogo personal — solo tú lo ves y lo administras.';

  await renderTabla();

  document.getElementById('file-excel').addEventListener('change', handleFileExcel);
  document.getElementById('btn-confirmar-import').addEventListener('click', confirmarImportacion);
  document.getElementById('manual-form').addEventListener('submit', handleManual);
});

async function renderTabla() {
  const rows = await Storage.CatalogoRep.getAll();
  const tbody = document.getElementById('catalogo-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><h4>Catálogo vacío</h4><p>Importa un Excel o agrega registros manualmente.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="mono cell-strong">${Utils.escapeHtml(r.codigoRep)}</td>
      <td>${Utils.escapeHtml(r.campaña || '—')}</td>
      <td>${Utils.escapeHtml(r.zona || '—')}</td>
      <td>${Utils.escapeHtml(r.gerenteZona || '—')}</td>
      <td>${Utils.escapeHtml(r.telefonoGerenteZona || '—')}</td>
      <td>${Utils.escapeHtml(r.telefonoRep || '—')}</td>
      <td>${Utils.escapeHtml(r.sector || '—')}</td>
      <td>${Utils.escapeHtml(r.pdActual || '—')}</td>
      <td>${Utils.escapeHtml(r.saldoLocal || '—')}</td>
      <td>${Utils.formatDate(r.actualizado)}</td>
      <td><button class="btn btn-ghost btn-sm" data-del="${Utils.escapeHtml(r.id)}" data-codigo="${Utils.escapeHtml(r.codigoRep)}">Eliminar</button></td>
    </tr>`).join('');

  tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await Utils.confirmDialog({ title: 'Eliminar registro', message: `¿Quitar "${btn.dataset.codigo}" del catálogo?`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    await Storage.CatalogoRep.eliminar(btn.dataset.del);
    Utils.toast('Registro eliminado', 'success');
    renderTabla();
  }));
}

function normalizarEncabezado(h) {
  return String(h || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita acentos
}

function handleFileExcel(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const wb = XLSX.read(evt.target.result, { type: 'binary' });
    // Se prioriza una hoja llamada "data"; si no existe, se intenta "REC";
    // si tampoco existe, se usa la primera hoja del archivo.
    const nombreHoja = wb.SheetNames.find(n => n.trim().toLowerCase() === 'data')
      || wb.SheetNames.find(n => n.trim().toLowerCase() === 'rec')
      || wb.SheetNames[0];
    if (!['data', 'rec'].includes(nombreHoja.trim().toLowerCase())) {
      Utils.toast(`No se encontró una hoja llamada "data" ni "REC" — se está usando "${nombreHoja}" en su lugar.`, 'error');
    }
    const ws = wb.Sheets[nombreHoja];
    const filas = XLSX.utils.sheet_to_json(ws, { defval: '' });

    CAT_PENDIENTE = filas.map(fila => {
      const norm = {};
      Object.keys(fila).forEach(k => { norm[normalizarEncabezado(k)] = fila[k]; });
      const buscar = (...claves) => {
        for (const c of claves) { if (norm[c] !== undefined && norm[c] !== '') return norm[c]; }
        return '';
      };
      return {
        codigoRep: buscar('codigo', 'código', 'codigo rep', 'codigorep'),
        campaña: buscar('campania_adeuda', 'campana_adeuda', 'campaña', 'campana'),
        zona: buscar('zona'),
        gerenteZona: buscar('gerente_zona', 'gerente zona', 'gerente de zona', 'gerentezona', 'gerente'),
        telefonoGerenteZona: buscar('contacto_gerente', 'telefono gerente', 'telefono gerente zona', 'tel gerente'),
        telefonoRep: buscar('contacto', 'telefono', 'teléfono', 'telefono rep', 'telefonorep'),
        sector: buscar('sector'),
        pdActual: buscar('pd_actual', 'pdactual', 'dias_mora_actual', 'dias mora', 'días mora', 'pd actual'),
        saldoLocal: buscar('saldo_actual', 'saldo local', 'saldolocal', 'saldo_local', 'saldo_inicial', 'saldo'),
        nombreRep: buscar('nombre rep', 'nombrerep', 'nombre')
      };
    }).filter(f => f.codigoRep);

    const box = document.getElementById('preview-box');
    const text = document.getElementById('preview-text');
    if (!CAT_PENDIENTE.length) {
      text.textContent = 'No se encontraron filas válidas — revisa que el archivo tenga una columna de código.';
      box.style.display = 'block';
      document.getElementById('btn-confirmar-import').style.display = 'none';
      return;
    }
    text.textContent = `Se encontraron ${CAT_PENDIENTE.length} registro(s) listos para importar.`;
    document.getElementById('btn-confirmar-import').style.display = 'inline-flex';
    box.style.display = 'block';
  };
  reader.readAsBinaryString(file);
}

async function confirmarImportacion() {
  if (!CAT_PENDIENTE.length) return;
  const btn = document.getElementById('btn-confirmar-import');
  btn.disabled = true; btn.textContent = 'Importando…';
  try {
    const n = await Storage.CatalogoRep.upsertMuchos(CAT_PENDIENTE);
    Utils.toast(`${n} registro(s) importado(s) correctamente`, 'success');
    CAT_PENDIENTE = [];
    document.getElementById('preview-box').style.display = 'none';
    document.getElementById('file-excel').value = '';
    renderTabla();
  } catch (err) {
    Utils.toast('Error al importar: ' + (err.message || err), 'error');
  }
  btn.disabled = false; btn.textContent = 'Confirmar importación';
}

async function handleManual(e) {
  e.preventDefault();
  const f = e.target;
  const codigoRep = f.elements.codigoRep.value.trim();
  if (!codigoRep) { Utils.toast('El código REP es obligatorio.', 'error'); return; }
  await Storage.CatalogoRep.upsertMuchos([{
    codigoRep,
    nombreRep: f.elements.nombreRep.value.trim(),
    campaña: f.elements.campaña.value.trim(),
    zona: f.elements.zona.value.trim(),
    gerenteZona: f.elements.gerenteZona.value.trim(),
    telefonoGerenteZona: f.elements.telefonoGerenteZona.value.trim(),
    telefonoRep: f.elements.telefonoRep.value.trim(),
    sector: f.elements.sector.value.trim(),
    pdActual: f.elements.pdActual.value.trim(),
    saldoLocal: f.elements.saldoLocal.value.trim()
  }]);
  Utils.toast('Registro guardado', 'success');
  f.reset();
  renderTabla();
}
