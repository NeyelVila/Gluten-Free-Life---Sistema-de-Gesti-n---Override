import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const VERDE = '#2E7D32';
const GRIS = '#37474F';

const money = (n: number) =>
  '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);
const qty = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(n);
const fecha = (d: Date | string) =>
  new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: process.env.TZ_NEGOCIO || 'America/Argentina/Buenos_Aires' }).format(new Date(d));
const unidad = (t: string) => (t === 'GRANEL' ? 'kg' : 'u.');

/** PedidoCompra.generarPDF(): documento A4 prolijo para enviar por WhatsApp o imprimir. */
export function generarPdfPedido(pedido: any, cfg: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Pedido de compra ${pedido.id_pedido}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 40;
    const right = doc.page.width - 40;
    const width = right - left;

    // Encabezado / logo
    doc.circle(left + 22, 62, 22).lineWidth(2).stroke(VERDE);
    doc.circle(left + 22, 62, 15).lineWidth(1).stroke(VERDE);
    doc.fillColor(VERDE).fontSize(16).font('Helvetica-Bold').text('GF', left + 12, 55);
    doc.fillColor(VERDE).fontSize(20).font('Helvetica-Bold').text('GLUTEN FREE LIFE', left + 56, 44);
    doc.fillColor(GRIS).fontSize(9).font('Helvetica')
      .text(cfg.comercio_nombre || 'Gluten Free Life', left + 56, 68)
      .text(`${cfg.comercio_direccion || ''}  ·  Tel. ${cfg.comercio_telefono || ''}`, left + 56, 80);

    doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(14)
      .text(`PEDIDO DE COMPRA N° ${String(pedido.id_pedido).padStart(4, '0')}`, left, 44, { width, align: 'right' });
    doc.font('Helvetica').fontSize(9)
      .text(`Fecha: ${fecha(pedido.fecha_generacion)}`, left, 64, { width, align: 'right' })
      .text(`Emitido por: ${pedido.usuario_nombre}`, left, 76, { width, align: 'right' });

    doc.moveTo(left, 108).lineTo(right, 108).lineWidth(1.5).stroke(VERDE);

    // Intermediario
    doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(10).text('INTERMEDIARIO LOGÍSTICO', left, 118);
    doc.fillColor(GRIS).font('Helvetica').fontSize(10)
      .text(`${pedido.intermediario_nombre}${pedido.intermediario_contacto ? ' — ' + pedido.intermediario_contacto : ''}`, left, 132)
      .text(
        [pedido.telefono_whatsapp && `WhatsApp: ${pedido.telefono_whatsapp}`, pedido.intermediario_email && `Email: ${pedido.intermediario_email}`]
          .filter(Boolean)
          .join('   ·   ') || ' ',
        left,
        146
      );

    // Tabla
    const cols = [
      { t: '#', w: 24, a: 'left' as const },
      { t: 'Producto', w: 190, a: 'left' as const },
      { t: 'Código', w: 80, a: 'left' as const },
      { t: 'Stock', w: 52, a: 'right' as const },
      { t: 'Cantidad', w: 62, a: 'right' as const },
      { t: 'P. compra', w: 56, a: 'right' as const },
      { t: 'Subtotal', w: 51, a: 'right' as const },
    ];
    const scale = width / cols.reduce((s, c) => s + c.w, 0);
    cols.forEach((c) => (c.w = c.w * scale));

    const drawHeader = (y: number) => {
      doc.rect(left, y, width, 20).fill(VERDE);
      let x = left;
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8.5);
      for (const c of cols) {
        doc.text(c.t, x + 4, y + 6, { width: c.w - 8, align: c.a });
        x += c.w;
      }
      return y + 20;
    };

    let y = drawHeader(172);
    pedido.items.forEach((it: any, i: number) => {
      const rowH = it.observacion ? 30 : 22;
      if (y + rowH > doc.page.height - 110) {
        doc.addPage();
        y = drawHeader(40);
      }
      if (i % 2 === 0) doc.rect(left, y, width, rowH).fill('#F1F8E9');
      let x = left;
      doc.fillColor(GRIS).font('Helvetica').fontSize(9);
      const vals = [
        String(i + 1),
        it.nombre,
        it.codigo_barra || '—',
        `${qty(it.stock_actual)} ${unidad(it.tipo_venta)}`,
        `${qty(it.cantidad_solicitada)} ${unidad(it.tipo_venta)}`,
        money(it.precio_costo),
        money(it.subtotal_estimado),
      ];
      cols.forEach((c, k) => {
        doc.font(k === 4 ? 'Helvetica-Bold' : 'Helvetica').text(vals[k], x + 4, y + 6, { width: c.w - 8, align: c.a, lineBreak: false, ellipsis: true });
        x += c.w;
      });
      if (it.observacion) {
        doc.fillColor('#78909C').fontSize(8).text(`Obs.: ${it.observacion}`, left + cols[0].w + 4, y + 18, { width: width - 30, lineBreak: false, ellipsis: true });
      }
      y += rowH;
    });

    if (y + 70 > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }
    doc.moveTo(left, y + 4).lineTo(right, y + 4).lineWidth(0.5).stroke('#B0BEC5');
    doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(12)
      .text(`TOTAL ESTIMADO: ${money(pedido.total_estimado)}`, left, y + 14, { width, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#78909C')
      .text(`${pedido.items.length} producto(s). Los precios de compra son los últimos registrados y pueden variar.`, left, y + 34, { width, align: 'right' });

    doc.fontSize(8).fillColor('#90A4AE')
      .text('Documento generado por Gluten Free Life — Sistema de Gestión', left, doc.page.height - 50, { width, align: 'center', lineBreak: false });
    doc.end();
  });
}

