/* ============================================================
   excel.js — Exportación a Excel (.xlsx) usando SheetJS
   ============================================================ */

const ExcelExport = (() => {

  function rowsFromCasos(casos) {
    return casos.map(c => ({
      'Número de Caso': c.numero,
      'Teléfono': c.telefono,
      'Saldo Pendiente': c.saldoPendiente,
      'Moneda': c.moneda?.codigo || 'GTQ',
      'Zona': c.zona,
      'Gerente de Zona': c.gerenteZona,
      'Teléfono Gerente de Zona': c.telefonoGerenteZona,
      'Código REP': c.codigoEBA,
      'Teléfono REP': c.telefonoEBA,
      'PD Actual': c.pdActual,
      'Campaña': c.campaña,
      'Sector': c.sector,
      'Fecha de Contacto': Utils.formatDate(c.fechaContacto),
      'Estado': c.estado,
      'Prioridad': c.prioridad,
      'Usuario Creador': c.usuarioCreador,
      'Fecha de Creación': Utils.formatDate(c.fechaCreacion),
      'Última Modificación': Utils.formatDate(c.ultimaModificacion),
      'Fecha de Cierre': c.fechaCierre ? Utils.formatDate(c.fechaCierre) : '',
      'Versión Representante': c.versionRepresentante || '',
      'Versión EBA': c.versionEBA || '',
      'Observaciones': c.observaciones || '',
      'Análisis': c.analisis || '',
      'Conclusión': c.conclusion || '',
      'Acción Tomada': c.accionTomada || '',
      'N° de Evidencias': (c.evidencias || []).length
    }));
  }

  function autosizeColumns(ws, rows) {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    ws['!cols'] = keys.map(k => {
      const maxLen = Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length));
      return { wch: Math.min(Math.max(maxLen + 2, 10), 45) };
    });
  }

  function exportCasos(casos, filename = 'SCMP_casos') {
    if (!casos.length) { Utils.toast('No hay casos para exportar.', 'error'); return; }
    const rows = rowsFromCasos(casos);
    const ws = XLSX.utils.json_to_sheet(rows);
    autosizeColumns(ws, rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Casos');
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    Utils.toast(`Exportados ${casos.length} caso(s) a Excel`, 'success');
  }

  function exportUnCaso(caso) {
    exportCasos([caso], `SCMP_${caso.numero}`);
  }

  return { exportCasos, exportUnCaso };
})();
