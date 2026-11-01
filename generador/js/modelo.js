// ============================================================================
// MODELO: PREGUNTAS, PRUEBAS Y GENERACIÓN DE LAS FORMAS A Y B
// Estructuras de datos, normalización de lo que se importa, resolución de una
// pregunta con un set de datos (enunciado + opciones calculadas) y el sorteo
// de las dos formas. Sin DOM.
//
// Pregunta del banco:
//   { id, tema, tipo: 'fija'|'calculo', enunciado, imagen: null | { datos
//     (data URL), ancho_mm, posicion: 'derecha'|'abajo', ancho_px, alto_px },
//     mezclar: true, opciones: [{ texto, formula, correcta }] (siempre 4),
//     variables: ['v','t'], sets: [{ v: '10', t: '5' }], formato: { modo,
//     decimales, unidad }, creada, modificada }
// Prueba:
//   { id, titulo, curso, fecha, instrucciones, opciones: {...}, items:
//     [{ preguntaId, setA: 'auto'|n, setB: 'auto'|n }], formas: null | {...},
//     creada, modificada }
// ============================================================================
'use strict';

const MODELO = {
  N_PREGUNTAS: 5,                 // lo que lee el Calificador OMR (P1..P5)
  N_OPCIONES: 4,                  // casilleros A, B, C, D
  LETRAS: ['A', 'B', 'C', 'D'],
  FORMAS: [{ letra: 'A', F: 1 }, { letra: 'B', F: 2 }],   // Forma → casilla F
  RE_NOMBRE_VARIABLE: /^[A-Za-z\u00C0-\u024F\u0370-\u03FF_][A-Za-z0-9\u00C0-\u024F\u0370-\u03FF_]*$/,
};

const OPCIONES_PRUEBA_DEFAULT = {
  fuente_pt: 10,            // tamaño de letra del cuerpo (puntos)
  ancho_cabecera_mm: 198,   // ancho impreso de la cabecera OMR
  marcar_F: true,           // imprimir la casilla F ya pintada (A→1, B→2)
  separador: ',',           // separador decimal de los números
  disposicion: 'a4',        // 'a4': dos pruebas por hoja A4; 'a5': páginas sueltas
  invertir_dorso: false,    // intercambiar mitades en la cara 2 (según impresora)
  preguntas_cara1: 'auto',  // 'auto' o número de preguntas en la primera cara
  mostrar_nombre_cara2: true,
};

// ============================================
// PREGUNTAS
// ============================================
function nuevaPregunta(tipo) {
  const ahora = ahoraISO();
  return {
    id: uid('q'),
    tema: '',
    tipo: tipo === 'calculo' ? 'calculo' : 'fija',
    enunciado: '',
    imagen: null,
    mezclar: true,
    opciones: MODELO.LETRAS.map((_, i) => ({ texto: '', formula: '', correcta: i === 0 })),
    variables: tipo === 'calculo' ? ['v', 't'] : [],
    sets: tipo === 'calculo' ? [{ v: '', t: '' }, { v: '', t: '' }] : [],
    formato: { modo: 'auto', decimales: 2, unidad: '' },
    creada: ahora,
    modificada: ahora,
  };
}

// Completa campos que falten y descarta basura (para importaciones y
// versiones anteriores). Devuelve null si no parece una pregunta.
function normalizarPregunta(p) {
  if (!p || typeof p !== 'object') return null;
  const base = nuevaPregunta(p.tipo === 'calculo' ? 'calculo' : 'fija');
  const q = Object.assign(base, {
    id: (typeof p.id === 'string' && p.id) ? p.id : base.id,
    tema: String(p.tema || '').trim(),
    tipo: p.tipo === 'calculo' ? 'calculo' : 'fija',
    enunciado: String(p.enunciado || ''),
    mezclar: p.mezclar !== false,
    creada: p.creada || base.creada,
    modificada: p.modificada || base.modificada,
  });
  // Opciones: siempre 4
  const ops = Array.isArray(p.opciones) ? p.opciones : [];
  q.opciones = MODELO.LETRAS.map((_, i) => {
    const o = ops[i] || {};
    return { texto: String(o.texto || ''), formula: String(o.formula || ''), correcta: !!o.correcta };
  });
  if (!q.opciones.some((o) => o.correcta)) q.opciones[0].correcta = true;
  else { let vista = false; q.opciones.forEach((o) => { if (o.correcta) { if (vista) o.correcta = false; vista = true; } }); }
  // Variables y sets
  q.variables = (Array.isArray(p.variables) ? p.variables : []).map((v) => String(v).trim()).filter(Boolean);
  q.sets = (Array.isArray(p.sets) ? p.sets : []).filter((s) => s && typeof s === 'object').map((s) => {
    const limpio = {};
    q.variables.forEach((v) => { limpio[v] = s[v] == null ? '' : String(s[v]); });
    return limpio;
  });
  if (q.tipo === 'fija') { q.variables = []; q.sets = []; }
  // Formato numérico
  const f = p.formato || {};
  q.formato = {
    modo: ['auto', 'fijo', 'sig'].includes(f.modo) ? f.modo : 'auto',
    decimales: clamp(parseInt(f.decimales, 10) || 0, 0, 8),
    unidad: String(f.unidad || ''),
  };
  // Imagen
  if (p.imagen && typeof p.imagen === 'object' && typeof p.imagen.datos === 'string' && /^data:image\//.test(p.imagen.datos)) {
    q.imagen = {
      datos: p.imagen.datos,
      ancho_mm: clamp(parseFloat(p.imagen.ancho_mm) || 55, 15, 190),
      posicion: p.imagen.posicion === 'abajo' ? 'abajo' : 'derecha',
      ancho_px: parseInt(p.imagen.ancho_px, 10) || 0,
      alto_px: parseInt(p.imagen.alto_px, 10) || 0,
    };
  } else {
    q.imagen = null;
  }
  return q;
}

