// ============================================================================
// UTILIDADES COMPARTIDAS DEL GENERADOR DE PRUEBAS
// Identificadores, fechas, azar reproducible, archivos, formato de números y
// el "texto enriquecido" de los enunciados. No toca el DOM ni el estado.
// ============================================================================
'use strict';

function uid(prefijo) {
  return prefijo + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function ahoraISO() { return new Date().toISOString(); }

// "01/11/2026 18:30" a partir de una fecha ISO (o '—' si no es válida).
function fechaCorta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function debounce(fn, ms) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function copiaProfunda(obj) { return JSON.parse(JSON.stringify(obj)); }

// ============================================
// AZAR REPRODUCIBLE (mulberry32): con la misma semilla, la misma secuencia.
// ============================================
function crearAleatorio(semilla) {
  let a = (semilla >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function semillaNueva() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

function enteroAleatorio(rnd, n) { return Math.floor(rnd() * n); }

// Copia barajada (Fisher-Yates).
function mezclar(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Permutación de 0..n-1 en la que ningún elemento queda en la posición que
// ocupa en `referencia` (desarreglo relativo). Si no se consigue, rota una.
function permutacionSinCoincidencias(referencia, rnd) {
  const n = referencia.length;
  if (n < 2) return referencia.slice();
  for (let intento = 0; intento < 200; intento++) {
    const p = mezclar(referencia, rnd);
    if (p.every((v, i) => v !== referencia[i])) return p;
  }
  return referencia.slice(1).concat(referencia.slice(0, 1));
}

// ============================================
// ARCHIVOS
// ============================================
function descargarArchivo(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

function leerArchivoTexto(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('No se pudo leer el archivo'));
    r.readAsText(file, 'utf-8');
  });
}

function leerArchivoDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}

function nombreArchivoSeguro(s, porDefecto) {
  const limpio = String(s || '').trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return limpio || porDefecto || 'archivo';
}

function fechaParaNombre() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ============================================
// NÚMEROS
// ============================================
// Acepta "2,5", "2.5", "1e3", " 3 ". Devuelve NaN si no es un número.
function normalizarNumero(texto) {
  if (typeof texto === 'number') return texto;
  const s = String(texto == null ? '' : texto).trim().replace(/\s+/g, '').replace(',', '.');
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN;
  return Number(s);
}

function quitarCerosFinales(s) {
  if (s.indexOf('.') < 0) return s;
  return s.replace(/\.?0+$/, '');
}

// Formatea un resultado numérico según el formato de la pregunta.
//   formato.modo: 'auto' (hasta N decimales, sin ceros finales), 'fijo'
//   (N decimales exactos) o 'sig' (N cifras significativas).
//   separador: ',' o '.' para los decimales.
// Los valores muy grandes o muy pequeños salen en notación científica con el
// exponente como superíndice (markup ^{...} de textoEnriquecido).
function formatearNumero(valor, formato, separador) {
  if (typeof valor !== 'number' || !isFinite(valor)) return null;
  formato = formato || {};
  separador = separador || ',';
  const modo = formato.modo || 'auto';
  const dec = clamp(parseInt(formato.decimales, 10) || 0, 0, 8);
  const abs = Math.abs(valor);
  let s;
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-4)) {
    let exp = Math.floor(Math.log10(abs));
    let mant = valor / Math.pow(10, exp);
    let mantStr = (modo === 'sig') ? Number(mant.toPrecision(Math.max(1, dec))).toString() : mant.toFixed(dec);
    if (Math.abs(parseFloat(mantStr)) >= 10) {
      exp += 1;
      mant = valor / Math.pow(10, exp);
      mantStr = (modo === 'sig') ? Number(mant.toPrecision(Math.max(1, dec))).toString() : mant.toFixed(dec);
    }
    if (modo === 'auto') mantStr = quitarCerosFinales(mantStr);
    return mantStr.replace('.', separador) + ' × 10^{' + exp + '}';
  }
  if (modo === 'fijo') {
    s = valor.toFixed(dec);
  } else if (modo === 'sig') {
    s = Number(valor.toPrecision(Math.max(1, dec))).toString();
    if (/e/i.test(s)) s = valor.toPrecision(Math.max(1, dec));
  } else {
    s = quitarCerosFinales(valor.toFixed(dec));
  }
  if (s === '-0' || /^-0(\.0+)?$/.test(s)) s = s.slice(1);
  return s.replace('.', separador);
}

// Un dato del set tal como lo escribió el profesor, pero con el separador
// decimal elegido (si es un número). Los textos se devuelven tal cual.
function formatearDato(valor, separador) {
  const s = String(valor == null ? '' : valor).trim();
  if (!isNaN(normalizarNumero(s)) && /^[-+]?(\d+[.,]?\d*|[.,]\d+)$/.test(s)) {
    return s.replace(/[.,]/, separador || ',');
  }
  return s;
}

// ============================================
// TEXTO ENRIQUECIDO DE ENUNCIADOS Y OPCIONES
// ============================================
// Nombres de variable entre llaves: {v}, {t_0}, {masa}
const RE_VARIABLE = /\{([A-Za-zÀ-ɏͰ-Ͽ_][A-Za-z0-9À-ɏͰ-Ͽ_]*)\}/g;

function variablesEnTexto(texto) {
  const set = new Set();
  String(texto || '').replace(RE_VARIABLE, (_, n) => { set.add(n); return _; });
  return Array.from(set);
}

// Sustituye {variable} por el valor del set. Las variables que falten quedan
// como están (el editor las avisa).
function sustituirVariables(texto, set, separador) {
  set = set || {};
  return String(texto || '').replace(RE_VARIABLE, (orig, nombre) => {
    if (!(nombre in set) || set[nombre] === '' || set[nombre] == null) return orig;
    return formatearDato(set[nombre], separador);
  });
}

// Markup mínimo: **negrita**, ^{sup} / ^2, _{sub} / _0 y saltos de línea.
// Primero se escapa el HTML, así el texto del profesor nunca se interpreta.
function textoEnriquecido(texto) {
  let s = escapeHtml(texto);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
  s = s.replace(/\^(-?\d+|[A-Za-z])/g, '<sup>$1</sup>');
  s = s.replace(/_\{([^}]*)\}/g, '<sub>$1</sub>');
  s = s.replace(/_(\d+|[A-Za-z])(?![A-Za-z0-9])/g, '<sub>$1</sub>');
  s = s.replace(/\r?\n/g, '<br>');
  return s;
}

// Versión sin markup para listas, claves y buscadores.
function textoPlano(texto) {
  return String(texto || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\^\{([^}]*)\}/g, '^$1')
    .replace(/_\{([^}]*)\}/g, '_$1')
    .replace(/\s+/g, ' ').trim();
}

function recortar(texto, n) {
  const s = String(texto || '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
