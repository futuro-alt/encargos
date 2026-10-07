// ui.js
// Piezas de interfaz reutilizables: íconos, avisos, hojas (ventanas que suben
// desde abajo), diálogos de confirmación y formularios.

/** Escapa texto para insertarlo en HTML de forma segura. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

export const icons = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chevron: svg('<path d="M9 5l7 7-7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  barcode: svg('<path d="M3 7V5a1 1 0 0 1 1-1h2M18 4h2a1 1 0 0 1 1 1v2M21 17v2a1 1 0 0 1-1 1h-2M6 20H4a1 1 0 0 1-1-1v-2"/><path d="M7 8v8M10 8v8M12.5 8v8M15.5 8v8M17.5 8v8"/>'),
  camera: svg('<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v10.5H4z"/><circle cx="12" cy="13.5" r="3.4"/>'),
  photo: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M21 16l-5-5-8.5 8"/>'),
  trash: svg('<path d="M4 7h16M10 7V4.5h4V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  share: svg('<path d="M12 15V3.5M8 7.5l4-4 4 4"/><path d="M7 10.5H5.5v10h13v-10H17"/>'),
  chat: svg('<path d="M4.5 19.5l1.2-3.6A7.8 7.8 0 1 1 8.3 18.4z"/><path d="M9 10.5h6M9 13.5h4"/>'),
  table: svg('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4v16"/>'),
  user: svg('<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.6-3.7 3.7-5.6 7.5-5.6s6.9 1.9 7.5 5.6"/>'),
  users: svg('<circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 19.5c.5-3.2 3-5 6.2-5s5.7 1.8 6.2 5"/><path d="M15.5 5.3a3.4 3.4 0 0 1 0 6.4M17.5 14.7c2 .6 3.3 2.2 3.7 4.8"/>'),
  bag: svg('<path d="M5 8h14l-1.1 12.2a1 1 0 0 1-1 .8H7.1a1 1 0 0 1-1-.8z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>'),
  sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  flash: svg('<path d="M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12z"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>'),
  money: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>'),
  download: svg('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>'),
  upload: svg('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  phone: svg('<path d="M6.5 3.5h3l1.5 4.5-2 1.3a10.5 10.5 0 0 0 5.7 5.7l1.3-2 4.5 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>'),
  refresh: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/>'),
  keyboard: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>'),
  globe: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z"/>'),
  tag: svg('<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.5"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.01"/>'),
  shield: svg('<path d="M12 3.5l7 3v5.3c0 4.3-2.9 7.7-7 8.7-4.1-1-7-4.4-7-8.7V6.5z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
  home: svg('<path d="M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>'),
};

// ---------- Avisos breves (toasts) ----------

/** Quita los avisos visibles (por ejemplo, al abrir una hoja). */
export function clearToasts() {
  document.getElementById('toast-root')?.replaceChildren();
}

export function toast(message, { type = 'info', ms = 2600 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  clearToasts(); // solo un aviso a la vez
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' is-error' : ''}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

// ---------- Hojas (bottom sheets) ----------

let openSheets = 0;

/**
 * Abre una hoja que sube desde abajo.
 * onMount(sheetElement, close) permite conectar eventos. close(valor) la cierra.
 * Devuelve una promesa con el valor con el que se cerró (null si se canceló).
 */
export function openSheet({ title, html, onMount, cancelText = 'Cancelar', className = '' }) {
  return new Promise((resolve) => {
    const root = document.getElementById('overlay-root');
    const wrap = document.createElement('div');
    wrap.className = `sheet-wrap ${className}`;
    wrap.innerHTML = `
      <div class="sheet-backdrop" data-sheet-close></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-grabber" aria-hidden="true"></div>
        <header class="sheet-head">
          <button type="button" class="link-btn" data-sheet-close>${esc(cancelText)}</button>
          <h2>${esc(title)}</h2>
          <span></span>
        </header>
        <div class="sheet-body">${html}</div>
      </section>`;
    root.appendChild(wrap);
    openSheets += 1;
    document.body.classList.add('has-sheet');
    clearToasts();
    const previousFocus = document.activeElement;

    let done = false;
    const close = (value = null) => {
      if (done) return;
      done = true;
      wrap.classList.remove('open');
      wrap.classList.add('closing');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        wrap.remove();
        openSheets = Math.max(0, openSheets - 1);
        if (!openSheets) document.body.classList.remove('has-sheet');
        if (previousFocus && previousFocus.focus) {
          try { previousFocus.focus({ preventScroll: true }); } catch { /* sin foco previo */ }
        }
      }, 200);
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-sheet-close]')) close(null);
    });
    requestAnimationFrame(() => wrap.classList.add('open'));
    const sheet = wrap.querySelector('.sheet');
    if (onMount) onMount(sheet, close);
  });
}

