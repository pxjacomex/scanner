// ============================================================================
// GRUPOS DE ESTUDIANTES Y DATOS DE EXPORTACIÓN
// Cada grupo es un archivo CSV de la carpeta "grupo" del teléfono: el nombre del
// grupo es el del archivo sin ".csv" (grupos/GR1A.csv → GR1A) y cada fila trae
// "estudiante_id","estudiante_email". Chrome para Android no permite leer una
// carpeta directamente, así que el usuario elige los archivos (varios a la vez)
// con un selector; se guardan en localStorage para no tener que repetirlo.
// También se guarda aquí el nombre de la evaluación y el grupo elegido, que
// usa js/exportacion.js para nombrar el CSV y rellenar "alumno_email".
// ============================================================================
const STORAGE_KEY_GRUPOS = 'omr_grupos_v1';
const STORAGE_KEY_EXPORT = 'omr_export_v1';

function loadGrupos() {
  STATE.grupos = {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY_GRUPOS);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') STATE.grupos = parsed;
    }
  } catch (e) {
    console.warn('Error cargando grupos:', e);
  }
}

function persistGrupos() {
  try {
    localStorage.setItem(STORAGE_KEY_GRUPOS, JSON.stringify(STATE.grupos));
    return true;
  } catch (e) {
    console.warn('Error guardando grupos:', e);
    return false;
  }
}

function loadExportConfig() {
  STATE.exportConfig = { grupo: '', evaluacion: '' };
  try {
    const stored = localStorage.getItem(STORAGE_KEY_EXPORT);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.grupo === 'string') STATE.exportConfig.grupo = parsed.grupo;
      if (parsed && typeof parsed.evaluacion === 'string') STATE.exportConfig.evaluacion = parsed.evaluacion;
    }
  } catch (e) {
    console.warn('Error cargando datos de exportación:', e);
  }
}

function persistExportConfig() {
  try {
    localStorage.setItem(STORAGE_KEY_EXPORT, JSON.stringify(STATE.exportConfig));
  } catch (e) {
    console.warn('Error guardando datos de exportación:', e);
  }
}

// Nombre del grupo a partir del nombre del archivo: se quita ".csv" (o la
// extensión que tenga) y los espacios de los extremos.
function nombreGrupoDesdeArchivo(nombreArchivo) {
  return String(nombreArchivo || '').replace(/\.csv$/i, '').replace(/\.[^.]{1,5}$/, '').trim();
}

// Divide una línea CSV respetando comillas ("" = comilla literal).
function parsearLineaCSV(linea, separador) {
  const campos = [];
  let actual = '', enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (enComillas) {
      if (ch === '"') {
        if (linea[i + 1] === '"') { actual += '"'; i++; }
        else enComillas = false;
      } else actual += ch;
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === separador) {
      campos.push(actual); actual = '';
    } else actual += ch;
  }
  campos.push(actual);
  return campos.map(c => c.trim());
}

// Convierte el texto de un archivo de grupo en { alumnos: {id: email}, filas, ignoradas }.
// Acepta coma, punto y coma o tabulador como separador y una fila de cabecera
// (toda fila cuyo segundo campo no tenga "@" se ignora, como la cabecera).
function parsearCSVGrupo(texto) {
  const lineas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  const alumnos = {};
  let filas = 0, ignoradas = 0;
  if (lineas.length === 0) return { alumnos, filas, ignoradas };
  const muestra = lineas[0];
  const cuenta = (ch) => (muestra.split(ch).length - 1);
  let separador = ',';
  if (cuenta(';') > cuenta(',')) separador = ';';
  if (cuenta('\t') > Math.max(cuenta(','), cuenta(';'))) separador = '\t';
  for (const linea of lineas) {
    const campos = parsearLineaCSV(linea, separador);
    const id = (campos[0] || '').trim();
    const email = (campos[1] || '').trim();
    if (!id || !email.includes('@')) { ignoradas++; continue; }
    alumnos[id] = email;
    filas++;
  }
  return { alumnos, filas, ignoradas };
}

function leerArchivoTexto(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}