/** PedidoCompra.generarExcel(): misma información en una planilla. */
export async function generarExcelPedido(pedido: any, cfg: Record<string, string>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gluten Free Life';
  const ws = wb.addWorksheet(`Pedido ${String(pedido.id_pedido).padStart(4, '0')}`, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 5 },
    { width: 34 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 30 },
  ];
  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = 'GLUTEN FREE LIFE — PEDIDO DE COMPRA';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF2E7D32' } };
  ws.addRow([`Pedido N° ${String(pedido.id_pedido).padStart(4, '0')}`]);
  ws.addRow([`Fecha: ${fecha(pedido.fecha_generacion)}`]);
  ws.addRow([`Comercio: ${cfg.comercio_nombre || ''} — ${cfg.comercio_direccion || ''} — Tel. ${cfg.comercio_telefono || ''}`]);
  ws.addRow([`Intermediario: ${pedido.intermediario_nombre}${pedido.intermediario_contacto ? ' (' + pedido.intermediario_contacto + ')' : ''}`]);
  ws.addRow([`WhatsApp: ${pedido.telefono_whatsapp || '—'}   Email: ${pedido.intermediario_email || '—'}`]);
  ws.addRow([]);
  const head = ws.addRow(['#', 'Producto', 'Código', 'Stock actual', 'Cantidad', 'Unidad', 'Precio compra', 'Subtotal', 'Observación']);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
    c.alignment = { horizontal: 'center' };
  });
  const first = head.number + 1;
  pedido.items.forEach((it: any, i: number) => {
    const r = ws.addRow([
      i + 1,
      it.nombre,
      it.codigo_barra || '',
      it.stock_actual,
      it.cantidad_solicitada,
      unidad(it.tipo_venta),
      it.precio_costo,
      null,
      it.observacion || '',
    ]);
    r.getCell(8).value = { formula: `E${r.number}*G${r.number}`, result: it.subtotal_estimado };
    r.getCell(7).numFmt = '"$"#,##0.00';
    r.getCell(8).numFmt = '"$"#,##0.00';
    r.getCell(4).numFmt = '#,##0.###';
    r.getCell(5).numFmt = '#,##0.###';
    r.getCell(5).font = { bold: true };
  });
  const last = first + pedido.items.length - 1;
  const tot = ws.addRow(['', '', '', '', '', '', 'TOTAL ESTIMADO', null, '']);
  tot.getCell(8).value = { formula: `SUM(H${first}:H${last})`, result: pedido.total_estimado };
  tot.getCell(8).numFmt = '"$"#,##0.00';
  tot.getCell(7).font = { bold: true };
  tot.getCell(8).font = { bold: true, size: 12 };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
