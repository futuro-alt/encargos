// view-client.js
// - Cuenta de un cliente dentro de un viaje (ticket, artículos y pagos)
// - Directorio de clientes y perfil de cada cliente
// - Formularios de cliente y de pago, y el selector de cliente

import {
  getTrip, getClient, getAllBy, getAll, getSettings, listClients, saveClient, deleteClient,
  clientUsage, removeClientFromTrip, savePayment, deletePayment,
} from './db.js';
import {
  sumTotals, itemCalc, fmtMXN, fmtUSD, fmtDate, fmtDateRange, parseNum, plural, foldText,
  todayISO, waPhone, CHARGED, PAYMENT_METHODS, inputNum,
} from './calc.js';
import {
  esc, icons, toast, openSheet, formSheet, actionSheet, confirmDialog, bindSearch, notFoundView,
} from './ui.js';
import { navigate, refresh } from './router.js';
import { hero, ticket, emptyState, statusChip, balanceBadge, initials, groupBy } from './parts.js';
import { thumbHtml, hydratePhotos } from './photos.js';
import { buildClientMessage, openWhatsAppSheet, deliverFile } from './share.js';
import { buildClientWorkbook } from './excel.js';

// ---------------------------------------------------------------------------
// Cuenta del cliente en un viaje
// ---------------------------------------------------------------------------
export async function clientInTripView({ params, signal }) {
  const { tripId, clientId } = params;
  const [trip, client, items, payments, settings] = await Promise.all([
    getTrip(tripId), getClient(clientId),
    getAllBy('items', 'trip_client', [tripId, clientId]),
    getAllBy('payments', 'trip_client', [tripId, clientId]),
    getSettings(),
  ]);
  if (!trip) return notFoundView('Este viaje ya no existe.');
  if (!client) return notFoundView('Este cliente ya no existe.', `/viaje/${tripId}/clientes`);

  const base = `/viaje/${tripId}`;
  const here = `${base}/cliente/${clientId}`;
  items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  payments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const t = sumTotals(items, payments, trip);

  const charged = items.filter((i) => CHARGED.has(i.status));
  const lines = charged.map((it) => {
    const c = itemCalc(it, trip);
    const sub = [it.variant, `${c.qty} × ${fmtMXN(c.unitPrice)}`, it.status === 'entregado' ? 'entregado' : ''].filter(Boolean).join(', ');
    return { name: it.name, sub, amount: fmtMXN(c.saleMXN) };
  });
  const totals = [];
  if (charged.length || t.paidMXN) {
    totals.push({ label: 'Total', value: fmtMXN(t.saleMXN) });
    if (t.paidMXN) totals.push({ label: 'Pagos y anticipos', value: `−${fmtMXN(t.paidMXN)}` });
    if (t.balanceMXN > 0) totals.push({ label: 'Saldo por pagar', value: fmtMXN(t.balanceMXN), strong: true });
    else if (t.balanceMXN < 0) totals.push({ label: 'Saldo a su favor', value: fmtMXN(-t.balanceMXN), strong: true });
    else totals.push({ label: 'Cuenta liquidada', value: fmtMXN(0), strong: true });
  }
  const notes = [];
  if (t.pendingLines) notes.push(`${plural(t.pendingLines, 'artículo', 'artículos')} por conseguir`);
  if (t.notFoundLines) notes.push(`${plural(t.notFoundLines, 'no encontrado', 'no encontrados')}`);

  const itemRows = items.map((it) => {
    const c = itemCalc(it, trip);
    return `
      <a class="row item-row" href="#${base}/articulo/${esc(it.id)}?volver=${encodeURIComponent(here)}">
        ${thumbHtml(it.photoId, it.name)}
        <span class="row-main">
          <span class="row-title${it.status === 'no_encontrado' ? ' is-struck' : ''}">${esc(it.name)}</span>
          <span class="row-sub">${esc([it.variant, it.store].filter(Boolean).join(', ') || it.description || '')}</span>
          <span class="row-meta">${statusChip(it.status)}</span>
        </span>
        <span class="row-end">
          ${c.unitPrice ? `<span class="amount">${fmtMXN(c.saleMXN)}</span>` : '<span class="row-sub">Sin precio</span>'}
          <span class="row-sub">${c.unitCost ? `${c.qty} × ${fmtUSD(c.unitCost)}` : plural(c.qty, 'pieza', 'piezas')}</span>
        </span>
      </a>`;
  }).join('');

  const payRows = payments.map((p) => `
    <button type="button" class="row" data-action="edit-payment" data-id="${esc(p.id)}">
      <span class="row-icon">${icons.money}</span>
      <span class="row-main">
        <span class="row-title">${esc(PAYMENT_METHODS[p.method] || 'Pago')}</span>
        <span class="row-sub">${esc([fmtDate(p.date), p.notes].filter(Boolean).join(', '))}</span>
      </span>
      <span class="row-end amount">${fmtMXN(p.amountMXN)}</span>
    </button>`).join('');

  const html = `
    ${ticket({
      kicker: settings.businessName || '',
      title: client.name,
      meta: [trip.name, fmtDateRange(trip.startDate, trip.endDate)].filter(Boolean).join(', '),
      lines,
      empty: items.length ? 'Aún no hay artículos comprados.' : 'Aún no hay artículos para este cliente.',
      totals,
      note: notes.join(', '),
    })}
    <div class="pad btn-pair">
      <button type="button" class="btn btn-primary" data-action="whatsapp">${icons.chat}<span>WhatsApp</span></button>
      <button type="button" class="btn btn-secondary" data-action="add-payment">${icons.money}<span>Registrar pago</span></button>
    </div>

    <h3 class="group-title">Artículos <span>${items.length}</span></h3>
    ${items.length ? `<div class="group list">${itemRows}</div>` : '<p class="list-note">Usa “Agregar artículo” para anotar lo que te encargó.</p>'}

    <h3 class="group-title">Pagos y anticipos <span>${payments.length}</span></h3>
    ${payments.length ? `<div class="group list">${payRows}</div>` : '<p class="list-note">Sin pagos registrados. Usa “Registrar pago” para anotar anticipos.</p>'}`;

  return {
    title: client.name,
    back: { to: `${base}/clientes`, label: trip.name },
    tab: 'viajes',
    actions: [{ icon: 'more', label: 'Opciones del cliente', onClick: () => clientMenu({ trip, client, items, payments, settings }) }],
    fab: { label: 'Agregar artículo', icon: 'barcode', to: `${base}/articulo/nuevo?cliente=${clientId}&volver=${encodeURIComponent(here)}` },
    html,
    mount(root) {
      hydratePhotos(root);
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        const a = b.dataset.action;
        if (a === 'whatsapp') {
          openWhatsAppSheet({ client, text: buildClientMessage({ trip, client, items, payments, settings }) });
        }
        if (a === 'add-payment') {
          if (await openPaymentForm({ trip, client, balance: t.balanceMXN })) refresh();
        }
        if (a === 'edit-payment') {
          const p = payments.find((x) => x.id === b.dataset.id);
          if (p && await openPaymentForm({ trip, client, payment: p, balance: t.balanceMXN })) refresh();
        }
      }, { signal });
    },
  };
}

