// sw.js — permite usar la app sin internet y distribuir actualizaciones.
//
// ▶ PARA PUBLICAR UNA ACTUALIZACIÓN: después de cambiar cualquier archivo,
//   sube el número de VERSION (por ejemplo de '1.0.0' a '1.0.1') y vuelve a
//   subir este archivo junto con los que cambiaste. Los teléfonos verán el
//   aviso "Hay una versión nueva" la próxima vez que abran la app con internet.
//
// ▶ SI AGREGAS UN ARCHIVO NUEVO a la app, agrégalo también a la lista FILES.

const VERSION = '1.0.0';
const CACHE = `encargos-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'router.js',
  'db.js',
  'calc.js',
  'ui.js',
  'parts.js',
  'photos.js',
  'share.js',
  'scanner.js',
  'excel.js',
  'backup.js',
  'view-trips.js',
  'view-trip.js',
  'view-client.js',
  'view-item.js',
  'view-settings.js',
  'manifest.webmanifest',
  'font-bricolage.woff2',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'vendor-exceljs.min.js',
  'vendor-barcode.js',
  'zxing_reader.wasm',
  'LICENCIAS.txt',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Se descarga cada archivo con "?v=VERSION" para saltar las copias viejas
    // que guardan el navegador y el servidor de GitHub Pages, y se guarda con
    // su nombre normal.
    await Promise.all(FILES.map(async (file) => {
      const url = new URL(file, self.location.href);
      const fresh = new URL(url);
      fresh.searchParams.set('v', VERSION);
      const res = await fetch(fresh.href, { cache: 'reload' });
      if (!res.ok) throw new Error(`No se pudo descargar ${file} (${res.status})`);
      await cache.put(url.href, res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('encargos-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // WhatsApp, búsquedas en internet, etc.

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
      return fetch(req);
    }
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch (err) {
      return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
