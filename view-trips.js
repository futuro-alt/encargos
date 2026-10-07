// view-trips.js
// Pantalla "Viajes" (inicio) y el formulario para crear o editar un viaje.

import { listTrips, getAll, saveTrip, deleteTrip, getSettings } from './db.js';
import {
  sumTotals, fmtMXN, fmtRate, fmtDateRange, todayISO, parseNum, plural, daysSince, inputNum,
} from './calc.js';
import { esc, icons, formSheet, toast, confirmDialog } from './ui.js';
import { navigate, refresh } from './router.js';
import { hero, emptyState, groupBy, isIOS, isStandalone } from './parts.js';
import { startBackup, showInstallHelp } from './view-settings.js';

export async function tripsView({ signal }) {
  const [trips, items, payments, tcs, settings] = await Promise.all([
    listTrips(), getAll('items'), getAll('payments'), getAll('tripClients'), getSettings(),
  ]);
  const itemsBy = groupBy(items, 'tripId');
  const paysBy = groupBy(payments, 'tripId');
  const tcsBy = groupBy(tcs, 'tripId');
  const open = trips.filter((t) => t.status !== 'cerrado').length;

  const banners = [];
  if (isIOS() && !isStandalone()) {
    banners.push(`
      <div class="banner is-info">
        ${icons.home}
        <div><strong>Instala la app en tu pantalla de inicio.</strong>
          <p>Úsala siempre desde el ícono: lo que captures aquí en Safari no pasa a la app instalada.</p>
          <button type="button" class="btn btn-sm btn-quiet" data-action="install-help">Ver cómo</button></div>
      </div>`);
  }
  // Recordatorio de respaldo: si hay cambios desde el último respaldo y ya pasó
  // una semana (o, si nunca se ha respaldado, un día desde la primera captura).
  const days = daysSince(settings.lastBackupAt);
  const lastChange = [...items, ...payments].reduce((m, x) => ((x.updatedAt || '') > m ? x.updatedAt : m), '');
  const firstCapture = items.reduce((m, x) => (!m || (x.createdAt || '') < m ? x.createdAt : m), '');
  const needsBackup = !!lastChange && (settings.lastBackupAt
    ? lastChange > settings.lastBackupAt && days >= 7
    : daysSince(firstCapture) >= 1);
  if (needsBackup) {
    banners.push(`
      <div class="banner is-warn">
        ${icons.shield}
        <div><strong>${settings.lastBackupAt ? `Tu último respaldo fue hace ${plural(days, 'día', 'días')}.` : 'Aún no has respaldado tus datos.'}</strong>
          <p>Guarda una copia en Archivos o mándatela por WhatsApp por si cambias o pierdes el teléfono.</p>
          <button type="button" class="btn btn-sm btn-quiet" data-action="backup">Respaldar ahora</button></div>
      </div>`);
  }

  const cards = trips.map((trip) => {
    const t = sumTotals(itemsBy.get(trip.id) || [], paysBy.get(trip.id) || [], trip);
    const nClients = (tcsBy.get(trip.id) || []).length;
    const where = [trip.destination, fmtDateRange(trip.startDate, trip.endDate)].filter(Boolean).join(', ');
    const counts = [plural(nClients, 'cliente', 'clientes'), plural(t.units, 'pieza', 'piezas')];
    if (t.pendingLines) counts.push(`${t.pendingLines} por comprar`);
    return `
      <a class="trip-card${trip.status === 'cerrado' ? ' is-closed' : ''}" href="#/viaje/${esc(trip.id)}">
        <div class="trip-card-top">
          <h2>${esc(trip.name)}</h2>
          <span class="tc-tag" title="Tipo de cambio">TC ${esc(fmtRate(trip.exchangeRate))}</span>
        </div>
        ${where ? `<p class="trip-meta">${esc(where)}</p>` : ''}
        <p class="trip-meta">${esc(counts.join(', '))}${trip.status === 'cerrado' ? ' <span class="chip st-cerrado">Cerrado</span>' : ''}</p>
        <dl class="trip-stats">
          <div><dt>Venta</dt><dd>${fmtMXN(t.saleMXN)}</dd></div>
          <div><dt>Ganancia</dt><dd>${fmtMXN(t.profitMXN)}</dd></div>
          <div><dt>Por cobrar</dt><dd>${fmtMXN(t.balanceMXN)}</dd></div>
        </dl>
      </a>`;
  }).join('');

  const body = trips.length
    ? `<div class="trip-list">${cards}</div>
       <div class="pad"><button type="button" class="btn btn-quiet btn-block" data-action="new-trip">${icons.plus}<span>Nuevo viaje</span></button></div>`
    : emptyState({
      icon: 'bag',
      title: 'Tu primer viaje',
      text: 'Crea un viaje para empezar a anotar lo que te encargan tus clientes.',
      action: `<button type="button" class="btn btn-primary" data-action="new-trip">${icons.plus}<span>Nuevo viaje</span></button>`,
    });

  return {
    title: 'Viajes',
    tab: 'viajes',
    actions: [{ icon: 'plus', label: 'Nuevo viaje', onClick: () => openTripForm() }],
    html: `${hero({ title: 'Viajes', sub: trips.length ? esc(`${plural(trips.length, 'viaje', 'viajes')}, ${plural(open, 'abierto', 'abiertos')}`) : 'Encargos por cliente, en cada viaje' })}
      ${banners.join('')}
      ${body}`,
    mount(root) {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        if (b.dataset.action === 'new-trip') openTripForm();
        if (b.dataset.action === 'backup') startBackup();
        if (b.dataset.action === 'install-help') showInstallHelp();
      }, { signal });
    },
  };
}