async function clientMenu({ trip, client, items, payments, settings }) {
  const phone = waPhone(client.phone);
  const actions = [
    { label: 'Editar datos del cliente', value: 'edit', icon: 'edit' },
    { label: 'Excel para el cliente', value: 'excel', icon: 'table' },
    { label: 'Historial del cliente', value: 'history', icon: 'user' },
  ];
  if (phone) actions.push({ label: `Llamar a ${client.name}`, value: 'call', icon: 'phone' });
  actions.push({ label: 'Quitar de este viaje', value: 'remove', icon: 'trash', danger: true });
  const choice = await actionSheet({ title: client.name, actions });
  if (choice === 'edit') {
    const res = await openClientForm(client);
    if (res === 'deleted') navigate(`/viaje/${trip.id}/clientes`);
    else if (res) refresh();
  }
  if (choice === 'excel') {
    try {
      toast('Preparando el Excel…', { ms: 1500 });
      const file = await buildClientWorkbook({ trip, client, items, payments, settings });
      await deliverFile(file, { title: 'Excel para el cliente', note: 'Solo incluye precios de venta, pagos y saldo (sin tus costos).' });
    } catch (err) {
      toast(err.message || 'No se pudo crear el Excel.', { type: 'error' });
    }
  }
  if (choice === 'history') navigate(`/cliente/${client.id}`);
  if (choice === 'call') window.location.href = `tel:+${phone}`;
  if (choice === 'remove') {
    const n = items.length + payments.length;
    const ok = await confirmDialog({
      title: `¿Quitar a ${client.name} de este viaje?`,
      message: n ? `También se borrarán ${plural(items.length, 'artículo', 'artículos')} y ${plural(payments.length, 'pago', 'pagos')} de este viaje. El cliente seguirá en tu directorio.` : 'El cliente seguirá en tu directorio.',
      confirmText: 'Quitar del viaje',
      danger: true,
    });
    if (ok) {
      await removeClientFromTrip(trip.id, client.id);
      toast('Cliente quitado del viaje');
      navigate(`/viaje/${trip.id}/clientes`);
    }
  }
}

