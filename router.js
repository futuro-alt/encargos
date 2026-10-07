// router.js
// Navegación entre pantallas usando la parte "#/..." de la dirección.
// Ejemplos: #/viajes, #/viaje/ID/clientes, #/viaje/ID/articulo/nuevo?cliente=ID

const routes = [];
let renderer = null;

/** Registra una pantalla. Los segmentos con ":" son variables (p. ej. :tripId). */
export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([^/]+)/g, (_, k) => {
    keys.push(k);
    return '/([^/]+)';
  }) + '/?$');
  routes.push({ re, keys, handler });
}

export function parseHash() {
  const raw = (location.hash || '').replace(/^#/, '') || '/viajes';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)), full: raw };
}

export function match(path) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
  }
  return null;
}

/** Cambia de pantalla. Con replace no se agrega al historial. */
export function navigate(to, { replace = false } = {}) {
  const target = to.startsWith('/') ? to : `/${to}`;
  if (('#' + target) === location.hash) {
    refresh();
    return;
  }
  if (replace) {
    history.replaceState(null, '', '#' + target);
    renderer && renderer({});
  } else {
    location.hash = target;
  }
}

/** Vuelve a dibujar la pantalla actual conservando la posición de desplazamiento. */
export function refresh() {
  if (renderer) renderer({ preserveScroll: true });
}

export function onRender(fn) {
  renderer = fn;
}
