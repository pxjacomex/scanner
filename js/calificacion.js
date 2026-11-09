// ============================================================================
// CALIFICACIÓN: RESULTADO DEL ESCANEO, TABLA Y CLAVE DE RESPUESTAS
// Muestra el resultado del escaneo actual, lo guarda en la tabla (con manejo de
// IDs duplicados), calcula notas con la clave de respuestas y permite borrar todo.
// ============================================================================

// ============================================
// NOTA SOBRE 100, CLAVE CON VARIAS OPCIONES Y BONUS
// ============================================
// La clave de cada pregunta (STATE.clave[formato][Pn]) es una cadena con las
// letras correctas en orden ("A", "AC", "ABCD") o null si no está definida.
// El estudiante acierta la pregunta si la única respuesta que pintó es
// cualquiera de esas letras; "AMBIGUO" (varias casillas pintadas) o en blanco
// no puntúan. La detección no cambia: solo la comparación con la clave.
//
// Solo se evalúan las preguntas de la cabecera en uso (listaPreguntas()) que
// tienen clave o BONUS; las demás no cuentan. La nota es
//   100 × aciertos / evaluables   (con un decimal si hace falta),
// así una clave con 8 de 10 preguntas califica sobre esas 8. Una pregunta con
// BONUS (STATE.bonus[formato][Pn]) cuenta como evaluable y como acierto para
// todos, marque lo que marque el estudiante.
const NOTA = {
  MAXIMA: 100,
  UMBRAL_ALTA: 60,    // color verde a partir de esta nota
  UMBRAL_MEDIA: 40,   // ámbar a partir de esta; rojo por debajo
};