// ---------------------------------------------------------------------------
// Formulario de pago
// ---------------------------------------------------------------------------
export async function openPaymentForm({ trip, client, payment = null, balance = 0 }) {
  const v = await formSheet({
    title: payment ? 'Editar pago' : 'Registrar pago',
    intro: `${client.name}, viaje ${trip.name}.`,
    submitText: payment ? 'Guardar cambios' : 'Registrar pago',
    fields: [
      {
        name: 'amount', label: 'Monto', type: 'money-mxn', required: true, value: inputNum(payment?.amountMXN), placeholder: '0.00',
        help: !payment && balance > 0 ? `Saldo actual: ${fmtMXN(balance)}` : '',
      },
      { name: 'date', label: 'Fecha', type: 'date', value: payment?.date || todayISO() },
      {
        name: 'method', label: 'Forma de pago', type: 'segmented', value: payment?.method || 'efectivo',
        options: Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label })),
      },
      { name: 'notes', label: 'Nota', value: payment?.notes, placeholder: 'Ej. Anticipo, transferencia BBVA' },
    ],
    dangerText: payment ? 'Eliminar pago' : '',
    validate(values) {
      const n = parseNum(values.amount);
      if (!(n > 0)) return { amount: 'Escribe un monto mayor a 0.' };
      return null;
    },
  });
  if (!v) return false;
  if (v.action === 'danger') {
    const ok = await confirmDialog({ title: '¿Eliminar este pago?', message: `${fmtMXN(payment.amountMXN)} de ${client.name}.`, confirmText: 'Eliminar', danger: true });
    if (!ok) return false;
    await deletePayment(payment.id);
    toast('Pago eliminado');
    return true;
  }
  await savePayment({
    ...(payment || {}),
    tripId: trip.id,
    clientId: client.id,
    amountMXN: parseNum(v.amount),
    date: v.date || todayISO(),
    method: v.method || 'efectivo',
    notes: v.notes,
  });
  toast(payment ? 'Pago actualizado' : 'Pago registrado');
  return true;
}

