// view-settings.js
// Ajustes: datos del negocio, valores por defecto, respaldo y restauración,
// almacenamiento, versión de la app y borrar todo.

import { getSettings, saveSettings, clearAll, getAll } from './db.js';
import { parseNum, fmtDateTime, daysSince, plural, fmtSize, inputNum } from './calc.js';
import { esc, icons, toast, openSheet, confirmDialog } from './ui.js';
import { refresh, navigate } from './router.js';
import { hero, isIOS, isStandalone } from './parts.js';
import { createBackupFile, readBackupFile, restoreBackup } from './backup.js';
import { deliverFile } from './share.js';

/** Versión de la app que está corriendo (la informa sw.js). */
export function getAppVersion() {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!sw) { resolve(null); return; }
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data && e.data.version); };
    sw.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
  });
}

export async function settingsView({ signal }) {
  const [s, version, items] = await Promise.all([getSettings(), getAppVersion(), getAll('items')]);
  let usage = '';
  let persisted = null;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usage = fmtSize(est.usage || 0);
    }
    if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted();
  } catch { /* opcional */ }
  const days = daysSince(s.lastBackupAt);

  const field = (key, label, value, { type = 'text', help = '', prefix = '', suffix = '', placeholder = '' } = {}) => `
    <div class="field">
      <label class="field-label" for="s-${key}">${esc(label)}</label>
      ${prefix || suffix
        ? `<div class="affix">${prefix ? `<span class="affix-pre">${esc(prefix)}</span>` : ''}<input id="s-${key}" data-setting="${key}" data-type="${type}" type="text" ${type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(value)}" placeholder="${esc(placeholder)}">${suffix ? `<span class="affix-suf">${esc(suffix)}</span>` : ''}</div>`
        : `<input id="s-${key}" data-setting="${key}" data-type="${type}" type="text" ${type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(value)}" placeholder="${esc(placeholder)}">`}
      ${help ? `<p class="help">${esc(help)}</p>` : ''}
    </div>`;

  const html = `
    ${hero({ title: 'Ajustes', sub: version ? `Versión ${esc(version)}` : 'Encargos' })}

    <h3 class="group-title">Tu negocio</h3>
    <div class="group">
      ${field('businessName', 'Nombre del negocio', s.businessName, { placeholder: 'Ej. Compras de Lupita', help: 'Aparece en los mensajes de WhatsApp y en los Excel.' })}
      ${field('closingMessage', 'Despedida en WhatsApp', s.closingMessage, { placeholder: '¡Gracias por tu preferencia!' })}
    </div>

    <h3 class="group-title">Para viajes nuevos</h3>
    <div class="group">
      ${field('defaultExchangeRate', 'Tipo de cambio inicial', inputNum(s.defaultExchangeRate), { type: 'number', prefix: '$', suffix: 'por dólar', placeholder: 'El del último viaje', help: 'Si lo dejas vacío se usa el del último viaje.' })}
      ${field('defaultTaxRate', 'Impuesto de compra', inputNum(s.defaultTaxRate), { type: 'number', suffix: '%', placeholder: '0' })}
      ${field('defaultMarginRate', 'Ganancia sugerida', inputNum(s.defaultMarginRate), { type: 'number', suffix: '%', placeholder: '30' })}
      <div class="field">
        <span class="field-label" id="round-l">Redondear precio sugerido a</span>
        <div class="seg" role="radiogroup" aria-labelledby="round-l">
          ${[1, 5, 10, 50, 100].map((n) => `
            <input type="radio" id="round-${n}" name="roundTo" value="${n}"${Number(s.roundTo) === n ? ' checked' : ''}>
            <label for="round-${n}">$${n}</label>`).join('')}
        </div>
      </div>
    </div>

    <h3 class="group-title">Respaldo</h3>
    <div class="group">
      <div class="row">
        <span class="row-icon">${icons.shield}</span>
        <span class="row-main">
          <span class="row-title wrap">${s.lastBackupAt ? `Último respaldo: hace ${days === 0 ? 'menos de un día' : plural(days, 'día', 'días')}` : 'Aún no hay respaldos'}</span>
          <span class="row-sub">${s.lastBackupAt ? esc(fmtDateTime(s.lastBackupAt)) : 'Los datos viven solo en este iPhone. Respalda después de cada viaje.'}</span>
        </span>
      </div>
      <div class="field field-switch">
        <label class="switch-row" for="bk-photos"><span>Incluir fotos en el respaldo</span>
          <input type="checkbox" class="switch" id="bk-photos" checked></label>
        <p class="help">Con fotos el archivo pesa más, pero queda completo.</p>
      </div>
      <div class="pad stack">
        <button type="button" class="btn btn-primary btn-block" data-action="backup">${icons.download}<span>Crear respaldo</span></button>
        <label class="btn btn-quiet btn-block">${icons.upload}<span>Restaurar desde un respaldo</span>
          <input type="file" accept=".json,application/json" class="file-input" data-restore></label>
      </div>
    </div>

    <h3 class="group-title">Este iPhone</h3>
    <div class="group">
      <div class="row">
        <span class="row-icon">${icons.home}</span>
        <span class="row-main">
          <span class="row-title wrap">${isStandalone() ? 'App instalada en la pantalla de inicio' : 'Abierta en el navegador'}</span>
          <span class="row-sub">${isStandalone() ? 'Así es como debe usarse.' : 'Instálala para usarla como app y sin internet.'}</span>
        </span>
        ${isStandalone() ? '' : '<button type="button" class="btn btn-sm btn-quiet" data-action="install-help">Cómo</button>'}
      </div>
      <div class="row">
        <span class="row-icon">${icons.shield}</span>
        <span class="row-main">
          <span class="row-title wrap">Protección de datos: ${persisted === true ? 'activa' : persisted === false ? 'no activa' : 'no disponible'}</span>
          <span class="row-sub">${persisted === true ? 'El sistema no borrará los datos por falta de espacio.' : 'Actívala para pedirle al sistema que no borre los datos.'}${usage ? ` Espacio usado: ${esc(usage)}.` : ''}</span>
        </span>
        ${persisted === false ? '<button type="button" class="btn btn-sm btn-quiet" data-action="persist">Activar</button>' : ''}
      </div>
      <div class="row">
        <span class="row-icon">${icons.refresh}</span>
        <span class="row-main">
          <span class="row-title">Versión ${esc(version || 'sin instalar')}</span>
          <span class="row-sub">Las mejoras se descargan solas cuando hay internet.</span>
        </span>
        <button type="button" class="btn btn-sm btn-quiet" data-action="update">Buscar</button>
      </div>
    </div>

    <h3 class="group-title">Zona de cuidado</h3>
    <div class="pad stack">
      <button type="button" class="btn btn-danger btn-block" data-action="wipe">${icons.trash}<span>Borrar todos los datos</span></button>
      <p class="help">${items.length ? `Tienes ${plural(items.length, 'artículo', 'artículos')} guardados. ` : ''}Crea un respaldo antes de borrar.</p>
      <p class="help center"><a href="LICENCIAS.txt" target="_blank" rel="noopener">Licencias de software de terceros</a></p>
    </div>`;

  return {
    title: 'Ajustes',
    tab: 'ajustes',
    html,
    mount(root) {
      // Guardado automático de cada ajuste al salir del campo.
      root.querySelectorAll('[data-setting]').forEach((input) => {
        input.addEventListener('change', async () => {
          const key = input.dataset.setting;
          let value = input.value.trim();
          if (input.dataset.type === 'number') {
            const n = parseNum(value);
            if (value && (n === null || n < 0)) {
              toast('Escribe solo números.', { type: 'error' });
              return;
            }
            value = value === '' ? (key === 'defaultExchangeRate' ? null : 0) : n;
          }
          await saveSettings({ [key]: value });
          toast('Ajuste guardado');
        }, { signal });
      });
      root.querySelectorAll('input[name="roundTo"]').forEach((r) => r.addEventListener('change', async () => {
        await saveSettings({ roundTo: Number(r.value) });
        toast('Ajuste guardado');
      }, { signal }));

      root.querySelector('[data-restore]').addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (file) await restoreFlow(file);
      }, { signal });

      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        const a = b.dataset.action;
        if (a === 'backup') startBackup({ includePhotos: root.querySelector('#bk-photos').checked });
        if (a === 'install-help') showInstallHelp();
        if (a === 'persist') {
          const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
          toast(ok ? 'Protección activada' : 'El sistema no la concedió. Instala la app en la pantalla de inicio y vuelve a intentarlo.', { type: ok ? 'info' : 'error', ms: 4000 });
          refresh();
        }
        if (a === 'update') checkForUpdate();
        if (a === 'wipe') wipeFlow();
      }, { signal });
    },
  };
}

/** Crea el respaldo y lo ofrece para compartir/guardar. */
export async function startBackup({ includePhotos = true } = {}) {
  try {
    toast('Preparando el respaldo…', { ms: 1500 });
    const { file, photos, items } = await createBackupFile({ includePhotos });
    await deliverFile(file, {
      title: 'Respaldo listo',
      note: `${plural(items, 'artículo', 'artículos')}${includePhotos ? ` y ${plural(photos, 'foto', 'fotos')}` : ''}. Guárdalo en Archivos (iCloud Drive) o mándatelo por WhatsApp.`,
      onDelivered: async () => {
        await saveSettings({ lastBackupAt: new Date().toISOString() });
        refresh();
      },
    });
  } catch (err) {
    console.error(err);
    toast(err.message || 'No se pudo crear el respaldo.', { type: 'error' });
  }
}

async function restoreFlow(file) {
  try {
    const { data, summary } = await readBackupFile(file);
    const ok = await confirmDialog({
      title: '¿Restaurar este respaldo?',
      message: `Del ${fmtDateTime(summary.exportedAt) || 'respaldo'}: ${plural(summary.trips, 'viaje', 'viajes')}, ${plural(summary.clients, 'cliente', 'clientes')}, ${plural(summary.items, 'artículo', 'artículos')} y ${plural(summary.photos, 'foto', 'fotos')}. Reemplazará TODO lo que hay ahora en la app.`,
      confirmText: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    await restoreBackup(data);
    toast('Respaldo restaurado');
    navigate('/viajes');
  } catch (err) {
    toast(err.message || 'No se pudo restaurar.', { type: 'error', ms: 5000 });
  }
}

async function wipeFlow() {
  const ok = await confirmDialog({
    title: '¿Borrar todos los datos?',
    message: 'Se eliminarán viajes, clientes, artículos, fotos y pagos de este iPhone. No se puede deshacer.',
    confirmText: 'Continuar',
    danger: true,
  });
  if (!ok) return;
  const word = await openSheet({
    title: 'Confirmar borrado',
    html: `<form class="sheet-form" data-wipe>
      <p class="sheet-message">Escribe <strong>BORRAR</strong> para confirmar.</p>
      <div class="group"><div class="field"><input type="text" autocapitalize="characters" aria-label="Escribe BORRAR" data-word></div></div>
      <div class="form-actions"><button type="submit" class="btn btn-danger btn-block">Borrar todo</button></div>
    </form>`,
    onMount(sheet, close) {
      sheet.querySelector('[data-wipe]').addEventListener('submit', (e) => {
        e.preventDefault();
        close(sheet.querySelector('[data-word]').value.trim().toUpperCase());
      });
    },
  });
  if (word !== 'BORRAR') {
    if (word !== null) toast('No se borró nada: la palabra no coincide.', { type: 'error' });
    return;
  }
  await clearAll();
  toast('Se borraron todos los datos');
  navigate('/viajes');
}

export async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) {
    toast('Este navegador no permite actualizar la app sin conexión.', { type: 'error' });
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { toast('La app todavía no está instalada para uso sin internet.'); return; }
    await reg.update();
    if (reg.waiting || reg.installing) toast('Hay una versión nueva: toca “Actualizar” en el aviso.');
    else toast('Ya tienes la versión más reciente.');
  } catch {
    toast('No se pudo buscar actualización. Revisa tu conexión.', { type: 'error' });
  }
}

/** Instrucciones para instalar la app en el iPhone. */
export function showInstallHelp() {
  const ios = isIOS();
  return openSheet({
    title: 'Instalar en el iPhone',
    cancelText: 'Cerrar',
    html: `
      <ol class="steps">
        <li><strong>Abre esta página en Safari</strong> (no en Chrome ni dentro de WhatsApp).</li>
        <li>Toca el botón <strong>Compartir</strong> ${icons.share} (en la barra de abajo o junto a la dirección; si no lo ves, toca primero el botón “…”).</li>
        <li>Desliza y toca <strong>Agregar a pantalla de inicio</strong>. Si aparece la opción <strong>Abrir como app web</strong>, déjala activada.</li>
        <li>Toca <strong>Agregar</strong>. Aparecerá el ícono de Encargos.</li>
        <li>Abre la app <strong>desde ese ícono</strong> y úsala siempre así. Lo que captures en Safari no pasa a la app instalada.</li>
      </ol>
      ${ios ? '' : '<p class="sheet-message">En Android usa Chrome: menú ⋮ › “Instalar app” o “Agregar a pantalla principal”.</p>'}`,
  });
}