// ¿La pregunta tiene al menos una letra correcta definida?
function claveDefinida(v) {
  return typeof v === 'string' && v.length > 0;
}
function esBonus(formato, q) {
  const b = STATE.bonus && STATE.bonus[formato];
  return !!(b && b[q] === true);
}
// Preguntas de la cabecera en uso que puntúan en un formato (con clave o BONUS).
function preguntasEvaluables(formato) {
  const clave = STATE.clave[formato] || {};
  return listaPreguntas().filter(q => esBonus(formato, q) || claveDefinida(clave[q])).length;
}
// Acierto: la respuesta detectada es una sola letra incluida en la clave.
function esAcierto(respuesta, correctas) {
  return typeof respuesta === 'string' && respuesta !== 'AMBIGUO' && respuesta.length === 1 &&
    claveDefinida(correctas) && correctas.includes(respuesta);
}
// Evalúa un escaneo contra la clave de un formato ('1' o '2').
// Devuelve { aciertos, evaluables, nota (null si nada es evaluable), estados }
// con estados[Pn] = 'bonus' | 'acierto' | 'error' | 'dudoso' | 'vacio' | 'sinclave'.
function evaluarRegistro(registro, formato) {
  const clave = STATE.clave[formato] || {};
  let aciertos = 0, evaluables = 0;
  const estados = {};
  for (const q of listaPreguntas()) {
    const resp = registro[q];
    if (esBonus(formato, q)) { evaluables++; aciertos++; estados[q] = 'bonus'; continue; }
    if (!claveDefinida(clave[q])) { estados[q] = 'sinclave'; continue; }
    evaluables++;
    if (resp === 'AMBIGUO') estados[q] = 'dudoso';
    else if (esAcierto(resp, clave[q])) { aciertos++; estados[q] = 'acierto'; }
    else estados[q] = resp ? 'error' : 'vacio';
  }
  const nota = evaluables > 0 ? Math.round(NOTA.MAXIMA * aciertos / evaluables * 10) / 10 : null;
  return { aciertos, evaluables, nota, estados };
}
// Aplica la evaluación a un registro (escaneo actual o fila guardada).
function calificarRegistro(r) {
  const ev = (r.F === '1' || r.F === '2') ? evaluarRegistro(r, r.F) : null;
  if (ev && ev.evaluables > 0) {
    r._nota = ev.nota; r._aciertos = ev.aciertos; r._evaluables = ev.evaluables;
  } else {
    r._nota = null; r._aciertos = null; r._evaluables = null;
  }
  return ev;
}
function tieneNota(r) {
  return r._nota !== null && r._nota !== undefined;
}
// Texto de una nota o promedio: entero si lo es, si no con un decimal (73.3).
function formatearNota(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
function claseNota(n) {
  return n >= NOTA.UMBRAL_ALTA ? 'high' : (n >= NOTA.UMBRAL_MEDIA ? 'mid' : 'low');
}
// Toque en una letra de la clave de una pregunta.
// - Sin "Opciones duplicadas": una sola letra; tocar otra reemplaza a la
//   anterior y tocar la misma la quita.
// - Con "Opciones duplicadas": cada letra se añade o se quita por separado.
function alternarLetraClave(formato, q, letra) {
  const actual = STATE.clave[formato][q] || '';
  let letras;
  if (STATE.claveOpcionesDuplicadas) {
    letras = actual.includes(letra)
      ? actual.replace(letra, '')
      : (actual + letra).split('').sort().join('');
  } else {
    letras = actual === letra ? '' : letra;
  }
  STATE.clave[formato][q] = letras.length > 0 ? letras : null;
  persistClave();
}

// Casilla "Opciones duplicadas". Al desmarcarla, las preguntas que ya tenían
// varias letras las conservan (se ven marcadas) hasta que se toque una letra,
// que entonces queda como única; se avisa si hay alguna en ese estado.
function setOpcionesDuplicadas(activo) {
  STATE.claveOpcionesDuplicadas = !!activo;
  persistClave();
  renderClaveOpciones();
  if (!activo) {
    const conVarias = Object.values(STATE.clave)
      .flatMap(f => Object.values(f))
      .filter(v => claveDefinida(v) && v.length > 1).length;
    if (conVarias > 0) {
      toast(`${conVarias} pregunta${conVarias > 1 ? 's' : ''} con varias opciones: toca una letra para dejar solo una`, 'warn');
    }
  }
}

function renderClaveOpciones() {
  const cb = document.getElementById('claveDuplicadas');
  if (cb) cb.checked = STATE.claveOpcionesDuplicadas;
}

// ============================================
// UI: RESULTADO DEL ESCANEO
// ============================================
function renderScanResult() {
  if (!STATE.currentScan) return;
  const s = STATE.currentScan;

  document.getElementById('scanResult').classList.remove('hidden');
  document.getElementById('scanActions').classList.remove('hidden');
  document.getElementById('valID').textContent = s.ID;
  document.getElementById('valF').textContent = s.F;

  // Marcar dudosos
  document.getElementById('cellID').classList.toggle('warn', s.ID.includes('?'));
  document.getElementById('cellF').classList.toggle('warn', s.F === '?');

  // Renderizar P1..Pn (las preguntas de la cabecera en uso) con su evaluación
  const row = document.getElementById('questionsRow');
  row.innerHTML = '';
  const ev = calificarRegistro(s);
  const hayNota = !!(ev && ev.evaluables > 0 && s.F !== '?');

  for (const q of listaPreguntas()) {
    const detected = s[q];
    const estado = ev ? ev.estados[q] : 'sinclave';
    const display = detected === 'AMBIGUO' ? '?' : (detected || '–');

    let cssClass = 'empty', etiqueta = q;
    if (estado === 'bonus') { cssClass = 'correct bonus'; etiqueta = `${q} · BONUS`; }
    else if (detected === 'AMBIGUO') cssClass = 'dudoso';
    else if (estado === 'acierto') cssClass = 'correct';
    else if (estado === 'error') cssClass = 'wrong';
    // 'vacio' (con clave, sin marca) y 'sinclave' (no puntúa) se muestran neutros

    const cell = document.createElement('div');
    cell.className = 'q-cell ' + cssClass;
    cell.innerHTML = `<div class="q-label">${etiqueta}</div><div class="q-value">${display}</div>`;
    row.appendChild(cell);
  }

  // Calificación
  const scoreSection = document.getElementById('scoreSection');
  const scoreDisp = document.getElementById('scoreDisplay');
  const scoreValEl = document.getElementById('scoreValue');
  const scoreLabel = document.getElementById('scoreLabel');

  if (hayNota) {
    scoreSection.classList.remove('hidden');
    scoreValEl.textContent = formatearNota(ev.nota);
    scoreLabel.textContent = `${ev.aciertos} de ${ev.evaluables} aciertos · sobre ${NOTA.MAXIMA}`;
    scoreDisp.classList.remove('high', 'mid', 'low');
    scoreDisp.classList.add(claseNota(ev.nota));
  } else {
    scoreSection.classList.add('hidden');
    s._nota = null; s._aciertos = null; s._evaluables = null;
  }

  // Hints
  const hintsArea = document.getElementById('hintsArea');
  hintsArea.innerHTML = '';

  // ===== Detección heurística de calibración desalineada =====
  // Si MÁS DE 3 bloques quedan AMBIGUOS y todos los fO ganadores son bajos
  // (<25%) en grupos donde casi seguramente HAY marca (D1, D2, F),
  // muy probablemente los ROIs no están centrados sobre los casilleros.
  let calibSospechosa = false;
  try {
    const det = DEBUG.classification && DEBUG.classification.detalles;
    if (det) {
      const obligatorios = ['D1', 'D2', 'F'];
      let sinPintada = 0;
      let totalObligatorios = 0;
      for (const g of obligatorios) {
        if (det[g] && det[g].ganador) {
          totalObligatorios++;
          if (det[g].ganador.frac_oscura < 0.25) sinPintada++;
        }
      }
      // Si TODOS los obligatorios tienen fO bajo, casi seguro la calibración está mal
      if (totalObligatorios > 0 && sinPintada === totalObligatorios) {
        calibSospechosa = true;
      }
    }
  } catch(_) {}

  if (calibSospechosa) {
    const div = document.createElement('div');
    div.className = 'hint error';
    div.innerHTML = `⚠️ <strong>Posible calibración desalineada.</strong> ` +
      `Ningún bloque obligatorio (ID, Forma) muestra una marca clara. ` +
      `Esto suele ocurrir si la calibración guardada está corrida respecto a los casilleros.` +
      `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">` +
      `<button class="btn btn-secondary" onclick="resetCalibrationAndReprocess()" style="margin:0;flex:1;min-width:160px">↺ Restaurar calibración</button>` +
      `<button class="btn btn-ghost" onclick="switchSection('calib')" style="margin:0;flex:1;min-width:120px">📐 Ir a calibrar</button>` +
      `</div>`;
    hintsArea.appendChild(div);
  } else if (s.dudoso) {
    const div = document.createElement('div');
    div.className = 'hint warn';
    div.textContent = `⚠️ Hay valores dudosos: ${s.ambiguos.join(', ')}. Verifica visualmente antes de guardar.`;
    hintsArea.appendChild(div);
  }
  // Aviso de hoja doblada / distorsión (el anclaje lo compensa, pero conviene revisar)
  const anc = STATE.anclaje;
  if (anc) {
    const sinCuadros = Object.keys(anc.porGrupo).filter(g => anc.porGrupo[g].ancladas === 0);
    if (anc.maxDesplazamiento_mm >= 2) {
      const div = document.createElement('div');
      div.className = 'hint';
      div.textContent = `📐 La hoja parece doblada o la foto tiene distorsión: las casillas aparecen hasta ${anc.maxDesplazamiento_mm.toFixed(1)} mm fuera de su posición calibrada. Se corrigió automáticamente anclándolas a los cuadros impresos; revisa la imagen rectificada.`;
      hintsArea.appendChild(div);
    }
    if (sinCuadros.length > 0) {
      const div = document.createElement('div');
      div.className = 'hint warn';
      div.textContent = `⚠️ No se encontraron los cuadros impresos de ${sinCuadros.join(', ')}; en ese grupo se usaron las coordenadas calibradas.`;
      hintsArea.appendChild(div);
    }
  }
  if (s.F !== '?' && !hayNota) {
    const div = document.createElement('div');
    div.className = 'hint';
    div.textContent = `ℹ️ Define la clave del formato ${s.F} en la pestaña "Clave" para calificar.`;
    hintsArea.appendChild(div);
  }

  // Panel de debug
  const debugDiv = document.getElementById('debugInfo');
  if (debugDiv) {
    let txt = '';
    if (DEBUG.imageInfo) {
      const di = DEBUG.imageInfo;
      txt += `Imagen normalizada (gris):\n`;
      txt += `  Tamaño: ${di.rectWidth}×${di.rectHeight} px\n`;
      txt += `  Gris min/max: ${di.grayMin}/${di.grayMax}\n`;
      txt += `  Muestra (5 puntos): ${di.graySample.join(', ')}\n\n`;
    }
    // Calibración por barra de tonos
    if (DEBUG.toneInfo) {
      const t = DEBUG.toneInfo;
      const tp = getTonePatches();
      txt += `Calibración de tonos (4 parches):\n`;
      for (let i = 0; i < t.names.length; i++) {
        txt += `  ${t.names[i].padEnd(11)}: obs=${t.obs[i].toFixed(0).padStart(3)} → target=${t.target[i].toString().padStart(3)} (std=${t.stds[i].toFixed(1)})\n`;
      }
      const errorMedio = t.obs.reduce((a, o, i) => a + Math.abs(o - t.target[i]), 0) / t.obs.length;
      txt += `  Desvío medio observado→target: ${errorMedio.toFixed(1)} niveles\n`;
      txt += `  ROI parche: ${tp.roi_w_mm.toFixed(1)}×${tp.roi_h_mm.toFixed(1)} mm\n`;
      if (!t.monotonyOk) {
        txt += `  ⚠ ${t.monotonyMsg}\n`;
      } else {
        txt += `  ✓ Orden de tonos correcto\n`;
      }
      txt += `\n`;
    }
    // Rectificación
    if (DEBUG.rectificacion) {
      const r = DEBUG.rectificacion;
      if (r.modo === 'dos_mitades') {
        txt += `Rectificación: dos mitades (marcadores ${r.marcadores.join(',')}) · desvío centrales 4→${r.desvioCentral_mm[4].toFixed(2)} mm, 5→${r.desvioCentral_mm[5].toFixed(2)} mm\n\n`;
      } else {
        txt += `Rectificación: homografía única (marcadores ${r.marcadores.join(',')})${r.motivo ? ' · ' + r.motivo : ''}\n\n`;
      }
    }
    // Anclaje a los cuadros impresos
    if (DEBUG.anclaje) {
      const a = DEBUG.anclaje;
      txt += `Anclaje a cuadros impresos (radio ${a.radio_mm} mm · ${a.cuadrosDetectados} cuadros detectados · máx. ${a.maxDesplazamiento_mm.toFixed(2)} mm):\n`;
      for (const grupo of gruposLectura()) {
        const r = a.porGrupo[grupo];
        if (!r) continue;
        txt += `  ${grupo.padEnd(2)}: dx=${r.dx_mm >= 0 ? '+' : ''}${r.dx_mm.toFixed(2)} dy=${r.dy_mm >= 0 ? '+' : ''}${r.dy_mm.toFixed(2)} mm (${r.ancladas}/${r.de} celdas con cuadro)\n`;
      }
      const p = a.parches;
      txt += `  Parches: ${p.score >= ANCLAJE.PARCHE_SCORE_MIN ? `dx=${p.dx_mm >= 0 ? '+' : ''}${p.dx_mm.toFixed(2)} dy=${p.dy_mm >= 0 ? '+' : ''}${p.dy_mm.toFixed(2)} mm` : 'no localizados'} (correlación ${p.score.toFixed(2)})\n\n`;
    } else if (STATE.detectorParams && !(STATE.detectorParams.anclaje_mm > 0)) {
      txt += `Anclaje a cuadros impresos: desactivado\n\n`;
    }
    if (DEBUG.classification) {
      const P = STATE.detectorParams;
      txt += `Parámetros del detector:\n`;
      txt += `  Umbral oscuro: ${P.umbral_oscuro}  ·  FracMin: ${P.frac_min_pintada.toFixed(2)}  ·  FracMulti: ${P.frac_multi.toFixed(2)}  ·  ROI margen: ${P.roi_margin_pct.toFixed(2)}  ·  Anclaje: ${(P.anclaje_mm || 0).toFixed(1)} mm\n\n`;
      txt += `Decisión por bloque (1°/2° con su frac_oscura):\n`;
      const det = DEBUG.classification.detalles;
      for (const grupo of gruposLectura()) {
        if (!det[grupo]) continue;
        const ganador = det[grupo].ganador;
        const segundo = det[grupo].segundo;
        const decision = DEBUG.classification.decisiones[grupo];
        const decStr = decision === null ? 'vacío' : decision;
        txt += `  ${grupo}: ${decStr}`;
        txt += ` (1°:${ganador.etiqueta}=${(ganador.frac_oscura*100).toFixed(1)}%`;
        if (segundo.etiqueta) txt += `, 2°:${segundo.etiqueta}=${(segundo.frac_oscura*100).toFixed(1)}%`;
        txt += `)\n`;
      }
      // Mostrar features brutas de ejemplos clave
      if (DEBUG.features) {
        txt += `\nFeatures brutas (muestra · gris e fO en imagen normalizada):\n`;
        const ejemplos = ['D1_0','D1_5','D2_5','D2_9','P1_A','P1_B','P1_C','P1_D','F_1','F_2'];
        for (const id of ejemplos) {
          const f = DEBUG.features[id];
          if (f) {
            const fo = (f.frac_oscura*100).toFixed(1)+'%';
            txt += `  ${id}: gris=${f.mean_gris.toFixed(0).padStart(3)}  fO=${fo}\n`;
          } else {
            txt += `  ${id}: NULL\n`;
          }
        }
      }
    }
    debugDiv.textContent = txt || 'Sin información';
  }
}


function discardScan() {
  STATE.currentScan = null;
  document.getElementById('scanResult').classList.add('hidden');
  document.getElementById('scanActions').classList.add('hidden');
  document.getElementById('capturedImg').style.display = 'none';
  document.getElementById('resultCanvas').style.display = 'none';
  document.getElementById('empty').style.display = 'block';
  toast('Escaneo descartado', 'warn');
}

function saveScan() {
  if (!STATE.currentScan) return;
  const s = STATE.currentScan;

  // Verificar duplicado por ID (si ID tiene ?, no se considera duplicado)
  if (!s.ID.includes('?')) {
    const existing = STATE.results.find(r => r.ID === s.ID);
    if (existing) {
      // Mostrar modal y esperar resolución
      STATE.pendingScan = { ...s, fecha: new Date().toISOString() };
      document.getElementById('dupId').textContent = s.ID;
      document.getElementById('dupModal').classList.add('show');
      return;
    }
  }

  commitScan({ ...s, fecha: new Date().toISOString() });
}

function resolveDuplicate(action) {
  document.getElementById('dupModal').classList.remove('show');
  const pending = STATE.pendingScan;
  STATE.pendingScan = null;
  if (!pending) return;

  if (action === 'replace') {
    // Eliminar todos los registros con ese ID y agregar el nuevo
    STATE.results = STATE.results.filter(r => r.ID !== pending.ID);
    STATE.results.push(pending);
    guardarResultados();
    toast('Reemplazado', 'success');
  } else if (action === 'keep') {
    toast('Se mantuvo el anterior', 'warn');
  } else if (action === 'both') {
    STATE.results.push(pending);
    guardarResultados();
    toast('Ambos guardados', 'success');
  }

  // Limpiar UI del scan actual
  STATE.currentScan = null;
  document.getElementById('scanResult').classList.add('hidden');
  document.getElementById('scanActions').classList.add('hidden');
  document.getElementById('capturedImg').style.display = 'none';
  document.getElementById('resultCanvas').style.display = 'none';
  document.getElementById('empty').style.display = 'block';

  renderTable();
}

// Guarda la tabla en el dispositivo; avisa si no se pudo (p. ej. sin espacio).
function guardarResultados() {
  if (!persistResultados()) toast('No se pudo guardar en el dispositivo: exporta el CSV pronto', 'warn');
}

function commitScan(scan) {
  STATE.results.push(scan);
  guardarResultados();
  STATE.currentScan = null;

  document.getElementById('scanResult').classList.add('hidden');
  document.getElementById('scanActions').classList.add('hidden');
  document.getElementById('capturedImg').style.display = 'none';
  document.getElementById('resultCanvas').style.display = 'none';
  document.getElementById('empty').style.display = 'block';

  renderTable();
  toast('Guardado: ID ' + scan.ID, 'success');
}


// ============================================
// TABLA DE RESULTADOS
// ============================================
function renderTable() {
  const tbody = document.getElementById('resultsTable');
  const empty = document.getElementById('tableEmpty');
  const count = STATE.results.length;

  // Badge en tab
  const badge = document.getElementById('resultsCount');
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }

  // Stats
  document.getElementById('statTotal').textContent = count;
  const conNota = STATE.results.filter(tieneNota);
  if (conNota.length > 0) {
    const avg = conNota.reduce((a, r) => a + r._nota, 0) / conNota.length;
    document.getElementById('statAvg').textContent = formatearNota(avg);
  } else {
    document.getElementById('statAvg').textContent = '—';
  }
  const conDudas = STATE.results.filter(r => r.dudoso).length;
  document.getElementById('statDoubts').textContent = conDudas;

  // Botones de export
  document.getElementById('btnExport').disabled = count === 0;
  document.getElementById('btnShare').disabled = count === 0;
  document.getElementById('btnClearAll').disabled = count === 0;

  if (count === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('tableInfo').textContent = '';
    return;
  }

  empty.style.display = 'none';
  // Cabecera de la tabla según la cabecera en uso (P1..P5 o P1..P10)
  const head = document.getElementById('resultsHead');
  if (head) {
    head.innerHTML = '<tr><th>#</th><th>ID</th><th>F</th>' +
      listaPreguntas().map(q => `<th>${q}</th>`).join('') + '<th>Nota</th><th>⚠</th></tr>';
  }
  // Mostrar últimas filas primero
  const lastN = Math.min(20, count);
  document.getElementById('tableInfo').textContent =
    count <= 20 ? `${count} registros` : `Mostrando últimos ${lastN} de ${count}`;

  const recent = [...STATE.results].slice(-lastN).reverse();
  tbody.innerHTML = recent.map((r, i) => {
    const num = count - i;
    const fmtP = v => v === 'AMBIGUO' ? '<span style="color:var(--warn)">?</span>' : (v || '<span style="color:var(--text-muted)">–</span>');
    const notaStr = tieneNota(r) ? formatearNota(r._nota) : '—';
    const notaClass = tieneNota(r) ? claseNota(r._nota) : '';
    const dudaIcon = r.dudoso ? '<span style="color:var(--warn)">⚠</span>' : '';
    return `<tr>
      <td>${num}</td>
      <td class="td-id">${r.ID}</td>
      <td>${r.F}</td>
      ${listaPreguntas().map(q => `<td>${fmtP(r[q])}</td>`).join('')}
      <td class="td-score ${notaClass}">${notaStr}</td>
      <td>${dudaIcon}</td>
    </tr>`;
  }).join('');
}


