#!/usr/bin/env python3
"""
Genera la propuesta de cabecera v2 de la plantilla OMR (PDF vectorial a escala
real + PNG a 300 dpi). Todas las medidas están en mm de página A4, origen
arriba-izquierda, y coinciden con la plantilla actual (templates/plantilla_A4.pdf)
en todo lo que la app mide: marcadores 0-3, centros de los 42 casilleros, casillas
F y centros de los 4 parches de tono. Por eso la calibración por defecto de la
app sigue siendo válida.

Cambios respecto a la plantilla actual (ver README de la propuesta):
  1. Contorno de los casilleros más grueso y oscuro (0.30 mm, gris 20 %).
  2. Etiquetas P1..P5 a 2.5 mm del casillero A (antes 1.3 mm).
  3. Tira de parches más alta (6.4 mm en vez de 4.9) con los mismos centros.
  4. Dos marcadores ArUco intermedios (ids 4 y 5, 5 mm) en la columna central,
     para rectificar por tramos en el futuro; la app actual los ignora.
  5. Línea guía bajo "Nombre" y "Fecha" (no reduce el espacio de escritura).
  6. Instrucción de marcado bajo la cabecera, fuera de la zona rectificada.
  7. Etiqueta "ID" junto a las filas del código.

Uso:  python3 templates/generar_cabecera_v2.py <carpeta_marcadores_png> <salida_sin_extension>
      Los marcadores son PNG de DICT_4X4_50 (aruco_0.png .. aruco_5.png, 6x6 celdas).
"""
import sys, glob
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics

MARK_DIR, OUT = sys.argv[1], sys.argv[2]
PAGE_H = 297.0

c = canvas.Canvas(OUT + '.pdf', pagesize=A4)
c.setTitle('Cabecera OMR v2 (propuesta)')

def Y(y_mm):               # mm desde arriba -> puntos desde abajo
    return (PAGE_H - y_mm) * mm
def rect_mm(x, y, w, h, **kw):   # x,y = esquina superior izquierda en mm
    c.rect(x * mm, Y(y + h), w * mm, h * mm, **kw)
def text_mm(x, y_base, s, font='Helvetica', size=11, gray=0.0, align='left'):
    c.setFont(font, size); c.setFillGray(gray)
    if align == 'left': c.drawString(x * mm, Y(y_base), s)
    elif align == 'right': c.drawRightString(x * mm, Y(y_base), s)
    else: c.drawCentredString(x * mm, Y(y_base), s)
def marker(id_, cx, cy, side):
    img = ImageReader(f'{MARK_DIR}/aruco_{id_}.png')
    c.drawImage(img, (cx - side / 2) * mm, Y(cy + side / 2), side * mm, side * mm)

# ---------- 1. Marcadores de esquina (igual que hoy: 6 mm) ----------
for id_, (cx, cy) in {0: (6.6, 6.09), 1: (203.4, 6.09), 2: (6.6, 19.89), 3: (203.4, 19.89)}.items():
    marker(id_, cx, cy, 6.0)

# ---------- 2. Marcadores intermedios (nuevos, 5 mm, columna central) ----------
MID_X = 122.99   # centrado entre el cuadro D de P1/P2 (borde 119.19) y la etiqueta P3/P4: 1.3 mm de aire a cada lado
marker(4, MID_X, 14.03, 5.0)
marker(5, MID_X, 20.83, 5.0)

# ---------- 3. Nombre / Fecha (mismo espacio en blanco; se añade línea guía) ----------
text_mm(15.1, 8.0, 'Nombre:', size=11)
text_mm(125.3, 7.58, 'Fecha:', size=11)
c.setStrokeGray(0.6); c.setLineWidth(0.2 * mm)
c.line(31.5 * mm, Y(8.9), 119.0 * mm, Y(8.9))
c.line(138.5 * mm, Y(8.9), 177.0 * mm, Y(8.9))

