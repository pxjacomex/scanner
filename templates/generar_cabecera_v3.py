#!/usr/bin/env python3
"""
Cabecera v3: 10 preguntas (P1..P10) con 4 opciones, a partir de la v2.
Misma geometría de casilleros (4.0 mm, paso 6.8 mm), mismos dígitos de ID, F,
nombre, fecha y marcadores 0, 1, 4 y 5; se añade una tercera fila de cuadrícula
(paso 6.8 mm hacia abajo) con P7..P10, y los marcadores inferiores 2 y 3 y la
tira de parches bajan a esa fila. La app la lee con la cabecera "10 preguntas"
(PLANTILLAS['10'] en js/estado.js, cuyas coordenadas salen de este archivo).

Uso:  python3 templates/generar_cabecera_v3.py <carpeta_marcadores_png> <salida_sin_extension>
      Los marcadores son PNG de DICT_4X4_50 (aruco_0.png .. aruco_5.png, 6x6 celdas),
      los mismos que usa generar_cabecera_v2.py.
"""
import sys, glob
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics

MARK_DIR, OUT = sys.argv[1], sys.argv[2]
PAGE_H = 297.0
PASO_FILA = 6.8                      # una línea más de cuadrícula hacia abajo
FILA = [14.03, 20.83, 20.83 + PASO_FILA]   # centros de las 3 filas de casilleros

c = canvas.Canvas(OUT + '.pdf', pagesize=A4)
c.setTitle('Cabecera OMR v3 (10 preguntas, propuesta)')

def Y(y_mm): return (PAGE_H - y_mm) * mm
def rect_mm(x, y, w, h, **kw): c.rect(x * mm, Y(y + h), w * mm, h * mm, **kw)
def text_mm(x, y_base, s, font='Helvetica', size=11, gray=0.0, align='left'):
    c.setFont(font, size); c.setFillGray(gray)
    if align == 'left': c.drawString(x * mm, Y(y_base), s)
    elif align == 'right': c.drawRightString(x * mm, Y(y_base), s)
    else: c.drawCentredString(x * mm, Y(y_base), s)
def marker(id_, cx, cy, side):
    c.drawImage(ImageReader(f'{MARK_DIR}/aruco_{id_}.png'), (cx - side / 2) * mm, Y(cy + side / 2), side * mm, side * mm)

# 1. Marcadores de esquina (6 mm): los inferiores bajan una fila
Y_SUP, Y_INF = 6.09, 19.89 + PASO_FILA
for id_, (cx, cy) in {0: (6.6, Y_SUP), 1: (203.4, Y_SUP), 2: (6.6, Y_INF), 3: (203.4, Y_INF)}.items():
    marker(id_, cx, cy, 6.0)
# 2. Marcadores centrales (5 mm): en las filas 1 y 2, igual que en la v2 (así la columna
#    central queda libre en la fila 3 para la etiqueta "P10" y la geometría de los
#    marcadores 0, 1, 4 y 5 no cambia respecto a la v2; solo bajan el 2 y el 3).
MID_X = 122.99
marker(4, MID_X, FILA[0], 5.0)
marker(5, MID_X, FILA[1], 5.0)

# 3. Nombre / Fecha (igual que v2)
text_mm(15.1, 8.0, 'Nombre:', size=11)
text_mm(125.3, 7.58, 'Fecha:', size=11)
c.setStrokeGray(0.6); c.setLineWidth(0.2 * mm)
c.line(31.5 * mm, Y(8.9), 119.0 * mm, Y(8.9))
c.line(138.5 * mm, Y(8.9), 177.0 * mm, Y(8.9))

# 4. Casilleros (igual que v2: 4.0 mm, borde 0.30 mm gris 20 %, letra gris 60 %)
BOX = 4.0
def casillero(cx, cy, etiqueta):
    c.setLineWidth(0.30 * mm); c.setStrokeGray(0.2); c.setFillGray(1.0)
    rect_mm(cx - BOX / 2, cy - BOX / 2, BOX, BOX, stroke=1, fill=1)
    text_mm(cx, cy + 1.0, etiqueta, size=8, gray=0.6, align='center')

# Código (ID): dos filas de 10 dígitos (igual que v2)
for i in range(10):
    casillero(17.0 + 6.8 * i, 14.00, str(i))
    casillero(17.0 + 6.8 * i, 20.80, str(i))

