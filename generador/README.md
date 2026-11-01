# Generador de pruebas (formas A y B)

Página web de una sola pantalla, hermana del Calificador OMR, para armar
pruebas de alternativas a partir de un **banco de preguntas** y sacar dos
formas (A y B) de la misma prueba, listas para imprimir con la cabecera que
lee el calificador. Igual que el calificador: sin servidor, sin paso de build y
sin dependencias; todo ocurre en el navegador y los datos quedan en el
dispositivo (IndexedDB + localStorage).

Se abre en `generador/` del mismo sitio (en GitHub Pages:
`https://<usuario>.github.io/scanner/generador/`) y también sirve abriendo
`generador/index.html` en un servidor local (`python3 -m http.server`).

## Qué hace

- **Banco de preguntas** con dos tipos:
  - *Opciones fijas*: cuatro alternativas de texto, una correcta.
  - *Problema con datos*: el enunciado lleva variables (`{v}`, `{t}`…),
    varios **sets de datos** (filas de valores) y una **fórmula por opción**
    (`v*t`, `sqrt(2*h/g)`…) que calcula su texto. Se eligen redondeo y unidad.
  - Cualquier pregunta puede llevar una **imagen o diagrama** (ancho impreso
    en mm, a la derecha del texto o debajo).
  - Editor con vista previa "así se imprime" y tabla con el valor de cada
    opción en cada set; avisa de fórmulas inválidas, variables sin valor y
    opciones repetidas.
  - Importar/exportar el banco como JSON; preguntas de ejemplo en
    `banco/ejemplos.json`.
- **Armar**: título, curso, fecha, instrucciones, tamaño de letra; 5 preguntas
  elegidas del banco (con vista previa antes de agregarlas); por problema, el
  set de cada forma (al azar o fijo).
- **Generar**: la forma A sale con las preguntas en orden aleatorio y la B con
  otro orden en el que ninguna pregunta repite posición; en cada pregunta las
  opciones se mezclan de forma distinta en A y B (la correcta cambia de letra)
  y los problemas usan sets de datos distintos. El resultado se guarda con una
  copia de las preguntas, así una prueba vieja se ve igual aunque el banco
  cambie después.
- **Vista previa e impresión**: páginas a tamaño real, claves de ambas formas
  y botones para imprimir todo, solo la cara 1, solo la cara 2 o la hoja de
  claves.
- **Guardadas**: ver, editar (vuelve a Armar), duplicar, exportar, importar,
  eliminar; copia de seguridad completa (banco + pruebas).

## Formato impreso

Reproduce la plantilla de Word que se imprimía a dos páginas por hoja: cada
prueba ocupa **media hoja A4 apaisada (210 × 148,5 mm) por las dos caras**.

- Disposición por defecto (`a4`): hojas A4 verticales con dos pruebas. Cara 1:
  arriba la primera cara de la forma A, abajo la de la forma B; cara 2: los
  dorsos (opción "invertir mitades" por si la impresora voltea por el otro
  borde). Línea de corte punteada en la mitad.
- Disposición `a5`: cuatro páginas sueltas de 210 × 148,5 mm (A1, A2, B1, B2),
  para seguir usando "2 páginas por hoja" del diálogo de impresión.
- La cabecera OMR (`img/cabecera_v2.png`, recorte de
  `templates/cabecera_v2.pdf` a 600 dpi, 210 × 23,5 mm de página) se imprime a
  198 mm de ancho (ajustable), con los marcadores a ≈9 mm del borde del papel.
  El calificador solo usa proporciones relativas a los marcadores, así que la
  reducción no le afecta.
- **Casilla F**: con "Imprimir la casilla F ya marcada", la forma A lleva F = 1
  y la B F = 2 pintadas (se dibujan sobre la imagen con un canvas; si el
  canvas no está disponible, con un cuadro negro superpuesto). El calificador
  exige F y aplica la clave del "Formato 1" o "Formato 2": basta con escribir
  allí las claves que muestra la vista previa.
