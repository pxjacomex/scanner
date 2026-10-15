#!/usr/bin/env python3
"""
Genera la cabecera v2 como dibujo editable de LibreOffice Draw (.odg): página
A4 con cada elemento como forma independiente (casilleros con su letra,
marcadores ArUco como imágenes, tira de parches, rótulos, líneas guía).
Mismas medidas en mm que generar_cabecera_v2.py, así la calibración de la app
sigue siendo válida si se edita sin mover casilleros, marcadores ni parches.

Uso: python3 templates/generar_cabecera_v2_odg.py <carpeta_marcadores_png> <salida.odg>
     (marcadores DICT_4X4_50 aruco_0.png .. aruco_5.png, 6x6 celdas)
"""
import sys, zipfile, glob, os
from xml.sax.saxutils import escape

MARK_DIR, OUT = sys.argv[1], sys.argv[2]

# ----------------------------- geometría (mm de página) -----------------------------
MARCADORES = {0: (6.6, 6.09, 6.0), 1: (203.4, 6.09, 6.0), 2: (6.6, 19.89, 6.0), 3: (203.4, 19.89, 6.0),
              4: (122.99, 14.03, 5.0), 5: (122.99, 20.83, 5.0)}      # cx, cy, lado
BOX = 4.0
PREG = {'P1': (96.79, 14.03), 'P2': (96.79, 20.83), 'P3': (135.19, 14.03), 'P4': (135.19, 20.83), 'P5': (173.60, 14.05)}
LABEL_GAP = 2.5
X0_TIRA, BW, CY_TIRA, BH = 171.40, 24.9 / 4, 20.54, 6.4
TONOS = ['#ffffff', '#ababab', '#545454', '#000000']
strip = sorted(glob.glob(os.path.join(MARK_DIR, '..', 'pdf', 'Im143*')))
if strip:
    from PIL import Image
    im = Image.open(strip[0]).convert('L'); w, h = im.size
    TONOS = ['#%02x%02x%02x' % ((v,) * 3) for v in [im.getpixel((int(w * (i + 0.5) / 4), h // 2)) for i in range(4)]]

def mm(v): return f'{v:.2f}mm'
shapes = []
def rect(name, style, x, y, w, h, texto=None, pstyle='Pletra'):
    inner = f'<text:p text:style-name="{pstyle}">{escape(texto)}</text:p>' if texto is not None else ''
    shapes.append(f'<draw:rect draw:name="{escape(name)}" draw:style-name="{style}" draw:layer="layout" '
                  f'svg:x="{mm(x)}" svg:y="{mm(y)}" svg:width="{mm(w)}" svg:height="{mm(h)}">{inner}</draw:rect>')
def text(name, x, y, w, h, texto, pstyle, style='gtexto'):
    shapes.append(f'<draw:frame draw:name="{escape(name)}" draw:style-name="{style}" draw:layer="layout" '
                  f'svg:x="{mm(x)}" svg:y="{mm(y)}" svg:width="{mm(w)}" svg:height="{mm(h)}">'
                  f'<draw:text-box><text:p text:style-name="{pstyle}">{escape(texto)}</text:p></draw:text-box></draw:frame>')
def line(name, x1, y1, x2, y2, style='glinea'):
    shapes.append(f'<draw:line draw:name="{escape(name)}" draw:style-name="{style}" draw:layer="layout" '
                  f'svg:x1="{mm(x1)}" svg:y1="{mm(y1)}" svg:x2="{mm(x2)}" svg:y2="{mm(y2)}"/>')
def image(name, href, x, y, w, h):
    shapes.append(f'<draw:frame draw:name="{escape(name)}" draw:style-name="gimagen" draw:layer="layout" '
                  f'svg:x="{mm(x)}" svg:y="{mm(y)}" svg:width="{mm(w)}" svg:height="{mm(h)}">'
                  f'<draw:image xlink:href="{href}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>')

# Marcadores ArUco (imágenes incrustadas)
pictures = {}
for id_, (cx, cy, lado) in MARCADORES.items():
    href = f'Pictures/aruco_{id_}.png'
    pictures[href] = os.path.join(MARK_DIR, f'aruco_{id_}.png')
    image(f'ArUco {id_}', href, cx - lado / 2, cy - lado / 2, lado, lado)
# Nombre / Fecha
text('Rótulo Nombre', 14.6, 2.8, 20, 6, 'Nombre:', 'Protulo')
text('Rótulo Fecha', 124.8, 2.4, 16, 6, 'Fecha:', 'Protulo')
line('Línea nombre', 31.5, 8.9, 119.0, 8.9)
line('Línea fecha', 138.5, 8.9, 177.0, 8.9)
# Código del estudiante: dos filas de 10 dígitos
for i in range(10):
    rect(f'D1_{i}', 'gcaja', 17.0 + 6.8 * i - BOX / 2, 14.00 - BOX / 2, BOX, BOX, str(i))
    rect(f'D2_{i}', 'gcaja', 17.0 + 6.8 * i - BOX / 2, 20.80 - BOX / 2, BOX, BOX, str(i))
text('Rótulo ID', 10.4, 15.9, 4.0, 3.0, 'ID', 'Pid')
# Preguntas
for nombre, (x0, y) in PREG.items():
    for j, letra in enumerate('ABCD'):
        rect(f'{nombre}_{letra}', 'gcaja', x0 + 6.8 * j - BOX / 2, y - BOX / 2, BOX, BOX, letra)
    text(f'Rótulo {nombre}', x0 - BOX / 2 - LABEL_GAP - 8.0, y - 2.2, 8.0, 4.4, nombre, 'Ppregunta')
# Formato
text('Rótulo F', 179.2, 2.5, 5, 6, 'F', 'Pf')
rect('F_1', 'gcaja', 187.1 - BOX / 2, 5.70 - BOX / 2, BOX, BOX, '1')
rect('F_2', 'gcaja', 193.9 - BOX / 2, 5.70 - BOX / 2, BOX, BOX, '2')
# Tira de parches de tono
for i, (tono, nombre) in enumerate(zip(TONOS, ['blanco', 'gris claro', 'gris oscuro', 'negro'])):
    rect(f'Parche {nombre}', f'gparche{i}', X0_TIRA + BW * i, CY_TIRA - BH / 2, BW, BH)
rect('Contorno parches', 'gcontorno', X0_TIRA, CY_TIRA - BH / 2, BW * 4, BH)
# Instrucción (fuera de la zona rectificada)
text('Instrucción', 16.5, 25.6, 150, 4, 'Marca rellenando todo el cuadro ■ con lápiz o bolígrafo. Un solo cuadro por pregunta. No uses X ni círculos.', 'Pinstr')

tono_styles = ''.join(
    f'<style:style style:name="gparche{i}" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="solid" draw:fill-color="{t}"/></style:style>'
    for i, t in enumerate(TONOS))

content = f'''<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3">
 <office:font-face-decls><style:font-face style:name="Liberation Sans" svg:font-family="'Liberation Sans'" style:font-family-generic="swiss"/></office:font-face-decls>
 <office:automatic-styles>
  <style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties draw:background-size="border" draw:fill="none"/></style:style>
  <style:style style:name="gcaja" style:family="graphic"><style:graphic-properties draw:stroke="solid" svg:stroke-width="0.30mm" svg:stroke-color="#333333" draw:fill="solid" draw:fill-color="#ffffff" draw:textarea-horizontal-align="center" draw:textarea-vertical-align="middle" fo:padding-top="0mm" fo:padding-bottom="0mm" fo:padding-left="0mm" fo:padding-right="0mm"/></style:style>
  <style:style style:name="gcontorno" style:family="graphic"><style:graphic-properties draw:stroke="solid" svg:stroke-width="0.15mm" svg:stroke-color="#999999" draw:fill="none"/></style:style>
  <style:style style:name="gtexto" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" draw:textarea-vertical-align="middle" fo:padding-top="0mm" fo:padding-bottom="0mm" fo:padding-left="0mm" fo:padding-right="0mm" draw:auto-grow-height="false"/></style:style>
  <style:style style:name="glinea" style:family="graphic"><style:graphic-properties draw:stroke="solid" svg:stroke-width="0.20mm" svg:stroke-color="#999999"/></style:style>
  <style:style style:name="gimagen" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none"/></style:style>
  {tono_styles}
  <style:style style:name="Pletra" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="8pt" fo:color="#999999"/></style:style>
  <style:style style:name="Protulo" style:family="paragraph"><style:paragraph-properties fo:text-align="start"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="11pt" fo:color="#000000"/></style:style>
  <style:style style:name="Ppregunta" style:family="paragraph"><style:paragraph-properties fo:text-align="end"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="9pt" fo:font-weight="bold" fo:color="#000000"/></style:style>
  <style:style style:name="Pf" style:family="paragraph"><style:paragraph-properties fo:text-align="start"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="11pt" fo:font-weight="bold" fo:color="#000000"/></style:style>
  <style:style style:name="Pid" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="7pt" fo:color="#808080"/></style:style>
  <style:style style:name="Pinstr" style:family="paragraph"><style:paragraph-properties fo:text-align="start"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="7pt" fo:color="#595959"/></style:style>
 </office:automatic-styles>
 <office:body><office:drawing>
  <draw:page draw:name="Cabecera v2" draw:style-name="dp1" draw:master-page-name="Default">
   {''.join(shapes)}
  </draw:page>
 </office:drawing></office:body>
</office:document-content>'''

styles = '''<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" office:version="1.3">
 <office:automatic-styles>
  <style:page-layout style:name="PM0"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait"/></style:page-layout>
  <style:style style:name="Mdp1" style:family="drawing-page"><style:drawing-page-properties draw:background-size="border" draw:fill="none"/></style:style>
 </office:automatic-styles>
 <office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM0" draw:style-name="Mdp1"/></office:master-styles>
</office:document-styles>'''

manifest = ('<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
            '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.graphics"/>'
            '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
            '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>'
            + ''.join(f'<manifest:file-entry manifest:full-path="{h}" manifest:media-type="image/png"/>' for h in pictures)
            + '</manifest:manifest>')

with zipfile.ZipFile(OUT, 'w') as z:
    z.writestr(zipfile.ZipInfo('mimetype'), 'application/vnd.oasis.opendocument.graphics', compress_type=zipfile.ZIP_STORED)
    z.writestr('META-INF/manifest.xml', manifest, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('content.xml', content, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('styles.xml', styles, compress_type=zipfile.ZIP_DEFLATED)
    for href, path in pictures.items():
        z.write(path, href, compress_type=zipfile.ZIP_DEFLATED)
print('escrito:', OUT, '| formas:', len(shapes), '| tonos:', TONOS)