# ---------- 4. Casilleros ----------
BOX = 4.0
BORDE_W, BORDE_GRAY = 0.30, 0.2       # antes: 0.18 mm, gris 60 %
LETRA_GRAY = 0.6                       # igual que hoy (no debe contar como marca)
def casillero(cx, cy, etiqueta):
    c.setLineWidth(BORDE_W * mm); c.setStrokeGray(BORDE_GRAY); c.setFillGray(1.0)
    rect_mm(cx - BOX / 2, cy - BOX / 2, BOX, BOX, stroke=1, fill=1)
    text_mm(cx, cy + 1.0, etiqueta, size=8, gray=LETRA_GRAY, align='center')

# Código (ID): dos filas de 10 dígitos
for i in range(10):
    casillero(17.0 + 6.8 * i, 14.00, str(i))
    casillero(17.0 + 6.8 * i, 20.80, str(i))
# Preguntas
PREG = {'P1': (96.79, 14.03), 'P2': (96.79, 20.83), 'P3': (135.19, 14.03), 'P4': (135.19, 20.83), 'P5': (173.60, 14.05)}
LABEL_GAP = 2.5                        # antes 1.3 mm entre etiqueta y casillero A
for nombre, (x0, y) in PREG.items():
    for j, letra in enumerate('ABCD'):
        casillero(x0 + 6.8 * j, y, letra)
    text_mm(x0 - BOX / 2 - LABEL_GAP, y + 1.4, nombre, font='Helvetica-Bold', size=9, align='right')
# Formato F
text_mm(179.7, 7.68, 'F', font='Helvetica-Bold', size=11)
casillero(187.1, 5.70, '1'); casillero(193.9, 5.70, '2')
# Etiqueta ID (vertical, gris claro) entre el marcador y la primera columna
c.saveState(); c.setFont('Helvetica', 7); c.setFillGray(0.5)
c.translate(12.3 * mm, Y(17.4)); c.rotate(90); c.drawCentredString(0, 0, 'ID'); c.restoreState()

# ---------- 5. Tira de parches de tono (mismos centros y anchos; más alta) ----------
strip = sorted(glob.glob(f'{MARK_DIR}/../pdf/Im143*'))
tonos = [1.0, 0.67, 0.33, 0.0]
if strip:
    from PIL import Image
    im = Image.open(strip[0]).convert('L'); w, h = im.size
    tonos = [im.getpixel((int(w * (i + 0.5) / 4), h // 2)) / 255.0 for i in range(4)]
X0, BW, CY, BH = 171.40, 24.9 / 4, 20.54, 6.4     # antes alto 4.9 mm
for i, g in enumerate(tonos):
    c.setFillGray(g); c.setStrokeGray(g); c.setLineWidth(0)
    rect_mm(X0 + BW * i, CY - BH / 2, BW, BH, stroke=0, fill=1)
# contorno fino SOLO alrededor del conjunto (el parche blanco queda delimitado sin tocar su ROI)
c.setStrokeGray(0.6); c.setLineWidth(0.15 * mm)
rect_mm(X0, CY - BH / 2, BW * 4, BH, stroke=1, fill=0)

# ---------- 6. Instrucción de marcado (fuera de la zona rectificada, y > 26 mm) ----------
c.setFont('Helvetica', 7); c.setFillGray(0.35)
tx = 17.0
c.drawString(tx * mm, Y(28.0), 'Marca rellenando todo el cuadro')
tw = pdfmetrics.stringWidth('Marca rellenando todo el cuadro', 'Helvetica', 7) / mm
c.setFillGray(0.1); rect_mm(tx + tw + 1.2, 28.0 - 1.9, 2.0, 2.0, stroke=0, fill=1)
c.setFillGray(0.35); c.setFont('Helvetica', 7)
c.drawString((tx + tw + 4.2) * mm, Y(28.0), 'con lápiz o bolígrafo. Un solo cuadro por pregunta. No uses X ni círculos.')

c.showPage(); c.save()
print('PDF escrito:', OUT + '.pdf', '| tonos tira:', [round(t, 2) for t in tonos])
