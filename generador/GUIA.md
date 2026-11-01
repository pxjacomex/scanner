# Guía paso a paso: poner en marcha el Generador de pruebas

Esta guía acompaña al generador que ya está construido en la carpeta
`generador/` de tu repositorio `pxjacomex/scanner`. Está pensada para seguirla
**un paso a la vez**; cada paso dice qué hacer y cómo comprobar que salió bien.
No hace falta instalar nada en el computador para los pasos 1 a 8: todo se
hace desde el navegador.

---

## Paso 1 · Incorporar el generador a la rama principal del repositorio

El código quedó en la rama `claude/dazzling-cannon-jcv1hk`. Para que se
publique hay que fusionarla en `main`.

1. Entra a <https://github.com/pxjacomex/scanner> con tu cuenta.
2. Arriba verás un aviso amarillo *"claude/dazzling-cannon-jcv1hk had recent
   pushes"* con el botón **Compare & pull request**. Si no aparece, ve a la
   pestaña **Pull requests → New pull request**, deja *base: main* y en
   *compare* elige `claude/dazzling-cannon-jcv1hk`.
3. Pulsa **Create pull request** (el título ya viene puesto).
4. En la página del pull request, pulsa **Merge pull request** y luego
   **Confirm merge**.

**Comprobación:** en la pestaña *Code* del repositorio, rama `main`, debe
aparecer la carpeta `generador/`.

---

## Paso 2 · Publicar con GitHub Pages

El Calificador OMR ya se sirve desde GitHub Pages, así que el generador se
publica solo con la fusión del paso 1.

1. Ve a **Settings → Pages** del repositorio y confirma que *Source* está en
   **Deploy from a branch**, rama **main**, carpeta **/ (root)**. Si no está
   así, configúralo y pulsa **Save**.
2. Espera uno o dos minutos (en la pestaña **Actions** se ve el despliegue
   *pages build and deployment*).
3. Abre <https://pxjacomex.github.io/scanner/generador/>.

**Comprobación:** se abre la página "📝 Generador de pruebas" con las pestañas
Banco, Armar, Vista previa, Guardadas y Ayuda. Si ves una versión antigua,
recarga con Ctrl + F5.

---

## Paso 3 · Primer recorrido con las preguntas de ejemplo

1. En la primera visita el banco está vacío y la página ofrece cargar
   preguntas de ejemplo: acepta (también puedes hacerlo después con el botón
   **📥 Cargar ejemplos** de la pestaña Banco).
2. Pulsa **👁️ Ver** en cualquier pregunta: se muestra tal como se imprimirá,
   con la correcta resaltada; en los problemas con datos puedes cambiar el set
   con el desplegable.
3. Pulsa **✏️ Editar** en "Un bloque de masa {m} kg está apoyado sobre un plano
   inclinado…" para ver cómo se definen las variables, los sets de datos y las
   fórmulas de las opciones. Cancela sin guardar.

**Comprobación:** en el editor, el panel derecho "Así se imprime" cambia al
instante cuando modificas el enunciado o un valor de la tabla.

---

## Paso 4 · Crear tu banco de preguntas

Para cada pregunta, en la pestaña **Banco**:

