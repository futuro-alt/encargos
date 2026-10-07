// view-trip.js
// Detalle de un viaje con tres pestañas: Clientes, Artículos y Resumen.

import { loadTripData, getSettings, saveTrip, deleteTrip, addClientToTrip } from './db.js';
import {
  sumTotals, itemCalc, fmtMXN, fmtUSD, fmtNum, fmtRate, fmtDateRange, plural, foldText, STATUS, STATUS_ORDER,
} from './calc.js';
import { esc, icons, toast, actionSheet, confirmDialog, bindSearch, notFoundView } from './ui.js';
import { navigate, refresh } from './router.js';
import { hero, ticket, emptyState, statusChip, balanceBadge, initials, groupBy } from './parts.js';
import { thumbHtml, hydratePhotos } from './photos.js';
import { openTripForm } from './view-trips.js';
import { pickClient } from './view-client.js';
import { buildTripWorkbook } from './excel.js';
import { deliverFile } from './share.js';
import { startBackup } from './view-settings.js';

const TABS = ['clientes', 'articulos', 'resumen'];

export async function tripView({ params, query, signal }) {
  const tab = TABS.includes(params.tab) ? params.tab : 'clientes';
  const data = await loadTripData(params.tripId);
  const { trip, tripClients, items, payments } = data;
  if (!trip) return notFoundView('Este viaje ya no existe.');
  const settings = await getSettings();
  const base = `/viaje/${trip.id}`;
  const itemsByClient = groupBy(items, 'clientId');
  const paysByClient = groupBy(payments, 'clientId');
  const clientName = (id) => data.clientMap.get(id)?.name || 'Sin cliente';

  const where = [trip.destination, fmtDateRange(trip.startDate, trip.endDate)].filter(Boolean).join(', ');
  const tabLink = (id, label, count) => `
    <a href="#${base}/${id}" data-replace class="${tab === id ? 'is-active' : ''}"${tab === id ? ' aria-current="page"' : ''}>
      ${label}${count !== undefined ? ` <span>${count}</span>` : ''}</a>`;
  const heroHtml = hero({
    title: trip.name,
    sub: `${where ? `${esc(where)}<br>` : ''}<button type="button" class="hero-chip" data-action="edit-trip">TC ${esc(fmtRate(trip.exchangeRate))}</button>
      <button type="button" class="hero-chip" data-action="edit-trip">Impuesto ${esc(fmtNum(trip.taxRate))}%</button>
      <button type="button" class="hero-chip" data-action="edit-trip">Ganancia ${esc(fmtNum(trip.marginRate))}%</button>
      ${trip.status === 'cerrado' ? '<span class="hero-chip is-closed">Cerrado</span>' : ''}`,
    below: `<nav class="band-tabs" aria-label="Secciones del viaje">
      ${tabLink('clientes', 'Clientes', tripClients.length)}
      ${tabLink('articulos', 'Artículos', items.length)}
      ${tabLink('resumen', 'Resumen')}
    </nav>`,
  });

  let body = '';

  if (tab === 'clientes') {
    const rows = tripClients.map((tc) => {
      const t = sumTotals(itemsByClient.get(tc.clientId) || [], paysByClient.get(tc.clientId) || [], trip);
      const sub = t.units || t.saleMXN
        ? `${plural(t.units, 'pieza', 'piezas')}, ${fmtMXN(t.saleMXN)}`
        : (t.pendingLines ? `${plural(t.pendingLines, 'encargo', 'encargos')} por comprar` : 'Sin artículos todavía');
      return `
        <a class="row" href="#${base}/cliente/${esc(tc.clientId)}" data-search="${esc(foldText(`${tc.client.name} ${tc.client.phone || ''}`))}">
          <span class="avatar" aria-hidden="true">${esc(initials(tc.client.name))}</span>
          <span class="row-main">
            <span class="row-title">${esc(tc.client.name)}</span>
            <span class="row-sub">${esc(sub)}</span>
          </span>
          <span class="row-end">${balanceBadge(t)}</span>
        </a>`;
    }).join('');
    body = tripClients.length
      ? `${tripClients.length > 6 ? `<div class="search-box">${icons.search}<input type="search" placeholder="Buscar cliente" aria-label="Buscar cliente" data-search-input></div>` : ''}
         <div class="group list" data-list>${rows}</div>
         <p class="list-empty" data-none hidden>Ningún cliente coincide con la búsqueda.</p>
         <div class="pad"><button type="button" class="btn btn-quiet btn-block" data-action="add-client">${icons.plus}<span>Agregar cliente al viaje</span></button></div>`
      : emptyState({
        icon: 'users',
        title: 'Agrega a tus clientes',
        text: 'Anota a cada persona que te hizo un encargo para este viaje. También puedes agregar un artículo directamente y elegir el cliente ahí.',
        action: `<button type="button" class="btn btn-primary" data-action="add-client">${icons.plus}<span>Agregar cliente</span></button>`,
      });
  }

  if (tab === 'articulos') {
    const filter = STATUS_ORDER.includes(query.estado) ? query.estado : 'todos';
    const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, items.filter((i) => i.status === s).length]));
    let list = filter === 'todos' ? [...items] : items.filter((i) => i.status === filter);
    if (filter === 'pendiente') {
      list.sort((a, b) => foldText(clientName(a.clientId)).localeCompare(foldText(clientName(b.clientId)), 'es') || (a.createdAt || '').localeCompare(b.createdAt || ''));
    } else {
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
    const here = `${base}/articulos${filter !== 'todos' ? `?estado=${filter}` : ''}`;
    const chip = (value, label, n) => `<a class="filter-chip${filter === value ? ' is-active' : ''}" href="#${base}/articulos${value === 'todos' ? '' : `?estado=${value}`}" data-replace>${esc(label)} <span>${n}</span></a>`;
    const rows = list.map((it) => {
      const c = itemCalc(it, trip);
      const who = clientName(it.clientId);
      const search = foldText([it.name, it.description, it.barcode, it.store, it.variant, who].filter(Boolean).join(' '));
      return `
        <a class="row item-row" href="#${base}/articulo/${esc(it.id)}?volver=${encodeURIComponent(here)}" data-search="${esc(search)}">
          ${thumbHtml(it.photoId, it.name)}
          <span class="row-main">
            <span class="row-title${it.status === 'no_encontrado' ? ' is-struck' : ''}">${esc(it.name)}</span>
            <span class="row-sub">${esc([who, it.variant].filter(Boolean).join(', '))}</span>
            <span class="row-meta">${statusChip(it.status)}${it.store ? `<span>${esc(it.store)}</span>` : ''}</span>
          </span>
          <span class="row-end">
            ${c.unitPrice ? `<span class="amount">${fmtMXN(c.saleMXN)}</span>` : '<span class="row-sub">Sin precio</span>'}
            <span class="row-sub">${c.unitCost ? `${c.qty} × ${fmtUSD(c.unitCost)}` : plural(c.qty, 'pieza', 'piezas')}</span>
          </span>
        </a>`;
    }).join('');
    body = `
      <div class="filter-bar">
        ${chip('todos', 'Todos', items.length)}
        ${STATUS_ORDER.map((s) => chip(s, STATUS[s], counts[s])).join('')}
      </div>
      ${items.length ? `<div class="search-box">${icons.search}<input type="search" placeholder="Buscar artículo, código o cliente" aria-label="Buscar artículo" data-search-input></div>` : ''}
      ${list.length
        ? `<div class="group list" data-list>${rows}</div><p class="list-empty" data-none hidden>Ningún artículo coincide con la búsqueda.</p>`
        : emptyState({
          icon: 'barcode',
          title: items.length ? 'Nada en este filtro' : 'Sin artículos todavía',
          text: items.length ? 'Elige otro estado para ver más artículos.' : 'Toca “Agregar artículo” para escanear o escribir lo que vas comprando.',
        })}`;
  }

  if (tab === 'resumen') {
    const t = sumTotals(items, payments, trip);
    const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, items.filter((i) => i.status === s).length]));
    body = `
      ${ticket({
        kicker: settings.businessName || '',
        title: 'Corte del viaje',
        meta: [trip.name, fmtDateRange(trip.startDate, trip.endDate)].filter(Boolean).join(', '),
        lines: [
          { name: 'Clientes', amount: String(tripClients.length) },
          { name: 'Piezas compradas', amount: String(t.units) },
          { name: 'Invertido en dólares', sub: Number(trip.taxRate) ? `con ${fmtNum(trip.taxRate)}% de impuesto` : 'sin impuesto', amount: fmtUSD(t.costUSDTax) },
          { name: 'Costo en pesos', sub: `a ${fmtRate(trip.exchangeRate)} por dólar`, amount: fmtMXN(t.costMXN) },
          { name: 'Venta', amount: fmtMXN(t.saleMXN) },
        ],
        totals: [
          { label: 'Ganancia', value: fmtMXN(t.profitMXN), strong: true },
          { label: 'Cobrado', value: fmtMXN(t.paidMXN) },
          { label: 'Por cobrar', value: fmtMXN(t.balanceMXN), strong: true },
        ],
        note: t.pendingLines ? `${plural(t.pendingLines, 'artículo pendiente', 'artículos pendientes')} por comprar${t.pendingSaleMXN > 0 ? ` (venta estimada ${fmtMXN(t.pendingSaleMXN)})` : ''}.` : '',
      })}
      <h3 class="group-title">Artículos por estado</h3>
      <div class="group">
        ${STATUS_ORDER.map((s) => `
          <a class="row" href="#${base}/articulos?estado=${s}" data-replace>
            <span class="row-main">${statusChip(s)}</span>
            <span class="row-end amount">${counts[s]}</span>
          </a>`).join('')}
      </div>
      <h3 class="group-title">Exportar</h3>
      <div class="pad stack">
        <button type="button" class="btn btn-primary btn-block" data-action="excel">${icons.table}<span>Exportar a Excel</span></button>
        <button type="button" class="btn btn-quiet btn-block" data-action="backup">${icons.shield}<span>Respaldar todos los datos</span></button>
        <p class="help">El Excel del viaje incluye costos y ganancias, es para tu control. Para mandarle su cuenta a un cliente, entra a su nombre y usa WhatsApp o “Excel para el cliente”.</p>
      </div>`;
  }

  return {
    title: trip.name,
    back: { to: '/viajes', label: 'Viajes' },
    tab: 'viajes',
    actions: [{ icon: 'more', label: 'Opciones del viaje', onClick: () => tripMenu(trip) }],
    fab: { label: 'Agregar artículo', icon: 'barcode', to: `${base}/articulo/nuevo?volver=${encodeURIComponent(`${base}/${tab}${tab === 'articulos' && query.estado ? `?estado=${query.estado}` : ''}`)}` },
    html: heroHtml + body,
    mount(root) {
      const input = root.querySelector('[data-search-input]');
      const listEl = root.querySelector('[data-list]');
      if (input && listEl) {
        const none = root.querySelector('[data-none]');
        bindSearch(input, [...listEl.children], { onChange: (n, q) => { if (none) none.hidden = !(q && n === 0); } });
      }
      hydratePhotos(root);
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        const a = b.dataset.action;
        if (a === 'edit-trip') openTripForm(trip);
        if (a === 'add-client') {
          const id = await pickClient({ tripId: trip.id, title: 'Agregar cliente al viaje', excludeInTrip: true });
          if (id) {
            await addClientToTrip(trip.id, id);
            toast('Cliente agregado al viaje');
            refresh();
          }
        }
        if (a === 'excel') exportTripExcel(trip.id);
        if (a === 'backup') startBackup();
      }, { signal });
    },
  };
}