/** Diálogo para confirmar. Devuelve true o false. */
export function confirmDialog({ title, message = '', confirmText = 'Aceptar', cancelText = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('overlay-root');
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `
      <div class="dialog-backdrop"></div>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">${esc(title)}</h2>
        ${message ? `<p>${esc(message)}</p>` : ''}
        <div class="dialog-actions">
          <button type="button" class="btn btn-quiet" data-v="0">${esc(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-v="1">${esc(confirmText)}</button>
        </div>
      </div>`;
    root.appendChild(wrap);
    document.body.classList.add('has-sheet');
    requestAnimationFrame(() => wrap.classList.add('open'));
    const finish = (v) => {
      wrap.remove();
      if (!root.querySelector('.sheet-wrap, .dialog-wrap')) document.body.classList.remove('has-sheet');
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) finish(b.dataset.v === '1');
    });
    wrap.querySelector('[data-v="1"]').focus();
  });
}

/**
 * Menú de opciones. actions: [{ label, value, icon, danger }].
 * Devuelve el value elegido o null.
 */
export function actionSheet({ title, message = '', actions }) {
  const html = `
    ${message ? `<p class="sheet-message">${esc(message)}</p>` : ''}
    <div class="action-list">
      ${actions.map((a, i) => `
        <button type="button" class="action-item${a.danger ? ' is-danger' : ''}" data-i="${i}">
          ${a.icon ? icons[a.icon] || '' : ''}<span>${esc(a.label)}</span>
        </button>`).join('')}
    </div>`;
  return openSheet({
    title,
    html,
    onMount(sheet, close) {
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) close(actions[Number(b.dataset.i)].value);
      });
    },
  });
}

// ---------- Formularios en hoja ----------

function fieldHtml(f, idPrefix) {
  const id = `${idPrefix}-${f.name}`;
  const value = f.value ?? '';
  const help = f.help ? `<p class="help">${esc(f.help)}</p>` : '';
  const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  const label = `<label class="field-label" for="${id}">${esc(f.label)}${req}</label>`;
  const common = `id="${id}" name="${esc(f.name)}"${f.required ? ' aria-required="true"' : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}`;
  switch (f.type) {
    case 'textarea':
      return `<div class="field" data-field="${esc(f.name)}">${label}<textarea ${common} rows="${f.rows || 2}">${esc(value)}</textarea>${help}<p class="field-error" hidden></p></div>`;
    case 'segmented':
      return `<div class="field" data-field="${esc(f.name)}"><span class="field-label" id="${id}-l">${esc(f.label)}</span>
        <div class="seg${f.options.length > 3 ? ' seg-grid' : ''}" role="radiogroup" aria-labelledby="${id}-l">
          ${f.options.map((o, i) => `
            <input type="radio" id="${id}-${i}" name="${esc(f.name)}" value="${esc(o.value)}"${String(o.value) === String(value) ? ' checked' : ''}>
            <label for="${id}-${i}"${o.className ? ` class="${o.className}"` : ''}>${esc(o.label)}</label>`).join('')}
        </div>${help}</div>`;
    case 'switch':
      return `<div class="field field-switch" data-field="${esc(f.name)}">
        <label class="switch-row" for="${id}"><span>${esc(f.label)}</span>
          <input type="checkbox" class="switch" id="${id}" name="${esc(f.name)}"${value ? ' checked' : ''}></label>${help}</div>`;
    case 'date':
      return `<div class="field" data-field="${esc(f.name)}">${label}<input type="date" ${common} value="${esc(value)}">${help}<p class="field-error" hidden></p></div>`;
    case 'decimal':
    case 'money-usd':
    case 'money-mxn': {
      const prefix = f.type === 'money-usd' ? 'US$' : f.type === 'money-mxn' ? '$' : (f.prefix || '');
      const input = `<input type="text" inputmode="decimal" autocomplete="off" ${common} value="${esc(value)}">`;
      return `<div class="field" data-field="${esc(f.name)}">${label}${prefix || f.suffix
        ? `<div class="affix">${prefix ? `<span class="affix-pre">${esc(prefix)}</span>` : ''}${input}${f.suffix ? `<span class="affix-suf">${esc(f.suffix)}</span>` : ''}</div>`
        : input}${help}<p class="field-error" hidden></p></div>`;
    }
    case 'tel':
      return `<div class="field" data-field="${esc(f.name)}">${label}<input type="tel" inputmode="tel" autocomplete="tel" ${common} value="${esc(value)}">${help}<p class="field-error" hidden></p></div>`;
    default:
      return `<div class="field" data-field="${esc(f.name)}">${label}<input type="text" autocomplete="${f.autocomplete || 'off'}" autocapitalize="${f.autocapitalize || 'sentences'}" ${common} value="${esc(value)}">${help}<p class="field-error" hidden></p></div>`;
  }
}