- **Pregunta de opciones fijas:** tema, enunciado, cuatro opciones y la
  correcta marcada. Si una opción debe quedar siempre al final ("Todas las
  anteriores"), desmarca *Mezclar el orden de las opciones*.
- **Problema con datos:**
  1. Escribe el enunciado con cada dato entre llaves: `Un auto viaja a {v} m/s
     durante {t} s`.
  2. En *Datos del enunciado*, pon el nombre de cada variable en la cabecera
     (`v`, `t`) y una fila por set de datos. Con **＋ Set de datos** añades
     filas; con **⧉** duplicas una para cambiar solo un valor. Conviene tener
     al menos 2 sets (uno por forma); con 3 o 4 podrás reutilizar la pregunta
     en otras pruebas con datos nuevos.
  3. En *Opciones de respuesta*, escribe la fórmula de cada opción
     (`v*t` la correcta; distractores como `v/t`, `v+t`, `2*v*t`) y marca la
     correcta. Elige el redondeo y la unidad.
  4. Revisa la tabla *Valor de cada opción por set*: si dos opciones dan el
     mismo número en algún set, aparece un aviso amarillo; cambia los datos de
     ese set.
- **Imagen o diagrama:** botón *Elegir imagen* (PNG, JPG o SVG). Ajusta el
  ancho impreso en mm y si va a la derecha del texto o debajo.
- Símbolos como ², °, π, Δ están en los botones bajo el enunciado; `m/s^{2}`
  se imprime como m/s² y `v_{0}` como v₀.

Al terminar una sesión de trabajo, pulsa **⬇️ Exportar banco** y guarda el
archivo `banco_preguntas_<fecha>.json` (ver paso 8).

**Comprobación:** la pregunta aparece en la lista sin la etiqueta roja
"incompleta" ni la amarilla "revisar".

---

## Paso 5 · Armar y generar la primera prueba

1. Pestaña **Armar**: escribe el título (se imprime en la cabecera), el curso,
   la fecha y las instrucciones. Deja marcada *Imprimir la casilla F ya
   marcada*.
2. Pulsa **＋ Agregar del banco** y elige 5 preguntas (puedes ver cada una
   antes de agregarla). El contador debe quedar en **5 / 5**.
3. En los problemas con datos, deja *Al azar (distinto en A y B)* o fija el
   set de cada forma.
4. Pulsa **🎲 Generar formas A y B**. Se abre la vista previa y la prueba queda
   guardada en **Guardadas**.
5. Si el orden o la mezcla no te convence, **🎲 Volver a mezclar**.

**Comprobación:** en la vista previa, la cabecera de la forma A tiene pintada
la casilla F "1" y la de la forma B la "2"; ninguna pregunta ocupa la misma
posición en las dos formas.

---

## Paso 6 · Imprimir

1. En **Vista previa**, deja la disposición *Hojas A4: dos pruebas por hoja*.
2. Pulsa **🖨️ Solo cara 1**. En el diálogo de Chrome: papel A4, escala 100 %
   (no "ajustar a la página"), márgenes "Ninguno" (o "Predeterminados"),
   fondo no hace falta. Imprime **una sola hoja** de prueba.
3. Vuelve a poner esa hoja en la bandeja como lo hacías con la plantilla de
   Word y pulsa **🖨️ Solo cara 2**.
4. Comprueba que el dorso de la forma A (arriba) sea la cara 2 de la forma A.
   Si quedó la forma B detrás de la A, marca *Invertir mitades en la cara 2* y
   repite la cara 2.
5. Cuando la hoja de prueba salga bien, imprime el número de copias que
   necesites (cada hoja da una prueba A y una B) y corta por la línea de
   puntos con la guillotina.

Si tu impresora imprime a doble cara automáticamente, usa **🖨️ Imprimir
todo** con "voltear por el borde largo".

**Comprobación:** en la hoja impresa se ven completos los cuatro cuadrados
negros de las esquinas de la cabecera (los marcadores que busca el
calificador).

---

## Paso 7 · Calificar con el Calificador OMR

1. En la vista previa, en *Claves para el Calificador OMR*, copia o imprime
   (**🔑 Imprimir claves**) las claves de las dos formas.
2. Abre el calificador (<https://pxjacomex.github.io/scanner/>), pestaña
   **Clave**: en **Formato 1 (F = 1)** marca la clave de la **forma A** y en
   **Formato 2 (F = 2)** la de la **forma B**. Guarda.
3. Escanea las hojas como siempre: como la casilla F viene impresa, el
   calificador detecta la forma y aplica la clave correcta.

**Comprobación:** al escanear una hoja de la forma B, el resultado muestra
"Forma 2".

---

## Paso 8 · Copias de seguridad del banco y de las pruebas

El banco y las pruebas viven en el navegador del computador donde los creaste.
Para no perderlos y para tenerlos en GitHub:

1. Pestaña **Guardadas → ⬇️ Exportar todo (banco + pruebas)**. Se descarga
   `respaldo_generador_<fecha>.json`.
2. Para guardarlo en el repositorio: en GitHub, entra en la carpeta
   `generador/banco/`, pulsa **Add file → Upload files**, arrastra el archivo
   y pulsa **Commit changes**.
3. En otro computador (o si borras los datos del navegador): **Guardadas →
   📂 Restaurar una copia** y elige ese archivo.

**Comprobación:** tras restaurar, el banco muestra el mismo número de
preguntas.

---

## Paso 9 (opcional) · Trabajar con el repositorio en tu computador

Solo si quieres editar el código o guardar los respaldos con Git en vez de
subirlos por la web.

1. Instala **GitHub Desktop** (<https://desktop.github.com>) e inicia sesión
   con tu cuenta; o instala Git y usa la terminal.
2. Clona el repositorio: en GitHub Desktop, **File → Clone repository →
   pxjacomex/scanner**; en terminal:

   ```bash
   git clone https://github.com/pxjacomex/scanner.git
   ```

3. Para probar cambios antes de subirlos, dentro de la carpeta clonada:

   ```bash
   python3 -m http.server 8000
   ```

   y abre <http://localhost:8000/generador/>.
4. Guarda cambios con un *commit* y súbelos con **Push origin** (GitHub
   Desktop) o `git push`. GitHub Pages se actualiza solo.

---

## Paso 10 (opcional) · Llevar el generador a un repositorio propio

La carpeta `generador/` es autónoma, así que puede vivir en su propio
repositorio si prefieres separarlo del calificador.

1. En GitHub: **New repository**, nombre por ejemplo `generador-pruebas`,
   público, sin README. **Create repository**.
2. Sube el **contenido** de la carpeta `generador/` (no la carpeta en sí:
   `index.html` debe quedar en la raíz): **uploading an existing file**,
   arrastra los archivos y carpetas (`css/`, `js/`, `img/`, `banco/`,
   `sw.js`, `index.html`, `README.md`) y confirma.
3. **Settings → Pages → Deploy from a branch → main / (root)**. La página
   quedará en `https://pxjacomex.github.io/generador-pruebas/`.
4. En ese repositorio, edita `index.html` y cambia el enlace del botón
   "📊 Calificador" de `../` a `https://pxjacomex.github.io/scanner/`, y el
   icono `../icons/icon-192.png` por una ruta propia (o quita esa línea).

Los datos (banco y pruebas) no se mueven con el código: expórtalos en el
sitio antiguo e impórtalos en el nuevo (paso 8).