# Preguntas: 3 por fila a la derecha del ID (filas 1 y 2) y 4 en la fila 3.
# Columnas: 96.79 (como P1/P2 v2), 135.19 (como P3/P4 v2), 173.60 (como P5 v2);
# en la fila 3, P7 y P8 van alineados con las columnas de dígitos 1-4 y 6-9.
COL = [96.79, 135.19, 173.60]
PREG = {
    'P1': (COL[0], FILA[0]), 'P2': (COL[1], FILA[0]), 'P3': (COL[2], FILA[0]),
    'P4': (COL[0], FILA[1]), 'P5': (COL[1], FILA[1]), 'P6': (COL[2], FILA[1]),
    'P7': (17.0 + 6.8 * 1, FILA[2]), 'P8': (17.0 + 6.8 * 6, FILA[2]), 'P9': (COL[0], FILA[2]), 'P10': (COL[1], FILA[2]),
}
LABEL_GAP = 2.5
for nombre, (x0, y) in PREG.items():
    for j, letra in enumerate('ABCD'):
        casillero(x0 + 6.8 * j, y, letra)
    text_mm(x0 - BOX / 2 - LABEL_GAP, y + 1.4, nombre, font='Helvetica-Bold', size=9, align='right')

# Formato F (igual que v2)
text_mm(179.7, 7.68, 'F', font='Helvetica-Bold', size=11)
casillero(187.1, 5.70, '1'); casillero(193.9, 5.70, '2')
# Etiqueta ID vertical (igual que v2)
c.saveState(); c.setFont('Helvetica', 7); c.setFillGray(0.5)
c.translate(12.3 * mm, Y(17.4)); c.rotate(90); c.drawCentredString(0, 0, 'ID'); c.restoreState()

# 5. Tira de parches: mismos centros X y alto; baja a la fila 3 (bajo P3/P6)
strip = sorted(glob.glob(f'{MARK_DIR}/../pdf/Im143*'))
tonos = [1.0, 0.67, 0.33, 0.0]
if strip:
    from PIL import Image
    im = Image.open(strip[0]).convert('L'); w, h = im.size
    tonos = [im.getpixel((int(w * (i + 0.5) / 4), h // 2)) / 255.0 for i in range(4)]
X0, BW, CY, BH = 171.40, 24.9 / 4, FILA[2], 6.4
for i, g in enumerate(tonos):
    c.setFillGray(g); c.setStrokeGray(g); c.setLineWidth(0)
    rect_mm(X0 + BW * i, CY - BH / 2, BW, BH, stroke=0, fill=1)
c.setStrokeGray(0.6); c.setLineWidth(0.15 * mm)
rect_mm(X0, CY - BH / 2, BW * 4, BH, stroke=1, fill=0)

# 6. Instrucción de marcado (fuera de la zona rectificada), una fila más abajo que en v2
Y_INSTR = 28.0 + PASO_FILA
c.setFont('Helvetica', 7); c.setFillGray(0.35)
tx = 17.0
c.drawString(tx * mm, Y(Y_INSTR), 'Marca rellenando todo el cuadro')
tw = pdfmetrics.stringWidth('Marca rellenando todo el cuadro', 'Helvetica', 7) / mm
c.setFillGray(0.1); rect_mm(tx + tw + 1.2, Y_INSTR - 1.9, 2.0, 2.0, stroke=0, fill=1)
c.setFillGray(0.35); c.setFont('Helvetica', 7)
c.drawString((tx + tw + 4.2) * mm, Y(Y_INSTR), 'con lápiz o bolígrafo. Un solo cuadro por pregunta. No uses X ni círculos.')
c.showPage(); c.save()

# Resumen para una futura calibración de la app (marco: x_pag - 1.56, y_pag - 1.05)
print('PDF escrito:', OUT + '.pdf', '| tonos tira:', [round(t, 2) for t in tonos])
print('Marcadores (página mm): M0 (6.6, %.2f) M1 (203.4, %.2f) M2 (6.6, %.2f) M3 (203.4, %.2f) M4 (%.2f, %.2f) M5 (%.2f, %.2f)' % (Y_SUP, Y_SUP, Y_INF, Y_INF, MID_X, FILA[0], MID_X, FILA[1]))
print('M0_M2 = %.2f mm (v2: 13.80); alto zona rectificada ≈ %.1f mm (v2: 24); instrucción en y = %.1f' % (Y_INF - Y_SUP, 24 + PASO_FILA, Y_INSTR))
print('Preguntas (marco mm, casilla A):', {k: (round(x - 1.56, 2), round(y - 1.05, 2)) for k, (x, y) in PREG.items()})
print('Parches (marco mm): centros x', [round(X0 + BW * (i + 0.5) - 1.56, 2) for i in range(4)], 'y', round(CY - 1.05, 2))