- Las preguntas se reparten entre las dos caras midiendo el alto real de cada
  una en la página (`paginarForma` en `js/vista.js`); se puede forzar cuántas
  van en la cara 1. Si algo no cabe, la vista previa lo avisa.
- Tipografía del papel: Arial/Helvetica (la de la plantilla original); tamaño
  configurable (9–12 pt).

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | Pantallas (Banco, Armar, Vista previa, Guardadas, Ayuda), modales y carga de scripts. |
| `css/generador.css` | Estilos de la interfaz (misma paleta que el calificador), del "papel" y de impresión (`@media print`). |
| `js/util.js` | Utilidades: ids, fechas, azar con semilla (mulberry32), archivos, formato de números y texto enriquecido (`^{}`, `_{}`, `**`). |
| `js/formulas.js` | Evaluador de fórmulas propio (sin `eval`): tokenizador + analizador descendente; funciones y constantes permitidas. |
| `js/almacen.js` | IndexedDB (`generador-omr`: `preguntas`, `pruebas`) y localStorage (borrador, ajustes). |
| `js/modelo.js` | Estructuras de pregunta y prueba, normalización de importaciones, `resolverPregunta` (enunciado + opciones con un set), `generarFormas` (sorteo de A y B). Sin DOM. |
| `js/vista.js` | Dibujo de una pregunta (`nodoPregunta`, compartido), páginas, paginación, hojas A4/A5, claves, impresión y cabecera con la F marcada. |
| `js/banco.js` | Lista del banco, editor, imágenes, importar/exportar, modal "ver pregunta". |
| `js/armado.js` | Borrador de la prueba, selector de preguntas, sets por forma, generación. |
| `js/guardadas.js` | Pruebas guardadas, importar/exportar, copia de seguridad. |
| `js/app.js` | Arranque, pestañas, modales, toasts, registro del service worker. |
| `sw.js` | Service worker propio del generador (ámbito `generador/`): precarga los archivos, red primero con caché de respaldo. |
| `img/cabecera_v2.png` | Cabecera OMR v2 recortada (600 dpi). |
| `banco/ejemplos.json` | Preguntas de ejemplo (Física) en el formato de exportación del banco. |

Los scripts son clásicos (ámbito global compartido) y se cargan en el orden
`util → formulas → almacen → modelo → vista → banco → armado → guardadas → app`.
Al añadir un archivo: enlazarlo en `index.html`, añadirlo a `ASSETS` en `sw.js`
y subir `VERSION`.

## Formato de datos

Pregunta (`preguntas` en IndexedDB y en los JSON exportados):

```json
{
  "id": "q_…", "tema": "Cinemática", "tipo": "calculo",
  "enunciado": "Un automóvil … {v} m/s durante {t} s …",
  "imagen": { "datos": "data:image/png;base64,…", "ancho_mm": 55, "posicion": "derecha", "ancho_px": 600, "alto_px": 400 },
  "mezclar": true,
  "opciones": [ { "texto": "", "formula": "v*t", "correcta": true }, { "texto": "", "formula": "v/t", "correcta": false }, … ],
  "variables": ["v", "t"],
  "sets": [ { "v": "12", "t": "5" }, { "v": "15", "t": "4" } ],
  "formato": { "modo": "auto", "decimales": 1, "unidad": "m" }
}
```

Prueba: `{ id, titulo, curso, fecha, instrucciones, opciones: {…}, items:
[{ preguntaId, setA, setB }], formas: { semilla, generada, A, B, snapshot,
avisos } }`. Cada forma tiene `items: [{ numero, preguntaId, setIndice,
enunciado, opciones: [{ texto, correcta }], correcta }]` y `clave`.

## Probar en local

```bash
python3 -m http.server 8000
# abrir http://localhost:8000/generador/
```

Para imprimir en PDF y revisar la paginación sin impresora: Chrome → Imprimir →
Destino "Guardar como PDF", papel A4, escala 100 %, márgenes "Ninguno".