// Errores que impiden usar la pregunta (lista de textos; vacía = válida).
function validarPregunta(p) {
  const errores = [];
  if (!String(p.enunciado || '').trim()) errores.push('El enunciado está vacío.');
  if (p.tipo === 'fija') {
    p.opciones.forEach((o, i) => { if (!String(o.texto || '').trim()) errores.push(`La opción ${MODELO.LETRAS[i]} está vacía.`); });
  } else {
    if (p.variables.length === 0) errores.push('Define al menos una variable.');
    p.variables.forEach((v) => { if (!MODELO.RE_NOMBRE_VARIABLE.test(v)) errores.push(`Nombre de variable no válido: "${v}" (letras, números y _; sin espacios).`); });
    const repetidas = p.variables.filter((v, i) => p.variables.indexOf(v) !== i);
    if (repetidas.length) errores.push('Variables repetidas: ' + repetidas.join(', '));
    if (p.sets.length === 0) errores.push('Añade al menos un set de datos.');
    p.opciones.forEach((o, i) => {
      if (!String(o.formula || '').trim() && !String(o.texto || '').trim()) errores.push(`La opción ${MODELO.LETRAS[i]} no tiene fórmula ni texto.`);
    });
    const faltan = variablesEnTexto(p.enunciado).filter((v) => !p.variables.includes(v));
    if (faltan.length) errores.push('El enunciado usa variables que no existen: ' + faltan.map((v) => '{' + v + '}').join(', '));
  }
  if (!p.opciones.some((o) => o.correcta)) errores.push('Marca la opción correcta.');
  return errores;
}

// Resuelve la pregunta con el set indicado:
// → { enunciado, opciones: [{ texto, correcta, error }], setIndice, set,
//     errores: [], advertencias: [] }
function resolverPregunta(p, setIndice, separador) {
  separador = separador || ',';
  const res = { enunciado: p.enunciado, opciones: [], setIndice: null, set: null, errores: [], advertencias: [] };
  if (p.tipo !== 'calculo') {
    res.opciones = p.opciones.map((o) => ({ texto: o.texto, correcta: !!o.correcta, error: null }));
  } else {
    const n = p.sets.length;
    const idx = n ? clamp(parseInt(setIndice, 10) || 0, 0, n - 1) : -1;
    const set = idx >= 0 ? p.sets[idx] : {};
    res.setIndice = idx >= 0 ? idx : null;
    res.set = set;
    if (idx < 0) res.errores.push('La pregunta no tiene sets de datos.');
    res.enunciado = sustituirVariables(p.enunciado, set, separador);
    const faltan = variablesEnTexto(res.enunciado);
    if (faltan.length) res.errores.push('Sin valor en este set: ' + faltan.map((v) => '{' + v + '}').join(', '));
    res.opciones = p.opciones.map((o, i) => {
      const letra = MODELO.LETRAS[i];
      const formula = String(o.formula || '').trim();
      if (!formula) {
        if (!String(o.texto || '').trim()) res.errores.push(`Opción ${letra}: sin fórmula ni texto.`);
        return { texto: sustituirVariables(o.texto, set, separador), correcta: !!o.correcta, error: null };
      }
      const r = FORMULAS.calcular(formula, set);
      if (r.error) {
        res.errores.push(`Opción ${letra} (${formula}): ${r.error}`);
        return { texto: '¿?', correcta: !!o.correcta, error: r.error, valor: null };
      }
      let texto = formatearNumero(r.valor, p.formato, separador);
      const unidad = String(p.formato.unidad || '').trim();
      if (unidad) texto += ' ' + unidad;
      return { texto, correcta: !!o.correcta, error: null, valor: r.valor };
    });
    // Opciones repetidas (misma cadena): el problema no se puede responder
    const vistos = new Map();
    res.opciones.forEach((o, i) => {
      const k = textoPlano(o.texto);
      if (vistos.has(k)) res.advertencias.push(`Las opciones ${MODELO.LETRAS[vistos.get(k)]} y ${MODELO.LETRAS[i]} dan el mismo valor (${k}).`);
      else vistos.set(k, i);
    });
  }
  return res;
}

