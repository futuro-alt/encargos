// backup.js
// Respaldo completo en un archivo .json y restauración desde ese archivo.
// El mismo formato servirá para pasar los datos a una futura app nativa.
//
// Formato:
// { app: "encargos", schemaVersion: 1, exportedAt, settings, trips, clients,
//   tripClients, items, payments, photos: [{ id, type, createdAt, full, thumb }] }
// (full y thumb van en base64)

import { getAll, getSettings, bulk, STORE_NAMES, saveSettings, openDB } from './db.js';
import { todayISO } from './calc.js';

export const BACKUP_SCHEMA = 1;

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Lee las fotos una por una para no llenar la memoria del iPhone. */
async function eachPhoto(fn) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction('photos', 'readonly');
    const req = t.objectStore('photos').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      fn(cursor.value);
      cursor.continue();
    };
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

/** Crea el archivo de respaldo. */
export async function createBackupFile({ includePhotos = true } = {}) {
  const [settings, trips, clients, tripClients, items, payments] = await Promise.all([
    getSettings(), getAll('trips'), getAll('clients'), getAll('tripClients'), getAll('items'), getAll('payments'),
  ]);
  const head = {
    app: 'encargos',
    schemaVersion: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    settings,
    trips,
    clients,
    tripClients,
    items,
    payments,
  };
  // Se arma por partes para no crear un texto gigante en memoria.
  const headJson = JSON.stringify(head);
  const parts = [headJson.slice(0, -1), ',"photos":['];
  let count = 0;
  if (includePhotos) {
    const used = new Set(items.map((i) => i.photoId).filter(Boolean));
    await eachPhoto((p) => {
      if (!used.has(p.id)) return;
      parts.push((count ? ',' : '') + JSON.stringify({
        id: p.id,
        type: p.type || 'image/jpeg',
        createdAt: p.createdAt,
        full: bufferToBase64(p.full),
        thumb: bufferToBase64(p.thumb),
      }));
      count += 1;
    });
  }
  parts.push(']}');
  const name = `encargos-respaldo_${todayISO()}${includePhotos ? '' : '_sin-fotos'}.json`;
  return { file: new File(parts, name, { type: 'application/json' }), photos: count, items: items.length };
}

/** Revisa un archivo de respaldo y devuelve un resumen (sin cambiar nada). */
export async function readBackupFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('El archivo no es un respaldo válido (no se pudo leer).');
  }
  if (!data || data.app !== 'encargos') throw new Error('Este archivo no es un respaldo de Encargos.');
  if (Number(data.schemaVersion) > BACKUP_SCHEMA) {
    throw new Error('El respaldo es de una versión más nueva de la app. Actualiza la app y vuelve a intentarlo.');
  }
  for (const key of ['trips', 'clients', 'tripClients', 'items', 'payments']) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
  if (!Array.isArray(data.photos)) data.photos = [];
  return {
    data,
    summary: {
      exportedAt: data.exportedAt,
      trips: data.trips.length,
      clients: data.clients.length,
      items: data.items.length,
      payments: data.payments.length,
      photos: data.photos.length,
    },
  };
}

/** Reemplaza todos los datos actuales por los del respaldo. */
export async function restoreBackup(data) {
  // Aquí se agregarían conversiones si en el futuro cambia el formato (schemaVersion).
  const photos = data.photos.map((p) => ({
    id: p.id,
    type: p.type || 'image/jpeg',
    createdAt: p.createdAt,
    full: base64ToBuffer(p.full),
    thumb: base64ToBuffer(p.thumb || p.full),
  }));
  const keepPhoto = new Set(photos.map((p) => p.id));
  const items = data.items.map((i) => (i.photoId && !keepPhoto.has(i.photoId) ? { ...i, photoId: null } : i));
  // Todo va en una sola transacción: si algo falla, los datos actuales se conservan.
  const ops = STORE_NAMES.map((store) => ({ op: 'clear', store }));
  const push = (store, list) => list.forEach((value) => ops.push({ op: 'put', store, value }));
  push('trips', data.trips);
  push('clients', data.clients);
  push('tripClients', data.tripClients);
  push('items', items);
  push('payments', data.payments);
  push('photos', photos);
  ops.push({ op: 'put', store: 'settings', value: { key: 'app', value: { ...(data.settings || {}) } } });
  await bulk(ops);
  // Se registra que acaba de restaurarse (cuenta como respaldo reciente).
  await saveSettings({ lastBackupAt: new Date().toISOString() });
  return true;
}