/**
 * Formulario dentro de una hoja.
 *  fields: [{ name, label, type, value, required, placeholder, help, options }]
 *  validate(values) → { campo: 'mensaje' } o null
 *  dangerText: si se indica, agrega un botón rojo que devuelve { action: 'danger' }
 * Devuelve los valores, { action: 'danger' } o null si se canceló.
 */
export function formSheet({ title, fields, submitText = 'Guardar', validate, dangerText, intro = '' }) {
  const idPrefix = 'f' + Math.random().toString(36).slice(2, 7);
  const html = `
    <form class="sheet-form" novalidate>
      ${intro ? `<p class="sheet-message">${esc(intro)}</p>` : ''}
      <div class="group">${fields.map((f) => fieldHtml(f, idPrefix)).join('')}</div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-block">${esc(submitText)}</button>
        ${dangerText ? `<button type="button" class="btn btn-danger-text btn-block" data-danger>${esc(dangerText)}</button>` : ''}
      </div>
    </form>`;
  return openSheet({
    title,
    html,
    onMount(sheet, close) {
      const form = sheet.querySelector('form');
      const collect = () => {
        const out = {};
        for (const f of fields) {
          if (f.type === 'switch') out[f.name] = form.elements[f.name].checked;
          else if (f.type === 'segmented') out[f.name] = (form.querySelector(`input[name="${f.name}"]:checked`) || {}).value ?? '';
          else out[f.name] = (form.elements[f.name]?.value ?? '').trim();
        }
        return out;
      };
      const showErrors = (errors) => {
        let first = null;
        for (const f of fields) {
          const box = form.querySelector(`[data-field="${f.name}"]`);
          const p = box?.querySelector('.field-error');
          const msg = errors?.[f.name];
          box?.classList.toggle('has-error', !!msg);
          if (p) { p.hidden = !msg; p.textContent = msg || ''; }
          if (msg && !first) first = form.elements[f.name];
        }
        if (first && first.focus) first.focus();
        return !!first;
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const values = collect();
        const errors = {};
        for (const f of fields) {
          if (f.required && !values[f.name]) errors[f.name] = 'Este dato es obligatorio.';
        }
        Object.assign(errors, (validate && validate(values)) || {});
        if (showErrors(errors)) return;
        close(values);
      });
      sheet.querySelector('[data-danger]')?.addEventListener('click', () => close({ action: 'danger' }));
    },
  });
}

/** Barra de búsqueda simple que filtra filas con data-search. */
export function bindSearch(input, rows, { onChange } = {}) {
  const run = () => {
    const q = input.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    let visible = 0;
    for (const r of rows) {
      const show = !q || (r.dataset.search || '').includes(q);
      r.hidden = !show;
      if (show) visible += 1;
    }
    if (onChange) onChange(visible, q);
  };
  input.addEventListener('input', run);
  run();
  return run;
}

/** Carga un archivo de script una sola vez (para las librerías grandes). */
const scriptPromises = new Map();
export function loadScript(src) {
  if (!scriptPromises.has(src)) {
    scriptPromises.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromises.delete(src);
        reject(new Error(`No se pudo cargar ${src}. Revisa tu conexión e inténtalo otra vez.`));
      };
      document.head.appendChild(s);
    }));
  }
  return scriptPromises.get(src);
}

/** Pantalla de "no encontrado" reutilizable para las vistas. */
export function notFoundView(message, backTo = '/viajes') {
  return {
    title: 'No encontrado',
    back: { to: backTo, label: 'Volver' },
    html: `<div class="empty"><h2>No está disponible</h2><p>${esc(message)}</p>
      <a class="btn btn-primary" href="#${esc(backTo)}">Volver</a></div>`,
  };
}
