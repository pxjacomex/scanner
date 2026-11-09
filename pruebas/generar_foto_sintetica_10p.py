#!/usr/bin/env python3
"""Foto sintética de la cabecera v3 (10 preguntas) para pruebas/: renderiza el PDF,
pinta casilleros (ID 37, F 1, P1 A, P2 C, P3 D, P4 B, P5 vacía, P6 A, P7 B, P8 C,
P9 D, P10 ambigua), aplica perspectiva, desenfoque, ruido y un degradado de luz,
y guarda un JPEG. Requiere pdftoppm (poppler) y Pillow.

Uso: python3 pruebas/generar_foto_sintetica_10p.py templates/cabecera_v3.pdf pruebas/<nombre_sin_extension>
"""
import sys, math, random, subprocess
from PIL import Image, ImageDraw, ImageFilter, ImageChops

PDF, OUT = sys.argv[1], sys.argv[2]
random.seed(7)
DPI = 300; PXMM = DPI / 25.4
# Cabecera + margen: 210 x 50 mm
subprocess.run(['pdftoppm', '-r', str(DPI), '-png', '-singlefile', '-x', '0', '-y', '0', '-W', str(round(210 * PXMM)), '-H', str(round(50 * PXMM)), PDF, OUT + '_plano'], check=True)
hoja = Image.open(OUT + '_plano.png').convert('L')

BOX = 4.0
def pintar(cx, cy, intensidad=70, cobertura=0.86):
    d = ImageDraw.Draw(hoja)
    r = BOX * cobertura / 2 * PXMM
    x, y = cx * PXMM, cy * PXMM
    # trazo irregular: varios rectángulos redondeados desplazados
    for k in range(6):
        dx, dy = random.uniform(-0.25, 0.25) * PXMM, random.uniform(-0.25, 0.25) * PXMM
        d.rounded_rectangle([x - r + dx, y - r + dy, x + r + dx, y + r + dy], radius=r * 0.3, fill=intensidad + random.randint(-15, 15))

# ID 37: D1 dígito 3, D2 dígito 7 (fila 14.00 / 20.80)
pintar(17.0 + 6.8 * 3, 14.00); pintar(17.0 + 6.8 * 7, 20.80)
# F = 1
pintar(187.1, 5.70)
# Respuestas: P1 A, P2 C, P3 D, P4 B, P5 (vacía), P6 A, P7 B, P8 C, P9 D, P10 ambigua (A y C)
COL = [96.79, 135.19, 173.60]; F = [14.03, 20.83, 27.63]
X0 = {'P1': (COL[0], F[0]), 'P2': (COL[1], F[0]), 'P3': (COL[2], F[0]), 'P4': (COL[0], F[1]), 'P5': (COL[1], F[1]), 'P6': (COL[2], F[1]),
      'P7': (23.8, F[2]), 'P8': (57.8, F[2]), 'P9': (COL[0], F[2]), 'P10': (COL[1], F[2])}
L = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
for q, letras in {'P1': 'A', 'P2': 'C', 'P3': 'D', 'P4': 'B', 'P6': 'A', 'P7': 'B', 'P8': 'C', 'P9': 'D', 'P10': 'AC'}.items():
    for l in letras:
        x0, y = X0[q]; pintar(x0 + 6.8 * L[l], y, intensidad=60 if l != 'C' or q != 'P10' else 85)

# Degradado de iluminación (más oscuro a la derecha y abajo) y papel no blanco
W, H = hoja.size
grad = Image.linear_gradient('L').rotate(90, expand=True).resize((W, H))      # 0 izquierda → 255 derecha
grad = ImageChops.invert(grad).point(lambda v: 185 + v * 50 // 255)           # 185..235
hoja = ImageChops.multiply(hoja, grad)

# Perspectiva: la hoja se ve algo inclinada (esquinas de destino), sobre un fondo tipo mesa
OW, OH = 2900, 1150
fondo = Image.new('L', (OW, OH), 95)
ruido_fondo = Image.effect_noise((OW, OH), 18).point(lambda v: 60 + v // 3)
fondo = ImageChops.add(fondo, ruido_fondo, scale=2.0)
# esquinas destino (TL, TR, BR, BL) de la hoja 210x50 mm
dst = [(150, 160), (2770, 110), (2805, 1010), (120, 1040)]
src = [(0, 0), (W, 0), (W, H), (0, H)]
def coeficientes(pa, pb):
    # resuelve coeficientes de PIL (salida -> entrada): pa = destino, pb = origen
    A = []; B = []
    for (x, y), (u, v) in zip(pa, pb):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    n = 8
    M = [row[:] + [B[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c])); M[c], M[piv] = M[piv], M[c]
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                for k in range(c, n + 1): M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]
coef = coeficientes(dst, src)
hoja_rgba = hoja.convert('L')
mascara = Image.new('L', (W, H), 255)
warp = hoja_rgba.transform((OW, OH), Image.PERSPECTIVE, coef, Image.BICUBIC, fillcolor=0)
warp_m = mascara.transform((OW, OH), Image.PERSPECTIVE, coef, Image.BICUBIC, fillcolor=0)
foto = Image.composite(warp, fondo, warp_m)
foto = foto.filter(ImageFilter.GaussianBlur(1.1))
ruido = Image.effect_noise((OW, OH), 10).point(lambda v: v // 2)
foto = ImageChops.add(foto, ruido, scale=1.0, offset=-64)
foto.convert('RGB').save(OUT + '.jpg', quality=86)
print('escrito', OUT + '.jpg', foto.size)