async function tripMenu(trip) {
  const closed = trip.status === 'cerrado';
  const choice = await actionSheet({
    title: trip.name,
    actions: [
      { label: 'Editar viaje', value: 'edit', icon: 'edit' },
      { label: 'Exportar a Excel', value: 'excel', icon: 'table' },
      { label: closed ? 'Reabrir viaje' : 'Marcar como cerrado', value: 'toggle', icon: 'check' },
      { label: 'Eliminar viaje', value: 'delete', icon: 'trash', danger: true },
    ],
  });
  if (choice === 'edit') openTripForm(trip);
  if (choice === 'excel') exportTripExcel(trip.id);
  if (choice === 'toggle') {
    await saveTrip({ ...trip, status: closed ? 'abierto' : 'cerrado' });
    toast(closed ? 'Viaje reabierto' : 'Viaje cerrado');
    refresh();
  }
  if (choice === 'delete') {
    const ok = await confirmDialog({
      title: `¿Eliminar “${trip.name}”?`,
      message: 'Se borrarán sus artículos, fotos y pagos. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar viaje',
      danger: true,
    });
    if (ok) {
      await deleteTrip(trip.id);
      toast('Viaje eliminado');
      navigate('/viajes');
    }
  }
}

export async function exportTripExcel(tripId) {
  toast('Preparando el Excel…', { ms: 1500 });
  try {
    const [data, settings] = await Promise.all([loadTripData(tripId), getSettings()]);
    const file = await buildTripWorkbook({
      trip: data.trip,
      tripClients: data.tripClients,
      items: data.items,
      payments: data.payments,
      settings,
    });
    await deliverFile(file, { title: 'Excel del viaje', note: 'Incluye costos y ganancias: es para tu control.' });
  } catch (err) {
    console.error(err);
    toast(err.message || 'No se pudo crear el Excel.', { type: 'error', ms: 4000 });
  }
}