// Carga uno o varios archivos de grupo elegidos por el usuario.
async function cargarArchivosGrupo(fileList) {
  const archivos = Array.from(fileList || []);
  if (archivos.length === 0) return;
  const resumen = [];
  for (const file of archivos) {
    const nombre = nombreGrupoDesdeArchivo(file.name);
    if (!nombre) { resumen.push(`${file.name}: nombre no válido`); continue; }
    try {
      const texto = await leerArchivoTexto(file);
      const { alumnos, filas, ignoradas } = parsearCSVGrupo(texto);
      STATE.grupos[nombre] = {
        nombre,
        archivo: file.name,
        alumnos,
        n: filas,
        cargado: new Date().toISOString().slice(0, 10),
      };
      resumen.push(`${nombre}: ${filas} alumno${filas === 1 ? '' : 's'}` + (ignoradas ? ` (${ignoradas} fila${ignoradas === 1 ? '' : 's'} ignorada${ignoradas === 1 ? '' : 's'})` : ''));
    } catch (e) {
      console.error('No se pudo leer', file.name, e);
      resumen.push(`${file.name}: no se pudo leer`);
    }
  }
  persistGrupos();
  // Si no había grupo elegido, seleccionar el primero cargado ahora
  if (!STATE.exportConfig.grupo || !STATE.grupos[STATE.exportConfig.grupo]) {
    const primero = nombreGrupoDesdeArchivo(archivos[0].name);
    if (STATE.grupos[primero]) { STATE.exportConfig.grupo = primero; persistExportConfig(); }
  }
  renderGrupoSelect();
  toast('Grupos cargados · ' + resumen.join(' · '), 'success');
}

function renderGrupoSelect() {
  const sel = document.getElementById('grupoSelect');
  const info = document.getElementById('gruposInfo');
  if (!sel) return;
  const nombres = Object.keys(STATE.grupos || {}).sort((a, b) => a.localeCompare(b, 'es'));
  sel.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = nombres.length ? '— Sin grupo —' : '— Sin grupos cargados —';
  sel.appendChild(opt0);
  for (const n of nombres) {
    const g = STATE.grupos[n];
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = `${n} (${g.n} alumno${g.n === 1 ? '' : 's'})`;
    sel.appendChild(opt);
  }
  sel.value = STATE.grupos[STATE.exportConfig.grupo] ? STATE.exportConfig.grupo : '';
  if (info) {
    info.textContent = nombres.length
      ? `${nombres.length} grupo${nombres.length === 1 ? '' : 's'} guardado${nombres.length === 1 ? '' : 's'} en este dispositivo. Vuelve a cargar un archivo para actualizarlo.`
      : 'Carga los archivos CSV de la carpeta «grupo» del teléfono (una fila por alumno: id, correo). El nombre del grupo es el del archivo sin ".csv".';
  }
}

function getGrupoSeleccionado() {
  const n = STATE.exportConfig && STATE.exportConfig.grupo;
  return (n && STATE.grupos && STATE.grupos[n]) ? STATE.grupos[n] : null;
}

function getNombreEvaluacion() {
  return ((STATE.exportConfig && STATE.exportConfig.evaluacion) || '').trim();
}

// Correo del alumno cuyo id coincide con el ID leído en la hoja. Compara como
// texto y, si ambos son numéricos, también como número (24 = 024).
function emailDeAlumno(id, grupo) {
  if (!grupo || !grupo.alumnos) return '';
  const clave = String(id || '').trim();
  if (!clave) return '';
  if (grupo.alumnos[clave] !== undefined) return grupo.alumnos[clave];
  if (/^\d+$/.test(clave)) {
    const n = parseInt(clave, 10);
    for (const k in grupo.alumnos) {
      if (/^\d+$/.test(k) && parseInt(k, 10) === n) return grupo.alumnos[k];
    }
  }
  return '';
}

// Solo caracteres imprimibles en el nombre de la evaluación.
function limpiarTextoEvaluacion(v) {
  return String(v || '').replace(/[\x00-\x1F\x7F]/g, '');
}

function initGruposUI() {
  loadGrupos();
  loadExportConfig();
  const sel = document.getElementById('grupoSelect');
  const input = document.getElementById('evalNombre');
  const fileInput = document.getElementById('gruposInput');
  if (input) {
    input.value = STATE.exportConfig.evaluacion;
    input.addEventListener('input', () => {
      const limpio = limpiarTextoEvaluacion(input.value);
      if (limpio !== input.value) input.value = limpio;
      STATE.exportConfig.evaluacion = limpio;
      persistExportConfig();
    });
  }
  if (sel) {
    sel.addEventListener('change', () => {
      STATE.exportConfig.grupo = sel.value;
      persistExportConfig();
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      await cargarArchivosGrupo(e.target.files);
      e.target.value = '';
    });
  }
  renderGrupoSelect();
}
