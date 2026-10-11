#!/usr/bin/env python3
"""
Integra la cabecera v2 (cabecera_v2.pdf, generada por generar_cabecera_v2.py) en
la plantilla A4 completa, conservando intacto el cuerpo de preguntas de la
plantilla base.

Cómo lo hace: la plantilla base (exportada de LibreOffice) dibuja cada elemento
en un bloque q…Q. Se eliminan del flujo de contenido los bloques cuyo dibujo
cae por completo en la franja de la cabecera (los primeros 30 mm: marcadores,
casilleros, letras, tira de parches, "Nombre:", "Fecha:", "F") y sus imágenes
dejan de referenciarse; después se superpone la página de la cabecera v2.

Uso: python3 templates/integrar_cabecera_v2.py <base.pdf> <cabecera_v2.pdf> <salida.pdf>
"""
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, NameObject, ArrayObject

BASE, CABECERA, SALIDA = sys.argv[1], sys.argv[2], sys.argv[3]
FRANJA_MM = 30.0                 # alto de la franja de cabecera a vaciar (desde arriba)
PT = 25.4 / 72

w = PdfWriter(clone_from=BASE)
page = w.pages[0]
alto_mm = float(page.mediabox.height) * PT
limite_pt = (alto_mm - FRANJA_MM) / PT     # coordenada y (PDF, desde abajo) del borde inferior de la franja

cs = ContentStream(page.get_contents(), w)
ops = cs.operations

def _op(o):
    return o.decode() if isinstance(o, bytes) else str(o)

# Agrupar operaciones en bloques q…Q "de elemento". LibreOffice envuelve toda la
# página en un q…Q exterior y dibuja cada elemento en un q…Q anidado; se toma el
# nivel de anidamiento en el que hay más bloques (el de los elementos).
from collections import Counter
depth = 0; conteo = Counter()
for operands, op in ops:
    op = _op(op)
    if op == 'q': conteo[depth] += 1; depth += 1
    elif op == 'Q': depth -= 1
nivel = max(conteo, key=lambda d: conteo[d]) if conteo else 0
grupos = []            # (inicio, fin) inclusive
depth = 0; inicio = None
for i, (operands, op) in enumerate(ops):
    op = _op(op)
    if op == 'q':
        if depth == nivel: inicio = i
        depth += 1
    elif op == 'Q':
        depth -= 1
        if depth == nivel and inicio is not None:
            grupos.append((inicio, i)); inicio = None

def ys_del_grupo(a, b):
    """Coordenadas y (PDF) que toca el bloque, e indicador de si es el fondo de página."""
    ys = []; fondo = False; cm_y = None; cm_h = 0
    for operands, op in ops[a:b + 1]:
        op = _op(op)
        try:
            if op == 're':
                x, y, w, h = map(float, operands)
                if w * PT > 200 and h * PT > 280: fondo = True
                ys += [y, y + h]
            elif op in ('m', 'l'):
                ys.append(float(operands[1]))
            elif op == 'c':
                ys += [float(operands[1]), float(operands[3]), float(operands[5])]
            elif op in ('v', 'y'):
                ys += [float(operands[1]), float(operands[3])]
            elif op == 'Td':
                ys.append(float(operands[1]))           # inicio de línea (BT nuevo → absoluto)
            elif op == 'Tm':
                ys.append(float(operands[5]))
            elif op == 'cm':
                cm_y = float(operands[5]); cm_h = abs(float(operands[3]))
            elif op == 'Do' and cm_y is not None:
                ys += [cm_y, cm_y + cm_h]
        except Exception:
            pass
    return ys, fondo

eliminar = set(); imagenes_quitadas = set()
for a, b in grupos:
    ys, fondo = ys_del_grupo(a, b)
    if fondo or not ys: continue
    if min(ys) >= limite_pt:                    # todo el bloque dentro de la franja de cabecera
        eliminar.update(range(a, b + 1))
        for operands, op in ops[a:b + 1]:
            if _op(op) == 'Do': imagenes_quitadas.add(str(operands[0]))

nuevas = [o for i, o in enumerate(ops) if i not in eliminar]
cs.operations = nuevas
page.replace_contents(cs)

# Quitar las imágenes de la cabecera antigua de los recursos de la página
res = page['/Resources']
if '/XObject' in res:
    xo = res['/XObject']
    for nombre in list(xo.keys()):
        if nombre in imagenes_quitadas:
            del xo[nombre]

# Superponer la cabecera v2
cab = PdfReader(CABECERA).pages[0]
page.merge_page(cab)

w.add_metadata({'/Title': 'Plantilla OMR A4 (cabecera v2)'})
with open(SALIDA, 'wb') as f:
    w.write(f)
print(f'nivel de elementos: {nivel} · bloques q…Q: {len(grupos)} · bloques eliminados: {sum(1 for a, b in grupos if a in eliminar)} · operaciones eliminadas: {len(eliminar)} · imágenes quitadas: {sorted(imagenes_quitadas)}')
print('escrito:', SALIDA)