// Revisión completa (todos los sets) para la lista del banco y el editor.
// → { errores: [...], advertencias: [...] } con el set indicado en cada texto.
function comprobarPregunta(p) {
  const out = { errores: validarPregunta(p), advertencias: [] };
  if (p.tipo === 'calculo') {
    p.sets.forEach((_, i) => {
      const r = resolverPregunta(p, i, ',');
      r.errores.forEach((e) => out.errores.push(`Set ${i + 1}: ${e}`));
      r.advertencias.forEach((a) => out.advertencias.push(`Set ${i + 1}: ${a}`));
    });
    if (p.sets.length < 2) out.advertencias.push('Con un solo set, las formas A y B llevarán los mismos datos.');
  }
  return out;
}

function letraCorrecta(opciones) {
  const i = opciones.findIndex((o) => o.correcta);
  return i >= 0 ? MODELO.LETRAS[i] : '?';
}

// ============================================
// PRUEBAS
// ============================================
function nuevaPrueba() {
  const ahora = ahoraISO();
  return {
    id: uid('p'),
    titulo: '',
    curso: '',
    fecha: '',
    instrucciones: 'Marca en la cabecera, rellenando todo el cuadro, la única alternativa correcta de cada pregunta.',
    opciones: Object.assign({}, OPCIONES_PRUEBA_DEFAULT),
    items: [],
    formas: null,
    creada: ahora,
    modificada: ahora,
  };
}

function normalizarPrueba(p) {
  if (!p || typeof p !== 'object') return null;
  const base = nuevaPrueba();
  const t = Object.assign(base, {
    id: (typeof p.id === 'string' && p.id) ? p.id : base.id,
    titulo: String(p.titulo || ''),
    curso: String(p.curso || ''),
    fecha: String(p.fecha || ''),
    instrucciones: String(p.instrucciones == null ? base.instrucciones : p.instrucciones),
    opciones: Object.assign({}, OPCIONES_PRUEBA_DEFAULT, (p.opciones && typeof p.opciones === 'object') ? p.opciones : {}),
    items: (Array.isArray(p.items) ? p.items : []).filter((it) => it && typeof it.preguntaId === 'string').map((it) => ({
      preguntaId: it.preguntaId,
      setA: it.setA === 'auto' || it.setA == null ? 'auto' : parseInt(it.setA, 10),
      setB: it.setB === 'auto' || it.setB == null ? 'auto' : parseInt(it.setB, 10),
    })),
    formas: (p.formas && typeof p.formas === 'object' && p.formas.A && p.formas.B) ? p.formas : null,
    creada: p.creada || base.creada,
    modificada: p.modificada || base.modificada,
  });
  t.opciones.fuente_pt = clamp(parseFloat(t.opciones.fuente_pt) || 10, 8, 14);
  t.opciones.ancho_cabecera_mm = clamp(parseFloat(t.opciones.ancho_cabecera_mm) || 198, 150, 200);
  t.opciones.separador = t.opciones.separador === '.' ? '.' : ',';
  t.opciones.disposicion = t.opciones.disposicion === 'a5' ? 'a5' : 'a4';
  return t;
}

