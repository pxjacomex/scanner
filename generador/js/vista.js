// ============================================================================
// VISTA PREVIA E IMPRESIÓN
// Dibuja las páginas tal como se imprimen (cada prueba ocupa media hoja A4
// horizontal: 210 × 148,5 mm, con la cabecera OMR arriba de la cara 1),
// reparte las preguntas entre las dos caras midiendo el alto real, compone
// las hojas A4 (dos pruebas por hoja) y maneja los botones de imprimir.
// También expone el dibujo de una pregunta (nodoPregunta) que reutilizan el
// editor del banco y el selector de preguntas.
// ============================================================================
'use strict';

const VISTA = {
  prueba: null,        // prueba mostrada (con `formas`)
  cabeceras: {},       // data URL de la cabecera por casilla F (0 = sin marcar)
  escala: 1,
  avisosPaginacion: [],
};

// Geometría de img/cabecera_v2.png: recorte de la cabecera v2 (x 0..210 mm,
// y 1,0..24,5 mm de la página) a 600 dpi. Casillas F en coordenadas de página
// (templates/generar_cabecera_v2.py): centros (187,1; 5,70) y (193,9; 5,70),
// lado 4 mm.
const CABECERA = {
  src: 'img/cabecera_v2.png',
  ancho_mm: 210, alto_mm: 23.5, y0_mm: 1.0,
  F: { 1: { cx: 187.1, cy: 5.70 }, 2: { cx: 193.9, cy: 5.70 } },
  lado_mm: 4.0,
};

let _cabeceraPromesa = null;
function cargarCabecera() {
  if (!_cabeceraPromesa) {
    _cabeceraPromesa = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen de la cabecera (img/cabecera_v2.png)'));
      img.src = CABECERA.src;
    });
  }
  return _cabeceraPromesa;
}

// Cabecera con la casilla F pintada (F = 1 o 2); F = 0 → sin marcar.
async function cabeceraConF(F) {
  if (VISTA.cabeceras[F]) return VISTA.cabeceras[F];
  const img = await cargarCabecera();
  if (!F || !CABECERA.F[F]) { VISTA.cabeceras[F] = img.src; return img.src; }
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pxPorMm = img.naturalWidth / CABECERA.ancho_mm;
    const f = CABECERA.F[F];
    const lado = CABECERA.lado_mm * pxPorMm;
    ctx.fillStyle = '#000';
    ctx.fillRect(f.cx * pxPorMm - lado / 2, (f.cy - CABECERA.y0_mm) * pxPorMm - lado / 2, lado, lado);
    const url = c.toDataURL('image/png');
    VISTA.cabeceras[F] = url;
    return url;
  } catch (e) {
    // Lienzo "contaminado" (p. ej. abriendo el archivo con file://): se usa la
    // cabecera sin marcar y un cuadro negro superpuesto (ver .marca-f en CSS).
    console.warn('Cabecera sin canvas:', e);
    VISTA.cabeceras[F] = img.src;
    return img.src;
  }
}

// ============================================
// DIBUJO DE UNA PREGUNTA (compartido)
// ============================================
function el(tag, clase, html) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (html != null) n.innerHTML = html;
  return n;
}

function crearImagenPregunta(imagen) {
  const img = document.createElement('img');
  img.src = imagen.datos;
  img.alt = '';
  img.style.width = imagen.ancho_mm + 'mm';
  if (imagen.ancho_px && imagen.alto_px) {
    img.style.height = (imagen.ancho_mm * imagen.alto_px / imagen.ancho_px) + 'mm';
  }
  return img;
}

// Según el largo de las opciones: 4 por fila, 2 por fila o una por línea.
function distribucionOpciones(opciones) {
  const max = Math.max(0, ...opciones.map((o) => textoPlano(o.texto).length));
  if (max <= 14) return 'fila';
  if (max <= 48) return 'cuadricula';
  return 'lista';
}