/** Formulario de viaje. Si se pasa un viaje, lo edita. */
export async function openTripForm(trip = null) {
  const settings = await getSettings();
  const trips = await listTrips();
  const last = trips[0];
  const defaultRate = trip?.exchangeRate ?? settings.defaultExchangeRate ?? last?.exchangeRate ?? '';
  const fields = [
    { name: 'name', label: 'Nombre del viaje', required: true, value: trip?.name, placeholder: 'Ej. Laredo, octubre' },
    { name: 'destination', label: 'Destino', value: trip?.destination, placeholder: 'Ej. Laredo, Texas' },
    { name: 'startDate', label: 'Fecha de salida', type: 'date', value: trip?.startDate || todayISO() },
    { name: 'endDate', label: 'Fecha de regreso', type: 'date', value: trip?.endDate || '' },
    {
      name: 'exchangeRate', label: 'Tipo de cambio', type: 'decimal', required: true, prefix: '$', suffix: 'por dólar',
      value: inputNum(defaultRate), placeholder: '0.00',
      help: 'Con este valor se convierte a pesos lo que pagas en dólares.',
    },
    {
      name: 'taxRate', label: 'Impuesto de compra en EE.UU.', type: 'decimal', suffix: '%',
      value: inputNum(trip?.taxRate ?? settings.defaultTaxRate ?? 0),
      help: 'Ej. 8.25 en Texas. Déjalo en 0 si anotas los precios con impuesto incluido.',
    },
    {
      name: 'marginRate', label: 'Ganancia sugerida', type: 'decimal', suffix: '%',
      value: inputNum(trip?.marginRate ?? settings.defaultMarginRate ?? 30),
      help: 'Sirve para proponerte un precio de venta. Siempre puedes cambiarlo.',
    },
  ];
  if (trip) {
    fields.push({
      name: 'status', label: 'Estado del viaje', type: 'segmented', value: trip.status || 'abierto',
      options: [{ value: 'abierto', label: 'Abierto' }, { value: 'cerrado', label: 'Cerrado' }],
    });
  }
  fields.push({ name: 'notes', label: 'Notas', type: 'textarea', value: trip?.notes, placeholder: 'Hotel, ruta, pendientes…' });

  const v = await formSheet({
    title: trip ? 'Editar viaje' : 'Nuevo viaje',
    submitText: trip ? 'Guardar cambios' : 'Crear viaje',
    fields,
    dangerText: trip ? 'Eliminar viaje' : '',
    validate(values) {
      const errors = {};
      const rate = parseNum(values.exchangeRate);
      if (!(rate > 0)) errors.exchangeRate = 'Escribe un tipo de cambio mayor a 0, por ejemplo 18.50.';
      const tax = parseNum(values.taxRate);
      if (values.taxRate && (tax === null || tax < 0 || tax > 100)) errors.taxRate = 'Escribe un porcentaje entre 0 y 100.';
      const margin = parseNum(values.marginRate);
      if (values.marginRate && (margin === null || margin < 0 || margin > 1000)) errors.marginRate = 'Escribe un porcentaje válido.';
      if (values.endDate && values.startDate && values.endDate < values.startDate) errors.endDate = 'El regreso no puede ser antes de la salida.';
      return errors;
    },
  });
  if (!v) return null;

  if (v.action === 'danger') {
    const ok = await confirmDialog({
      title: `¿Eliminar “${trip.name}”?`,
      message: 'Se borrarán sus artículos, fotos y pagos. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar viaje',
      danger: true,
    });
    if (!ok) return null;
    await deleteTrip(trip.id);
    toast('Viaje eliminado');
    navigate('/viajes');
    return null;
  }

  const saved = await saveTrip({
    ...(trip || {}),
    name: v.name,
    destination: v.destination,
    startDate: v.startDate,
    endDate: v.endDate,
    exchangeRate: parseNum(v.exchangeRate),
    taxRate: parseNum(v.taxRate) || 0,
    marginRate: parseNum(v.marginRate) || 0,
    status: v.status || trip?.status || 'abierto',
    notes: v.notes,
  });
  if (!trip) {
    // Pide al iPhone que no borre los datos de la app por falta de espacio.
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* opcional */ }
    toast('Viaje creado');
    navigate(`/viaje/${saved.id}/clientes`);
  } else {
    toast('Cambios guardados');
    refresh();
  }
  return saved;
}
