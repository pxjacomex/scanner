# Calificador OMR — guía del proyecto

App web de **una sola página** (`index.html`) que califica plantillas de examen
tipo OMR a partir de una foto tomada con el celular. Todo el procesamiento ocurre
en el navegador con OpenCV.js (detección de marcadores ArUco → rectificación →
lectura de casilleros → nota). No hay backend, ni paso de build, ni `npm`.

## Lineamientos del proyecto (obligatorios)

1. **Debe funcionar sin internet** (salvo, como mucho, el primer uso).
   - Nada de llamadas a servidores en tiempo de uso. Todo recurso externo que se
     necesite debe quedar guardado en el dispositivo tras la primera carga
     (ver "Modo sin conexión" más abajo).
   - Si algo no está en caché y no hay red, la app debe explicarlo al usuario,
     no fallar en silencio.
2. **Sin paquetes poco conocidos, poco probados o de dudosa confiabilidad.**
   - No agregar plugins, frameworks ni complementos externos distintos de los
     que ya tiene el proyecto original (el build oficial de OpenCV.js, copiado
     en `vendor/`, y la fuente Outfit de Google Fonts).
   - Preferir siempre APIs nativas del navegador (Canvas, File, Web Share,
     Cache Storage, Service Worker, localStorage) antes que librerías.
   - El service worker es código propio del proyecto (sin Workbox ni similares).
3. **Diseñada para Google Chrome en un móvil con Android 16.**
   - Interfaz táctil, una columna, botones grandes; probar siempre pensando en
     pantalla de teléfono (≈360–430 px de ancho).
   - La captura usa `<input type="file" accept="image/*" capture="environment">`
     (abre la cámara en Chrome Android). No usar `getUserMedia` salvo necesidad.
   - Puede instalarse en la pantalla de inicio (PWA: `manifest.webmanifest`).
   - No depender de APIs exclusivas de escritorio ni de otros navegadores.

Además: la interfaz y los comentarios del código están en **español**; mantenerlo así.

## Estructura

| Archivo | Para qué |
|---|---|
| `index.html` | Toda la app: CSS, HTML y JS en un solo archivo. |
| `sw.js` | Service worker: deja la app utilizable sin conexión. |
| `vendor/opencv.js` | Build oficial de OpenCV.js (4.x) servido desde este mismo sitio. `docs.opencv.org` retiró la URL `4.10.0/opencv.js` que usaba la app, por eso se aloja aquí. |
| `.nojekyll` | Evita que GitHub Pages procese el sitio con Jekyll (sirve los archivos tal cual). |
| `manifest.webmanifest`, `icons/` | Metadatos e iconos para instalar como app en Android. |
| `templates/plantilla_A4.pdf` | Plantilla imprimible que se escanea. |

## Modo sin conexión (cómo está resuelto)

- `sw.js` guarda `index.html`, el manifest y los iconos al instalarse (caché
  `omr-shell-<VERSION>`), y los sirve con *stale-while-revalidate*: carga al
  instante desde caché y, si hay red, busca una versión nueva en segundo plano.
  Si el HTML cambió, avisa a la página y esta muestra un toast para recargar.
- OpenCV.js (`vendor/opencv.js`, ≈10 MB) y las fuentes de Google se sirven
  *cache-first* desde la caché `omr-vendor-v2`. El worker guarda OpenCV.js al
  instalarse (normalmente sale de la caché HTTP, sin segunda descarga), así que
  el modo sin conexión funciona desde la **primera** visita completa. Las fuentes
  son respuestas de otro origen (opacas); el navegador puede usarlas aunque el
  JS no pueda leerlas.
- Cuando OpenCV termina de cargar, `index.html` (función `ensureOpenCVCached`)
  comprueba que el archivo esté en `omr-vendor-v2` y, si falta, lo guarda.
- Si OpenCV.js falla al cargar (`cvLoadError`), se borra la copia en caché por si
  estaba corrupta y se muestra un mensaje distinto según haya o no conexión.
- Service Worker y Cache API solo existen en contextos seguros (`https://` o
  `http://localhost`). Abriendo el archivo con `file://` la app funciona igual
  que antes, pero sin caché. En GitHub Pages (https) todo aplica.

## Cómo probar en local

```bash
python3 -m http.server 8000
# abrir http://localhost:8000/ en Chrome (o chrome://inspect para el celular)
```

En Chrome: DevTools → Application → Service Workers / Cache Storage para ver las
cachés; marcar "Offline" y recargar para comprobar el modo sin conexión.

## Al hacer cambios

- Cambiar `index.html` **no** exige tocar `sw.js`: el shell se renueva solo y la
  página avisa de la nueva versión.
- Si cambias la lista de archivos del shell (manifest, iconos) o quieres forzar
  una limpieza de caché en los dispositivos, sube `VERSION` en `sw.js`.
- Para actualizar OpenCV.js, reemplaza `vendor/opencv.js` por el build oficial
  nuevo (4.x; descargar de `https://docs.opencv.org/4.x/opencv.js` o de la
  carpeta de la versión concreta) y sube el sufijo de `VENDOR_CACHE` en `sw.js`
  **y** en `index.html` (deben coincidir) para que los dispositivos descarten la
  copia antigua. Si cambias la ruta, actualízala en la etiqueta
  `<script id="opencvScript">` y en `OPENCV_URL` de `sw.js`.
- No introducir dependencias nuevas sin discutirlo primero (lineamiento 2).
