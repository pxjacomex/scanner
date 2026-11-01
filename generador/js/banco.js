// ============================================================================
// PESTAÑA BANCO: lista de preguntas, editor y vista previa de cada pregunta.
// El banco vive en IndexedDB (ver almacen.js) y en memoria en BANCO.preguntas.
// ============================================================================
'use strict';

const BANCO = {
  preguntas: [],
  editando: null,      // copia de la pregunta en edición
  esNueva: false,
  setPreview: 0,       // set elegido en la vista previa del editor
  filtro: { texto: '', tema: '', tipo: '' },
  modalPregunta: null, // { pregunta, setIndice, alAgregar }
};

async function bancoCargar() {
  try {
    const lista = await bdTodos(BD_PREGUNTAS);
    BANCO.preguntas = lista.map(normalizarPregunta).filter(Boolean);
  } catch (e) {
    BANCO.preguntas = [];
    toast('No se pudo abrir el banco de preguntas: ' + e.message, 'error');
  }
  bancoOrdenar();
  bancoRender();
}

function bancoOrdenar() {
  BANCO.preguntas.sort((a, b) => (a.tema || '').localeCompare(b.tema || '', 'es') || (b.modificada || '').localeCompare(a.modificada || ''));
}

function bancoPorId() {
  return new Map(BANCO.preguntas.map((p) => [p.id, p]));
}

