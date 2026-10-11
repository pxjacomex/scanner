# Pruebas de regresión con fotos reales

Esta carpeta guarda fotos reales de plantillas con su resultado esperado
codificado en el nombre del archivo, y una página que las pasa por el pipeline
real de la app (`js/deteccion.js`) y compara.

## Cómo ejecutar

Abrir `pruebas/regresion.html` desde el sitio publicado
(`https://pxjacomex.github.io/scanner/pruebas/regresion.html`) o en local
(`python3 -m http.server 8000` → `http://localhost:8000/pruebas/regresion.html`).
Funciona también en el celular. Cada foto se procesa dos veces: con el anclaje a
los cuadros impresos (parámetros por defecto) y sin él, para ver qué aporta.

Se usan siempre los parámetros y la calibración **por defecto** del código, no
los guardados en el dispositivo, así el resultado es reproducible.

## Cómo añadir una foto

1. Nombrarla con el patrón
   `studentId_<ID>_form_<F>_P1_<r>_P2_<r>_P3_<r>_P4_<r>_P5_<r>.jpg`
   donde `<r>` es la letra marcada (`A`…`D`), `null` si está vacía, o `amb` si
   hay dos marcas y debe salir ambigua. Ejemplo:
   `studentId_24_form_1_P1_A_P2_C_P3_D_P4_B_P5_null.jpg`.
2. Subirla a esta carpeta.
3. Añadir el nombre a `fotos.json`.

Conviene incluir fotos difíciles (hoja doblada, poca luz, sombras, bolígrafo,
lápiz suave): son las que detectan regresiones al cambiar el detector.

Después de `P5_<r>` el nombre puede llevar un sufijo libre (por ejemplo
`_v2_doblada_sintetica`) para describir la foto. Las "sintéticas" se generan a
partir del PDF de la plantilla con marcas y deformaciones simuladas; sirven
para cubrir casos que aún no tienen foto real (como la cabecera v2 doblada por
el centro), pero no sustituyen a una foto real.
