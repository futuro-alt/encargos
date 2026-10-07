// db.js
// Base de datos local (IndexedDB) que vive dentro del iPhone.
// Tablas ("almacenes"):
//   settings     ajustes de la app (un solo registro con clave "app")
//   trips        viajes
//   clients      directorio de clientes (se reutilizan entre viajes)
//   tripClients  qué clientes participan en cada viaje
//   items        artículos encargados (pertenecen a un viaje y a un cliente)
//   payments     pagos y anticipos de cada cliente en cada viaje
//   photos       fotos de los artículos (imagen completa y miniatura)
//
// CÓMO AGREGAR CAMBIOS EN EL FUTURO: sube DB_VERSION en 1 y agrega un bloque
// "if (oldVersion < N)" dentro de upgrade(). Así los datos existentes se conservan.

import { uid, foldText, barcodeKey } from './calc.js';

const DB_NAME = 'encargos';
export const DB_VERSION = 1;
export const STORE_NAMES = ['settings', 'trips', 'clients', 'tripClients', 'items', 'payments', 'photos'];

function upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    db.createObjectStore('settings', { keyPath: 'key' });

    const trips = db.createObjectStore('trips', { keyPath: 'id' });
    trips.createIndex('startDate', 'startDate');

    const clients = db.createObjectStore('clients', { keyPath: 'id' });
    clients.createIndex('nameKey', 'nameKey');

    const tc = db.createObjectStore('tripClients', { keyPath: 'id' });
    tc.createIndex('tripId', 'tripId');
    tc.createIndex('clientId', 'clientId');
    tc.createIndex('trip_client', ['tripId', 'clientId'], { unique: true });

    const items = db.createObjectStore('items', { keyPath: 'id' });
    items.createIndex('tripId', 'tripId');
    items.createIndex('clientId', 'clientId');
    items.createIndex('barcodeKey', 'barcodeKey');
    items.createIndex('trip_client', ['tripId', 'clientId']);

    const pays = db.createObjectStore('payments', { keyPath: 'id' });
    pays.createIndex('tripId', 'tripId');
    pays.createIndex('clientId', 'clientId');
    pays.createIndex('trip_client', ['tripId', 'clientId']);

    db.createObjectStore('photos', { keyPath: 'id' });
  }
  // Ejemplo para una versión futura:
  // if (oldVersion < 2) { db.createObjectStore('expenses', { keyPath: 'id' }); }
}

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Este navegador no permite guardar datos. Abre la app en Safari.'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      dbPromise = null;
      reject(err);
      return;
    }
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => console.warn('La base de datos está abierta en otra ventana.');
  });
  return dbPromise;
}

const reqP = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/**
 * Ejecuta una transacción. fn recibe un objeto con los almacenes pedidos.
 * Si iOS cerró la conexión mientras la app estaba en segundo plano,
 * se vuelve a abrir y se reintenta una vez.
 */
async function tx(names, mode, fn, retry = true) {
  const list = Array.isArray(names) ? names : [names];
  const db = await openDB();
  let t;
  try {
    t = db.transaction(list, mode);
  } catch (err) {
    if (retry && (err.name === 'InvalidStateError' || err.name === 'UnknownError' || err.name === 'TransactionInactiveError')) {
      dbPromise = null;
      return tx(names, mode, fn, false);
    }
    throw err;
  }
  const stores = {};
  for (const n of list) stores[n] = t.objectStore(n);
  const result = fn(stores, t);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => Promise.resolve(result).then(resolve, reject);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('La operación se canceló.'));
  });
}

// ---------- Operaciones genéricas ----------

export const get = (store, key) => tx(store, 'readonly', (s) => reqP(s[store].get(key)));
export const getAll = (store) => tx(store, 'readonly', (s) => reqP(s[store].getAll()));
export const getAllKeys = (store) => tx(store, 'readonly', (s) => reqP(s[store].getAllKeys()));
export const getAllBy = (store, index, key) => tx(store, 'readonly', (s) => reqP(s[store].index(index).getAll(key)));
export const put = (store, value) => tx(store, 'readwrite', (s) => reqP(s[store].put(value)));
export const del = (store, key) => tx(store, 'readwrite', (s) => reqP(s[store].delete(key)));

/** Varias escrituras en una sola transacción: [{ op: 'put'|'delete'|'clear', store, value, key }] */
export function bulk(ops) {
  if (!ops.length) return Promise.resolve();
  const names = [...new Set(ops.map((o) => o.store))];
  return tx(names, 'readwrite', (s) => {
    for (const o of ops) {
      if (o.op === 'put') s[o.store].put(o.value);
      else if (o.op === 'delete') s[o.store].delete(o.key);
      else if (o.op === 'clear') s[o.store].clear();
    }
  });
}