// item: { numero, enunciado, opciones: [{ texto, correcta }] }
// imagen: la de la pregunta (o null). opts.marcarCorrecta resalta la correcta.
function nodoPregunta(item, imagen, opts) {
  opts = opts || {};
  const div = el('div', 'pregunta');
  if (imagen && imagen.datos && imagen.posicion !== 'abajo') {
    const img = crearImagenPregunta(imagen);
    img.classList.add('fig-der');
    div.appendChild(img);
  }
  const enun = el('div', 'enunciado');
  enun.innerHTML = `<span class="num">${item.numero}.</span> ${textoEnriquecido(item.enunciado)}`;
  div.appendChild(enun);
  if (imagen && imagen.datos && imagen.posicion === 'abajo') {
    const fig = el('div', 'fig-abajo');
    fig.appendChild(crearImagenPregunta(imagen));
    div.appendChild(fig);
  }
  const ops = el('div', 'opciones ' + distribucionOpciones(item.opciones));
  item.opciones.forEach((o, i) => {
    const d = el('div', 'opcion' + (opts.marcarCorrecta && o.correcta ? ' correcta' : ''));
    d.innerHTML = `<span class="letra">${MODELO.LETRAS[i] || '?'})</span> <span class="txt">${textoEnriquecido(o.texto)}</span>`;
    ops.appendChild(d);
  });
  div.appendChild(ops);
  div.appendChild(el('div', 'limpiar'));
  return div;
}

// Monta un nodo de pregunta en un "papel" de vista previa (editor y modal).
// Con anchoReal, el interior mide lo mismo que el área impresa (198 mm) y se
// reduce con transform para que quepa: las líneas se cortan igual que en la
// hoja. Sin anchoReal (panel estrecho del editor) ocupa el ancho disponible
// con la letra a tamaño legible.
const PAPEL_ANCHO_MM = 198;
function montarPapel(papel, nodo, fuentePt, anchoReal) {
  papel.innerHTML = '';
  const interior = el('div', 'papel-interior' + (anchoReal ? ' real' : ''));
  if (anchoReal) interior.style.width = PAPEL_ANCHO_MM + 'mm';
  interior.style.fontSize = (fuentePt || 10) + 'pt';
  interior.appendChild(nodo);
  papel.appendChild(interior);
  papel.style.height = '';
  if (anchoReal) ajustarPapel(papel);
}

function ajustarPapel(papel) {
  const interior = papel.firstElementChild;
  if (!interior || !interior.classList.contains('real') || !papel.clientWidth) return;
  const estilo = getComputedStyle(papel);
  const disponible = papel.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
  const escala = Math.min(1, disponible / interior.offsetWidth);
  interior.style.transform = `scale(${escala})`;
  papel.style.height = (interior.offsetHeight * escala + parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom)) + 'px';
}

function ajustarPapelesVisibles() {
  document.querySelectorAll('.papel').forEach((p) => { if (p.offsetParent) ajustarPapel(p); });
}

// ============================================
// PÁGINAS
// ============================================
function tituloPrueba(prueba) {
  return prueba.titulo.trim() || 'Prueba';
}

// Media hoja (210 × 148,5 mm). cara = 1 (con cabecera OMR) o 2 (dorso).
function construirMedia(prueba, forma, cara, cabeceraURL) {
  const media = el('div', `media forma-${forma.letra} cara-${cara}`);
  const caraEl = el('div', 'cara');
  caraEl.style.fontSize = prueba.opciones.fuente_pt + 'pt';
  media.appendChild(caraEl);

  if (cara === 1) {
    const cab = el('div', 'cabecera-omr');
    cab.style.width = prueba.opciones.ancho_cabecera_mm + 'mm';
    const img = document.createElement('img');
    img.src = cabeceraURL;
    img.alt = 'Cabecera OMR';
    img.style.width = '100%';
    img.style.height = (prueba.opciones.ancho_cabecera_mm * CABECERA.alto_mm / CABECERA.ancho_mm) + 'mm';
    cab.appendChild(img);
    // Si el lienzo no pudo pintar la F (file://), se superpone un cuadro negro.
    if (prueba.opciones.marcar_F && cabeceraURL && !/^data:/.test(cabeceraURL) && CABECERA.F[forma.F]) {
      const f = CABECERA.F[forma.F];
      const m = el('div', 'marca-f');
      m.style.left = ((f.cx - CABECERA.lado_mm / 2) / CABECERA.ancho_mm * 100) + '%';
      m.style.top = ((f.cy - CABECERA.y0_mm - CABECERA.lado_mm / 2) / CABECERA.alto_mm * 100) + '%';
      m.style.width = (CABECERA.lado_mm / CABECERA.ancho_mm * 100) + '%';
      m.style.height = (CABECERA.lado_mm / CABECERA.alto_mm * 100) + '%';
      cab.appendChild(m);
    }
    caraEl.appendChild(cab);

    const tit = el('div', 'titulo-prueba');
    const partes = [];
    if (prueba.curso.trim()) partes.push(escapeHtml(prueba.curso.trim()));
    if (prueba.fecha.trim()) partes.push('Fecha: ' + escapeHtml(prueba.fecha.trim()));
    tit.innerHTML = `<span class="titulo">${escapeHtml(tituloPrueba(prueba))}</span>`
      + `<span class="forma">Forma ${forma.letra}</span>`
      + (partes.length ? `<span class="detalle">${partes.join(' · ')}</span>` : '');
    caraEl.appendChild(tit);
    if (prueba.instrucciones.trim()) {
      caraEl.appendChild(el('div', 'instrucciones', textoEnriquecido(prueba.instrucciones.trim())));
    }
  } else {
    const mini = el('div', 'mini-cabecera');
    mini.innerHTML = `<span class="titulo">${escapeHtml(tituloPrueba(prueba))}</span>`
      + `<span class="forma">Forma ${forma.letra}</span>`
      + (prueba.opciones.mostrar_nombre_cara2 !== false ? '<span class="nombre">Nombre: <span class="linea"></span></span>' : '');
    caraEl.appendChild(mini);
  }
  caraEl.appendChild(el('div', 'cuerpo'));
  return media;
}

