// excel.js
// Genera los archivos de Excel (.xlsx) con ExcelJS (vendor-exceljs.min.js).
// - Excel del viaje: Resumen, Artículos, Pagos y una hoja por cliente.
//   Es para uso interno: incluye costos y ganancias.
// - Excel del cliente: solo su cuenta (sin costos), para mandárselo.
// Las columnas calculadas llevan fórmulas: si cambias un precio, el tipo de
// cambio o el impuesto en Excel, todo se vuelve a calcular.

import { loadScript } from './ui.js';
import {
  itemCalc, sumTotals, STATUS, PAYMENT_METHODS, fmtDateRange, fmtDateTime,
  parseISODate, uniqueLabels, fileSafe, todayISO,
} from './calc.js';

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function loadExcelJS() {
  if (window.ExcelJS) return window.ExcelJS;
  await loadScript('vendor-exceljs.min.js');
  if (!window.ExcelJS) throw new Error('No se pudo cargar el generador de Excel.');
  return window.ExcelJS;
}

const COLOR = {
  band: 'FF201E3A',
  white: 'FFFFFFFF',
  rosa: 'FFCF0A6E',
  soft: 'FFF4F2F7',
  line: 'FFD9D5E3',
  muted: 'FF6E6A85',
  totalFill: 'FFFCE6F1',
};
const NF = {
  usd: '"US$"#,##0.00',
  mxn: '"$"#,##0.00;[Red]-"$"#,##0.00',
  pct: '0.00%',
  rate: '#,##0.00##',
  int: '#,##0',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
};
const STATUS_LIST = '"Pendiente,Comprado,Entregado,No encontrado"';

// ExcelJS guarda las fechas como si fueran UTC; así se conserva la hora local.
const asUTC = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
const isoToExcel = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : asUTC(d);
};
const dayToExcel = (s) => {
  const d = parseISODate(s);
  return d ? asUTC(d) : null;
};

/** Evita que un nombre se interprete como comodín o comparación en SUMAR.SI.CONJUNTO. */
const criteriaSafe = (s) => String(s || '').replace(/[*?~]/g, '').replace(/^[=<>]+/, '').trim() || 'Sin nombre';

/** Comillas para nombres de hoja dentro de fórmulas: 'Artículos'!A1 */
const q = (name) => `'${name.replace(/'/g, "''")}'`;

