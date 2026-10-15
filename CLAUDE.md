# Calificador OMR — guía del proyecto

App web de **una sola página** (`index.html` + `css/` + `js/`) que califica
plantillas de examen tipo OMR a partir de una foto tomada con el celular. Todo el
procesamiento ocurre en el navegador con OpenCV.js (detección de marcadores
ArUco → rectificación → lectura de casilleros → nota). No hay backend, ni paso
de build, ni `npm`: los archivos se sirven tal cual.

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
| `index.html` | Solo HTML: pantallas, modales y las etiquetas que cargan css/ y js/. |
| `css/estilos.css` | Todos los estilos. |
| `js/estado.js` | Estado global (`STATE`, `DEBUG`), parámetros del detector, geometría, calibración, parches de tono y su persistencia en `localStorage`. |
| `js/motor.js` | Carga de OpenCV.js (`Module`, `onCVReady`, `cvLoadError`) y modo sin conexión (service worker, caché, aviso de versión). |
| `js/app.js` | `initApp`, pestañas, modales, toasts. |
| `js/camara.js` | Captura de la foto y flujo captura → pipeline → resultado (`processImage`). |
| `js/deteccion.js` | `runPipeline` y todo el procesamiento de imagen: ArUco, rectificación, anclaje a los cuadros impresos, LUT de tonos, features, clasificación, anotación. Sin DOM. |
| `js/calificacion.js` | Resultado del escaneo, tabla de resultados, duplicados, clave de respuestas y notas. La nota es sobre 100 (20 puntos por acierto, constantes en `NOTA`). La clave de cada pregunta admite varias letras (`"AC"`): el estudiante acierta si la única casilla que pintó es cualquiera de ellas (`esAcierto`); la detección no cambia. |
| `js/grupos.js` | Grupos de estudiantes (archivos CSV `id,email` de la carpeta "grupo" del teléfono, cargados con un selector de archivos y guardados en `localStorage`), nombre de la evaluación y grupo elegido. |
| `js/exportacion.js` | CSV (nombre `<grupo>_<evaluación>_Clave_1_A…5_A__<fecha>.csv`, con las letras juntas si una pregunta admite varias: `1_AC`; columna `alumno_email` y columna de nota sobre 100 titulada con la evaluación), compartir (Web Share) y ver/descargar la imagen rectificada. |
| `js/calibracion.js` | Pestaña Calibrar (coordenadas de casilleros con vista previa). |
| `js/parametros.js` | Pestaña Detector (sliders, parches de tono, previews, reclasificación en vivo). |
| `sw.js` | Service worker: deja la app utilizable sin conexión. |
| `vendor/opencv.js` | Build oficial de OpenCV.js (4.x) servido desde este mismo sitio. `docs.opencv.org` retiró la URL `4.10.0/opencv.js` que usaba la app, por eso se aloja aquí. |
| `.nojekyll` | Evita que GitHub Pages procese el sitio con Jekyll (sirve los archivos tal cual). |
| `manifest.webmanifest`, `icons/` | Metadatos e iconos para instalar como app en Android. |
| `templates/plantilla_A4.pdf` | Plantilla imprimible que se escanea (cabecera v2). Se genera con `generar_cabecera_v2.py` (cabecera) + `integrar_cabecera_v2.py` (la monta sobre el cuerpo de preguntas de `plantilla_A4_v1.pdf`). |
| `templates/plantilla_A4_v1.pdf` | Plantilla original (histórico). Misma geometría de marcadores, casilleros y parches que la v2: la calibración por defecto sirve para ambas. |
| `templates/cabecera_v2.*` | Cabecera v2 sola (PNG 300 dpi, PDF vectorial) y comparación con la v1. |
| `templates/plantilla_A4_horizontal.docx` | Documento Word compatible con Google Docs: A4 horizontal, cabecera v2 (sin la línea de instrucción) como imagen a 600 dpi en la sección de encabezado, escalada al ancho útil (287 mm), márgenes de 4 mm arriba y a los lados; el cuerpo lleva las preguntas de la plantilla como párrafos editables. Lo genera `generar_plantilla_docx.py` (python-docx). La cabecera escalada se reconoce igual: la app solo usa proporciones relativas a los marcadores. |
| `templates/cabecera_v2.odg` | La cabecera v2 como dibujo editable de LibreOffice Draw (página A4, cada casillero/marcador/parche es una forma). Lo genera `generar_cabecera_v2_odg.py`; al editar, no mover casilleros, marcadores ni parches o habrá que recalibrar. |
| `pruebas/` | Fotos reales con el resultado esperado en el nombre, `fotos.json` y `regresion.html` (página que las pasa por el pipeline y compara; ver `pruebas/README.md`). No se cachea sin conexión. |

## Cómo están organizados los scripts

- Son **scripts clásicos** (sin `type="module"`, sin bundler) que comparten el
  ámbito global: las funciones de un archivo se llaman desde otro y desde los
  `onclick` del HTML. Las constantes/`let` de nivel superior (`STATE`,
  `CALIBRATION`, `COORDS`, `GEOM`…) también son compartidas.
