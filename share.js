// share.js
// Compartir archivos (Excel y respaldos) y armar el mensaje de WhatsApp.

import { esc, icons, openSheet, toast } from './ui.js';
import { fmtMXN, fmtSize, firstName, sumTotals, itemCalc, waPhone, CHARGED, fmtDateRange } from './calc.js';

/** Descarga directa (respaldo cuando el iPhone no permite compartir). */
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Muestra el archivo ya preparado con botones para compartirlo o descargarlo.
 * (En iPhone, "Compartir" abre el menú para mandarlo por WhatsApp, correo,
 * AirDrop o "Guardar en Archivos".)
 */
export function deliverFile(file, { title = 'Archivo listo', note = '', onDelivered } = {}) {
  const canShare = !!(navigator.canShare && (() => {
    try { return navigator.canShare({ files: [file] }); } catch { return false; }
  })());
  const html = `
    <div class="file-ready">
      <span class="file-ready-icon">${file.name.endsWith('.json') ? icons.shield : icons.table}</span>
      <p class="file-ready-name">${esc(file.name)}</p>
      <p class="file-ready-size">${esc(fmtSize(file.size))}</p>
      ${note ? `<p class="file-ready-note">${esc(note)}</p>` : ''}
    </div>
    <div class="form-actions">
      ${canShare ? `<button type="button" class="btn btn-primary btn-block" data-act="share">${icons.share}<span>Compartir o guardar en Archivos</span></button>` : ''}
      <button type="button" class="btn ${canShare ? 'btn-quiet' : 'btn-primary'} btn-block" data-act="download">${icons.download}<span>Descargar</span></button>
    </div>`;
  return openSheet({
    title,
    html,
    cancelText: 'Cerrar',
    onMount(sheet, close) {
      sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'share') {
          try {
            await navigator.share({ files: [file], title: file.name });
            onDelivered && onDelivered('share');
            close('share');
          } catch (err) {
            if (err?.name !== 'AbortError') toast('No se pudo compartir. Usa “Descargar”.', { type: 'error' });
          }
        } else if (b.dataset.act === 'download') {
          downloadFile(file);
          onDelivered && onDelivered('download');
          close('download');
        }
      });
    },
  });
}

// ---------- WhatsApp ----------

/** Texto con la cuenta del cliente para mandarlo por WhatsApp. */
export function buildClientMessage({ trip, client, items, payments, settings }) {
  const t = sumTotals(items, payments, trip);
  const charged = items.filter((i) => CHARGED.has(i.status));
  const pending = items.filter((i) => i.status === 'pendiente');
  const missing = items.filter((i) => i.status === 'no_encontrado');
  const lines = [];
  lines.push(`Hola ${firstName(client.name) || ''},`.replace(' ,', ','));
  lines.push(`te comparto tu cuenta del viaje *${trip.name}*${trip.startDate ? ` (${fmtDateRange(trip.startDate, trip.endDate)})` : ''}:`);
  lines.push('');
  if (charged.length) {
    for (const it of charged) {
      const c = itemCalc(it, trip);
      lines.push(`• ${it.name}${it.variant ? ` (${it.variant})` : ''} x${c.qty}: ${fmtMXN(c.saleMXN)}`);
    }
    lines.push('');
    lines.push(`*Total: ${fmtMXN(t.saleMXN)}*`);
    if (t.paidMXN) lines.push(`Pagos y anticipos: −${fmtMXN(t.paidMXN)}`);
    if (t.balanceMXN > 0) lines.push(`*Saldo por pagar: ${fmtMXN(t.balanceMXN)}*`);
    else if (t.balanceMXN < 0) lines.push(`*Saldo a tu favor: ${fmtMXN(-t.balanceMXN)}*`);
    else lines.push('*Tu cuenta está liquidada. ¡Gracias!*');
  } else {
    lines.push('Todavía no hay artículos comprados en tu pedido.');
    if (t.paidMXN) lines.push(`Anticipo recibido: ${fmtMXN(t.paidMXN)}`);
  }
  if (pending.length) {
    lines.push('');
    lines.push('Por conseguir:');
    for (const it of pending) lines.push(`• ${it.name}${it.variant ? ` (${it.variant})` : ''}`);
  }
  if (missing.length) {
    lines.push('');
    lines.push('No se encontró:');
    for (const it of missing) lines.push(`• ${it.name}${it.variant ? ` (${it.variant})` : ''}`);
  }
  if (settings.closingMessage) {
    lines.push('');
    lines.push(settings.closingMessage);
  }
  if (settings.businessName) lines.push(settings.businessName);
  return lines.join('\n');
}

export function whatsappLink(phone, text) {
  const p = waPhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

/** Hoja para revisar/editar el mensaje y mandarlo. */
export function openWhatsAppSheet({ client, text }) {
  const phone = waPhone(client.phone);
  const html = `
    <div class="wa-sheet">
      <p class="sheet-message">${phone
        ? `Se abrirá el chat con ${esc(client.name)} (+${esc(phone)}). Puedes ajustar el texto antes de enviarlo.`
        : `${esc(client.name)} no tiene teléfono guardado: WhatsApp te pedirá elegir el chat.`}</p>
      <div class="group"><div class="field">
        <label class="field-label" for="wa-text">Mensaje</label>
        <textarea id="wa-text" rows="12">${esc(text)}</textarea>
      </div></div>
      <div class="form-actions">
        <a class="btn btn-primary btn-block" data-act="open" href="${esc(whatsappLink(client.phone, text))}" target="_blank" rel="noopener">${icons.chat}<span>Abrir WhatsApp</span></a>
        <div class="btn-pair">
          <button type="button" class="btn btn-quiet" data-act="copy">${icons.copy}<span>Copiar</span></button>
          <button type="button" class="btn btn-quiet" data-act="share">${icons.share}<span>Compartir</span></button>
        </div>
      </div>
    </div>`;
  return openSheet({
    title: 'Enviar por WhatsApp',
    html,
    onMount(sheet, close) {
      const ta = sheet.querySelector('#wa-text');
      const link = sheet.querySelector('[data-act="open"]');
      ta.addEventListener('input', () => { link.href = whatsappLink(client.phone, ta.value); });
      sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'open') {
          setTimeout(() => close('sent'), 300);
        } else if (b.dataset.act === 'copy') {
          try {
            await navigator.clipboard.writeText(ta.value);
            toast('Mensaje copiado');
          } catch {
            ta.select();
            toast('Selecciona el texto y cópialo manualmente.', { type: 'error' });
          }
        } else if (b.dataset.act === 'share') {
          if (navigator.share) {
            try { await navigator.share({ text: ta.value }); close('shared'); }
            catch (err) { if (err?.name !== 'AbortError') toast('No se pudo compartir.', { type: 'error' }); }
          } else {
            toast('Tu navegador no permite compartir; usa “Copiar”.', { type: 'error' });
          }
        }
      });
    },
  });
}
