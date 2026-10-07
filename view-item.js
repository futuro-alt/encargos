// view-item.js
// Formulario para agregar o editar un artículo: cliente, código de barras
// (con escáner), nombre, precios, estado, foto y notas.
// Lo capturado se guarda como borrador mientras se escribe: si iOS cierra la
// app (por ejemplo, al cambiar a WhatsApp), al volver se recupera.

import {
  getTrip, getItem, getClient, getSettings, getAll, saveItem, deleteItem,
  findItemsByBarcode, knownStores, deletePhoto,
} from './db.js';
import {
  itemCalc, suggestedPrice, fmtMXN, fmtUSD, fmtNum, fmtRate, fmtDate, isoDate, parseNum, inputNum,
  STATUS, STATUS_ORDER,
} from './calc.js';
import { esc, icons, toast, confirmDialog, notFoundView } from './ui.js';
import { navigate } from './router.js';
import { pickClient } from './view-client.js';
import { scanBarcode, preloadScanner } from './scanner.js';
import { storePhotoFile, photoURL, openPhotoViewer, forgetPhotoURL } from './photos.js';

const DRAFT_PREFIX = 'encargos:borrador:';
const DAY = 86400000;

function readDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.state || Date.now() - d.at > DAY) {
      localStorage.removeItem(key);
      return null;
    }
    return d;
  } catch { return null; }
}
function writeDraft(key, state) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), state })); } catch { /* sin espacio */ }
}
function clearDraft(key) {
  try { localStorage.removeItem(key); } catch { /* nada */ }
}

/** Fotos que pertenecen a borradores (para no borrarlas en la limpieza). */
export function draftPhotoIds() {
  const ids = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      for (const id of [d?.state?.photoId, ...(d?.state?.newPhotos || [])]) if (id) ids.push(id);
    }
  } catch { /* nada */ }
  return ids;
}

const safeRoute = (r) => (typeof r === 'string' && /^\/(viaje|viajes|cliente|clientes)\b/.test(r) && !r.includes('//') ? r : '');