const nowISO = () => new Date().toISOString();

// ---------- Ajustes ----------

export const DEFAULT_SETTINGS = {
  businessName: '',
  closingMessage: '¡Gracias por tu preferencia!',
  defaultExchangeRate: null,
  defaultTaxRate: 0,
  defaultMarginRate: 30,
  roundTo: 10,
  lastBackupAt: null,
};

export async function getSettings() {
  const rec = await get('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...(rec?.value || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await put('settings', { key: 'app', value: next });
  return next;
}

// ---------- Viajes ----------

export async function listTrips() {
  const trips = await getAll('trips');
  return trips.sort((a, b) => {
    const ca = a.status === 'cerrado' ? 1 : 0;
    const cb = b.status === 'cerrado' ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return (b.startDate || b.createdAt || '').localeCompare(a.startDate || a.createdAt || '');
  });
}

export const getTrip = (id) => get('trips', id);

export async function saveTrip(trip) {
  const now = nowISO();
  const t = {
    status: 'abierto',
    ...trip,
    id: trip.id || uid(),
    createdAt: trip.createdAt || now,
    updatedAt: now,
  };
  await put('trips', t);
  return t;
}

export async function deleteTrip(id) {
  const [tcs, items, pays] = await Promise.all([
    getAllBy('tripClients', 'tripId', id),
    getAllBy('items', 'tripId', id),
    getAllBy('payments', 'tripId', id),
  ]);
  await bulk([
    { op: 'delete', store: 'trips', key: id },
    ...tcs.map((x) => ({ op: 'delete', store: 'tripClients', key: x.id })),
    ...items.map((x) => ({ op: 'delete', store: 'items', key: x.id })),
    ...items.filter((x) => x.photoId).map((x) => ({ op: 'delete', store: 'photos', key: x.photoId })),
    ...pays.map((x) => ({ op: 'delete', store: 'payments', key: x.id })),
  ]);
}

/** Todo lo de un viaje en una sola llamada. */
export async function loadTripData(tripId) {
  const [trip, tcs, items, payments, clients] = await Promise.all([
    getTrip(tripId),
    getAllBy('tripClients', 'tripId', tripId),
    getAllBy('items', 'tripId', tripId),
    getAllBy('payments', 'tripId', tripId),
    getAll('clients'),
  ]);
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const tripClients = tcs
    .map((tc) => ({ ...tc, client: clientMap.get(tc.clientId) }))
    .filter((tc) => tc.client)
    .sort((a, b) => a.client.nameKey.localeCompare(b.client.nameKey, 'es'));
  return { trip, tripClients, items, payments, clientMap };
}

// ---------- Clientes ----------

export async function listClients() {
  const list = await getAll('clients');
  return list.sort((a, b) => (a.nameKey || '').localeCompare(b.nameKey || '', 'es'));
}

export const getClient = (id) => get('clients', id);

export async function saveClient(client) {
  const now = nowISO();
  const c = {
    phone: '',
    city: '',
    notes: '',
    ...client,
    name: String(client.name || '').trim(),
    nameKey: foldText(client.name),
    id: client.id || uid(),
    createdAt: client.createdAt || now,
    updatedAt: now,
  };
  await put('clients', c);
  return c;
}

export async function clientUsage(clientId) {
  const [tcs, items, pays] = await Promise.all([
    getAllBy('tripClients', 'clientId', clientId),
    getAllBy('items', 'clientId', clientId),
    getAllBy('payments', 'clientId', clientId),
  ]);
  return { tripClients: tcs, items, payments: pays };
}

export async function deleteClient(clientId) {
  const { tripClients, items, payments } = await clientUsage(clientId);
  await bulk([
    { op: 'delete', store: 'clients', key: clientId },
    ...tripClients.map((x) => ({ op: 'delete', store: 'tripClients', key: x.id })),
    ...items.map((x) => ({ op: 'delete', store: 'items', key: x.id })),
    ...items.filter((x) => x.photoId).map((x) => ({ op: 'delete', store: 'photos', key: x.photoId })),
    ...payments.map((x) => ({ op: 'delete', store: 'payments', key: x.id })),
  ]);
}

/** Agrega un cliente a un viaje (si ya estaba, no hace nada). */
export async function addClientToTrip(tripId, clientId) {
  try {
    await tx('tripClients', 'readwrite', (s) => {
      const idx = s.tripClients.index('trip_client');
      const r = idx.count([tripId, clientId]);
      r.onsuccess = () => {
        if (!r.result) s.tripClients.put({ id: uid(), tripId, clientId, createdAt: nowISO() });
      };
    });
  } catch (err) {
    if (err?.name !== 'ConstraintError') throw err; // ya existía
  }
}

export async function removeClientFromTrip(tripId, clientId) {
  const [tcs, items, pays] = await Promise.all([
    getAllBy('tripClients', 'trip_client', [tripId, clientId]),
    getAllBy('items', 'trip_client', [tripId, clientId]),
    getAllBy('payments', 'trip_client', [tripId, clientId]),
  ]);
  await bulk([
    ...tcs.map((x) => ({ op: 'delete', store: 'tripClients', key: x.id })),
    ...items.map((x) => ({ op: 'delete', store: 'items', key: x.id })),
    ...items.filter((x) => x.photoId).map((x) => ({ op: 'delete', store: 'photos', key: x.photoId })),
    ...pays.map((x) => ({ op: 'delete', store: 'payments', key: x.id })),
  ]);
}

// ---------- Artículos ----------

export const getItem = (id) => get('items', id);

/** Guarda un artículo y se asegura de que su cliente aparezca en el viaje. */
export async function saveItem(item) {
  const now = nowISO();
  const it = {
    status: 'comprado',
    quantity: 1,
    ...item,
    id: item.id || uid(),
    barcode: String(item.barcode || '').trim(),
    barcodeKey: barcodeKey(item.barcode),
    createdAt: item.createdAt || now,
    updatedAt: now,
  };
  await tx(['items', 'tripClients'], 'readwrite', (s) => {
    s.items.put(it);
    const r = s.tripClients.index('trip_client').count([it.tripId, it.clientId]);
    r.onsuccess = () => {
      if (!r.result) s.tripClients.put({ id: uid(), tripId: it.tripId, clientId: it.clientId, createdAt: now });
    };
  });
  return it;
}

export async function deleteItem(item) {
  await bulk([
    { op: 'delete', store: 'items', key: item.id },
    ...(item.photoId ? [{ op: 'delete', store: 'photos', key: item.photoId }] : []),
  ]);
}

/** Busca un código de barras en todos los viajes (el más reciente primero). */
export async function findItemsByBarcode(code) {
  const key = barcodeKey(code);
  if (!key) return [];
  const list = await getAllBy('items', 'barcodeKey', key);
  return list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/** Tiendas usadas antes, la más frecuente primero (para sugerirlas). */
export async function knownStores() {
  const items = await getAll('items');
  const count = new Map();
  for (const it of items) {
    const s = String(it.store || '').trim();
    if (s) count.set(s, (count.get(s) || 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 30);
}

// ---------- Pagos ----------

export async function savePayment(payment) {
  const now = nowISO();
  const p = { ...payment, id: payment.id || uid(), createdAt: payment.createdAt || now, updatedAt: now };
  await tx(['payments', 'tripClients'], 'readwrite', (s) => {
    s.payments.put(p);
    const r = s.tripClients.index('trip_client').count([p.tripId, p.clientId]);
    r.onsuccess = () => {
      if (!r.result) s.tripClients.put({ id: uid(), tripId: p.tripId, clientId: p.clientId, createdAt: now });
    };
  });
  return p;
}

export const deletePayment = (id) => del('payments', id);

// ---------- Fotos ----------
// El id de cada foto incluye la fecha en que se tomó ("ph-<milisegundos>-...")
// para poder limpiar fotos que quedaron sin usar sin tener que leerlas.

export async function savePhoto({ type, full, thumb }) {
  const id = `ph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await put('photos', { id, type, full, thumb, createdAt: nowISO() });
  return id;
}

export const getPhoto = (id) => get('photos', id);
export const deletePhoto = (id) => del('photos', id);

/** Borra fotos que no pertenecen a ningún artículo y tienen más de un día. */
export async function cleanupOrphanPhotos(keepIds = []) {
  const [keys, items] = await Promise.all([getAllKeys('photos'), getAll('items')]);
  const used = new Set([...items.map((i) => i.photoId).filter(Boolean), ...keepIds]);
  const dayAgo = Date.now() - 86400000;
  const orphans = keys.filter((k) => {
    if (used.has(k)) return false;
    const ts = Number(String(k).split('-')[1]);
    return Number.isFinite(ts) && ts < dayAgo;
  });
  if (orphans.length) await bulk(orphans.map((key) => ({ op: 'delete', store: 'photos', key })));
  return orphans.length;
}

/** Borra absolutamente todo (se usa al restaurar un respaldo o desde Ajustes). */
export function clearAll() {
  return bulk(STORE_NAMES.map((store) => ({ op: 'clear', store })));
}