- El **orden de carga** en `index.html` es: `estado` → `motor` → `app` →
  `camara` → `deteccion` → `calificacion` → `grupos` → `exportacion` →
  `calibracion` → `parametros`, y al final `vendor/opencv.js` (`async`). Solo `estado.js` ejecuta
  código al cargarse que otros necesitan; el resto son definiciones que se usan
  cuando OpenCV ya inicializó (`onCVReady` → `initApp`).
- Al **añadir un archivo** a `css/` o `js/`: enlazarlo en `index.html`, añadirlo a
  `SHELL_ASSETS` en `sw.js` y subir `VERSION` (si no, no estará disponible sin
  conexión).
- Regla de reparto: `deteccion.js` no toca el DOM; el DOM lo tocan las pantallas
  (`calificacion`, `calibracion`, `parametros`, `camara`) y `app.js`.

## Cómo lee la hoja (y por qué hay anclaje)

- Los 4 ArUco de los extremos dan la homografía que rectifica la cabecera a
  un marco de 207 × 24 mm **reales** (15 px/mm; `GEOM`): M0 queda en (5, 5) y
  un punto de la hoja en (x_página − 1.56, y_página − 1.05). Las celdas se leen
  en coordenadas calibradas (`CALIBRATION` → `COORDS`) midiendo la fracción de
  píxeles oscuros sobre la imagen normalizada con la LUT de los 4 parches.
- **Las coordenadas por defecto están derivadas del PDF de la plantilla**
  (`CALIBRATION_DEFAULT`, `TONE_PATCHES_DEFAULT.coords`, `GEOM.MARCADORES_MM`),
  no medidas sobre fotos. Si cambia la plantilla, recalcularlas a partir de la
  geometría del PDF (ver `templates/generar_cabecera_v2.py`) y subir las claves
  `STORAGE_KEY_CALIB` / `STORAGE_KEY_TONE_PATCHES` si cambia el marco.
- **Cabecera v2 (marcadores centrales 4 y 5):** si se detectan, `rectificar`
  usa dos homografías (izquierda 0-4-5-2, derecha 4-1-3-5) unidas en la columna
  central (`GEOM.MARCADORES_MM`, x = 121.42 mm), así un doblez por el centro se absorbe como
  cambio de plano. Antes se comprueba que los centrales caigan cerca de su
  posición esperada (`GEOM.TOL_MARCADOR_CENTRAL_MM`); si no, o si faltan (hojas
  v1), homografía única. Parámetro `rectificar_por_mitades` (Detector → "②"),
  que al cambiar vuelve a procesar la última foto (`reprocesarUltimaFoto`).
  El resultado queda en `DEBUG.rectificacion`.
- Con la hoja doblada o la foto distorsionada, una homografía de 4 puntos deja
  el centro corrido varios mm (medido: 3,75 mm con casillas de 4,2 mm y paso
  de 6,7 mm). Por eso, antes de medir, `aplicarAnclaje` (en `js/deteccion.js`)
  detecta los cuadros impresos (umbral adaptativo + contornos; se descartan las
  formas con el interior oscuro, como los marcadores centrales), busca para cada
  fila el desplazamiento que hace coincidir más celdas con un cuadro, centra
  cada celda en su cuadro y localiza la tira de parches con una plantilla de 4
  bandas. El resultado queda en `STATE.coordsLectura` / `STATE.anclaje`;
  `getCoordsLectura()` es lo que usan `extractFeatures` y la anotación.
- Parámetro `anclaje_mm` (Detector → "③ Anclaje"): radio de búsqueda en X; 0 lo
  desactiva y la app vuelve a leer exactamente como antes. Al mover sliders de
  calibración o del detector se vuelve a anclar (`reanclar()`).
- Para comprobar cambios en el detector, abrir `pruebas/regresion.html`: pasa
  las fotos de `pruebas/fotos.json` con y sin anclaje y compara con el nombre.
  Añadir ahí cualquier foto problemática (convención de nombre en
  `pruebas/README.md`).

## Modo sin conexión (cómo está resuelto)

- `sw.js` guarda `index.html`, `css/`, `js/`, el manifest y los iconos al
  instalarse (caché `omr-shell-<VERSION>`), y los sirve con *stale-while-
  revalidate*: carga al instante desde caché y, si hay red, busca una versión
  nueva en segundo plano. Si algún archivo de texto cambió, avisa a la página y
  esta muestra un toast para recargar.
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

- Cambiar `index.html`, `css/` o `js/` **no** exige tocar `sw.js`: el shell se
  renueva solo y la página avisa de la nueva versión.
- Si añades o quitas archivos del shell (css, js, manifest, iconos) o quieres
  forzar una limpieza de caché en los dispositivos, actualiza `SHELL_ASSETS` y
  sube `VERSION` en `sw.js`.
- Para actualizar OpenCV.js, reemplaza `vendor/opencv.js` por el build oficial
  nuevo (4.x; descargar de `https://docs.opencv.org/4.x/opencv.js` o de la
  carpeta de la versión concreta) y sube el sufijo de `VENDOR_CACHE` en `sw.js`
  **y** en `js/motor.js` (deben coincidir) para que los dispositivos descarten la
  copia antigua. Si cambias la ruta, actualízala en la etiqueta
  `<script id="opencvScript">` y en `OPENCV_URL` de `sw.js`.
- No introducir dependencias nuevas sin discutirlo primero (lineamiento 2).
