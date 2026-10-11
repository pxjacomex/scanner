// ============================================================================
// CALIFICACIÓN: RESULTADO DEL ESCANEO, TABLA Y CLAVE DE RESPUESTAS
// Muestra el resultado del escaneo actual, lo guarda en la tabla (con manejo de
// IDs duplicados), calcula notas con la clave de respuestas y permite borrar todo.
// ============================================================================

// ============================================
// UI: RESULTADO DEL ESCANEO
// ============================================
function renderScanResult() {
  if (!STATE.currentScan) return;
  const s = STATE.currentScan;

  document.getElementById('scanResult').classList.remove('hidden');
  document.getElementById('valID').textContent = s.ID;
  document.getElementById('valF').textContent = s.F;

  // Marcar dudosos
  document.getElementById('cellID').classList.toggle('warn', s.ID.includes('?'));
  document.getElementById('cellF').classList.toggle('warn', s.F === '?');

  // Renderizar P1..P5
  const row = document.getElementById('questionsRow');
  row.innerHTML = '';

  // Verificar si hay clave para este formato
  const claveFormato = STATE.clave[s.F];
  const todasClavesDefinidas = claveFormato &&
    Object.values(claveFormato).every(v => v !== null);

  let aciertos = 0;
  let totalEvaluables = 5;

  for (let i = 1; i <= 5; i++) {
    const q = `P${i}`;
    const detected = s[q];
    const correct = claveFormato ? claveFormato[q] : null;

    const cell = document.createElement('div');
    cell.className = 'q-cell';

    const display = detected === 'AMBIGUO' ? '?' : (detected || '–');

    let cssClass = 'empty';
    if (detected === 'AMBIGUO') {
      cssClass = 'dudoso';
    } else if (detected && correct && todasClavesDefinidas) {
      if (detected === correct) {
        cssClass = 'correct';
        aciertos++;
      } else {
        cssClass = 'wrong';
      }
    } else if (!detected && correct === null) {
      cssClass = 'empty';
    }

    cell.classList.add(cssClass);
    cell.innerHTML = `<div class="q-label">${q}</div><div class="q-value">${display}</div>`;
    row.appendChild(cell);
  }

  // Calificación
  const scoreSection = document.getElementById('scoreSection');
  const scoreDisp = document.getElementById('scoreDisplay');
  const scoreValEl = document.getElementById('scoreValue');
  const scoreLabel = document.getElementById('scoreLabel');

  if (todasClavesDefinidas && s.F !== '?') {
    scoreSection.classList.remove('hidden');
    const nota = aciertos * 0.2;
    scoreValEl.textContent = nota.toFixed(2);
    scoreLabel.textContent = `${aciertos} de 5 aciertos`;
    scoreDisp.classList.remove('high', 'mid', 'low');
    if (nota >= 0.6) scoreDisp.classList.add('high');
    else if (nota >= 0.4) scoreDisp.classList.add('mid');
    else scoreDisp.classList.add('low');

    s._nota = nota;
    s._aciertos = aciertos;
  } else {
    scoreSection.classList.add('hidden');
    s._nota = null;
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
  if (s.F !== '?' && !todasClavesDefinidas) {
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
      for (const grupo of ['D1','D2','F','P1','P2','P3','P4','P5']) {
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
      for (const grupo of ['D1','D2','F','P1','P2','P3','P4','P5']) {
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
    toast('Reemplazado', 'success');
  } else if (action === 'keep') {
    toast('Se mantuvo el anterior', 'warn');
  } else if (action === 'both') {
    STATE.results.push(pending);
    toast('Ambos guardados', 'success');
  }

  // Limpiar UI del scan actual
  STATE.currentScan = null;
  document.getElementById('scanResult').classList.add('hidden');
  document.getElementById('capturedImg').style.display = 'none';
  document.getElementById('resultCanvas').style.display = 'none';
  document.getElementById('empty').style.display = 'block';

  renderTable();
}

function commitScan(scan) {
  STATE.results.push(scan);
  STATE.currentScan = null;

  document.getElementById('scanResult').classList.add('hidden');
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
  const conNota = STATE.results.filter(r => r._nota !== null && r._nota !== undefined);
  if (conNota.length > 0) {
    const avg = conNota.reduce((a, r) => a + r._nota, 0) / conNota.length;
    document.getElementById('statAvg').textContent = avg.toFixed(2);
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
  // Mostrar últimas filas primero
  const lastN = Math.min(20, count);
  document.getElementById('tableInfo').textContent =
    count <= 20 ? `${count} registros` : `Mostrando últimos ${lastN} de ${count}`;

  const recent = [...STATE.results].slice(-lastN).reverse();
  tbody.innerHTML = recent.map((r, i) => {
    const num = count - i;
    const fmtP = v => v === 'AMBIGUO' ? '<span style="color:var(--warn)">?</span>' : (v || '<span style="color:var(--text-muted)">–</span>');
    const notaStr = r._nota !== null && r._nota !== undefined ? r._nota.toFixed(2) : '—';
    const notaClass = r._nota >= 0.6 ? 'high' : (r._nota >= 0.4 ? 'mid' : (r._nota !== null && r._nota !== undefined ? 'low' : ''));
    const dudaIcon = r.dudoso ? '<span style="color:var(--warn)">⚠</span>' : '';
    return `<tr>
      <td>${num}</td>
      <td class="td-id">${r.ID}</td>
      <td>${r.F}</td>
      <td>${fmtP(r.P1)}</td>
      <td>${fmtP(r.P2)}</td>
      <td>${fmtP(r.P3)}</td>
      <td>${fmtP(r.P4)}</td>
      <td>${fmtP(r.P5)}</td>
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
  for (let i = 1; i <= 5; i++) {
    const q = `P${i}`;
    const valor = STATE.clave[formato][q];
    const row = document.createElement('div');
    row.className = 'answer-row';
    row.innerHTML = `<div class="q-name">${q}</div>` +
      ['A', 'B', 'C', 'D'].map(l => {
        const sel = valor === l ? 'selected' : '';
        return `<button data-fmt="${formato}" data-q="${q}" data-letra="${l}" class="${sel}">${l}</button>`;
      }).join('');
    cont.appendChild(row);
  }
  cont.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const f = b.dataset.fmt, q = b.dataset.q, l = b.dataset.letra;
      // Toggle: si ya estaba seleccionado, deseleccionar
      if (STATE.clave[f][q] === l) {
        STATE.clave[f][q] = null;
      } else {
        STATE.clave[f][q] = l;
      }
      renderClaveUI(f);
    });
  });
}

function saveClave() {
  const f1 = STATE.clave['1'];
  const f2 = STATE.clave['2'];
  const f1Done = Object.values(f1).filter(v => v !== null).length;
  const f2Done = Object.values(f2).filter(v => v !== null).length;
  toast(`Clave guardada: F1 ${f1Done}/5, F2 ${f2Done}/5`, 'success');

  // Re-renderizar resultado actual si existe
  if (STATE.currentScan) renderScanResult();
  // Re-renderizar tabla con nuevas notas
  // (recalcular notas de los ya guardados)
  recomputeAllScores();
  renderTable();
}

function recomputeAllScores() {
  for (const r of STATE.results) {
    const claveFormato = STATE.clave[r.F];
    const todasDefinidas = claveFormato && Object.values(claveFormato).every(v => v !== null);
    if (todasDefinidas && r.F !== '?') {
      let aciertos = 0;
      for (let i = 1; i <= 5; i++) {
        if (r[`P${i}`] === claveFormato[`P${i}`]) aciertos++;
      }
      r._nota = aciertos * 0.2;
      r._aciertos = aciertos;
    } else {
      r._nota = null;
    }
  }
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
  closeModal('clearModal');
  renderTable();
  toast('Todos los registros borrados', 'warn');
}
