/*
 * Service worker del Calificador OMR.
 *
 * Objetivo (lineamiento 1 del proyecto): la app debe funcionar sin internet
 * después del primer uso. Código propio, sin librerías externas.
 *
 * Estrategias:
 *  - Shell de la app (index.html, css/, js/, manifest, iconos): stale-while-
 *    revalidate. Se sirve al instante desde caché; si hay red se busca una
 *    versión nueva en segundo plano y, si algún archivo de texto cambió, se
 *    avisa a la pestaña para que ofrezca recargar.
 *  - Recursos grandes y estables (OpenCV.js en vendor/, fuentes de Google):
 *    cache-first. Se descargan una vez y se reutilizan siempre. OpenCV.js se
 *    guarda ya al instalar el worker, así el modo sin conexión funciona desde
 *    la primera visita.
 *
 * Nota: las respuestas de otro origen sin CORS son "opacas" (status 0). El
 * navegador puede ejecutarlas como <script>/CSS aunque el JS no pueda leerlas,
 * y la Cache API las acepta con cache.put().
 */
'use strict';

const VERSION = 'v2';  // v2: index.html dividido en css/ y js/
const SHELL_CACHE = 'omr-shell-' + VERSION;
// Caché aparte para OpenCV.js y fuentes: no se borra al subir VERSION, así no
// se vuelven a descargar ~8 MB con cada cambio de la app. Debe coincidir con la
// constante VENDOR_CACHE de js/motor.js.
const VENDOR_CACHE = 'omr-vendor-v2';  // v2: OpenCV.js servido desde vendor/ (antes CDN)

const SHELL_ASSETS = [
  './',
  './index.html',
  './css/estilos.css',
  './js/estado.js',
  './js/motor.js',
  './js/app.js',
  './js/camara.js',
  './js/deteccion.js',
  './js/calificacion.js',
  './js/exportacion.js',
  './js/calibracion.js',
  './js/parametros.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

const VENDOR_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const INDEX_URL = new URL('./index.html', self.location.href).href;
// Copia propia del build oficial de OpenCV.js (misma ruta que en index.html).
const OPENCV_URL = new URL('./vendor/opencv.js', self.location.href).href;

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
    // OpenCV.js: solo si aún no está (la página acaba de descargarlo para la
    // etiqueta <script>, así que casi siempre sale de la caché HTTP del navegador).
    caches.open(VENDOR_CACHE).then(async (cache) => {
      if (!(await cache.match(OPENCV_URL, { ignoreVary: true }))) await cache.add(OPENCV_URL);
    }),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== VENDOR_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (isVendor(url)) {
    event.respondWith(cacheFirst(event, request));
    return;
  }

  if (url.origin === self.location.origin) {
    // pruebas/ (fotos y página de regresión) no se cachea: va a la red.
    if (url.pathname.includes('/pruebas/')) return;
    event.respondWith(staleWhileRevalidate(event, request));
  }
  // Cualquier otro origen: va directo a la red (sin interceptar).
});

function isVendor(url) {
  return VENDOR_HOSTS.includes(url.hostname) || /\/opencv\.js$/.test(url.pathname);
}

// Clave de caché sin query ni hash (p. ej. "?utm=..." o "#seccion").
function isTextResponse(response) {
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  return /text\/html|text\/css|javascript/.test(ct);
}

function cacheKey(urlString) {
  const u = new URL(urlString);
  u.search = '';
  u.hash = '';
  return u.href;
}

async function cacheFirst(event, request) {
  const cache = await caches.open(VENDOR_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  }
  return response;
}

async function staleWhileRevalidate(event, request) {
  const isNavigation = request.mode === 'navigate';
  const key = cacheKey(request.url);
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(key, { ignoreVary: true });
  // Copia para comparar después (el cuerpo de `cached` lo consumirá la página).
  // Se comparan los recursos de texto (html, css, js): un cambio en cualquiera
  // de ellos merece el aviso de nueva versión.
  const cachedForCompare = (cached && isTextResponse(cached)) ? cached.clone() : null;

  const networkPromise = fetch(key, { cache: 'no-cache', credentials: 'same-origin' })
    .then(async (response) => {
      // No se guardan respuestas redirigidas (Chrome rechaza servirlas a una
      // navegación); se devuelven tal cual y el navegador sigue la redirección.
      if (!response.ok || response.redirected) return response;
      if (cachedForCompare) {
        try {
          const [oldText, newText] = await Promise.all([
            cachedForCompare.text(),
            response.clone().text(),
          ]);
          if (oldText !== newText) updateDetected(event.resultingClientId || event.clientId);
        } catch (_) { /* sin aviso si no se pudo comparar */ }
      }
      await cache.put(key, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }

  const response = await networkPromise;
  if (response) {
    return (isNavigation && response.redirected) ? Response.redirect(response.url, 302) : response;
  }

  if (isNavigation) {
    const fallback = await cache.match(INDEX_URL, { ignoreVary: true });
    if (fallback) return fallback;
  }
  return new Response('Sin conexión y el recurso no está en caché.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// ---- Aviso de nueva versión ----
// La página avisa cuando ya puede recibir mensajes (OMR_PAGE_READY) y el worker
// le responde si, al revalidar su navegación, encontró un index.html distinto.
// Se cubren los dos órdenes posibles: detección antes o después del aviso.
// (Si no se hiciera así, el mensaje podría llegar antes de que la página
// registre su listener y se perdería.)
const readyClients = new Set();
const pendingUpdates = new Set();

function updateDetected(clientId) {
  if (!clientId) return;
  if (readyClients.has(clientId)) {
    postUpdate(clientId);
  } else {
    pendingUpdates.add(clientId);
  }
}

async function postUpdate(clientId) {
  const client = await self.clients.get(clientId);
  if (client) client.postMessage({ type: 'OMR_UPDATE_AVAILABLE' });
}

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'OMR_PAGE_READY' || !event.source) return;
  const id = event.source.id;
  readyClients.add(id);
  if (pendingUpdates.has(id)) {
    pendingUpdates.delete(id);
    event.source.postMessage({ type: 'OMR_UPDATE_AVAILABLE' });
  }
});
