/* ============================================================
   pdf.js — Informe PDF profesional de un caso (jsPDF + autoTable)
   ============================================================ */

const PdfExport = (() => {

  function exportCaso(c, usuario) {
    if (!window.jspdf) { Utils.toast('No se pudo cargar el generador de PDF.', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const marginX = 40;
    let y = 44;
    const pageW = doc.internal.pageSize.getWidth();

    // ---- Encabezado ----
    doc.setFillColor(14, 20, 36);
    doc.rect(0, 0, pageW, 78, 'F');
    doc.setFillColor(47, 211, 198);
    doc.rect(0, 78, pageW, 3, 'F'); // barra de acento
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('S.C.M.P. — Sistema de Control de Malas Prácticas', marginX, 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.setTextColor(190, 200, 225);
    doc.text('Informe de caso', marginX, 48);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.setTextColor(239, 93, 93);
    doc.text('CONFIDENCIAL — USO INTERNO', marginX, 63);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.setTextColor(47, 211, 198);
    doc.text(c.numero, pageW - marginX, 34, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(190, 200, 225);
    doc.text(`Estado: ${c.estado}`, pageW - marginX, 50, { align: 'right' });

    y = 100;
    doc.setTextColor(20, 27, 49);

    // ---- Datos generales ----
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    doc.text('Información general', marginX, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX }, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 5, textColor: [20, 27, 49] },
      headStyles: { fillColor: [14, 20, 36], textColor: 255 },
      body: [
        ['Teléfono', c.telefono || '—', 'Zona', c.zona || '—'],
        ['Gerente de zona', c.gerenteZona || '—', 'Tel. gerente de zona', c.telefonoGerenteZona || '—'],
        ['Código REP', c.codigoEBA || '—', 'Teléfono REP', c.telefonoEBA || '—'],
        ['Campaña', c.campaña || '—', 'Sector', c.sector || '—'],
        ['Saldo pendiente', c.saldoPendiente ? `${c.moneda?.simbolo || 'Q'} ${c.saldoPendiente}` : '—', 'PD Actual', c.pdActual ? `${c.pdActual} días` : '—'],
        ['Fecha de contacto', Utils.formatDate(c.fechaContacto), 'Estado', c.estado],
      ],
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } }
    });
    y = doc.lastAutoTable.finalY + 18;

    // ---- Información administrativa ----
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    doc.text('Información administrativa', marginX, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX }, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 5, textColor: [20, 27, 49] },
      headStyles: { fillColor: [14, 20, 36], textColor: 255 },
      body: [
        ['Prioridad', c.prioridad || '—', 'Usuario creador', c.usuarioCreador || '—'],
        ['Fecha de creación', Utils.formatDateTime(c.fechaCreacion), 'Última modificación', Utils.formatDateTime(c.ultimaModificacion)],
        ['Fecha de cierre', c.fechaCierre ? Utils.formatDateTime(c.fechaCierre) : '—', '', ''],
      ],
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } }
    });
    y = doc.lastAutoTable.finalY + 18;

    // ---- Comparativa ----
    y = ensureSpace(doc, y, 90);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    doc.text('Comparativa de versiones', marginX, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX }, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 6, textColor: [20, 27, 49], valign: 'top' },
      head: [['Versión de la Representante', 'Versión de la Empresaria / EBA']],
      headStyles: { fillColor: [76, 141, 255] },
      body: [[c.versionRepresentante || '—', c.versionEBA || '—']],
      columnStyles: { 0: { cellWidth: 260 }, 1: { cellWidth: 260 } }
    });
    y = doc.lastAutoTable.finalY + 14;

    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX }, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 6, textColor: [20, 27, 49] },
      body: [
        ['Observaciones', c.observaciones || '—'],
        ['Análisis', c.analisis || '—'],
        ['Conclusión', c.conclusion || '—'],
        ['Acción tomada', c.accionTomada || '—'],
      ],
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 } }
    });
    y = doc.lastAutoTable.finalY + 18;

    // ---- Evidencias ----
    y = ensureSpace(doc, y, 60);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    doc.text('Evidencias', marginX, y); y += 8;
    const evidencias = c.evidencias || [];
    if (evidencias.length) {
      doc.autoTable({
        startY: y, margin: { left: marginX, right: marginX }, theme: 'striped',
        styles: { fontSize: 9, cellPadding: 5 },
        head: [['Archivo', 'Tamaño', 'Fecha']],
        headStyles: { fillColor: [14, 20, 36] },
        body: evidencias.map(e => [e.nombre, Utils.formatBytes(e.tamaño), Utils.formatDate(e.fecha)])
      });
      y = doc.lastAutoTable.finalY + 18;
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(120, 128, 150);
      doc.text('No se registraron evidencias en este caso.', marginX, y + 4);
      doc.setTextColor(20, 27, 49);
      y += 22;
    }

    // ---- Historial ----
    y = ensureSpace(doc, y, 60);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    doc.text('Historial / Línea de tiempo', marginX, y); y += 8;
    const tl = [...(c.timeline || [])].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX }, theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 5 },
      head: [['Fecha', 'Usuario', 'Acción', 'Estado anterior', 'Estado nuevo']],
      headStyles: { fillColor: [14, 20, 36] },
      body: tl.map(t => [Utils.formatDateTime(t.fecha), t.usuario, t.accion, t.estadoAnterior || '—', t.estadoNuevo || '—'])
    });

    // ---- Pie de página ----
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(223, 227, 238);
      doc.line(marginX, doc.internal.pageSize.getHeight() - 34, pageW - marginX, doc.internal.pageSize.getHeight() - 34);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.setTextColor(239, 93, 93);
      doc.text('CONFIDENCIAL — USO INTERNO', marginX, doc.internal.pageSize.getHeight() - 22);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.setTextColor(140, 148, 170);
      doc.text(`Generado el ${Utils.formatDateTime(Utils.nowISO())} por ${usuario?.nombre || 'Sistema'}`, marginX, doc.internal.pageSize.getHeight() - 10);
      doc.text(`Página ${i} de ${pageCount}`, pageW - marginX, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
    }

    doc.save(`${c.numero}_informe.pdf`);
    Utils.toast('PDF generado correctamente', 'success');
  }

  function ensureSpace(doc, y, needed) {
    const pageH = doc.internal.pageSize.getHeight();
    if (y + needed > pageH - 40) { doc.addPage(); return 44; }
    return y;
  }

  function exportListado(casos, titulo, usuario) {
    if (!window.jspdf) { Utils.toast('No se pudo cargar el generador de PDF.', 'error'); return; }
    if (!casos.length) { Utils.toast('No hay casos para exportar.', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
    const marginX = 32;
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(14, 20, 36);
    doc.rect(0, 0, pageW, 58, 'F');
    doc.setFillColor(47, 211, 198);
    doc.rect(0, 58, pageW, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('S.C.M.P. — Sistema de Control de Malas Prácticas', marginX, 24);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.setTextColor(190, 200, 225);
    doc.text(titulo, marginX, 40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.setTextColor(239, 93, 93);
    doc.text('CONFIDENCIAL — USO INTERNO', pageW - marginX, 24, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.setTextColor(190, 200, 225);
    doc.text(`${casos.length} caso(s)`, pageW - marginX, 40, { align: 'right' });

    doc.autoTable({
      startY: 74, margin: { left: marginX, right: marginX }, theme: 'striped',
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [14, 20, 36] },
      head: [['Caso', 'Zona', 'Campaña', 'Código REP', 'Estado', 'Prioridad', 'Saldo pendiente', 'Fecha', 'Responsable']],
      body: casos.map(c => [
        c.numero, c.zona || '—', c.campaña || '—', c.codigoEBA || '—',
        c.estado, c.prioridad || '—',
        c.saldoPendiente ? `${c.moneda?.simbolo || 'Q'} ${c.saldoPendiente}` : '—',
        Utils.formatDate(c.fechaCreacion), c.usuarioCreador || '—'
      ])
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.setTextColor(140, 148, 170);
      doc.text(`Generado el ${Utils.formatDateTime(Utils.nowISO())} por ${usuario?.nombre || 'Sistema'}`, marginX, doc.internal.pageSize.getHeight() - 16);
      doc.text(`Página ${i} de ${pageCount}`, pageW - marginX, doc.internal.pageSize.getHeight() - 16, { align: 'right' });
    }

    doc.save(`SCMP_listado_${new Date().toISOString().slice(0, 10)}.pdf`);
    Utils.toast(`PDF generado con ${casos.length} caso(s)`, 'success');
  }

  function exportReporteMensual(casos, usuario) {
    if (!window.jspdf) { Utils.toast('No se pudo cargar el generador de PDF.', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const marginX = 40;
    const pageW = doc.internal.pageSize.getWidth();
    let y;

    const now = new Date();
    const mesLabel = now.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
    const esteMes = casos.filter(c => {
      const f = new Date(c.fechaCreacion);
      return f.getFullYear() === now.getFullYear() && f.getMonth() === now.getMonth();
    });

    // ---- Encabezado ----
    doc.setFillColor(14, 20, 36);
    doc.rect(0, 0, pageW, 78, 'F');
    doc.setFillColor(47, 211, 198);
    doc.rect(0, 78, pageW, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('S.C.M.P. — Reporte Ejecutivo Mensual', marginX, 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.setTextColor(190, 200, 225);
    doc.text(mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1), marginX, 48);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.setTextColor(239, 93, 93);
    doc.text('CONFIDENCIAL — USO INTERNO', marginX, 63);

    y = 100;
    doc.setTextColor(20, 27, 49);

    // ---- KPIs generales ----
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    doc.text('Resumen general', marginX, y); y += 8;
    const counts = {
      total: casos.length,
      nuevo: casos.filter(c => c.estado === 'Nuevo').length,
      investigacion: casos.filter(c => c.estado === 'En investigación').length,
      escalado: casos.filter(c => c.estado === 'Escalado').length,
      resuelto: casos.filter(c => c.estado === 'Resuelto').length,
      cerrado: casos.filter(c => c.estado === 'Cerrado').length,
      esteMes: esteMes.length
    };
    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX }, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 6, halign: 'center' },
      headStyles: { fillColor: [14, 20, 36] },
      head: [['Total', 'Nuevos', 'Investigación', 'Escalados', 'Resueltos', 'Cerrados', `Creados en ${mesLabel}`]],
      body: [[counts.total, counts.nuevo, counts.investigacion, counts.escalado, counts.resuelto, counts.cerrado, counts.esteMes]]
    });
    y = doc.lastAutoTable.finalY + 20;

    // ---- Saldo pendiente por moneda ----
    y = ensureSpace(doc, y, 70);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    doc.text('Saldo pendiente por moneda (casos abiertos)', marginX, y); y += 8;
    const monedaMap = {};
    casos.forEach(c => {
      if (!c.saldoPendiente || c.estado === 'Cerrado') return;
      const cod = c.moneda?.codigo || 'GTQ', sim = c.moneda?.simbolo || 'Q';
      if (!monedaMap[cod]) monedaMap[cod] = { simbolo: sim, total: 0, casos: 0 };
      monedaMap[cod].total += parseFloat(c.saldoPendiente) || 0;
      monedaMap[cod].casos += 1;
    });
    const monedaEntries = Object.entries(monedaMap);
    if (monedaEntries.length) {
      doc.autoTable({
        startY: y, margin: { left: marginX, right: marginX }, theme: 'striped',
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [14, 20, 36] },
        head: [['Moneda', 'Casos abiertos', 'Total']],
        body: monedaEntries.map(([cod, d]) => [cod, d.casos, `${d.simbolo} ${d.total.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`])
      });
      y = doc.lastAutoTable.finalY + 20;
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(120, 128, 150);
      doc.text('Sin saldos pendientes en casos abiertos.', marginX, y + 4); doc.setTextColor(20, 27, 49);
      y += 24;
    }

    // ---- Casos por país / agente ----
    y = ensureSpace(doc, y, 90);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    doc.text('Casos por agente', marginX, y); y += 8;
    const porAgente = {};
    casos.forEach(c => { const k = c.usuarioCreador || 'Sin asignar'; porAgente[k] = (porAgente[k] || 0) + 1; });
    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX }, theme: 'striped',
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [14, 20, 36] },
      head: [['Agente', 'Casos']],
      body: Object.entries(porAgente).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v])
    });
    y = doc.lastAutoTable.finalY + 20;

    // ---- Casos estancados ----
    y = ensureSpace(doc, y, 90);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    doc.setTextColor(239, 93, 93);
    doc.text('Casos estancados (5+ días sin actividad)', marginX, y); y += 8;
    doc.setTextColor(20, 27, 49);
    const ahora = Date.now();
    const estancados = casos
      .filter(c => c.estado !== 'Cerrado' && c.estado !== 'Resuelto')
      .map(c => ({ ...c, dias: Math.floor((ahora - new Date(c.ultimaModificacion).getTime()) / 86400000) }))
      .filter(c => c.dias >= 5)
      .sort((a, b) => b.dias - a.dias);
    if (estancados.length) {
      doc.autoTable({
        startY: y, margin: { left: marginX, right: marginX }, theme: 'striped',
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: { fillColor: [14, 20, 36] },
        head: [['Caso', 'Código REP', 'Responsable', 'Estado', 'Días sin actividad']],
        body: estancados.map(c => [c.numero, c.codigoEBA || '—', c.usuarioCreador, c.estado, c.dias])
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(120, 128, 150);
      doc.text('Ningún caso lleva 5 días o más sin actividad.', marginX, y + 4); doc.setTextColor(20, 27, 49);
    }

    // ---- Pie de página ----
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(223, 227, 238);
      doc.line(marginX, doc.internal.pageSize.getHeight() - 34, pageW - marginX, doc.internal.pageSize.getHeight() - 34);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(239, 93, 93);
      doc.text('CONFIDENCIAL — USO INTERNO', marginX, doc.internal.pageSize.getHeight() - 22);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 148, 170);
      doc.text(`Generado el ${Utils.formatDateTime(Utils.nowISO())} por ${usuario?.nombre || 'Sistema'}`, marginX, doc.internal.pageSize.getHeight() - 10);
      doc.text(`Página ${i} de ${pageCount}`, pageW - marginX, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
    }

    doc.save(`SCMP_reporte_mensual_${new Date().toISOString().slice(0, 7)}.pdf`);
    Utils.toast('Reporte mensual generado', 'success');
  }

  return { exportCaso, exportListado, exportReporteMensual };
})();