// ============================================
// CLAVE DE RESPUESTAS
// ============================================
function renderClaveUI(formato) {
  const cont = document.getElementById('claveF' + formato);
  cont.innerHTML = '';
  for (const q of listaPreguntas()) {
    const valor = STATE.clave[formato][q] || '';
    const bonus = esBonus(formato, q);
    const row = document.createElement('div');
    row.className = 'answer-row' + (bonus ? ' bonus' : '');
    // Letras: con "Opciones duplicadas" cada una se añade o se quita; sin ella,
    // la nueva reemplaza a la anterior. BONUS: la pregunta cuenta como acierto
    // para todos (las letras quedan atenuadas, pero se conservan).
    row.innerHTML = `<div class="q-name">${q}</div>` +
      ['A', 'B', 'C', 'D'].map(l => {
        const sel = valor.includes(l) ? 'selected' : '';
        return `<button type="button" data-fmt="${formato}" data-q="${q}" data-letra="${l}" class="${sel}" aria-pressed="${sel ? 'true' : 'false'}">${l}</button>`;
      }).join('') +
      `<label class="bonus-check" title="La pregunta cuenta como acierto para todos, marquen lo que marquen">` +
        `<input type="checkbox" data-fmt="${formato}" data-q="${q}" ${bonus ? 'checked' : ''}><span>BONUS</span></label>`;
    cont.appendChild(row);
  }
  cont.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      alternarLetraClave(b.dataset.fmt, b.dataset.q, b.dataset.letra);
      renderClaveUI(b.dataset.fmt);
    });
  });
  cont.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => setBonus(cb.dataset.fmt, cb.dataset.q, cb.checked));
  });
}

