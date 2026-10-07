// scanner.js
// Lector de códigos de barras con la cámara del iPhone.
// Usa ZXing (vendor-barcode.js + zxing_reader.wasm), que funciona sin internet.

import { icons, loadScript, esc } from './ui.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'];
const RETAIL = new Set(['ean_13', 'ean_8', 'upc_a', 'upc_e']); // traen dígito verificador

let detectorPromise = null;

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await loadScript('vendor-barcode.js');
      const api = window.BarcodeDetectionAPI;
      if (!api) throw new Error('No se cargó el lector de códigos.');
      const wasmURL = new URL('zxing_reader.wasm', document.baseURI).href;
      await api.prepareZXingModule({
        overrides: {
          locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmURL : prefix + path),
        },
        fireImmediately: true,
      });
      return new api.BarcodeDetector({ formats: FORMATS });
    })().catch((err) => {
      detectorPromise = null;
      throw err;
    });
  }
  return detectorPromise;
}

/** Carga el lector en segundo plano para que el primer escaneo sea rápido. */
export function preloadScanner() {
  getDetector().catch(() => { /* se reintentará al escanear */ });
}

let audioCtx = null;
function unlockAudio() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    audioCtx = audioCtx || new C();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* sin sonido */ }
}
function beep() {
  try {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 1760;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.14);
  } catch { /* sin sonido */ }
}

function cameraErrorMessage(err) {
  if (!window.isSecureContext) return 'La cámara solo funciona cuando la app se abre desde una dirección segura (https://).';
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'La app no tiene permiso para usar la cámara. En el iPhone ve a Ajustes › Apps › Safari › Cámara, elige “Preguntar” o “Permitir” y vuelve a intentarlo.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No se encontró una cámara disponible en este dispositivo.';
    case 'NotReadableError':
    case 'AbortError':
      return 'La cámara está ocupada por otra app. Ciérrala y vuelve a intentarlo.';
    case 'NotSupportedError':
      return 'Este navegador no permite usar la cámara. Abre la app en Safari.';
    default:
      return err?.message || 'No se pudo abrir la cámara.';
  }
}

/**
 * Abre la cámara y espera un código.
 * Devuelve { code, format } si leyó uno, { manual: true } si la persona prefiere
 * escribirlo, o null si canceló.
 */
export function scanBarcode() {
  unlockAudio(); // debe ocurrir dentro del toque para que iOS permita el sonido
  return new Promise((resolve) => {
    const root = document.getElementById('overlay-root');
    const wrap = document.createElement('div');
    wrap.className = 'scanner';
    wrap.innerHTML = `
      <video playsinline muted autoplay></video>
      <div class="scan-window"><span class="scan-line"></span></div>
      <div class="scan-top">
        <button type="button" class="scan-btn" data-a="close">${icons.close}<span>Cancelar</span></button>
        <button type="button" class="scan-btn" data-a="torch" hidden>${icons.flash}<span>Linterna</span></button>
      </div>
      <p class="scan-hint" role="status">Preparando la cámara…</p>
      <div class="scan-bottom">
        <button type="button" class="scan-btn" data-a="manual">${icons.keyboard}<span>Escribir el código</span></button>
      </div>`;
    root.appendChild(wrap);
    document.body.classList.add('has-sheet');

    const video = wrap.querySelector('video');
    const hint = wrap.querySelector('.scan-hint');
    const torchBtn = wrap.querySelector('[data-a="torch"]');
    let stream = null;
    let track = null;
    let timer = null;
    let stopped = false;
    let torchOn = false;

    const finish = (value) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHidden);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      wrap.remove();
      if (!root.querySelector('.sheet-wrap, .dialog-wrap, .viewer, .scanner')) document.body.classList.remove('has-sheet');
      resolve(value);
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') finish(null); };
    document.addEventListener('visibilitychange', onHidden);

    const showError = (msg) => {
      wrap.classList.add('has-error');
      hint.innerHTML = `<strong>No se pudo escanear.</strong><br>${esc(msg)}`;
    };

    wrap.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'close') finish(null);
      if (b.dataset.a === 'manual') finish({ manual: true });
      if (b.dataset.a === 'torch' && track) {
        torchOn = !torchOn;
        try {
          await track.applyConstraints({ advanced: [{ torch: torchOn }] });
          torchBtn.classList.toggle('is-on', torchOn);
        } catch { torchBtn.hidden = true; }
      }
    });

    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw Object.assign(new Error('Sin cámara'), { name: 'NotSupportedError' });
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        track = stream.getVideoTracks()[0];
        video.srcObject = stream;
        await video.play().catch(() => {});
        try {
          const caps = track.getCapabilities ? track.getCapabilities() : {};
          if (caps && caps.torch) torchBtn.hidden = false;
        } catch { /* sin linterna */ }
      } catch (err) {
        showError(cameraErrorMessage(err));
        return;
      }

      let detector;
      try {
        hint.textContent = 'Cargando el lector de códigos…';
        detector = await getDetector();
      } catch {
        showError('No se pudo preparar el lector de códigos. Abre la app una vez con internet para que quede guardado en el iPhone.');
        return;
      }
      if (stopped) return;
      hint.textContent = 'Apunta al código de barras dentro del recuadro';

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let last = '';
      let repeats = 0;

      const tick = async () => {
        if (stopped) return;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh && video.readyState >= 2) {
          // Analiza la franja central del video (donde está el recuadro).
          const cw = Math.round(vw * 0.92);
          const ch = Math.round(vh * (vw < vh ? 0.45 : 0.7));
          const scale = Math.min(1, 1280 / cw);
          canvas.width = Math.round(cw * scale);
          canvas.height = Math.round(ch * scale);
          ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
          try {
            const found = await detector.detect(canvas);
            const hit = found && found.find((f) => f.rawValue && String(f.rawValue).trim());
            if (hit) {
              const value = String(hit.rawValue).trim();
              repeats = value === last ? repeats + 1 : 1;
              last = value;
              // Los códigos de tienda (EAN/UPC) se aceptan a la primera;
              // los demás se confirman con una segunda lectura igual.
              if (RETAIL.has(hit.format) || repeats >= 2) {
                wrap.classList.add('is-hit');
                beep();
                if (navigator.vibrate) navigator.vibrate(40);
                setTimeout(() => finish({ code: value, format: hit.format }), 180);
                return;
              }
            }
          } catch (err) {
            console.warn('Error al leer el código', err);
          }
        }
        timer = setTimeout(tick, 110);
      };
      tick();
    })();
  });
}
