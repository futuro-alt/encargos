// calc.js
// Cálculos de dinero, formatos de fecha/moneda y utilidades de texto.
// No depende de ningún otro archivo, así que es seguro modificarlo.

/** Estados que puede tener un artículo. El orden importa para los filtros. */
export const STATUS = {
  pendiente: 'Pendiente',
  comprado: 'Comprado',
  entregado: 'Entregado',
  no_encontrado: 'No encontrado',
};
export const STATUS_ORDER = ['pendiente', 'comprado', 'entregado', 'no_encontrado'];

/** Solo estos estados se cobran al cliente y cuentan en los totales. */
export const CHARGED = new Set(['comprado', 'entregado']);

export const PAYMENT_METHODS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

/** Identificador único (para viajes, clientes, artículos, pagos). */
export function uid(prefix = '') {
  const base = (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  return prefix + base;
}

/**
 * Redondea a 2 decimales igual que la función REDONDEAR de Excel
 * (mitades hacia arriba y corrigiendo el error binario: 99.715 → 99.72).
 */
export function round2(n) {
  const x = Number(n) || 0;
  const s = x < 0 ? -1 : 1;
  const cents = Number((Math.abs(x) * 100).toPrecision(15));
  return (s * Math.round(cents)) / 100;
}

/**
 * Convierte lo que se escribe en un campo a número.
 * Acepta "1,234.50", "12.5", "12,5" y "$ 120". Si está vacío devuelve null.
 */
export function parseNum(value) {
  if (value === null || value === undefined) return null;
  let s = String(value).trim().replace(/\s/g, '').replace(/US\$|\$|MXN|USD/gi, '');
  if (s === '') return null;
  if (s.includes(',') && !s.includes('.')) {
    // "1,234" son miles; "12,5" es decimal.
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const nf2 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfMax2 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const nfMax4 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 4 });

/** $1,234.50 (pesos mexicanos). */
export function fmtMXN(n) {
  const v = round2(n);
  return (v < 0 ? '−$' : '$') + nf2.format(Math.abs(v));
}

/** US$12.50 (dólares). */
export function fmtUSD(n) {
  const v = round2(n);
  return (v < 0 ? '−US$' : 'US$') + nf2.format(Math.abs(v));
}

const nfRate = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Tipo de cambio: 18.5 → "$18.50", 18.6525 → "$18.6525". */
export function fmtRate(n) {
  return '$' + nfRate.format(Number(n) || 0);
}

/** Número sin decimales innecesarios: 8.25 → "8.25", 30 → "30". */
export function fmtNum(n, maxDecimals = 2) {
  const v = Number(n) || 0;
  return (maxDecimals > 2 ? nfMax4 : nfMax2).format(v);
}

/** Valor para poner dentro de un campo de texto (sin comas de miles). */
export function inputNum(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Number(n);
  return Number.isFinite(v) ? String(v) : '';
}

// ---------- Fechas ----------

/** Fecha local en formato AAAA-MM-DD. */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const todayISO = () => isoDate(new Date());

export function parseISODate(s) {
  if (!s || typeof s !== 'string') return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const dfDay = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const dfFull = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const dfTime = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const clean = (s) => s.replace(/\./g, '');

/** "5 oct 2026" */
export function fmtDate(s) {
  const d = parseISODate(s);
  return d ? clean(dfFull.format(d)) : '';
}

/** "5 – 8 oct 2026", "28 sep – 2 oct 2026" o solo una fecha. */
export function fmtDateRange(a, b) {
  const da = parseISODate(a);
  const db = parseISODate(b);
  if (!da && !db) return '';
  if (!da || !db) return fmtDate(a || b);
  if (isoDate(da) === isoDate(db)) return fmtDate(a);
  if (da.getFullYear() === db.getFullYear()) {
    if (da.getMonth() === db.getMonth()) return `${da.getDate()} – ${clean(dfFull.format(db))}`;
    return `${clean(dfDay.format(da))} – ${clean(dfFull.format(db))}`;
  }
  return `${clean(dfFull.format(da))} – ${clean(dfFull.format(db))}`;
}

/** "5 oct 2026, 3:40 p.m." a partir de una marca de tiempo ISO. */
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dfTime.format(d);
}

/** Días completos desde una fecha ISO (o Infinity si no hay fecha). */
export function daysSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86400000);
}

// ---------- Texto ----------