// ---------------------------------------------------------------------------
// Formulario de cliente
// ---------------------------------------------------------------------------
/** Devuelve el cliente guardado, 'deleted' si se eliminó, o null si se canceló. */
export async function openClientForm(client = null, { name = '' } = {}) {
  const v = await formSheet({
    title: client ? 'Editar cliente' : 'Nuevo cliente',
    submitText: client ? 'Guardar cambios' : 'Agregar cliente',
    fields: [
      { name: 'name', label: 'Nombre', required: true, value: client?.name ?? name, placeholder: 'Ej. Ana López', autocapitalize: 'words' },
      { name: 'phone', label: 'WhatsApp o teléfono', type: 'tel', value: client?.phone, placeholder: 'Ej. 462 123 4567', help: '10 dígitos. Si es un número de EE.UU., escríbelo con +1 al inicio.' },
      { name: 'city', label: 'Ciudad', value: client?.city, placeholder: 'Ej. León' },
      { name: 'notes', label: 'Notas', type: 'textarea', value: client?.notes, placeholder: 'Tallas, gustos, dirección de entrega…' },
    ],
    dangerText: client ? 'Eliminar cliente' : '',
    validate(values) {
      const digits = values.phone.replace(/\D/g, '');
      if (values.phone && digits.length < 10) return { phone: 'Revisa el número: debe tener al menos 10 dígitos.' };
      return null;
    },
  });
  if (!v) return null;
  if (v.action === 'danger') {
    const usage = await clientUsage(client.id);
    const ok = await confirmDialog({
      title: `¿Eliminar a ${client.name}?`,
      message: usage.items.length || usage.payments.length
        ? `Se borrarán también ${plural(usage.items.length, 'artículo', 'artículos')} y ${plural(usage.payments.length, 'pago', 'pagos')} en todos los viajes. Esta acción no se puede deshacer.`
        : 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar cliente',
      danger: true,
    });
    if (!ok) return null;
    await deleteClient(client.id);
    toast('Cliente eliminado');
    return 'deleted';
  }
  const saved = await saveClient({ ...(client || {}), name: v.name, phone: v.phone, city: v.city, notes: v.notes });
  toast(client ? 'Cliente actualizado' : 'Cliente agregado');
  return saved;
}