function desborda(media) {
  const cara = media.firstElementChild;
  return cara.scrollHeight > cara.clientHeight + 1;
}

// Reparte las preguntas de una forma entre sus dos caras.
function paginarForma(prueba, forma, media1, media2) {
  const avisos = [];
  const snapshot = prueba.formas.snapshot || {};
  const nodos = forma.items.map((it) => nodoPregunta(it, (snapshot[it.preguntaId] || {}).imagen, {}));
  const c1 = media1.querySelector('.cuerpo');
  const c2 = media2.querySelector('.cuerpo');
  const pref = prueba.opciones.preguntas_cara1;
  const automatico = pref === 'auto' || pref == null || pref === '';
  let enCara1 = automatico ? nodos.length : clamp(parseInt(pref, 10) || 0, 0, nodos.length);
  nodos.forEach((n, i) => (i < enCara1 ? c1 : c2).appendChild(n));
  if (automatico) {
    while (desborda(media1) && c1.children.length > 1) {
      c2.insertBefore(c1.lastElementChild, c2.firstChild);
    }
  }
  if (desborda(media1)) avisos.push(`Forma ${forma.letra}: la cara 1 no cabe (reduce la letra o el ancho de las imágenes, o pasa preguntas a la cara 2).`);
  if (desborda(media2)) avisos.push(`Forma ${forma.letra}: la cara 2 no cabe (reduce la letra o el ancho de las imágenes).`);
  return avisos;
}

function lineaCorte() {
  return el('div', 'linea-corte', '<span>✂</span>');
}

function esperarImagenes(raiz) {
  const imgs = Array.from(raiz.querySelectorAll('img'));
  return Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
}

// Dibuja la prueba actual en #hojas. Debe llamarse con la pestaña visible
// (si está oculta no se pueden medir las alturas).
async function vistaRenderizar() {
  const prueba = VISTA.prueba;
  const hojas = document.getElementById('hojas');
  hojas.innerHTML = '';
  if (!prueba || !prueba.formas) return;
  const op = prueba.opciones;
  const [urlA, urlB] = await Promise.all([
    cabeceraConF(op.marcar_F ? prueba.formas.A.F : 0),
    cabeceraConF(op.marcar_F ? prueba.formas.B.F : 0),
  ]);
  const A1 = construirMedia(prueba, prueba.formas.A, 1, urlA);
  const A2 = construirMedia(prueba, prueba.formas.A, 2, urlA);
  const B1 = construirMedia(prueba, prueba.formas.B, 1, urlB);
  const B2 = construirMedia(prueba, prueba.formas.B, 2, urlB);

  if (op.disposicion === 'a5') {
    [[A1, 1], [A2, 2], [B1, 1], [B2, 2]].forEach(([m, cara]) => {
      const h = el('div', `hoja a5 cara-${cara}`);
      h.appendChild(m);
      hojas.appendChild(h);
    });
  } else {
    const h1 = el('div', 'hoja a4 cara-1');
    h1.appendChild(A1); h1.appendChild(lineaCorte()); h1.appendChild(B1);
    const h2 = el('div', 'hoja a4 cara-2');
    const [arriba, abajo] = op.invertir_dorso ? [B2, A2] : [A2, B2];
    h2.appendChild(arriba); h2.appendChild(lineaCorte()); h2.appendChild(abajo);
    hojas.appendChild(h1); hojas.appendChild(h2);
  }
  // Etiquetas de cada hoja (solo pantalla)
  Array.from(hojas.children).forEach((h, i) => {
    const et = el('div', 'etiqueta-hoja');
    if (op.disposicion === 'a5') {
      const m = h.firstElementChild;
      et.textContent = `Página ${i + 1} · Forma ${m.classList.contains('forma-A') ? 'A' : 'B'} · ${m.classList.contains('cara-1') ? 'cara 1 (frente)' : 'cara 2 (dorso)'}`;
    } else {
      et.textContent = i === 0 ? 'Hoja A4 · cara 1 (frente): arriba Forma A, abajo Forma B'
        : `Hoja A4 · cara 2 (dorso): arriba Forma ${op.invertir_dorso ? 'B' : 'A'}, abajo Forma ${op.invertir_dorso ? 'A' : 'B'}`;
    }
    h.insertBefore(et, h.firstChild);
  });

  await esperarImagenes(hojas);
  VISTA.avisosPaginacion = [].concat(
    paginarForma(prueba, prueba.formas.A, A1, A2),
    paginarForma(prueba, prueba.formas.B, B1, B2),
  );
  vistaAjustarEscala();
  vistaRenderAvisos();
}

