// ============================================================================
// MOTOR DE VISIÓN (carga de OpenCV.js) Y MODO SIN CONEXIÓN
// `Module` debe existir antes de que se ejecute vendor/opencv.js (por eso esa
// etiqueta <script async> va al final de index.html). onCVReady arranca la app
// (initApp, en js/app.js) cuando OpenCV termina de inicializarse.
// También: registro del service worker (sw.js), caché de OpenCV.js y aviso de
// nueva versión.
// ============================================================================

// OpenCV.js callback
var Module = {
  onRuntimeInitialized() {
    onCVReady();
  }
};

// ============================================
// OPENCV: ESPERA Y VALIDACION
// ============================================
function onCVReady() {
  console.log('OpenCV.js cargado');
  STATE.cvReady = true;
  document.getElementById('cvLoading').classList.add('hidden');
  initApp();
  // Guardar OpenCV.js en caché (en segundo plano) para el modo sin conexión.
  setTimeout(ensureOpenCVCached, 1000);
}

function cvLoadError() {
  // Si había una copia guardada y falló, probablemente está dañada o incompleta:
  // se descarta para que el próximo intento la descargue de nuevo.
  dropCachedOpenCV();
  const sinRed = (typeof navigator.onLine === 'boolean') && !navigator.onLine;
  const detalle = sinRed
    ? 'Estás sin conexión y OpenCV.js aún no está guardado en este dispositivo. ' +
      'Conéctate a internet una vez para descargarlo; después la app funciona sin conexión.'
    : 'No se pudo descargar OpenCV.js. Verifica tu conexión a internet la primera vez. ' +
      'Una vez cargado, la app funciona sin conexión.';
  document.getElementById('cvLoading').innerHTML =
    '<div class="content"><h2>Error de carga</h2>' +
    '<p>' + detalle + '</p>' +
    '<button class="btn btn-primary" onclick="location.reload()" style="margin-top:16px;width:auto;padding:12px 24px">Reintentar</button></div>';
}


// ============================================
// MODO SIN CONEXIÓN (Service Worker + Cache API)
// ============================================
// Lineamiento 1 del proyecto: la app debe funcionar sin internet después del
// primer uso. sw.js guarda index.html/manifest/iconos y sirve OpenCV.js y las
// fuentes desde caché. Aquí, además, en cuanto OpenCV termina de cargar se
// guarda su archivo en la misma caché que usa sw.js, para que el modo sin
// conexión funcione ya desde la segunda apertura.
// Debe coincidir con VENDOR_CACHE en sw.js.
const VENDOR_CACHE = 'omr-vendor-v2';  // v2: OpenCV.js servido desde vendor/ (antes CDN)

function offlineSupported() {
  // Service Worker y Cache API solo existen en contextos seguros
  // (https:// o http://localhost). Con file:// la app funciona, pero sin caché.
  return 'serviceWorker' in navigator && 'caches' in window &&
    (location.protocol === 'https:' || location.protocol === 'http:');
}

function getOpenCVUrl() {
  const s = document.getElementById('opencvScript');
  return s ? s.src : null;
}

function registerServiceWorker() {
  if (!offlineSupported()) return;
  navigator.serviceWorker.register('./sw.js')
    .then(reg => console.log('Service worker registrado:', reg.scope))
    .catch(err => console.warn('No se pudo registrar el service worker:', err));
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'OMR_UPDATE_AVAILABLE') showUpdateToast();
  });
  // Avisar al worker que esta página ya puede recibir mensajes; si al revalidar
  // index.html encontró una versión nueva, responderá con OMR_UPDATE_AVAILABLE.
  navigator.serviceWorker.ready.then(() => {
    const ctrl = navigator.serviceWorker.controller;
    if (ctrl) ctrl.postMessage({ type: 'OMR_PAGE_READY' });
  }).catch(() => {});
}

async function ensureOpenCVCached() {
  if (!offlineSupported()) return;
  const url = getOpenCVUrl();
  if (!url) return;
  try {
    const cache = await caches.open(VENDOR_CACHE);
    if (await cache.match(url, { ignoreVary: true })) return;
    // 'force-cache' reutiliza la copia que el navegador acaba de descargar para
    // la etiqueta <script> (si la conservó) y evita una segunda descarga de ~8 MB.
    // Normalmente sw.js ya la guardó al instalarse; esto es la segunda oportunidad.
    const resp = await fetch(url, { mode: 'no-cors', cache: 'force-cache' });
    if (resp.ok || resp.type === 'opaque') {
      await cache.put(url, resp);
      console.log('OpenCV.js guardado para uso sin conexión');
    }
  } catch (e) {
    console.warn('No se pudo guardar OpenCV.js en caché:', e);
  }
}

async function dropCachedOpenCV() {
  if (!offlineSupported()) return;
  const url = getOpenCVUrl();
  if (!url) return;
  try {
    const cache = await caches.open(VENDOR_CACHE);
    await cache.delete(url, { ignoreVary: true });
  } catch (_) {}
}

function showUpdateToast() {
  const stack = document.getElementById('toastStack');
  if (stack.querySelector('.toast-update')) return;
  const t = document.createElement('div');
  t.className = 'toast success toast-update';
  t.textContent = '🔄 Hay una nueva versión de la app. Toca aquí para actualizar.';
  t.style.cursor = 'pointer';
  t.addEventListener('click', () => location.reload());
  stack.appendChild(t);
}

window.addEventListener('load', registerServiceWorker);