function sheetNamer() {
  const used = new Set();
  return (raw) => {
    const base = String(raw || 'Hoja').replace(/[[\]*?/\\:']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Hoja';
    let name = base;
    let i = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${i++})`;
      name = base.slice(0, 31 - suffix.length).trim() + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  };
}

function styleHeader(row, cols) {
  row.height = 32;
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: COLOR.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.band } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
}

function hairline(row, cols) {
  for (let c = 1; c <= cols; c++) {
    row.getCell(c).border = { bottom: { style: 'hair', color: { argb: COLOR.line } } };
  }
}

function emphasize(row, cols, fill = COLOR.totalFill) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { ...(cell.font || {}), bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  }
}

const fmt = (cell, numFmt) => { cell.numFmt = numFmt; return cell; };

async function toFile(wb, name) {
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], name, { type: XLSX_TYPE });
}

// ---------------------------------------------------------------------------
// Hoja con la cuenta de un cliente (sin costos). Se usa en ambos archivos.
// ---------------------------------------------------------------------------
function writeClientStatement(sh, { trip, client, items, payments, settings }) {
  sh.columns = [{ width: 34 }, { width: 30 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 15 }];
  sh.getCell('A1').value = client.name;
  sh.getCell('A1').font = { bold: true, size: 16, color: { argb: COLOR.band } };
  const dates = fmtDateRange(trip.startDate, trip.endDate);
  sh.getCell('A2').value = `Cuenta del viaje ${trip.name}${dates ? ` (${dates})` : ''}`;
  sh.getCell('A2').font = { color: { argb: COLOR.muted } };
  if (settings.businessName) {
    sh.getCell('A3').value = settings.businessName;
    sh.getCell('A3').font = { color: { argb: COLOR.muted } };
  }

  let r = 5;
  sh.getRow(r).values = ['Artículo', 'Descripción', 'Talla / color', 'Cantidad', 'Precio por pieza', 'Importe', 'Estado'];
  styleHeader(sh.getRow(r), 7);
  const first = r + 1;
  for (const it of items) {
    r += 1;
    const c = itemCalc(it, trip);
    const row = sh.getRow(r);
    row.values = [
      it.name || '', it.description || '', it.variant || '', c.qty, it.unitPriceMXN ?? null,
      { formula: `ROUND(D${r}*E${r},2)`, result: c.saleMXN },
      STATUS[it.status] || it.status || '',
    ];
    fmt(row.getCell(4), NF.int);
    fmt(row.getCell(5), NF.mxn);
    fmt(row.getCell(6), NF.mxn);
    row.getCell(7).dataValidation = { type: 'list', allowBlank: false, formulae: [STATUS_LIST] };
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    hairline(row, 7);
  }
  const last = r;
  const t = sumTotals(items, payments, trip);

  r += 2;
  const totalRow = r;
  sh.getCell(`E${r}`).value = 'Total';
  sh.getCell(`F${r}`).value = items.length
    ? { formula: `SUMIFS(F${first}:F${last},G${first}:G${last},"Comprado")+SUMIFS(F${first}:F${last},G${first}:G${last},"Entregado")`, result: t.saleMXN }
    : 0;
  fmt(sh.getCell(`F${r}`), NF.mxn);
  emphasize(sh.getRow(r), 0);
  sh.getCell(`E${r}`).font = { bold: true };
  sh.getCell(`F${r}`).font = { bold: true };
  sh.getCell(`A${r}`).value = 'Solo se cobran los artículos comprados o entregados.';
  sh.getCell(`A${r}`).font = { italic: true, color: { argb: COLOR.muted }, size: 10 };

  r += 2;
  sh.getCell(`A${r}`).value = 'Pagos y anticipos';
  sh.getCell(`A${r}`).font = { bold: true };
  r += 1;
  sh.getRow(r).values = ['Fecha', 'Método', 'Notas', '', '', 'Monto'];
  styleHeader(sh.getRow(r), 6);
  const pFirst = r + 1;
  const sortedPays = [...payments].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const p of sortedPays) {
    r += 1;
    const row = sh.getRow(r);
    row.values = [dayToExcel(p.date), PAYMENT_METHODS[p.method] || p.method || '', p.notes || '', '', '', Number(p.amountMXN) || 0];
    fmt(row.getCell(1), NF.date);
    fmt(row.getCell(6), NF.mxn);
    hairline(row, 6);
  }
  const pLast = r;
  r += 1;
  const paidRow = r;
  sh.getCell(`E${r}`).value = 'Pagado';
  sh.getCell(`F${r}`).value = sortedPays.length ? { formula: `SUM(F${pFirst}:F${pLast})`, result: t.paidMXN } : 0;
  fmt(sh.getCell(`F${r}`), NF.mxn);
  r += 1;
  sh.getCell(`E${r}`).value = 'Saldo por pagar';
  sh.getCell(`F${r}`).value = { formula: `F${totalRow}-F${paidRow}`, result: t.balanceMXN };
  fmt(sh.getCell(`F${r}`), NF.mxn);
  for (const col of ['E', 'F']) {
    const cell = sh.getCell(`${col}${r}`);
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.totalFill } };
  }
  sh.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

// ---------------------------------------------------------------------------
// Excel completo del viaje
// ---------------------------------------------------------------------------
export async function buildTripWorkbook({ trip, tripClients, items, payments, settings, perClientSheets = true }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.businessName || 'Encargos';
  wb.created = new Date();

  const sheetName = sheetNamer();
  const S_RES = sheetName('Resumen');
  const S_ART = sheetName('Artículos');
  const S_PAY = sheetName('Pagos');
  const A = q(S_ART);
  const P = q(S_PAY);

  const clients = tripClients.map((tc) => ({ ...tc.client, name: criteriaSafe(tc.client.name) }));
  const labels = uniqueLabels(clients);
  const labelOf = (id) => labels.get(id) || 'Sin cliente';
  const byLabel = (a, b) => labelOf(a.clientId).localeCompare(labelOf(b.clientId), 'es');
  const sortedItems = [...items].sort((a, b) => byLabel(a, b) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const sortedPays = [...payments].sort((a, b) => (a.date || '').localeCompare(b.date || '') || byLabel(a, b));

  const rs = wb.addWorksheet(S_RES, { properties: { tabColor: { argb: COLOR.rosa } }, views: [{ showGridLines: false }] });
  const ws = wb.addWorksheet(S_ART, { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });
  const ps = wb.addWorksheet(S_PAY, { views: [{ state: 'frozen', ySplit: 1 }] });

  // ----- Artículos -----
  ws.columns = [
    { header: '#', width: 5 },
    { header: 'Cliente', width: 22 },
    { header: 'Artículo', width: 30 },
    { header: 'Descripción', width: 32 },
    { header: 'Talla / color', width: 14 },
    { header: 'Tienda', width: 16 },
    { header: 'Código de barras', width: 18 },
    { header: 'Estado', width: 15 },
    { header: 'Cantidad', width: 10 },
    { header: 'Compra por pieza (US$)', width: 14 },
    { header: 'Costo (US$)', width: 13 },
    { header: 'Costo con impuesto (US$)', width: 15 },
    { header: 'Costo en pesos', width: 15 },
    { header: 'Venta por pieza (pesos)', width: 15 },
    { header: 'Venta (pesos)', width: 15 },
    { header: 'Ganancia (pesos)', width: 15 },
    { header: 'Notas', width: 28 },
    { header: 'Registrado', width: 17 },
    { header: 'Foto', width: 7 },
  ];
  styleHeader(ws.getRow(1), 19);
  sortedItems.forEach((it, i) => {
    const r = i + 2;
    const c = itemCalc(it, trip);
    const row = ws.addRow([
      i + 1,
      labelOf(it.clientId),
      it.name || '',
      it.description || '',
      it.variant || '',
      it.store || '',
      it.barcode || '',
      STATUS[it.status] || it.status || '',
      c.qty,
      it.unitCostUSD ?? null,
      { formula: `ROUND(I${r}*J${r},2)`, result: c.costUSD },
      { formula: `ROUND(K${r}*(1+Impuesto),2)`, result: c.costUSDTax },
      { formula: `ROUND(L${r}*TipoCambio,2)`, result: c.costMXN },
      it.unitPriceMXN ?? null,
      { formula: `ROUND(I${r}*N${r},2)`, result: c.saleMXN },
      { formula: `ROUND(O${r}-M${r},2)`, result: c.profitMXN },
      it.notes || '',
      isoToExcel(it.createdAt),
      it.photoId ? 'Sí' : 'No',
    ]);
    fmt(row.getCell(7), '@');
    row.getCell(8).dataValidation = {
      type: 'list', allowBlank: false, formulae: [STATUS_LIST],
      showErrorMessage: true, errorTitle: 'Estado', error: 'Elige un estado de la lista.',
    };
    fmt(row.getCell(9), NF.int);
    for (const col of [10, 11, 12]) fmt(row.getCell(col), NF.usd);
    for (const col of [13, 14, 15, 16]) fmt(row.getCell(col), NF.mxn);
    fmt(row.getCell(18), NF.datetime);
    for (const col of [3, 4, 17]) row.getCell(col).alignment = { wrapText: true, vertical: 'top' };
    hairline(row, 19);
  });
  ws.autoFilter = 'A1:S1';
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // ----- Pagos -----
  ps.columns = [
    { header: 'Fecha', width: 12 },
    { header: 'Cliente', width: 24 },
    { header: 'Monto (pesos)', width: 15 },
    { header: 'Método', width: 15 },
    { header: 'Notas', width: 36 },
  ];
  styleHeader(ps.getRow(1), 5);
  for (const p of sortedPays) {
    const row = ps.addRow([dayToExcel(p.date), labelOf(p.clientId), Number(p.amountMXN) || 0, PAYMENT_METHODS[p.method] || p.method || '', p.notes || '']);
    fmt(row.getCell(1), NF.date);
    fmt(row.getCell(3), NF.mxn);
    hairline(row, 5);
  }
  ps.autoFilter = 'A1:E1';

  // ----- Resumen -----
  rs.columns = [{ width: 38 }, { width: 18 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 13 }];
  rs.getCell('A1').value = `Resumen del viaje: ${trip.name}`;
  rs.getCell('A1').font = { bold: true, size: 16, color: { argb: COLOR.band } };
  rs.getCell('A2').value = `${settings.businessName ? `${settings.businessName}. ` : ''}Generado el ${fmtDateTime(new Date().toISOString())}`;
  rs.getCell('A2').font = { size: 10, color: { argb: COLOR.muted } };

  const tc = Number(trip.exchangeRate) || 0;
  const tax = (Number(trip.taxRate) || 0) / 100;
  const info = [
    ['Viaje', trip.name || ''],
    ['Destino', trip.destination || ''],
    ['Fechas', fmtDateRange(trip.startDate, trip.endDate)],
    ['Tipo de cambio (pesos por dólar)', tc],
    ['Impuesto de compra en EE.UU.', tax],
    ['Ganancia sugerida', (Number(trip.marginRate) || 0) / 100],
  ];
  info.forEach(([label, value], i) => {
    const r = 4 + i;
    rs.getCell(`A${r}`).value = label;
    rs.getCell(`A${r}`).font = { color: { argb: COLOR.muted } };
    rs.getCell(`B${r}`).value = value;
    rs.getCell(`B${r}`).alignment = { horizontal: 'left' };
    hairline(rs.getRow(r), 2);
  });
  rs.getCell('B7').name = 'TipoCambio';
  fmt(rs.getCell('B7'), NF.rate);
  rs.getCell('B8').name = 'Impuesto';
  fmt(rs.getCell('B8'), NF.pct);
  fmt(rs.getCell('B9'), NF.pct);
  for (const ref of ['B7', 'B8']) {
    rs.getCell(ref).font = { bold: true, color: { argb: COLOR.rosa } };
  }
  rs.getCell('A10').value = 'Si cambias el tipo de cambio o el impuesto, todas las cifras se recalculan.';
  rs.getCell('A10').font = { italic: true, size: 10, color: { argb: COLOR.muted } };

  const totals = sumTotals(items, payments, trip);
  const charged = (col) => `SUMIFS(${A}!$${col}:$${col},${A}!$H:$H,"Comprado")+SUMIFS(${A}!$${col}:$${col},${A}!$H:$H,"Entregado")`;
  rs.getCell('A12').value = 'Totales del viaje';
  rs.getCell('A12').font = { bold: true, size: 12 };
  const rows = [
    ['Piezas compradas', { formula: charged('I'), result: totals.units }, NF.int],
    ['Invertido en dólares (con impuesto)', { formula: charged('L'), result: totals.costUSDTax }, NF.usd],
    ['Costo en pesos', { formula: charged('M'), result: totals.costMXN }, NF.mxn],
    ['Venta', { formula: charged('O'), result: totals.saleMXN }, NF.mxn],
    ['Ganancia', { formula: 'B16-B15', result: totals.profitMXN }, NF.mxn],
    ['Cobrado (pagos y anticipos)', { formula: `SUM(${P}!$C:$C)`, result: totals.paidMXN }, NF.mxn],
    ['Por cobrar', { formula: 'B16-B18', result: totals.balanceMXN }, NF.mxn],
    ['Piezas pendientes por comprar', { formula: `SUMIFS(${A}!$I:$I,${A}!$H:$H,"Pendiente")`, result: totals.pendingUnits }, NF.int],
  ];
  rows.forEach(([label, value, numFmt], i) => {
    const r = 13 + i;
    rs.getCell(`A${r}`).value = label;
    rs.getCell(`B${r}`).value = value;
    fmt(rs.getCell(`B${r}`), numFmt);
    hairline(rs.getRow(r), 2);
  });
  for (const r of [17, 19]) {
    rs.getCell(`A${r}`).font = { bold: true };
    rs.getCell(`B${r}`).font = { bold: true };
  }

  rs.getCell('A21').value = 'Por cliente';
  rs.getCell('A21').font = { bold: true, size: 12 };
  rs.getRow(22).values = ['Cliente', 'Teléfono', 'Piezas', 'Venta', 'Costo en pesos', 'Ganancia', 'Pagado', 'Saldo', 'Pendientes'];
  styleHeader(rs.getRow(22), 9);
  let r = 23;
  const firstClientRow = r;
  for (const tcRec of tripClients) {
    const cl = tcRec.client;
    const ci = items.filter((i) => i.clientId === cl.id);
    const cp = payments.filter((p) => p.clientId === cl.id);
    const t = sumTotals(ci, cp, trip);
    const byClient = (col) => `SUMIFS(${A}!$${col}:$${col},${A}!$B:$B,$A${r},${A}!$H:$H,"Comprado")+SUMIFS(${A}!$${col}:$${col},${A}!$B:$B,$A${r},${A}!$H:$H,"Entregado")`;
    const row = rs.getRow(r);
    row.values = [
      labelOf(cl.id),
      cl.phone || '',
      { formula: byClient('I'), result: t.units },
      { formula: byClient('O'), result: t.saleMXN },
      { formula: byClient('M'), result: t.costMXN },
      { formula: `D${r}-E${r}`, result: t.profitMXN },
      { formula: `SUMIFS(${P}!$C:$C,${P}!$B:$B,$A${r})`, result: t.paidMXN },
      { formula: `D${r}-G${r}`, result: t.balanceMXN },
      { formula: `SUMIFS(${A}!$I:$I,${A}!$B:$B,$A${r},${A}!$H:$H,"Pendiente")`, result: t.pendingUnits },
    ];
    fmt(row.getCell(2), '@');
    fmt(row.getCell(3), NF.int);
    for (const col of [4, 5, 6, 7, 8]) fmt(row.getCell(col), NF.mxn);
    fmt(row.getCell(9), NF.int);
    hairline(row, 9);
    r += 1;
  }
  if (tripClients.length) {
    const lastClientRow = r - 1;
    const sum = (col, result) => ({ formula: `SUM(${col}${firstClientRow}:${col}${lastClientRow})`, result });
    const row = rs.getRow(r);
    row.values = [
      'Total', '',
      sum('C', totals.units), sum('D', totals.saleMXN), sum('E', totals.costMXN), sum('F', totals.profitMXN),
      sum('G', totals.paidMXN), sum('H', totals.balanceMXN), sum('I', totals.pendingUnits),
    ];
    fmt(row.getCell(3), NF.int);
    for (const col of [4, 5, 6, 7, 8]) fmt(row.getCell(col), NF.mxn);
    fmt(row.getCell(9), NF.int);
    emphasize(row, 9);
  }
  rs.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // ----- Una hoja por cliente -----
  if (perClientSheets) {
    for (const tcRec of tripClients) {
      const cl = tcRec.client;
      const ci = sortedItems.filter((i) => i.clientId === cl.id);
      const cp = payments.filter((p) => p.clientId === cl.id);
      if (!ci.length && !cp.length) continue;
      const sh = wb.addWorksheet(sheetName(labelOf(cl.id)), { views: [{ showGridLines: false }] });
      writeClientStatement(sh, { trip, client: cl, items: ci, payments: cp, settings });
    }
  }

  return toFile(wb, `${fileSafe(trip.name)}_${todayISO()}.xlsx`);
}

// ---------------------------------------------------------------------------
// Excel para mandarle a un cliente (sin costos ni ganancias)
// ---------------------------------------------------------------------------
export async function buildClientWorkbook({ trip, client, items, payments, settings }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.businessName || 'Encargos';
  wb.created = new Date();
  const sh = wb.addWorksheet('Cuenta', { views: [{ showGridLines: false }] });
  const sorted = [...items].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  writeClientStatement(sh, { trip, client, items: sorted, payments, settings });
  return toFile(wb, `Cuenta_${fileSafe(client.name)}_${fileSafe(trip.name)}.xlsx`);
}
