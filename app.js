// app.js
// Arranque de la app: pantallas, barra superior, pestañas, botón flotante,
// funcionamiento sin internet (service worker) y aviso de versión nueva.

import { route, parseHash, match, onRender, navigate } from './router.js';
import { openDB, cleanupOrphanPhotos } from './db.js';
import { esc, icons, toast } from './ui.js';
import { tripsView } from './view-trips.js';
import { tripView } from './view-trip.js';
import { clientInTripView, clientsView, clientProfileView } from './view-client.js';
import { itemFormView, draftPhotoIds } from './view-item.js';
import { settingsView } from './view-settings.js';

// ---------- Pantallas ----------
route('/viajes', tripsView);
route('/viaje/:tripId', tripView);
route('/viaje/:tripId/cliente/:clientId', clientInTripView);
route('/viaje/:tripId/articulo/:itemId', itemFormView);
route('/viaje/:tripId/:tab', tripView);
route('/clientes', clientsView);
route('/cliente/:clientId', clientProfileView);
route('/ajustes', settingsView);

const main = document.getElementById('view');
const topbar = document.getElementById('topbar');
const tabbar = document.getElementById('tabbar');
const LAST_ROUTE_KEY = 'encargos:ultima-pantalla';

tabbar.innerHTML = `
  <a href="#/viajes" data-tab="viajes">${icons.bag}<span>Viajes</span></a>
  <a href="#/clientes" data-tab="clientes">${icons.users}<span>Clientes</span></a>
  <a href="#/ajustes" data-tab="ajustes">${icons.sliders}<span>Ajustes</span></a>`;

function renderTopbar(v) {
  const left = v.back
    ? `<button type="button" class="tb-back" data-tb-back>${icons.back}<span>${esc(v.back.label || 'Atrás')}</span></button>`
    : '<span class="tb-brand">Encargos</span>';
  const right = (v.actions || []).map((a, i) => `
    <button type="button" class="tb-icon" data-tb-action="${i}" aria-label="${esc(a.label)}" title="${esc(a.label)}">${icons[a.icon] || ''}</button>`).join('');
  topbar.innerHTML = `
    <div class="tb-row">
      <div class="tb-left">${left}</div>
      <div class="tb-title">${esc(v.title || '')}</div>
      <div class="tb-right">${right}</div>
    </div>`;
  topbar.querySelector('[data-tb-back]')?.addEventListener('click', () => {
    if (v.back.onClick) v.back.onClick();
    else navigate(v.back.to);
  });
  topbar.querySelectorAll('[data-tb-action]').forEach((b) => {
    b.addEventListener('click', () => v.actions[Number(b.dataset.tbAction)].onClick());
  });
}

function setTabbar(v) {
  document.body.classList.toggle('no-tabbar', !!v.hideTabbar);
  tabbar.hidden = !!v.hideTabbar;
  tabbar.querySelectorAll('[data-tab]').forEach((a) => {
    const active = a.dataset.tab === v.tab;
    a.classList.toggle('is-active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function setFab(fab) {
  let el = document.getElementById('fab');
  if (!fab) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('a');
    el.id = 'fab';
    el.className = 'fab';
    document.body.appendChild(el);
  }
  el.href = `#${fab.to}`;
  el.innerHTML = `${icons[fab.icon] || icons.plus}<span>${esc(fab.label)}</span>`;
}

// El título pequeño de la barra aparece cuando el título grande sale de la vista.
let heroObserver = null;
function observeHero() {
  if (heroObserver) heroObserver.disconnect();
  const title = main.querySelector('[data-hero] .hero-title');
  topbar.classList.toggle('show-title', !title);
  if (!title || !('IntersectionObserver' in window)) return;
  heroObserver = new IntersectionObserver(([entry]) => {
    topbar.classList.toggle('show-title', !entry.isIntersecting);
  }, { rootMargin: '-56px 0px 0px 0px' });
  heroObserver.observe(title);
}

function errorView(err) {
  return {
    title: 'Algo falló',
    back: { to: '/viajes', label: 'Viajes' },
    tab: 'viajes',
    html: `<div class="empty"><h2>No se pudo abrir esta pantalla</h2>
      <p>${esc(err && err.message ? err.message : String(err))}</p>
      <a class="btn btn-primary" href="#/viajes">Ir a Viajes</a></div>`,
  };
}

function rememberRoute(full) {
  try { localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ r: full, at: Date.now() })); } catch { /* sin espacio */ }
}

/** Al abrir la app desde el ícono, regresa a la última pantalla (si fue hace poco). */
function restoreLastRoute() {
  if (location.hash && location.hash !== '#' && location.hash !== '#/') return;
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_ROUTE_KEY) || 'null');
    if (saved && saved.r && Date.now() - saved.at < 12 * 3600000 && match(saved.r.split('?')[0])) {
      history.replaceState(null, '', `#${saved.r}`);
    }
  } catch { /* nada */ }
}

let renderSeq = 0;
let viewCtl = null;

async function render({ preserveScroll = false } = {}) {
  const mySeq = ++renderSeq;
  const { path, query, full } = parseHash();
  const m = match(path);
  if (!m) {
    navigate('/viajes', { replace: true });
    return;
  }
  if (viewCtl) viewCtl.abort();
  viewCtl = new AbortController();
  const signal = viewCtl.signal;
  let v;
  try {
    v = await m.handler({ params: m.params, query, signal, path });
  } catch (err) {
    console.error(err);
    v = errorView(err);
  }
  if (mySeq !== renderSeq) return; // otra navegación ganó
  const y = preserveScroll ? window.scrollY : 0;
  main.innerHTML = v.html || '';
  renderTopbar(v);
  setTabbar(v);
  setFab(v.fab);
  observeHero();
  document.title = v.title ? `${v.title} | Encargos` : 'Encargos';
  try {
    if (v.mount) v.mount(main, { signal });
  } catch (err) {
    console.error(err);
    toast('Algo falló al mostrar esta pantalla.', { type: 'error' });
  }
  window.scrollTo(0, y);
  rememberRoute(full);
}

onRender(render);
window.addEventListener('hashchange', () => render());

// ---------- Funcionamiento sin internet y actualizaciones ----------

function showUpdateBar(reg) {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>Hay una versión nueva de la app.</span>
    <button type="button" class="btn btn-sm btn-primary">Actualizar</button>`;
  const btn = bar.querySelector('button');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Actualizando…';
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    else location.reload();
  });
  document.body.appendChild(bar);
}

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // la primera instalación no necesita recargar
    reloading = true;
    location.reload();
  });
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    const offerIfWaiting = () => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg);
    };
    offerIfWaiting();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed') offerIfWaiting(); });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch (err) {
    console.warn('No se pudo activar el modo sin internet', err);
  }
}

// ---------- Arranque ----------

async function start() {
  try {
    await openDB();
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="empty"><h2>No se pudo abrir la base de datos</h2>
      <p>Si estás en una ventana privada de Safari, abre la app en una ventana normal o desde su ícono.</p>
      <p class="help">${esc(err && err.message ? err.message : String(err))}</p></div>`;
    return;
  }
  restoreLastRoute();
  await render();
  setupServiceWorker();
  // Limpieza diaria de fotos que quedaron sin usar.
  setTimeout(() => {
    try {
      const last = Number(localStorage.getItem('encargos:limpieza') || 0);
      if (Date.now() - last > 86400000) {
        cleanupOrphanPhotos(draftPhotoIds())
          .then(() => localStorage.setItem('encargos:limpieza', String(Date.now())))
          .catch(() => {});
      }
    } catch { /* nada */ }
  }, 5000);
}

start();