/** Minúsculas y sin acentos, para buscar y ordenar. */
export function foldText(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/**
 * Clave para comparar códigos de barras: quita ceros a la izquierda en
 * códigos numéricos (así un UPC-A y su EAN-13 equivalente coinciden).
 */
export function barcodeKey(code) {
  const s = String(code || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return s.replace(/^0+/, '') || '0';
  return s.toUpperCase();
}

/**
 * Teléfono en formato internacional para WhatsApp (solo dígitos).
 * 10 dígitos → México (+52). Si empieza con + se respeta tal cual.
 */
export function waPhone(phone) {
  const raw = String(phone || '').trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 13 && d.startsWith('521')) return '52' + d.slice(3);
  if (raw.startsWith('+')) return d;
  if (d.length === 10) return '52' + d;
  return d;
}

/** Nombre de archivo seguro: "Laredo octubre" → "Laredo-octubre". */
export function fileSafe(s) {
  return String(s || 'archivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'archivo';
}

export function fmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${fmtNum(b / 1024, 1)} KB`;
  return `${fmtNum(b / 1024 / 1024, 1)} MB`;
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------- Cálculos del negocio ----------

/**
 * Cálculo de un artículo. Sigue exactamente las mismas fórmulas que el Excel:
 *  costo US$            = REDONDEAR(cantidad × precio de compra, 2)
 *  costo US$ c/impuesto = REDONDEAR(costo US$ × (1 + impuesto), 2)
 *  costo en pesos       = REDONDEAR(costo US$ c/impuesto × tipo de cambio, 2)
 *  venta                = REDONDEAR(cantidad × precio de venta, 2)
 *  ganancia             = venta − costo en pesos
 */
export function itemCalc(item, trip) {
  const qty = Math.max(0, Number(item?.quantity) || 0);
  const unitCost = Number(item?.unitCostUSD) || 0;
  const unitPrice = Number(item?.unitPriceMXN) || 0;
  const tax = (Number(trip?.taxRate) || 0) / 100;
  const tc = Number(trip?.exchangeRate) || 0;
  const costUSD = round2(qty * unitCost);
  const costUSDTax = round2(costUSD * (1 + tax));
  const costMXN = round2(costUSDTax * tc);
  const saleMXN = round2(qty * unitPrice);
  const profitMXN = round2(saleMXN - costMXN);
  return { qty, unitCost, unitPrice, costUSD, costUSDTax, costMXN, saleMXN, profitMXN, charged: CHARGED.has(item?.status) };
}

/** Totales de un conjunto de artículos y pagos (de un cliente o de todo un viaje). */
export function sumTotals(items = [], payments = [], trip) {
  const t = {
    lines: 0, units: 0, costUSD: 0, costUSDTax: 0, costMXN: 0, saleMXN: 0, profitMXN: 0,
    paidMXN: 0, balanceMXN: 0,
    pendingLines: 0, pendingUnits: 0, pendingSaleMXN: 0,
    notFoundLines: 0, boughtLines: 0, deliveredLines: 0,
  };
  for (const it of items) {
    const c = itemCalc(it, trip);
    if (it.status === 'pendiente') {
      t.pendingLines += 1; t.pendingUnits += c.qty; t.pendingSaleMXN += c.saleMXN;
      continue;
    }
    if (it.status === 'no_encontrado') { t.notFoundLines += 1; continue; }
    if (it.status === 'entregado') t.deliveredLines += 1; else t.boughtLines += 1;
    t.lines += 1;
    t.units += c.qty;
    t.costUSD += c.costUSD;
    t.costUSDTax += c.costUSDTax;
    t.costMXN += c.costMXN;
    t.saleMXN += c.saleMXN;
    t.profitMXN += c.profitMXN;
  }
  for (const p of payments) t.paidMXN += Number(p.amountMXN) || 0;
  for (const k of ['costUSD', 'costUSDTax', 'costMXN', 'saleMXN', 'profitMXN', 'paidMXN', 'pendingSaleMXN']) t[k] = round2(t[k]);
  t.balanceMXN = round2(t.saleMXN - t.paidMXN);
  return t;
}

/**
 * Precio de venta sugerido por pieza, en pesos:
 * compra × (1 + impuesto) × tipo de cambio × (1 + ganancia), redondeado hacia arriba.
 */
export function suggestedPrice(unitCostUSD, trip, roundTo = 10) {
  const u = Number(unitCostUSD) || 0;
  const tc = Number(trip?.exchangeRate) || 0;
  if (u <= 0 || tc <= 0) return null;
  const tax = (Number(trip?.taxRate) || 0) / 100;
  const margin = (Number(trip?.marginRate) || 0) / 100;
  const raw = u * (1 + tax) * tc * (1 + margin);
  const step = Number(roundTo) > 0 ? Number(roundTo) : 1;
  return round2(Math.ceil(raw / step - 1e-9) * step);
}

/** Etiqueta única por cliente (por si dos clientes se llaman igual). */
export function uniqueLabels(clients) {
  const count = new Map();
  for (const c of clients) {
    const k = foldText(c.name);
    count.set(k, (count.get(k) || 0) + 1);
  }
  const used = new Set();
  const labels = new Map();
  for (const c of clients) {
    let label = String(c.name || 'Sin nombre').trim();
    if (count.get(foldText(c.name)) > 1) {
      const tail = String(c.phone || '').replace(/\D/g, '').slice(-4);
      label = tail ? `${label} (${tail})` : label;
    }
    let candidate = label;
    let i = 2;
    while (used.has(foldText(candidate))) candidate = `${label} ${i++}`;
    used.add(foldText(candidate));
    labels.set(c.id, candidate);
  }
  return labels;
}