// Marca o desmarca el BONUS de una pregunta (se guarda con la clave; como las
// letras, se aplica a las notas al pulsar "Guardar clave").
function setBonus(formato, q, activo) {
  if (!STATE.bonus[formato]) return;
  STATE.bonus[formato][q] = !!activo;
  persistClave();
  renderClaveUI(formato);
}

function saveClave() {
  const n = numPreguntas();
  persistClave();
  toast(`Clave guardada: F1 ${preguntasEvaluables('1')}/${n}, F2 ${preguntasEvaluables('2')}/${n} preguntas puntúan`, 'success');

  // Re-renderizar resultado actual si existe
  if (STATE.currentScan) renderScanResult();
  // Re-renderizar tabla con nuevas notas
  // (recalcular notas de los ya guardados)
  recomputeAllScores();
  renderTable();
}

function recomputeAllScores() {
  for (const r of STATE.results) calificarRegistro(r);
}


// ============================================
// LIMPIAR TODO
// ============================================
function confirmClearAll() {
  document.getElementById('clearCount').textContent = STATE.results.length;
  document.getElementById('clearModal').classList.add('show');
}
function doClearAll() {
  STATE.results = [];
  persistResultados();
  closeModal('clearModal');
  renderTable();
  toast('Todos los registros borrados', 'warn');
}
