// photos.js
// Reduce el tamaño de las fotos antes de guardarlas (para no llenar el iPhone)
// y las muestra en la app.

import { savePhoto, getPhoto } from './db.js';
import { esc, icons, toast } from './ui.js';

const FULL_MAX = 1280;  // lado mayor de la foto guardada, en pixeles
const THUMB_MAX = 240;  // lado mayor de la miniatura

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen. Prueba con otra foto.')); };
    img.src = url;
  });
}

function toJpeg(img, max, quality) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))), 'image/jpeg', quality);
  });
}

/** Procesa un archivo de imagen y lo guarda. Devuelve el id de la foto. */
export async function storePhotoFile(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('El archivo elegido no es una imagen.');
  const img = await loadImage(file);
  const [full, thumb] = await Promise.all([toJpeg(img, FULL_MAX, 0.72), toJpeg(img, THUMB_MAX, 0.7)]);
  const id = await savePhoto({
    type: 'image/jpeg',
    full: await full.arrayBuffer(),
    thumb: await thumb.arrayBuffer(),
  });
  urlCache.delete(id);
  return id;
}

// Direcciones temporales de las imágenes ya cargadas.
const urlCache = new Map();

export async function photoURL(id, size = 'thumb') {
  if (!id) return null;
  const key = `${id}:${size}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const rec = await getPhoto(id);
  if (!rec) return null;
  const data = size === 'full' ? rec.full : rec.thumb;
  const url = URL.createObjectURL(new Blob([data], { type: rec.type || 'image/jpeg' }));
  urlCache.set(key, url);
  return url;
}

export function forgetPhotoURL(id) {
  for (const size of ['thumb', 'full']) {
    const key = `${id}:${size}`;
    if (urlCache.has(key)) {
      URL.revokeObjectURL(urlCache.get(key));
      urlCache.delete(key);
    }
  }
}

/** Llena todas las <img data-photo="id"> que haya dentro de root. */
export function hydratePhotos(root) {
  root.querySelectorAll('img[data-photo]').forEach(async (img) => {
    try {
      const url = await photoURL(img.dataset.photo, img.dataset.size || 'thumb');
      if (url) {
        img.src = url;
        img.closest('.thumb')?.classList.add('has-photo');
      }
    } catch { /* si falla se queda el ícono */ }
  });
}

/** Miniatura cuadrada para listas. */
export function thumbHtml(photoId, label = '') {
  return `<span class="thumb">${icons.bag}${photoId ? `<img data-photo="${esc(photoId)}" alt="${esc(label)}">` : ''}</span>`;
}

/** Visor de foto a pantalla completa, con botón para compartirla. */
export async function openPhotoViewer(photoId, title = 'Foto') {
  const url = await photoURL(photoId, 'full');
  if (!url) {
    toast('No se encontró la foto.', { type: 'error' });
    return;
  }
  // El archivo se prepara antes del toque: iOS solo permite compartir
  // si la acción ocurre justo al tocar el botón.
  const rec = await getPhoto(photoId);
  const safeName = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim() || 'foto';
  const file = rec ? new File([rec.full], `${safeName}.jpg`, { type: 'image/jpeg' }) : null;
  const root = document.getElementById('overlay-root');
  const wrap = document.createElement('div');
  wrap.className = 'viewer';
  wrap.innerHTML = `
    <img src="${url}" alt="${esc(title)}">
    <div class="viewer-bar">
      <button type="button" class="viewer-btn" data-v="close" aria-label="Cerrar">${icons.close}</button>
      <button type="button" class="viewer-btn" data-v="share">${icons.share}<span>Compartir</span></button>
    </div>`;
  root.appendChild(wrap);
  document.body.classList.add('has-sheet');
  const close = () => {
    wrap.remove();
    if (!root.querySelector('.sheet-wrap, .dialog-wrap, .viewer')) document.body.classList.remove('has-sheet');
  };
  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) { if (e.target === wrap) close(); return; }
    if (b.dataset.v === 'close') close();
    if (b.dataset.v === 'share' && file) {
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
        }
      } catch (err) {
        if (err?.name !== 'AbortError') toast('No se pudo compartir la foto.', { type: 'error' });
      }
    }
  });
}