function vistaAjustarEscala() {
  const wrap = document.getElementById('hojasWrap');
  const hojas = document.getElementById('hojas');
  if (!hojas.firstElementChild) { wrap.style.height = ''; return; }
  const anchoHoja = hojas.firstElementChild.offsetWidth;
  const escala = Math.min(1, (wrap.clientWidth - 4) / anchoHoja);
  VISTA.escala = escala;
  hojas.style.transform = `scale(${escala})`;
  wrap.style.height = Math.ceil(hojas.offsetHeight * escala) + 'px';
}

function vistaRenderAvisos() {
  const cont = document.getElementById('vistaAvisos');
  const prueba = VISTA.prueba;
  const lista = [];
  if (prueba && prueba.formas) {
    (prueba.formas.avisos || []).forEach((a) => lista.push({ tipo: 'warn', texto: a }));
    if (prueba.formas.A.items.length !== MODELO.N_PREGUNTAS) {
      lista.push({ tipo: 'warn', texto: `La prueba tiene ${prueba.formas.A.items.length} preguntas; el Calificador OMR lee ${MODELO.N_PREGUNTAS} (P1 a P5).` });
    }
  }
  VISTA.avisosPaginacion.forEach((a) => lista.push({ tipo: 'error', texto: a }));
  cont.innerHTML = lista.map((a) => `<div class="aviso-item ${a.tipo}">${escapeHtml(a.texto)}</div>`).join('');
  cont.classList.toggle('hidden', lista.length === 0);
}

// ============================================
// CLAVES
// ============================================
function vistaRenderClaves() {
  const prueba = VISTA.prueba;
  const cont = document.getElementById('vistaClaves');
  if (!prueba || !prueba.formas) { cont.innerHTML = ''; return; }
  const { A, B, snapshot } = prueba.formas;
  const filas = A.items.map((_, i) => {
    const a = A.items[i], b = B.items[i];
    const desc = (it) => {
      const set = it.setIndice != null ? ` · set ${it.setIndice + 1}` : '';
      return `<span class="clave-letra">${it.correcta}</span> <span class="clave-desc">${textoEnriquecido(recortar(String(it.enunciado).replace(/\s+/g, ' ').trim(), 70))}${set}</span>`;
    };
    return `<tr><td>${i + 1}</td><td>${desc(a)}</td><td>${desc(b)}</td></tr>`;
  }).join('');
  const encabezado = [tituloPrueba(prueba), prueba.curso.trim(), prueba.fecha.trim()].filter(Boolean).map(escapeHtml).join(' · ');
  cont.innerHTML = `
    <div class="claves-resumen">
      <div class="claves-prueba">${encabezado}</div>
      <div><b>Forma A</b> (casilla F = ${A.F}): <code>${escapeHtml(claveTexto(A))}</code></div>
      <div><b>Forma B</b> (casilla F = ${B.F}): <code>${escapeHtml(claveTexto(B))}</code></div>
      <div class="field-note">En el Calificador OMR, pestaña Clave: "Formato 1" es la Forma A y "Formato 2" la Forma B. Si la casilla F va impresa ya marcada, el calificador elige la clave solo.</div>
    </div>
    <div class="table-wrap"><table class="tabla-claves">
      <thead><tr><th>#</th><th>Forma A</th><th>Forma B</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`;
}