// Genera las dos formas. `preguntasPorId` es un Map id → pregunta del banco.
// Devuelve el objeto `formas` (autocontenido: guarda una copia de cada
// pregunta, así la prueba se puede volver a ver aunque el banco cambie).
function generarFormas(prueba, preguntasPorId, semilla) {
  semilla = (semilla >>> 0) || semillaNueva();
  const rnd = crearAleatorio(semilla);
  const sep = prueba.opciones.separador || ',';
  const avisos = [];

  const items = prueba.items
    .map((it) => ({ item: it, pregunta: preguntasPorId.get(it.preguntaId) }))
    .filter((x) => x.pregunta);
  if (items.length === 0) throw new Error('La prueba no tiene preguntas.');

  // Orden de las preguntas: A al azar; B sin ninguna pregunta en la misma posición.
  const indices = items.map((_, i) => i);
  const ordenA = mezclar(indices, rnd);
  const ordenB = permutacionSinCoincidencias(ordenA, rnd);

  // Por pregunta: set y permutación de opciones de cada forma.
  const decisiones = items.map(({ item, pregunta }, i) => {
    const nSets = pregunta.tipo === 'calculo' ? pregunta.sets.length : 0;
    let setA = null, setB = null;
    if (nSets > 0) {
      const fijoA = (item.setA !== 'auto' && item.setA >= 0 && item.setA < nSets) ? item.setA : null;
      const fijoB = (item.setB !== 'auto' && item.setB >= 0 && item.setB < nSets) ? item.setB : null;
      setA = fijoA != null ? fijoA : enteroAleatorio(rnd, nSets);
      if (fijoB != null) setB = fijoB;
      else if (nSets === 1) setB = 0;
      else {
        const candidatos = Array.from({ length: nSets }, (_, k) => k).filter((k) => k !== setA);
        setB = candidatos[enteroAleatorio(rnd, candidatos.length)];
      }
      if (setA === setB) avisos.push(`Pregunta ${i + 1} (${recortar(textoPlano(pregunta.enunciado), 40)}): las dos formas usan el set ${setA + 1}.`);
    }
    const nOps = pregunta.opciones.length;
    const identidad = Array.from({ length: nOps }, (_, k) => k);
    const idxCorrecta = pregunta.opciones.findIndex((o) => o.correcta);
    let permA = identidad, permB = identidad;
    if (pregunta.mezclar !== false) {
      permA = mezclar(identidad, rnd);
      const posA = permA.indexOf(idxCorrecta);
      let encontrada = null;
      for (let k = 0; k < 60 && !encontrada; k++) {
        const cand = mezclar(identidad, rnd);
        if (cand.indexOf(idxCorrecta) !== posA && cand.some((v, j) => v !== permA[j])) encontrada = cand;
      }
      if (!encontrada) {
        encontrada = permA.slice();
        const otra = (posA + 1) % nOps;
        [encontrada[posA], encontrada[otra]] = [encontrada[otra], encontrada[posA]];
      }
      permB = encontrada;
    } else {
      avisos.push(`Pregunta ${i + 1}: las opciones no se mezclan (así está marcada en el banco).`);
    }
    return { setA, setB, permA, permB };
  });

  function construirForma(def, orden, usarSet, usarPerm) {
    const lista = orden.map((idxBase, pos) => {
      const { pregunta } = items[idxBase];
      const d = decisiones[idxBase];
      const setIdx = usarSet(d);
      const res = resolverPregunta(pregunta, setIdx, sep);
      const perm = usarPerm(d);
      const opciones = perm.map((k) => ({ texto: res.opciones[k].texto, correcta: res.opciones[k].correcta }));
      res.errores.forEach((e) => avisos.push(`Forma ${def.letra}, pregunta ${pos + 1}: ${e}`));
      res.advertencias.forEach((a) => avisos.push(`Forma ${def.letra}, pregunta ${pos + 1}: ${a}`));
      return {
        numero: pos + 1,
        preguntaId: pregunta.id,
        indiceBase: idxBase,
        setIndice: res.setIndice,
        enunciado: res.enunciado,
        opciones,
        correcta: letraCorrecta(opciones),
      };
    });
    return { letra: def.letra, F: def.F, items: lista, clave: lista.map((it) => it.correcta) };
  }

  const A = construirForma(MODELO.FORMAS[0], ordenA, (d) => d.setA, (d) => d.permA);
  const B = construirForma(MODELO.FORMAS[1], ordenB, (d) => d.setB, (d) => d.permB);

  // Copia de las preguntas usadas (enunciado original, imagen, tema...)
  const snapshot = {};
  items.forEach(({ pregunta }) => {
    snapshot[pregunta.id] = {
      id: pregunta.id, tema: pregunta.tema, tipo: pregunta.tipo,
      enunciado: pregunta.enunciado, imagen: pregunta.imagen ? Object.assign({}, pregunta.imagen) : null,
      nSets: pregunta.tipo === 'calculo' ? pregunta.sets.length : 0,
    };
  });

  return { semilla, generada: ahoraISO(), A, B, snapshot, avisos };
}

// Texto de la clave de una forma para el calificador: "1-B 2-D 3-A 4-C 5-B".
function claveTexto(forma) {
  return forma.items.map((it) => `${it.numero}-${it.correcta}`).join('  ');
}