function bancoTemas() {
  return Array.from(new Set(BANCO.preguntas.map((p) => p.tema.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
}

function bancoFiltrar(preguntas, filtro) {
  const t = (filtro.texto || '').trim().toLowerCase();
  return preguntas.filter((p) => {
    if (filtro.tema && p.tema.trim() !== filtro.tema) return false;
    if (filtro.tipo && p.tipo !== filtro.tipo) return false;
    if (t) {
      const pajar = (p.enunciado + ' ' + p.tema + ' ' + p.opciones.map((o) => o.texto + ' ' + o.formula).join(' ')).toLowerCase();
      if (!pajar.includes(t)) return false;
    }
    return true;
  });
}

function etiquetaTipo(p) {
  return p.tipo === 'calculo' ? `🧮 Problema · ${p.sets.length} set${p.sets.length === 1 ? '' : 's'}` : '📝 Opciones fijas';
}

// Enunciado resuelto con el primer set, en una línea y recortado (conserva el
// markup: se muestra con textoEnriquecido).
function resumenPregunta(p, n) {
  const r = p.tipo === 'calculo' && p.sets.length ? resolverPregunta(p, 0, ',') : null;
  return recortar(String(r ? r.enunciado : p.enunciado).replace(/\s+/g, ' ').trim(), n || 150);
}

function bancoRender() {
  // Temas
  const selTema = document.getElementById('bancoTema');
  const temaActual = BANCO.filtro.tema;
  selTema.innerHTML = '<option value="">Todos los temas</option>' + bancoTemas().map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  selTema.value = bancoTemas().includes(temaActual) ? temaActual : '';
  BANCO.filtro.tema = selTema.value;
  // Datalist de temas para el editor
  const dl = document.getElementById('listaTemas');
  if (dl) dl.innerHTML = bancoTemas().map((t) => `<option value="${escapeHtml(t)}">`).join('');

  const lista = bancoFiltrar(BANCO.preguntas, BANCO.filtro);
  document.getElementById('bancoInfo').textContent = BANCO.preguntas.length === 0
    ? 'El banco está vacío. Crea una pregunta o carga las de ejemplo.'
    : `${lista.length} de ${BANCO.preguntas.length} pregunta${BANCO.preguntas.length === 1 ? '' : 's'}`;

  const cont = document.getElementById('bancoItems');
  if (lista.length === 0) {
    cont.innerHTML = BANCO.preguntas.length ? '<div class="card vacio">Ninguna pregunta coincide con el filtro.</div>' : '';
    return;
  }
  const enPrueba = new Set((ARMADO.prueba ? ARMADO.prueba.items : []).map((it) => it.preguntaId));
  cont.innerHTML = lista.map((p) => {
    const rev = comprobarPregunta(p);
    const estado = rev.errores.length ? `<span class="badge error" title="${escapeHtml(rev.errores.join('\n'))}">⚠ incompleta</span>`
      : rev.advertencias.length ? `<span class="badge warn" title="${escapeHtml(rev.advertencias.join('\n'))}">⚠ revisar</span>` : '';
    const thumb = p.imagen ? `<img class="miniatura" src="${p.imagen.datos}" alt="">` : '';
    return `
      <div class="item-pregunta" data-id="${p.id}">
        ${thumb}
        <div class="item-cuerpo">
          <div class="item-meta">
            ${p.tema ? `<span class="badge tema">${escapeHtml(p.tema)}</span>` : '<span class="badge">sin tema</span>'}
            <span class="badge">${etiquetaTipo(p)}</span>
            ${estado}
            ${enPrueba.has(p.id) ? '<span class="badge ok">en la prueba</span>' : ''}
          </div>
          <div class="item-texto">${textoEnriquecido(resumenPregunta(p))}</div>
          <div class="item-acciones">
            <button class="btn btn-ghost btn-mini" onclick="bancoVer('${p.id}')">👁️ Ver</button>
            <button class="btn btn-ghost btn-mini" onclick="bancoEditar('${p.id}')">✏️ Editar</button>
            <button class="btn btn-ghost btn-mini" onclick="bancoDuplicar('${p.id}')">⧉ Duplicar</button>
            <button class="btn btn-ghost btn-mini peligro" onclick="bancoEliminar('${p.id}')">🗑️ Eliminar</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function bancoFiltro(campo, valor) {
  BANCO.filtro[campo] = valor;
  bancoRender();
}

// ---- Acciones de la lista ----
function bancoNueva(tipo) {
  BANCO.editando = nuevaPregunta(tipo);
  BANCO.esNueva = true;
  editorAbrir();
}

function bancoEditar(id) {
  const p = bancoPorId().get(id);
  if (!p) return;
  BANCO.editando = copiaProfunda(p);
  BANCO.esNueva = false;
  editorAbrir();
}

async function bancoDuplicar(id) {
  const p = bancoPorId().get(id);
  if (!p) return;
  const copia = copiaProfunda(p);
  copia.id = uid('q');
  copia.creada = copia.modificada = ahoraISO();
  copia.enunciado = copia.enunciado + ' (copia)';
  await bancoGuardarPregunta(copia);
  toast('Pregunta duplicada');
}

async function bancoEliminar(id) {
  const p = bancoPorId().get(id);
  if (!p) return;
  const ok = await confirmar('¿Eliminar esta pregunta del banco?', recortar(textoPlano(p.enunciado), 120));
  if (!ok) return;
  try {
    await bdEliminar(BD_PREGUNTAS, id);
    BANCO.preguntas = BANCO.preguntas.filter((q) => q.id !== id);
    bancoRender();
    if (typeof armarRender === 'function') armarRender();
    toast('Pregunta eliminada');
  } catch (e) { toast('No se pudo eliminar: ' + e.message, 'error'); }
}

function bancoVer(id) {
  const p = bancoPorId().get(id);
  if (p) mostrarVistaPregunta(p, {});
}

async function bancoGuardarPregunta(p) {
  p.modificada = ahoraISO();
  await bdGuardar(BD_PREGUNTAS, p);
  const i = BANCO.preguntas.findIndex((q) => q.id === p.id);
  if (i >= 0) BANCO.preguntas[i] = p; else BANCO.preguntas.push(p);
  bancoOrdenar();
  bancoRender();
  if (typeof armarRender === 'function') armarRender();
}

// ---- Importar / exportar ----
function bancoExportar() {
  if (BANCO.preguntas.length === 0) { toast('El banco está vacío', 'error'); return; }
  const nombre = `banco_preguntas_${fechaParaNombre()}.json`;
  descargarArchivo(nombre, JSON.stringify({ tipo: 'banco-generador-omr', version: 1, exportado: ahoraISO(), preguntas: BANCO.preguntas }, null, 1), 'application/json');
  toast(`Banco exportado (${BANCO.preguntas.length} preguntas): ${nombre}`);
}

// Fusiona una lista de preguntas: las que ya existen (mismo id) se actualizan.
async function bancoFusionar(lista, origen) {
  const porId = bancoPorId();
  let nuevas = 0, actualizadas = 0, invalidas = 0;
  const aGuardar = [];
  lista.forEach((raw) => {
    const p = normalizarPregunta(raw);
    if (!p || !p.enunciado.trim()) { invalidas++; return; }
    if (porId.has(p.id)) actualizadas++; else nuevas++;
    aGuardar.push(p);
  });
  if (aGuardar.length) await bdGuardarVarios(BD_PREGUNTAS, aGuardar);
  await bancoCargar();
  toast(`${origen}: ${nuevas} nuevas, ${actualizadas} actualizadas${invalidas ? `, ${invalidas} descartadas` : ''}`);
}

async function bancoImportarArchivo(file) {
  if (!file) return;
  try {
    const datos = JSON.parse(await leerArchivoTexto(file));
    const lista = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.preguntas) ? datos.preguntas : null);
    if (!lista) throw new Error('El archivo no contiene una lista de preguntas');
    await bancoFusionar(lista, 'Banco importado');
  } catch (e) {
    toast('No se pudo importar: ' + e.message, 'error');
  }
}

async function bancoCargarEjemplos() {
  try {
    const resp = await fetch('banco/ejemplos.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const datos = await resp.json();
    await bancoFusionar(datos.preguntas || [], 'Preguntas de ejemplo');
  } catch (e) {
    toast('No se pudieron cargar los ejemplos (¿sin conexión o abriendo el archivo con file://?): ' + e.message, 'error');
  }
}

// ============================================
// EDITOR
// ============================================
function editorAbrir() {
  BANCO.setPreview = 0;
  document.getElementById('bancoLista').classList.add('hidden');
  document.getElementById('bancoEditor').classList.remove('hidden');
  editorRender();
  window.scrollTo({ top: 0 });
}

function editorCerrar() {
  BANCO.editando = null;
  document.getElementById('bancoEditor').classList.add('hidden');
  document.getElementById('bancoLista').classList.remove('hidden');
  bancoRender();
}

async function editorCancelar() {
  editorCerrar();
}

async function editorGuardar() {
  const p = BANCO.editando;
  if (!p) return;
  p.tema = p.tema.trim();
  const rev = comprobarPregunta(p);
  if (!p.enunciado.trim()) { toast('Escribe el enunciado antes de guardar', 'error'); return; }
  try {
    await bancoGuardarPregunta(p);
    toast(rev.errores.length ? 'Guardada, pero la pregunta está incompleta (ver avisos)' : 'Pregunta guardada', rev.errores.length ? 'warn' : 'success');
    editorCerrar();
  } catch (e) {
    toast('No se pudo guardar: ' + e.message, 'error');
  }
}

const SIMBOLOS = ['²', '³', '⁻¹', '°', '×', '÷', '±', '√', 'π', 'Δ', 'θ', 'α', 'μ', 'Ω', 'λ', '→', '≤', '≥', '≈', '·', '∞'];

function editorRender() {
  const p = BANCO.editando;
  const cont = document.getElementById('bancoEditor');
  const esCalc = p.tipo === 'calculo';
  cont.innerHTML = `
    <div class="editor-grid">
      <div class="editor-col">
        <div class="card">
          <div class="card-head">
            <h2>${BANCO.esNueva ? 'Nueva pregunta' : 'Editar pregunta'}</h2>
            <div class="segmento">
              <button type="button" class="${esCalc ? '' : 'activo'}" onclick="editorTipo('fija')">Opciones fijas</button>
              <button type="button" class="${esCalc ? 'activo' : ''}" onclick="editorTipo('calculo')">Problema con datos</button>
            </div>
          </div>
          <div class="form-group">
            <label>Tema (para filtrar el banco)</label>
            <input class="input" list="listaTemas" value="${escapeHtml(p.tema)}" oninput="editorCampo('tema', this.value)" placeholder="p. ej. Cinemática">
          </div>
          <div class="form-group">
            <label>Enunciado</label>
            <textarea class="input" id="editorEnunciado" rows="5" oninput="editorCampo('enunciado', this.value)" placeholder="${esCalc ? 'Un móvil parte del reposo con aceleración {a} m/s^{2} durante {t} s. ¿Qué distancia recorre?' : 'Escribe aquí la pregunta…'}">${escapeHtml(p.enunciado)}</textarea>
            <div class="simbolos">${SIMBOLOS.map((s) => `<button type="button" onclick="editorInsertar('${s}')">${s}</button>`).join('')}</div>
            <div class="field-note">${esCalc ? 'Escribe cada dato entre llaves con el nombre de su variable: <code>{v}</code>, <code>{t}</code>. ' : ''}Formato: <code>^{2}</code> superíndice, <code>_{0}</code> subíndice, <code>**negrita**</code>.</div>
          </div>
          <div class="form-group">
            <label>Imagen o diagrama (opcional)</label>
            <div class="imagen-ctl">
              ${p.imagen ? `<img class="imagen-preview" src="${p.imagen.datos}" alt="">` : '<div class="imagen-preview vacia">Sin imagen</div>'}
              <div class="imagen-campos">
                <input type="file" accept="image/*" id="editorImagenInput" style="display:none" onchange="editorImagen(this.files[0]); this.value='';">
                <div class="btn-row">
                  <button type="button" class="btn btn-secondary btn-inline" onclick="document.getElementById('editorImagenInput').click()">📂 ${p.imagen ? 'Cambiar' : 'Elegir imagen'}</button>
                  ${p.imagen ? '<button type="button" class="btn btn-ghost btn-inline" onclick="editorQuitarImagen()">✖ Quitar</button>' : ''}
                </div>
                ${p.imagen ? `
                <div class="grid-2">
                  <div class="form-group"><label>Ancho impreso (mm)</label>
                    <input class="input" type="number" min="15" max="190" step="1" value="${p.imagen.ancho_mm}" oninput="editorImagenCampo('ancho_mm', this.value)"></div>
                  <div class="form-group"><label>Posición</label>
                    <select class="select" onchange="editorImagenCampo('posicion', this.value)">
                      <option value="derecha" ${p.imagen.posicion === 'derecha' ? 'selected' : ''}>A la derecha del texto</option>
                      <option value="abajo" ${p.imagen.posicion === 'abajo' ? 'selected' : ''}>Debajo del enunciado</option>
                    </select></div>
                </div>` : '<div class="field-note">PNG, JPG o SVG. Se guarda en el dispositivo, reducida a 1400 px como máximo.</div>'}
              </div>
            </div>
          </div>
        </div>

        ${esCalc ? editorHtmlDatos(p) : ''}

        <div class="card">
          <h2>Opciones de respuesta</h2>
          <div class="field-note" style="margin-bottom:8px">Marca la correcta. ${esCalc ? 'Cada opción se calcula con una fórmula a partir de los datos (p. ej. <code>v*t</code>, <code>sqrt(2*h/g)</code>, <code>0.5*m*v^2</code>). Si una opción es un texto fijo ("No se puede determinar"), deja la fórmula vacía y escribe el texto.' : ''}</div>
          <div id="editorOpciones">${editorHtmlOpciones(p)}</div>
          ${esCalc ? `
          <div class="grid-3" style="margin-top:10px">
            <div class="form-group"><label>Redondeo</label>
              <select class="select" onchange="editorFormato('modo', this.value)">
                <option value="auto" ${p.formato.modo === 'auto' ? 'selected' : ''}>Hasta N decimales</option>
                <option value="fijo" ${p.formato.modo === 'fijo' ? 'selected' : ''}>N decimales fijos</option>
                <option value="sig" ${p.formato.modo === 'sig' ? 'selected' : ''}>N cifras significativas</option>
              </select></div>
            <div class="form-group"><label>N</label>
              <input class="input" type="number" min="0" max="8" value="${p.formato.decimales}" oninput="editorFormato('decimales', this.value)"></div>
            <div class="form-group"><label>Unidad (se añade al valor)</label>
              <input class="input" value="${escapeHtml(p.formato.unidad)}" oninput="editorFormato('unidad', this.value)" placeholder="m/s^{2}"></div>
          </div>` : ''}
          <label class="check-row" style="margin-top:6px">
            <input type="checkbox" ${p.mezclar ? 'checked' : ''} onchange="editorCampo('mezclar', this.checked)">
            <span>Mezclar el orden de las opciones en cada forma
              <span class="check-note">Desmárcalo si una opción debe quedar fija ("Todas las anteriores").</span></span>
          </label>
        </div>

        <div class="btn-row editor-acciones">
          <button type="button" class="btn btn-ghost" onclick="editorCancelar()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="editorGuardar()">💾 Guardar pregunta</button>
        </div>
      </div>

      <div class="editor-col editor-preview">
        <div class="card sticky">
          <div class="card-head">
            <h2>Así se imprime</h2>
            ${esCalc ? `<select class="select select-mini" id="editorSetPreview" onchange="BANCO.setPreview = parseInt(this.value, 10); editorPreview()">${p.sets.map((_, i) => `<option value="${i}" ${i === BANCO.setPreview ? 'selected' : ''}>Set ${i + 1}</option>`).join('')}</select>` : ''}
          </div>
          <div id="editorPapel" class="papel"></div>
          <div class="field-note">Letra a tamaño real sobre un ancho reducido; el reparto exacto de líneas y páginas se ve en Vista previa.</div>
          <div id="editorAvisos" class="aviso"></div>
          ${esCalc ? '<div id="editorTablaValores"></div>' : ''}
        </div>
      </div>
    </div>`;
  editorPreview();
}

function editorHtmlOpciones(p) {
  const esCalc = p.tipo === 'calculo';
  return p.opciones.map((o, i) => `
    <div class="opcion-fila">
      <label class="radio-letra" title="Correcta">
        <input type="radio" name="editorCorrecta" ${o.correcta ? 'checked' : ''} onchange="editorCorrecta(${i})">
        <span>${MODELO.LETRAS[i]}</span>
      </label>
      ${esCalc ? `<input class="input mono" placeholder="fórmula, p. ej. v*t" value="${escapeHtml(o.formula)}" oninput="editorOpcion(${i}, 'formula', this.value)">` : ''}
      <input class="input" placeholder="${esCalc ? 'texto fijo (solo si no hay fórmula)' : 'Texto de la opción ' + MODELO.LETRAS[i]}" value="${escapeHtml(o.texto)}" oninput="editorOpcion(${i}, 'texto', this.value)">
    </div>`).join('');
}

function editorHtmlDatos(p) {
  const cab = p.variables.map((v, j) => `
    <th><div class="var-celda">
      <input class="input mono" value="${escapeHtml(v)}" oninput="editorVariableNombre(${j}, this.value)" placeholder="nombre">
      <button type="button" class="btn-x" title="Quitar variable" onclick="editorQuitarVariable(${j})">✖</button>
    </div></th>`).join('');
  const filas = p.sets.map((s, i) => `
    <tr>
      <td class="set-num">Set ${i + 1}</td>
      ${p.variables.map((v) => `<td><input class="input" value="${escapeHtml(s[v] == null ? '' : s[v])}" oninput="editorSetValor(${i}, '${escapeHtml(v)}', this.value)"></td>`).join('')}
      <td class="set-acciones">
        <button type="button" class="btn-x" title="Duplicar set" onclick="editorDuplicarSet(${i})">⧉</button>
        <button type="button" class="btn-x" title="Quitar set" onclick="editorQuitarSet(${i})">✖</button>
      </td>
    </tr>`).join('');
  return `
    <div class="card">
      <div class="card-head">
        <h2>Datos del enunciado</h2>
        <div class="btn-row">
          <button type="button" class="btn btn-secondary btn-inline btn-mini" onclick="editorAgregarVariable()">＋ Variable</button>
          <button type="button" class="btn btn-secondary btn-inline btn-mini" onclick="editorAgregarSet()">＋ Set de datos</button>
        </div>
      </div>
      <div class="field-note" style="margin-bottom:8px">Cada fila es un set de datos completo; la forma A y la forma B usan sets distintos. Los números van con coma o punto; también puedes poner textos (p. ej. el nombre de un objeto).</div>
      <div class="table-wrap">
        <table class="tabla-sets" id="editorTablaSets">
          <thead><tr><th></th>${cab}<th></th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div class="field-note">Constantes disponibles en las fórmulas: <code>pi</code>, <code>e</code>, <code>g</code> = 9,8 (si defines una variable <code>g</code>, se usa la tuya). Funciones: <code>sqrt</code>, <code>abs</code>, <code>sin</code>, <code>cos</code>, <code>tan</code> (radianes), <code>sind</code>, <code>cosd</code>, <code>tand</code> (grados), <code>asin</code>…, <code>ln</code>, <code>log</code>, <code>exp</code>, <code>round(x, n)</code>, <code>min</code>, <code>max</code>, <code>hypot</code>.</div>
    </div>`;
}

// ---- Cambios en los campos ----
const editorPreviewDebounced = debounce(() => editorPreview(), 200);

function editorCampo(campo, valor) {
  BANCO.editando[campo] = valor;
  editorPreviewDebounced();
}

function editorTipo(tipo) {
  const p = BANCO.editando;
  if (p.tipo === tipo) return;
  p.tipo = tipo;
  if (tipo === 'calculo' && p.variables.length === 0) {
    p.variables = ['v', 't'];
    p.sets = [{ v: '', t: '' }, { v: '', t: '' }];
  }
  editorRender();
}

function editorInsertar(simbolo) {
  const ta = document.getElementById('editorEnunciado');
  const ini = ta.selectionStart, fin = ta.selectionEnd;
  ta.value = ta.value.slice(0, ini) + simbolo + ta.value.slice(fin);
  ta.selectionStart = ta.selectionEnd = ini + simbolo.length;
  ta.focus();
  editorCampo('enunciado', ta.value);
}

function editorCorrecta(i) {
  BANCO.editando.opciones.forEach((o, k) => { o.correcta = k === i; });
  editorPreviewDebounced();
}

function editorOpcion(i, campo, valor) {
  BANCO.editando.opciones[i][campo] = valor;
  editorPreviewDebounced();
}

function editorFormato(campo, valor) {
  const f = BANCO.editando.formato;
  if (campo === 'decimales') f.decimales = clamp(parseInt(valor, 10) || 0, 0, 8);
  else f[campo] = valor;
  editorPreviewDebounced();
}

function editorVariableNombre(j, valor) {
  const p = BANCO.editando;
  const viejo = p.variables[j];
  const nuevo = valor.trim();
  p.variables[j] = nuevo;
  p.sets.forEach((s) => { if (viejo !== nuevo) { s[nuevo] = s[viejo] == null ? '' : s[viejo]; if (viejo) delete s[viejo]; } });
  editorPreviewDebounced();
}

function editorAgregarVariable() {
  const p = BANCO.editando;
  let n = p.variables.length + 1, nombre = 'x' + n;
  while (p.variables.includes(nombre)) nombre = 'x' + (++n);
  p.variables.push(nombre);
  p.sets.forEach((s) => { s[nombre] = ''; });
  editorRender();
  const inputs = document.querySelectorAll('#editorTablaSets thead input');
  if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
}

function editorQuitarVariable(j) {
  const p = BANCO.editando;
  const v = p.variables[j];
  p.variables.splice(j, 1);
  p.sets.forEach((s) => { delete s[v]; });
  editorRender();
}

function editorAgregarSet() {
  const p = BANCO.editando;
  const s = {};
  p.variables.forEach((v) => { s[v] = ''; });
  p.sets.push(s);
  editorRender();
  const filas = document.querySelectorAll('#editorTablaSets tbody tr');
  const inp = filas.length ? filas[filas.length - 1].querySelector('input') : null;
  if (inp) inp.focus();
}

function editorDuplicarSet(i) {
  const p = BANCO.editando;
  p.sets.splice(i + 1, 0, Object.assign({}, p.sets[i]));
  editorRender();
}

function editorQuitarSet(i) {
  const p = BANCO.editando;
  p.sets.splice(i, 1);
  if (BANCO.setPreview >= p.sets.length) BANCO.setPreview = Math.max(0, p.sets.length - 1);
  editorRender();
}

function editorSetValor(i, variable, valor) {
  BANCO.editando.sets[i][variable] = valor;
  editorPreviewDebounced();
}

// ---- Imagen ----
function cargarImagenDesdeURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
    img.src = url;
  });
}

// Lee el archivo, lo reduce (máx. 1400 px) y lo deja como data URL con fondo
// blanco. Los SVG se guardan tal cual (imprimen nítidos a cualquier tamaño).
async function procesarImagen(file) {
  const dataURL = await leerArchivoDataURL(file);
  const img = await cargarImagenDesdeURL(dataURL);
  if (file.type === 'image/svg+xml') {
    return { datos: dataURL, ancho_px: img.naturalWidth || 300, alto_px: img.naturalHeight || 200 };
  }
  const MAX = 1400;
  const esc = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * esc));
  const h = Math.max(1, Math.round(img.naturalHeight * esc));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let datos = canvas.toDataURL('image/png');
  if (datos.length > 600 * 1024) {
    const jpg = canvas.toDataURL('image/jpeg', 0.9);
    if (jpg.length < datos.length) datos = jpg;
  }
  return { datos, ancho_px: w, alto_px: h };
}

async function editorImagen(file) {
  if (!file) return;
  try {
    const r = await procesarImagen(file);
    const prev = BANCO.editando.imagen;
    BANCO.editando.imagen = {
      datos: r.datos, ancho_px: r.ancho_px, alto_px: r.alto_px,
      ancho_mm: prev ? prev.ancho_mm : 55,
      posicion: prev ? prev.posicion : 'derecha',
    };
    editorRender();
  } catch (e) {
    toast('No se pudo usar la imagen: ' + e.message, 'error');
  }
}

function editorQuitarImagen() {
  BANCO.editando.imagen = null;
  editorRender();
}

function editorImagenCampo(campo, valor) {
  const im = BANCO.editando.imagen;
  if (!im) return;
  if (campo === 'ancho_mm') im.ancho_mm = clamp(parseFloat(valor) || 55, 15, 190);
  else im[campo] = valor;
  editorPreviewDebounced();
}

// ---- Vista previa del editor ----
function editorPreview() {
  const p = BANCO.editando;
  if (!p) return;
  const papel = document.getElementById('editorPapel');
  const avisos = document.getElementById('editorAvisos');
  if (!papel) return;
  const setIdx = p.tipo === 'calculo' ? clamp(BANCO.setPreview, 0, Math.max(0, p.sets.length - 1)) : 0;
  const res = resolverPregunta(p, setIdx, ',');
  montarPapel(papel, nodoPregunta({ numero: 1, enunciado: res.enunciado, opciones: res.opciones }, p.imagen, { marcarCorrecta: true }), 10, false);

  const rev = comprobarPregunta(p);
  const lista = rev.errores.map((e) => `<div class="aviso-item error">${escapeHtml(e)}</div>`)
    .concat(rev.advertencias.map((a) => `<div class="aviso-item warn">${escapeHtml(a)}</div>`));
  avisos.innerHTML = lista.join('');
  avisos.classList.toggle('hidden', lista.length === 0);

  const tabla = document.getElementById('editorTablaValores');
  if (tabla && p.tipo === 'calculo') {
    if (p.sets.length === 0) { tabla.innerHTML = ''; return; }
    const filas = p.sets.map((_, i) => {
      const r = resolverPregunta(p, i, ',');
      const celdas = r.opciones.map((o) => `<td class="${o.correcta ? 'ok' : ''} ${o.error ? 'error' : ''}" title="${escapeHtml(o.error || '')}">${escapeHtml(textoPlano(o.texto))}</td>`).join('');
      const marca = r.errores.length ? ' class="fila-error"' : (r.advertencias.length ? ' class="fila-warn"' : '');
      return `<tr${marca}><td class="set-num">Set ${i + 1}</td>${celdas}</tr>`;
    }).join('');
    tabla.innerHTML = `<div class="label" style="margin-top:12px">Valor de cada opción por set (verde = correcta)</div>
      <div class="table-wrap"><table class="tabla-valores"><thead><tr><th></th>${MODELO.LETRAS.map((l) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div>`;
  }
}

// ============================================
// MODAL "VER PREGUNTA" (banco y selector de la prueba)
// ============================================
function mostrarVistaPregunta(pregunta, opts) {
  opts = opts || {};
  BANCO.modalPregunta = { pregunta, setIndice: 0, alAgregar: opts.alAgregar || null };
  const esCalc = pregunta.tipo === 'calculo';
  document.getElementById('modalPreguntaMeta').innerHTML =
    (pregunta.tema ? `<span class="badge tema">${escapeHtml(pregunta.tema)}</span> ` : '') + `<span class="badge">${etiquetaTipo(pregunta)}</span>`;
  const sel = document.getElementById('modalPreguntaSet');
  sel.classList.toggle('hidden', !esCalc || pregunta.sets.length === 0);
  sel.innerHTML = pregunta.sets.map((_, i) => `<option value="${i}">Set ${i + 1}</option>`).join('');
  sel.value = '0';
  const btn = document.getElementById('modalPreguntaAgregar');
  btn.classList.toggle('hidden', !opts.alAgregar);
  abrirModal('modalPregunta');   // antes de dibujar: el papel necesita medirse visible
  modalPreguntaRender();
}

function modalPreguntaSet(valor) {
  if (!BANCO.modalPregunta) return;
  BANCO.modalPregunta.setIndice = parseInt(valor, 10) || 0;
  modalPreguntaRender();
}

function modalPreguntaRender() {
  const m = BANCO.modalPregunta;
  if (!m) return;
  const res = resolverPregunta(m.pregunta, m.setIndice, ',');
  montarPapel(document.getElementById('modalPreguntaPapel'), nodoPregunta({ numero: 1, enunciado: res.enunciado, opciones: res.opciones }, m.pregunta.imagen, { marcarCorrecta: true }), 10, true);
  const rev = comprobarPregunta(m.pregunta);
  const avisos = document.getElementById('modalPreguntaAvisos');
  const lista = rev.errores.map((e) => `<div class="aviso-item error">${escapeHtml(e)}</div>`)
    .concat(rev.advertencias.map((a) => `<div class="aviso-item warn">${escapeHtml(a)}</div>`));
  avisos.innerHTML = lista.join('');
  avisos.classList.toggle('hidden', lista.length === 0);
}

function modalPreguntaAgregar() {
  const m = BANCO.modalPregunta;
  if (m && m.alAgregar) m.alAgregar(m.pregunta);
  cerrarModal('modalPregunta');
}