// ============================================
// CONTROL DE LA PESTAÑA
// ============================================
async function vistaMostrar(prueba) {
  VISTA.prueba = prueba;
  const vacia = document.getElementById('vistaVacia');
  const cont = document.getElementById('vistaContenido');
  const hay = !!(prueba && prueba.formas);
  vacia.classList.toggle('hidden', hay);
  cont.classList.toggle('hidden', !hay);
  if (!hay) { document.getElementById('hojas').innerHTML = ''; return; }
  document.getElementById('vistaTitulo').textContent = tituloPrueba(prueba) + (prueba.curso ? ' · ' + prueba.curso : '');
  document.getElementById('vistaMeta').textContent = `Generada el ${fechaCorta(prueba.formas.generada)} · semilla ${prueba.formas.semilla}`;
  const op = prueba.opciones;
  document.getElementById('vistaDisposicion').value = op.disposicion || 'a4';
  document.getElementById('vistaInvertir').checked = !!op.invertir_dorso;
  const selCara = document.getElementById('vistaCara1');
  const n = prueba.formas.A.items.length;
  selCara.innerHTML = '<option value="auto">Automático</option>' + Array.from({ length: n + 1 }, (_, k) => `<option value="${k}">${k} en la cara 1</option>`).join('');
  selCara.value = (op.preguntas_cara1 === 'auto' || op.preguntas_cara1 == null) ? 'auto' : String(op.preguntas_cara1);
  document.getElementById('vistaInvertirWrap').classList.toggle('hidden', op.disposicion === 'a5');
  vistaRenderClaves();
  switchSection('vista');
  await vistaRenderizar();
}

// Cambios en los controles de la vista (se guardan en la prueba).
async function vistaOpcion(nombre, valor) {
  const prueba = VISTA.prueba;
  if (!prueba) return;
  prueba.opciones[nombre] = valor;
  prueba.modificada = ahoraISO();
  document.getElementById('vistaInvertirWrap').classList.toggle('hidden', prueba.opciones.disposicion === 'a5');
  await guardarPruebaSilenciosa(prueba);
  await vistaRenderizar();
}

async function guardarPruebaSilenciosa(prueba) {
  try {
    await bdGuardar(BD_PRUEBAS, prueba);
    if (ARMADO.prueba && ARMADO.prueba.id === prueba.id) {
      ARMADO.prueba.opciones = Object.assign({}, prueba.opciones);
      armarGuardarBorrador();
    }
  } catch (e) { toast('No se pudo guardar la prueba: ' + e.message, 'error'); }
}

function estiloDePagina(disposicion) {
  return disposicion === 'a5'
    ? '@page { size: 210mm 148.5mm; margin: 0; }'
    : '@page { size: A4 portrait; margin: 0; }';
}

// modo: 'todo' | 'cara1' | 'cara2' | 'claves'
function vistaImprimir(modo) {
  const prueba = VISTA.prueba;
  if (!prueba || !prueba.formas) { toast('No hay ninguna prueba para imprimir', 'error'); return; }
  document.getElementById('estiloPagina').textContent = modo === 'claves'
    ? '@page { size: A4 portrait; margin: 15mm; }'
    : estiloDePagina(prueba.opciones.disposicion);
  document.body.classList.remove('imprimir-cara1', 'imprimir-cara2', 'imprimir-claves');
  if (modo === 'cara1') document.body.classList.add('imprimir-cara1');
  if (modo === 'cara2') document.body.classList.add('imprimir-cara2');
  if (modo === 'claves') document.body.classList.add('imprimir-claves');
  const limpiar = () => {
    document.body.classList.remove('imprimir-cara1', 'imprimir-cara2', 'imprimir-claves');
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  // Pequeña espera para que el navegador aplique las clases antes del diálogo.
  setTimeout(() => window.print(), 50);
}

function vistaExportar() {
  const prueba = VISTA.prueba;
  if (!prueba) return;
  const nombre = `prueba_${nombreArchivoSeguro(prueba.titulo, 'sin_titulo')}_${fechaParaNombre()}.json`;
  descargarArchivo(nombre, JSON.stringify({ tipo: 'prueba-generador-omr', version: 1, exportado: ahoraISO(), prueba }, null, 1), 'application/json');
  toast('Prueba exportada: ' + nombre);
}

function vistaEditar() {
  if (!VISTA.prueba) return;
  armarCargarPrueba(VISTA.prueba);
}

async function vistaRemezclar() {
  const prueba = VISTA.prueba;
  if (!prueba) return;
  try {
    prueba.formas = regenerarFormas(prueba, semillaNueva());
    prueba.modificada = ahoraISO();
    await guardarPruebaSilenciosa(prueba);
    await vistaMostrar(prueba);
    toast('Formas A y B generadas de nuevo');
  } catch (e) {
    toast(e.message, 'error');
  }
}

window.addEventListener('resize', debounce(() => {
  if (document.getElementById('section-vista').classList.contains('active')) vistaAjustarEscala();
  ajustarPapelesVisibles();
}, 150));