export async function itemFormView({ params, query, signal }) {
  const { tripId, itemId } = params;
  const isNew = itemId === 'nuevo';
  const [trip, settings, stores, existing, trips, clients] = await Promise.all([
    getTrip(tripId), getSettings(), knownStores(), isNew ? null : getItem(itemId), getAll('trips'), getAll('clients'),
  ]);
  if (!trip) return notFoundView('Este viaje ya no existe.');
  if (!isNew && !existing) return notFoundView('Este artículo ya no existe.', `/viaje/${tripId}/articulos`);

  const backTo = safeRoute(query.volver)
    || (existing ? `/viaje/${tripId}/cliente/${existing.clientId}`
      : query.cliente ? `/viaje/${tripId}/cliente/${query.cliente}` : `/viaje/${tripId}/articulos`);
  const tripName = new Map(trips.map((t) => [t.id, t.name]));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const initial = existing
    ? {
      clientId: existing.clientId,
      barcode: existing.barcode || '',
      name: existing.name || '',
      description: existing.description || '',
      store: existing.store || '',
      variant: existing.variant || '',
      quantity: String(existing.quantity || 1),
      unitCostUSD: inputNum(existing.unitCostUSD),
      unitPriceMXN: inputNum(existing.unitPriceMXN),
      status: existing.status || 'comprado',
      notes: existing.notes || '',
      photoId: existing.photoId || null,
      newPhotos: [],
    }
    : {
      clientId: query.cliente || '',
      barcode: '',
      name: '',
      description: '',
      store: query.tienda || '',
      variant: '',
      quantity: '1',
      unitCostUSD: '',
      unitPriceMXN: '',
      status: STATUS_ORDER.includes(query.estado) ? query.estado : 'comprado',
      notes: '',
      photoId: null,
      newPhotos: [],
    };

  const draftKey = `${DRAFT_PREFIX}${tripId}:${itemId}`;
  const draft = readDraft(draftKey);
  const state = { ...initial, ...(draft ? draft.state : {}) };
  if (state.clientId && !clientName.has(state.clientId)) state.clientId = '';

  // Estado compartido entre el formulario y el botón "Cancelar".
  const session = { dirty: !!draft, newPhotos: new Set(state.newPhotos || []), photoId: state.photoId };

  const cancel = async () => {
    if (session.dirty) {
      const ok = await confirmDialog({
        title: '¿Descartar lo capturado?',
        message: 'Se perderán los datos que escribiste en este artículo.',
        confirmText: 'Descartar',
        danger: true,
      });
      if (!ok) return;
    }
    for (const id of session.newPhotos) deletePhoto(id).catch(() => {});
    clearDraft(draftKey);
    navigate(backTo, { replace: true });
  };

  const statusOptions = STATUS_ORDER.map((s, i) => `
    <input type="radio" id="st-${s}" name="status" value="${s}"${state.status === s ? ' checked' : ''}>
    <label for="st-${s}" class="opt-${s}">${esc(STATUS[s])}</label>`).join('');

  const html = `
    <form class="item-form" novalidate autocomplete="off">
      ${draft ? `
        <div class="banner is-info compact">${icons.refresh}
          <div><strong>Recuperamos lo que estabas capturando.</strong>
          <button type="button" class="link-btn" data-action="discard-draft">Descartar y empezar de nuevo</button></div>
        </div>` : ''}

      <h3 class="group-title">Para quién es</h3>
      <div class="group">
        <div class="field" data-field="client">
          <button type="button" class="picker" data-action="pick-client" aria-describedby="client-error">
            <span class="avatar${state.clientId ? '' : ' is-new'}" data-client-avatar aria-hidden="true">${state.clientId ? esc(initialsOf(clientName.get(state.clientId))) : icons.user}</span>
            <span class="picker-text">
              <span class="picker-label">Cliente</span>
              <span class="picker-value" data-client-name>${state.clientId ? esc(clientName.get(state.clientId)) : 'Elegir cliente'}</span>
            </span>
            ${icons.chevron}
          </button>
          <p class="field-error" id="client-error" hidden></p>
        </div>
      </div>

      <h3 class="group-title">Artículo</h3>
      <div class="group">
        <div class="field" data-field="barcode">
          <label class="field-label" for="f-barcode">Código de barras</label>
          <div class="input-with-btn">
            <input id="f-barcode" name="barcode" type="text" inputmode="numeric" autocomplete="off" placeholder="Escanéalo o escríbelo" value="${esc(state.barcode)}">
            <button type="button" class="btn btn-scan" data-action="scan">${icons.barcode}<span>Escanear</span></button>
          </div>
          <div class="barcode-info" data-barcode-info aria-live="polite"></div>
        </div>
        <div class="field" data-field="name">
          <label class="field-label" for="f-name">Nombre del artículo <span class="req" aria-hidden="true">*</span></label>
          <input id="f-name" name="name" type="text" autocapitalize="sentences" placeholder="Ej. Tenis Nike Air Max" value="${esc(state.name)}" aria-required="true">
          <p class="field-error" hidden></p>
        </div>
        <div class="field" data-field="description">
          <label class="field-label" for="f-description">Descripción</label>
          <textarea id="f-description" name="description" rows="2" placeholder="Marca, modelo, detalles">${esc(state.description)}</textarea>
        </div>
        <div class="field-row">
          <div class="field" data-field="store">
            <label class="field-label" for="f-store">Tienda</label>
            <input id="f-store" name="store" type="text" list="store-list" autocapitalize="words" placeholder="Ej. Walmart" value="${esc(state.store)}">
          </div>
          <div class="field" data-field="variant">
            <label class="field-label" for="f-variant">Talla o color</label>
            <input id="f-variant" name="variant" type="text" placeholder="Ej. 7 MX, negro" value="${esc(state.variant)}">
          </div>
        </div>
        <datalist id="store-list">${stores.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
      </div>

      <h3 class="group-title">Precio</h3>
      <div class="group">
        <div class="field" data-field="quantity">
          <label class="field-label" for="f-quantity">Cantidad</label>
          <div class="stepper">
            <button type="button" data-action="qty-minus" aria-label="Menos uno">${icons.minus}</button>
            <input id="f-quantity" name="quantity" type="text" inputmode="numeric" value="${esc(state.quantity)}">
            <button type="button" data-action="qty-plus" aria-label="Más uno">${icons.plus}</button>
          </div>
          <p class="field-error" hidden></p>
        </div>
        <div class="field" data-field="unitCostUSD">
          <label class="field-label" for="f-cost">Precio de compra por pieza</label>
          <div class="affix"><span class="affix-pre">US$</span><input id="f-cost" name="unitCostUSD" type="text" inputmode="decimal" placeholder="0.00" value="${esc(state.unitCostUSD)}"></div>
          <p class="field-error" hidden></p>
        </div>
        <div class="field" data-field="unitPriceMXN">
          <label class="field-label" for="f-price">Precio de venta por pieza</label>
          <div class="affix"><span class="affix-pre">$</span><input id="f-price" name="unitPriceMXN" type="text" inputmode="decimal" placeholder="0.00" value="${esc(state.unitPriceMXN)}"><span class="affix-suf">pesos</span></div>
          <button type="button" class="suggest" data-action="use-suggested" hidden></button>
          <p class="field-error" hidden></p>
        </div>
        <div class="calc" data-calc aria-live="polite"></div>
      </div>

      <h3 class="group-title">Estado</h3>
      <div class="group">
        <div class="field">
          <div class="seg seg-grid seg-status" role="radiogroup" aria-label="Estado del artículo">${statusOptions}</div>
        </div>
      </div>

      <h3 class="group-title">Foto y notas</h3>
      <div class="group">
        <div class="field">
          <div class="photo-field" data-photo-box>
            <button type="button" class="photo-preview" data-action="view-photo" hidden><img alt="Foto del artículo"></button>
            <div class="photo-actions">
              <label class="btn btn-quiet">
                ${icons.camera}<span data-photo-label>Tomar o elegir foto</span>
                <input type="file" accept="image/*" class="file-input" data-photo-input>
              </label>
              <button type="button" class="btn btn-danger-text" data-action="remove-photo" hidden>Quitar foto</button>
            </div>
          </div>
        </div>
        <div class="field" data-field="notes">
          <label class="field-label" for="f-notes">Notas</label>
          <textarea id="f-notes" name="notes" rows="2" placeholder="Ej. Si no hay en negro, en azul">${esc(state.notes)}</textarea>
        </div>
      </div>

      <div class="form-actions sticky-actions">
        <button type="submit" class="btn btn-primary btn-block" data-save>${icons.check}<span>Guardar</span></button>
        ${isNew ? `<button type="button" class="btn btn-secondary btn-block" data-action="save-next">${icons.plus}<span>Guardar y agregar otro</span></button>` : ''}
        ${!isNew ? `<button type="button" class="btn btn-danger-text btn-block" data-action="delete">${icons.trash}<span>Eliminar artículo</span></button>` : ''}
      </div>
    </form>`;

  return {
    title: isNew ? 'Nuevo artículo' : 'Editar artículo',
    back: { to: backTo, label: 'Cancelar', onClick: cancel },
    tab: 'viajes',
    hideTabbar: true,
    html,
    mount(root) {
      const form = root.querySelector('form');
      const el = (name) => form.elements[name];
      const calcBox = root.querySelector('[data-calc]');
      const suggestBtn = root.querySelector('[data-action="use-suggested"]');
      const info = root.querySelector('[data-barcode-info]');
      const photoBox = root.querySelector('[data-photo-box]');
      const photoPreview = photoBox.querySelector('.photo-preview');
      const photoImg = photoPreview.querySelector('img');
      const photoInput = photoBox.querySelector('[data-photo-input]');
      const photoLabel = photoBox.querySelector('[data-photo-label]');
      const removePhotoBtn = photoBox.querySelector('[data-action="remove-photo"]');
      let saving = false;
      let lookupSeq = 0;
      let lookupTimer = null;
      let draftTimer = null;

      preloadScanner();

      const collect = () => ({
        clientId: state.clientId,
        barcode: el('barcode').value.trim(),
        name: el('name').value.trim(),
        description: el('description').value.trim(),
        store: el('store').value.trim(),
        variant: el('variant').value.trim(),
        quantity: el('quantity').value.trim(),
        unitCostUSD: el('unitCostUSD').value.trim(),
        unitPriceMXN: el('unitPriceMXN').value.trim(),
        status: (form.querySelector('input[name="status"]:checked') || {}).value || 'comprado',
        notes: el('notes').value.trim(),
        photoId: session.photoId,
        newPhotos: [...session.newPhotos],
      });
      const markDirty = () => {
        session.dirty = true;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => writeDraft(draftKey, collect()), 300);
      };

      const updateCalc = () => {
        const qty = Math.max(1, parseInt(el('quantity').value, 10) || 1);
        const cost = parseNum(el('unitCostUSD').value);
        const price = parseNum(el('unitPriceMXN').value);
        const c = itemCalc({ quantity: qty, unitCostUSD: cost, unitPriceMXN: price }, trip);
        const sug = suggestedPrice(cost, trip, settings.roundTo);
        if (sug && sug !== price) {
          suggestBtn.hidden = false;
          suggestBtn.textContent = `Usar precio sugerido: ${fmtMXN(sug)}`;
          suggestBtn.dataset.value = String(sug);
        } else {
          suggestBtn.hidden = true;
        }
        if (cost === null && price === null) {
          calcBox.innerHTML = `<p class="calc-hint">Tipo de cambio del viaje: ${esc(fmtRate(trip.exchangeRate))} por dólar${Number(trip.taxRate) ? `, impuesto ${esc(fmtNum(trip.taxRate))}%` : ''}. Escribe el precio de compra para ver el costo en pesos y tu ganancia.</p>`;
          return;
        }
        const tax = Number(trip.taxRate) || 0;
        calcBox.innerHTML = `
          <div class="calc-row"><span>Costo${qty > 1 ? ` de ${qty} piezas` : ''}</span><span>${fmtUSD(c.costUSD)}${tax ? ` + ${fmtNum(tax)}% = ${fmtUSD(c.costUSDTax)}` : ''}</span></div>
          <div class="calc-row"><span>Costo en pesos</span><span>${fmtMXN(c.costMXN)}</span></div>
          <div class="calc-row"><span>Venta</span><span>${fmtMXN(c.saleMXN)}</span></div>
          <div class="calc-row is-strong${c.profitMXN < 0 ? ' is-negative' : ''}"><span>Ganancia</span><span>${fmtMXN(c.profitMXN)}</span></div>`;
      };

      const setError = (field, msg) => {
        const box = form.querySelector(`[data-field="${field}"]`);
        if (!box) return;
        box.classList.toggle('has-error', !!msg);
        const p = box.querySelector('.field-error');
        if (p) { p.hidden = !msg; p.textContent = msg || ''; }
      };

      // ----- Foto -----
      const showPhoto = async (id) => {
        if (!id) {
          photoPreview.hidden = true;
          removePhotoBtn.hidden = true;
          photoLabel.textContent = 'Tomar o elegir foto';
          return;
        }
        const url = await photoURL(id, 'thumb');
        if (!url) { session.photoId = null; return showPhoto(null); }
        photoImg.src = url;
        photoPreview.hidden = false;
        removePhotoBtn.hidden = false;
        photoLabel.textContent = 'Cambiar foto';
      };
      const setPhoto = (id) => {
        const prev = session.photoId;
        if (prev && prev !== id && session.newPhotos.has(prev)) {
          deletePhoto(prev).catch(() => {});
          session.newPhotos.delete(prev);
          forgetPhotoURL(prev);
        }
        session.photoId = id;
        showPhoto(id);
        markDirty();
      };
      showPhoto(session.photoId);
      photoInput.addEventListener('change', async () => {
        const file = photoInput.files && photoInput.files[0];
        photoInput.value = '';
        if (!file) return;
        photoBox.classList.add('is-loading');
        photoLabel.textContent = 'Guardando foto…';
        try {
          const id = await storePhotoFile(file);
          session.newPhotos.add(id);
          setPhoto(id);
        } catch (err) {
          toast(err.message || 'No se pudo guardar la foto.', { type: 'error' });
          showPhoto(session.photoId);
        } finally {
          photoBox.classList.remove('is-loading');
        }
      }, { signal });

      // ----- Código de barras -----
      const lookup = async (code) => {
        const seq = ++lookupSeq;
        if (!code) { info.innerHTML = ''; return; }
        const matches = (await findItemsByBarcode(code)).filter((m) => m.id !== existing?.id);
        if (seq !== lookupSeq) return;
        const parts = [];
        const sameTrip = matches.filter((m) => m.tripId === tripId);
        if (sameTrip.length) {
          const who = sameTrip.map((m) => `${clientName.get(m.clientId) || 'otro cliente'} (${m.quantity || 1})`).join(', ');
          parts.push(`<p class="note is-warn">${icons.info}<span>Este código ya está en este viaje para ${esc(who)}.</span></p>`);
        }
        const prev = matches[0];
        if (prev) {
          const filled = [];
          const fill = (name, value, label) => {
            if (!el(name).value.trim() && value !== null && value !== undefined && value !== '') {
              el(name).value = value;
              filled.push(label);
            }
          };
          fill('name', prev.name, 'nombre');
          fill('description', prev.description, 'descripción');
          fill('store', prev.store, 'tienda');
          fill('unitCostUSD', inputNum(prev.unitCostUSD), 'precio de compra');
          fill('unitPriceMXN', inputNum(prev.unitPriceMXN), 'precio de venta');
          const when = prev.createdAt ? fmtDate(isoDate(new Date(prev.createdAt))) : '';
          const from = [tripName.get(prev.tripId), when].filter(Boolean).join(', ');
          if (filled.length) {
            parts.push(`<p class="note is-ok">${icons.check}<span>Llené ${esc(filled.join(', '))} con tu compra anterior${from ? ` (${esc(from)})` : ''}. Revisa que sigan vigentes.</span></p>`);
            updateCalc();
            markDirty();
          } else {
            parts.push(`<p class="note">${icons.info}<span>Ya lo habías registrado: ${esc(prev.name)}, ${esc(fmtUSD(prev.unitCostUSD || 0))}${from ? ` (${esc(from)})` : ''}.</span></p>`);
          }
        } else {
          parts.push(`<button type="button" class="link-btn small" data-action="web-lookup">${icons.globe}<span>Buscar el nombre en internet (alimentos y botanas)</span></button>`);
        }
        info.innerHTML = parts.join('');
      };

      const webLookup = async (btn) => {
        const code = el('barcode').value.trim();
        if (!code) return;
        if (navigator.onLine === false) {
          toast('Necesitas internet para buscar el nombre.', { type: 'error' });
          return;
        }
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Buscando…';
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 9000);
          const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=product_name,product_name_es,brands,quantity`, { signal: ctrl.signal });
          clearTimeout(timer);
          const data = await res.json();
          const p = data && data.status === 1 ? data.product : null;
          const base = p && (p.product_name_es || p.product_name);
          if (base) {
            const brand = String(p.brands || '').split(',')[0].trim();
            let name = brand && !base.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${base}` : base;
            if (p.quantity) name += ` ${p.quantity}`;
            if (!el('name').value.trim()) el('name').value = name.trim();
            else if (!el('description').value.trim()) el('description').value = name.trim();
            markDirty();
            btn.outerHTML = `<p class="note is-ok">${icons.check}<span>Encontrado: ${esc(name.trim())}.</span></p>`;
          } else {
            btn.outerHTML = `<p class="note">${icons.info}<span>No está en la base de alimentos. Escribe el nombre a mano.</span></p>`;
          }
        } catch {
          btn.disabled = false;
          btn.querySelector('span').textContent = 'No se pudo consultar. Toca para intentar de nuevo.';
        }
      };

      el('barcode').addEventListener('input', () => {
        clearTimeout(lookupTimer);
        const code = el('barcode').value.trim();
        lookupTimer = setTimeout(() => lookup(code.length >= 6 ? code : ''), 600);
      }, { signal });

      // ----- Guardar -----
      const save = async ({ next = false } = {}) => {
        if (saving) return;
        const v = collect();
        const errors = {};
        if (!v.clientId) errors.client = 'Elige para qué cliente es este artículo.';
        if (!v.name) errors.name = 'Escribe el nombre del artículo.';
        const qty = parseInt(v.quantity, 10);
        if (!(qty >= 1) || String(qty) !== v.quantity.replace(/^0+(?=\d)/, '')) errors.quantity = 'Escribe una cantidad entera, de 1 en adelante.';
        const cost = parseNum(v.unitCostUSD);
        const price = parseNum(v.unitPriceMXN);
        if (v.unitCostUSD && (cost === null || cost < 0)) errors.unitCostUSD = 'Revisa el precio de compra (solo números, ej. 24.99).';
        if (v.unitPriceMXN && (price === null || price < 0)) errors.unitPriceMXN = 'Revisa el precio de venta (solo números, ej. 650).';
        for (const f of ['client', 'name', 'quantity', 'unitCostUSD', 'unitPriceMXN']) setError(f, errors[f]);
        const firstError = Object.keys(errors)[0];
        if (firstError) {
          const target = form.querySelector(`[data-field="${firstError}"]`);
          target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          toast('Revisa los datos marcados.', { type: 'error' });
          return;
        }
        saving = true;
        try {
          const item = {
            ...(existing || {}),
            tripId,
            clientId: v.clientId,
            barcode: v.barcode,
            name: v.name,
            description: v.description,
            store: v.store,
            variant: v.variant,
            quantity: qty,
            unitCostUSD: cost,
            unitPriceMXN: price,
            status: v.status,
            notes: v.notes,
            photoId: session.photoId || null,
          };
          const now = new Date().toISOString();
          if (v.status !== existing?.status) {
            if (v.status === 'comprado' && !item.purchasedAt) item.purchasedAt = now;
            if (v.status === 'entregado') item.deliveredAt = now;
          }
          await saveItem(item);
          if (existing?.photoId && existing.photoId !== item.photoId) {
            await deletePhoto(existing.photoId);
            forgetPhotoURL(existing.photoId);
          }
          for (const id of session.newPhotos) if (id !== item.photoId) await deletePhoto(id);
          session.newPhotos.clear();
          session.dirty = false;
          clearTimeout(draftTimer);
          clearDraft(draftKey);
          toast(existing ? 'Cambios guardados' : `Guardado para ${clientName.get(v.clientId) || 'el cliente'}`);
          if (next) {
            const q = new URLSearchParams({ cliente: v.clientId, volver: backTo });
            if (v.store) q.set('tienda', v.store);
            if (v.status !== 'comprado') q.set('estado', v.status);
            navigate(`/viaje/${tripId}/articulo/nuevo?${q.toString()}`, { replace: true });
            window.scrollTo(0, 0);
          } else {
            navigate(backTo, { replace: true });
          }
        } catch (err) {
          console.error(err);
          toast(`No se pudo guardar: ${err.message || err}`, { type: 'error', ms: 5000 });
        } finally {
          saving = false;
        }
      };

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        // La tecla "Intro" del teclado pasa al siguiente campo en vez de guardar.
        if (!e.submitter || !e.submitter.hasAttribute('data-save')) {
          const fields = [...form.querySelectorAll('input:not([type=radio]):not([type=file]):not([hidden]), textarea')];
          const i = fields.indexOf(document.activeElement);
          if (i >= 0 && fields[i + 1]) fields[i + 1].focus();
          else document.activeElement?.blur();
          return;
        }
        save();
      }, { signal });

      form.addEventListener('input', (e) => {
        markDirty();
        if (['quantity', 'unitCostUSD', 'unitPriceMXN'].includes(e.target.name)) updateCalc();
        const f = e.target.closest('[data-field]');
        if (f && f.classList.contains('has-error')) setError(f.dataset.field, '');
      }, { signal });
      form.addEventListener('change', markDirty, { signal });

      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        const a = b.dataset.action;
        if (a === 'scan') {
          const res = await scanBarcode();
          if (!res) return;
          if (res.manual) { el('barcode').focus(); return; }
          el('barcode').value = res.code;
          markDirty();
          await lookup(res.code);
        }
        if (a === 'pick-client') {
          const id = await pickClient({ tripId, title: 'Elegir cliente' });
          if (!id) return;
          const c = await getClient(id);
          if (!c) return;
          clientName.set(c.id, c.name);
          state.clientId = c.id;
          root.querySelector('[data-client-name]').textContent = c.name;
          const av = root.querySelector('[data-client-avatar]');
          av.classList.remove('is-new');
          av.textContent = initialsOf(c.name);
          setError('client', '');
          markDirty();
        }
        if (a === 'qty-minus' || a === 'qty-plus') {
          const cur = parseInt(el('quantity').value, 10) || 1;
          el('quantity').value = String(Math.max(1, Math.min(999, cur + (a === 'qty-plus' ? 1 : -1))));
          setError('quantity', '');
          updateCalc();
          markDirty();
        }
        if (a === 'use-suggested') {
          el('unitPriceMXN').value = b.dataset.value;
          setError('unitPriceMXN', '');
          updateCalc();
          markDirty();
        }
        if (a === 'web-lookup') webLookup(b);
        if (a === 'view-photo' && session.photoId) openPhotoViewer(session.photoId, el('name').value || 'Foto');
        if (a === 'remove-photo') setPhoto(null);
        if (a === 'save-next') save({ next: true });
        if (a === 'delete') {
          const ok = await confirmDialog({
            title: '¿Eliminar este artículo?',
            message: `${existing.name}. Esta acción no se puede deshacer.`,
            confirmText: 'Eliminar',
            danger: true,
          });
          if (!ok) return;
          await deleteItem(existing);
          for (const id of session.newPhotos) deletePhoto(id).catch(() => {});
          clearDraft(draftKey);
          session.dirty = false;
          toast('Artículo eliminado');
          navigate(backTo, { replace: true });
        }
        if (a === 'discard-draft') {
          for (const id of session.newPhotos) deletePhoto(id).catch(() => {});
          clearDraft(draftKey);
          session.dirty = false;
          navigate(`/viaje/${tripId}/articulo/${itemId}?${new URLSearchParams(query).toString()}`, { replace: true });
        }
      }, { signal });

      updateCalc();
      if (state.barcode) lookup(state.barcode);
    },
  };
}

function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
