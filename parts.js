// parts.js
// Fragmentos visuales que se repiten en varias pantallas.

import { esc, icons } from './ui.js';
import { STATUS, fmtMXN } from './calc.js';

export function statusChip(status) {
  return `<span class="chip st-${esc(status)}">${esc(STATUS[status] || status)}</span>`;
}

/** Indicador de saldo de un cliente: debe, pagado o saldo a favor. */
export function balanceBadge(t) {
  if (t.lines === 0 && !t.paidMXN) {
    return t.pendingLines
      ? `<span class="badge is-muted">${t.pendingLines} por comprar</span>`
      : '<span class="badge is-muted">Sin compras</span>';
  }
  if (t.balanceMXN > 0) return `<span class="badge is-due">Debe ${fmtMXN(t.balanceMXN)}</span>`;
  if (t.balanceMXN < 0) return `<span class="badge is-credit">A favor ${fmtMXN(-t.balanceMXN)}</span>`;
  return `<span class="badge is-paid">${icons.check}Pagado</span>`;
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

/** Encabezado grande sobre la banda oscura. */
export function hero({ title, sub = '', below = '' }) {
  return `
    <section class="hero" data-hero>
      <div class="hero-inner">
        <h1 class="hero-title">${esc(title)}</h1>
        ${sub ? `<p class="hero-sub">${sub}</p>` : ''}
        ${below}
      </div>
    </section>`;
}

/**
 * Ticket estilo recibo de tienda.
 * lines: [{ name, sub, amount, muted }]  totals: [{ label, value, strong }]
 */
export function ticket({ kicker = '', title, meta = '', lines = [], empty = '', totals = [], note = '' }) {
  return `
    <article class="ticket">
      <header class="ticket-head">
        ${kicker ? `<p class="ticket-kicker">${esc(kicker)}</p>` : ''}
        <h2 class="ticket-title">${esc(title)}</h2>
        ${meta ? `<p class="ticket-meta">${esc(meta)}</p>` : ''}
      </header>
      ${lines.length ? `<ul class="ticket-lines">
        ${lines.map((l) => `
          <li class="tl${l.muted ? ' is-muted' : ''}">
            <span class="tl-name">${esc(l.name)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</span>
            <span class="tl-dots" aria-hidden="true"></span>
            <span class="tl-amt">${esc(l.amount)}</span>
          </li>`).join('')}
      </ul>` : `<p class="ticket-empty">${esc(empty)}</p>`}
      ${totals.length ? `<dl class="ticket-totals">
        ${totals.map((t) => `<div class="tt${t.strong ? ' is-strong' : ''}"><dt>${esc(t.label)}</dt><dd>${esc(t.value)}</dd></div>`).join('')}
      </dl>` : ''}
      ${note ? `<p class="ticket-note">${esc(note)}</p>` : ''}
    </article>`;
}

export function emptyState({ icon = 'bag', title, text, action = '' }) {
  return `
    <div class="empty">
      <span class="empty-icon">${icons[icon] || ''}</span>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      ${action}
    </div>`;
}

export function groupBy(list, key) {
  const m = new Map();
  for (const x of list) {
    const k = typeof key === 'function' ? key(x) : x[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}