// ---------------------------------------------------------------------------
// Selector de cliente (con búsqueda y alta rápida)
// ---------------------------------------------------------------------------
/** Devuelve el id del cliente elegido (o creado), o null. */
export async function pickClient({ tripId = null, title = 'Elegir cliente', excludeInTrip = false } = {}) {
  const [clients, tcs] = await Promise.all([listClients(), tripId ? getAllBy('tripClients', 'tripId', tripId) : []]);
  const inTrip = new Set(tcs.map((x) => x.clientId));
  const visible = excludeInTrip ? clients.filter((c) => !inTrip.has(c.id)) : clients;
  const first = excludeInTrip ? [] : visible.filter((c) => inTrip.has(c.id));
  const rest = excludeInTrip ? visible : visible.filter((c) => !inTrip.has(c.id));
  const rowsHtml = (list) => list.map((c) => `
    <button type="button" class="row pick-row" data-id="${esc(c.id)}" data-search="${esc(foldText(`${c.name} ${c.phone || ''} ${c.city || ''}`))}">
      <span class="avatar" aria-hidden="true">${esc(initials(c.name))}</span>
      <span class="row-main">
        <span class="row-title">${esc(c.name)}</span>
        ${c.phone || c.city ? `<span class="row-sub">${esc([c.phone, c.city].filter(Boolean).join(', '))}</span>` : ''}
      </span>
    </button>`).join('');

  const html = `
    <div class="pick">
      <div class="search-box in-sheet">${icons.search}<input type="search" placeholder="Buscar o escribir un nombre nuevo" aria-label="Buscar cliente" autocomplete="off" data-q></div>
      <div class="group"><button type="button" class="row pick-new" data-create hidden>
        <span class="avatar is-new" aria-hidden="true">${icons.plus}</span>
        <span class="row-main"><span class="row-title" data-create-label></span><span class="row-sub">Cliente nuevo; después puedes agregar su teléfono.</span></span>
      </button>
      <button type="button" class="row pick-new" data-new-full>
        <span class="avatar is-new" aria-hidden="true">${icons.user}</span>
        <span class="row-main"><span class="row-title">Nuevo cliente con teléfono</span></span>
      </button></div>
      ${first.length ? `<h3 class="group-title">En este viaje</h3><div class="group list" data-rows>${rowsHtml(first)}</div>` : ''}
      ${rest.length ? `<h3 class="group-title">${first.length ? 'Otros clientes' : 'Tus clientes'}</h3><div class="group list" data-rows>${rowsHtml(rest)}</div>` : ''}
      ${!visible.length ? `<p class="list-note">${clients.length ? 'Todos tus clientes ya están en este viaje.' : 'Aún no tienes clientes. Escribe un nombre arriba para crear el primero.'}</p>` : ''}
      <p class="list-note" data-none hidden>Ningún cliente coincide. Toca “Crear” para agregarlo.</p>
    </div>`;

  return openSheet({
    title,
    html,
    onMount(sheet, close) {
      const input = sheet.querySelector('[data-q]');
      const create = sheet.querySelector('[data-create]');
      const createLabel = sheet.querySelector('[data-create-label]');
      const none = sheet.querySelector('[data-none]');
      const rows = [...sheet.querySelectorAll('[data-rows] .row')];
      bindSearch(input, rows, {
        onChange(n, q) {
          const text = input.value.trim();
          const exact = clients.some((c) => foldText(c.name) === foldText(text));
          create.hidden = !text || exact;
          createLabel.textContent = `Crear “${text}”`;
          none.hidden = !(q && n === 0);
          sheet.querySelectorAll('[data-rows]').forEach((g) => {
            g.hidden = ![...g.children].some((r) => !r.hidden);
            const title = g.previousElementSibling;
            if (title && title.classList.contains('group-title')) title.hidden = g.hidden;
          });
        },
      });
      sheet.addEventListener('click', async (e) => {
        const row = e.target.closest('[data-id]');
        if (row) { close(row.dataset.id); return; }
        if (e.target.closest('[data-create]')) {
          const c = await saveClient({ name: input.value.trim() });
          close(c.id);
          return;
        }
        if (e.target.closest('[data-new-full]')) {
          const c = await openClientForm(null, { name: input.value.trim() });
          if (c && c.id) close(c.id);
        }
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Directorio de clientes
// ---------------------------------------------------------------------------
export async function clientsView({ signal }) {
  const [clients, tcs] = await Promise.all([listClients(), getAll('tripClients')]);
  const tripsBy = groupBy(tcs, 'clientId');
  const rows = clients.map((c) => {
    const n = (tripsBy.get(c.id) || []).length;
    return `
      <a class="row" href="#/cliente/${esc(c.id)}" data-search="${esc(foldText(`${c.name} ${c.phone || ''} ${c.city || ''}`))}">
        <span class="avatar" aria-hidden="true">${esc(initials(c.name))}</span>
        <span class="row-main">
          <span class="row-title">${esc(c.name)}</span>
          <span class="row-sub">${esc([c.phone, c.city].filter(Boolean).join(', ') || 'Sin teléfono')}</span>
        </span>
        <span class="row-end row-sub">${plural(n, 'viaje', 'viajes')}</span>
      </a>`;
  }).join('');

  return {
    title: 'Clientes',
    tab: 'clientes',
    actions: [{ icon: 'plus', label: 'Nuevo cliente', onClick: async () => { if (await openClientForm()) refresh(); } }],
    html: `${hero({ title: 'Clientes', sub: clients.length ? esc(plural(clients.length, 'cliente', 'clientes')) : 'Tu directorio para todos los viajes' })}
      ${clients.length
        ? `<div class="search-box">${icons.search}<input type="search" placeholder="Buscar por nombre, teléfono o ciudad" aria-label="Buscar cliente" data-search-input></div>
           <div class="group list" data-list>${rows}</div>
           <p class="list-empty" data-none hidden>Ningún cliente coincide con la búsqueda.</p>
           <div class="pad"><button type="button" class="btn btn-quiet btn-block" data-action="new-client">${icons.plus}<span>Nuevo cliente</span></button></div>`
        : emptyState({
          icon: 'users',
          title: 'Aún no hay clientes',
          text: 'Los clientes que agregues en tus viajes aparecerán aquí, con su historial de compras.',
          action: `<button type="button" class="btn btn-primary" data-action="new-client">${icons.plus}<span>Nuevo cliente</span></button>`,
        })}`,
    mount(root) {
      const input = root.querySelector('[data-search-input]');
      const list = root.querySelector('[data-list]');
      const none = root.querySelector('[data-none]');
      if (input && list) bindSearch(input, [...list.children], { onChange: (n, q) => { none.hidden = !(q && n === 0); } });
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-action="new-client"]')) {
          if (await openClientForm()) refresh();
        }
      }, { signal });
    },
  };
}

// ---------------------------------------------------------------------------
// Perfil del cliente con su historial
// ---------------------------------------------------------------------------
export async function clientProfileView({ params, signal }) {
  const client = await getClient(params.clientId);
  if (!client) return notFoundView('Este cliente ya no existe.', '/clientes');
  const [usage, trips] = await Promise.all([clientUsage(client.id), getAll('trips')]);
  const itemsBy = groupBy(usage.items, 'tripId');
  const paysBy = groupBy(usage.payments, 'tripId');
  const tripIds = new Set([...usage.tripClients.map((x) => x.tripId), ...itemsBy.keys(), ...paysBy.keys()]);
  const myTrips = trips.filter((t) => tripIds.has(t.id))
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  let lifetime = 0;
  let owed = 0;
  const rows = myTrips.map((trip) => {
    const t = sumTotals(itemsBy.get(trip.id) || [], paysBy.get(trip.id) || [], trip);
    lifetime += t.saleMXN;
    if (t.balanceMXN > 0) owed += t.balanceMXN;
    return `
      <a class="row" href="#/viaje/${esc(trip.id)}/cliente/${esc(client.id)}">
        <span class="row-main">
          <span class="row-title">${esc(trip.name)}</span>
          <span class="row-sub">${esc([fmtDateRange(trip.startDate, trip.endDate), `${plural(t.units, 'pieza', 'piezas')}, ${fmtMXN(t.saleMXN)}`].filter(Boolean).join(', '))}</span>
        </span>
        <span class="row-end">${balanceBadge(t)}</span>
      </a>`;
  }).join('');
  const phone = waPhone(client.phone);

  return {
    title: client.name,
    back: { to: '/clientes', label: 'Clientes' },
    tab: 'clientes',
    actions: [{ icon: 'edit', label: 'Editar cliente', onClick: () => editProfile(client) }],
    html: `${hero({ title: client.name, sub: esc(myTrips.length ? `${plural(myTrips.length, 'viaje', 'viajes')}, ${fmtMXN(lifetime)} en compras${owed ? `, debe ${fmtMXN(owed)}` : ''}` : 'Sin compras todavía') })}
      <div class="group">
        ${client.phone ? `
          <a class="row" href="tel:+${esc(phone)}"><span class="row-icon">${icons.phone}</span><span class="row-main"><span class="row-title">${esc(client.phone)}</span><span class="row-sub">Llamar</span></span></a>
          <a class="row" href="https://wa.me/${esc(phone)}" target="_blank" rel="noopener"><span class="row-icon">${icons.chat}</span><span class="row-main"><span class="row-title">Abrir chat de WhatsApp</span></span></a>`
        : `<button type="button" class="row" data-action="edit"><span class="row-icon">${icons.phone}</span><span class="row-main"><span class="row-title">Agregar teléfono</span><span class="row-sub">Para mandarle su cuenta por WhatsApp</span></span></button>`}
        ${client.city ? `<div class="row"><span class="row-icon">${icons.home}</span><span class="row-main"><span class="row-title">${esc(client.city)}</span></span></div>` : ''}
        ${client.notes ? `<div class="row"><span class="row-icon">${icons.info}</span><span class="row-main"><span class="row-sub pre">${esc(client.notes)}</span></span></div>` : ''}
      </div>
      <h3 class="group-title">Historial</h3>
      ${rows ? `<div class="group list">${rows}</div>` : '<p class="list-note">Este cliente todavía no aparece en ningún viaje.</p>'}`,
    mount(root) {
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="edit"]')) editProfile(client);
      }, { signal });
    },
  };
}

async function editProfile(client) {
  const res = await openClientForm(client);
  if (res === 'deleted') navigate('/clientes');
  else if (res) refresh();
}
