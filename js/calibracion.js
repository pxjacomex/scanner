// ============================================================================
// EDITOR DE CALIBRACIÓN DE COORDENADAS (pestaña Calibrar)
// Sliders por grupo de casilleros con vista previa en vivo sobre la última imagen
// rectificada. Persiste en localStorage vía js/estado.js.
// ============================================================================

// ============================================
// EDITOR DE CALIBRACION
// ============================================
// Imagen rectificada SIN anotaciones (para vista previa al ajustar)
let CALIB_BASE_RECTIFIED_DATAURL = null;

function renderCalibrationUI() {
  const cont = document.getElementById('calibGroups');
  if (!cont) return;
  cont.innerHTML = '';

  // Aviso si la calibración difiere significativamente del default.
  // Calculamos el "drift" como la suma absoluta de diferencias en x0/y/paso_x
  // a lo largo de todos los grupos, normalizada a "casilleros equivalentes".
  let drift = 0;
  for (const g of ['D1','D2','F','P1','P2','P3','P4','P5']) {
    const cur = CALIBRATION[g], def = CALIBRATION_DEFAULT[g];
    drift += Math.abs(cur.x0 - def.x0) + Math.abs(cur.y - def.y) + Math.abs(cur.paso_x - def.paso_x);
  }
  drift += Math.abs((CALIBRATION.roi_size || 0) - CALIBRATION_DEFAULT.roi_size) * 2;

  if (drift > 3.0) {
    const aviso = document.createElement('div');
    aviso.className = 'hint warn';
    aviso.style.marginBottom = '12px';
    aviso.innerHTML = `⚠️ <strong>Calibración modificada respecto al original.</strong> ` +
      `Si los rectángulos no caen bien sobre los casilleros impresos, ` +
      `pulsa <em>Restaurar</em>. Drift acumulado: ${drift.toFixed(1)} mm.`;
    cont.appendChild(aviso);
  }

  // Bloque global: tamaño común de todos los casilleros
  const globalDiv = document.createElement('div');
  globalDiv.className = 'calib-group';
  globalDiv.innerHTML = `
    <div class="calib-group-title">
      <span>Tamaño de casilleros</span>
      <span class="desc">aplica a los 42</span>
    </div>
    ${calibRowHTML('GLOBAL', 'roi_size', 'Lado', CALIBRATION.roi_size)}
  `;
  cont.appendChild(globalDiv);

  const grupoInfo = {
    D1: { titulo: 'D1 — Primer dígito del ID', desc: '10 casilleros (0-9)' },
    D2: { titulo: 'D2 — Segundo dígito del ID', desc: '10 casilleros (0-9)' },
    F:  { titulo: 'F — Forma de la prueba',     desc: '2 casilleros (1-2)' },
    P1: { titulo: 'P1 — Pregunta 1',            desc: '4 casilleros (A-D)' },
    P2: { titulo: 'P2 — Pregunta 2',            desc: '4 casilleros (A-D)' },
    P3: { titulo: 'P3 — Pregunta 3',            desc: '4 casilleros (A-D)' },
    P4: { titulo: 'P4 — Pregunta 4',            desc: '4 casilleros (A-D)' },
    P5: { titulo: 'P5 — Pregunta 5',            desc: '4 casilleros (A-D)' },
  };

  for (const grupo of ['D1','D2','F','P1','P2','P3','P4','P5']) {
    const info = grupoInfo[grupo];
    const cfg = CALIBRATION[grupo];

    const div = document.createElement('div');
    div.className = 'calib-group';
    div.innerHTML = `
      <div class="calib-group-title">
        <span>${info.titulo}</span>
        <span class="desc">${info.desc}</span>
      </div>
      ${calibRowHTML(grupo, 'x0', 'X 1°', cfg.x0)}
      ${calibRowHTML(grupo, 'y',  'Y',    cfg.y)}
      ${calibRowHTML(grupo, 'paso_x', 'Paso', cfg.paso_x)}
    `;
    cont.appendChild(div);
  }

  // Conectar eventos
  cont.querySelectorAll('.calib-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = btn.dataset.grupo;
      const f = btn.dataset.field;
      const delta = parseFloat(btn.dataset.delta);

      // Grupo especial 'GLOBAL': el campo (ej. roi_size) vive en la raíz de CALIBRATION
      let nuevo;
      if (g === 'GLOBAL') {
        nuevo = Math.round((CALIBRATION[f] + delta) * 1000) / 1000;
        // Limitar tamaño del casillero a un rango sensato (1 mm a 10 mm)
        if (f === 'roi_size') nuevo = Math.max(1, Math.min(10, nuevo));
        CALIBRATION[f] = nuevo;
      } else {
        nuevo = Math.round((CALIBRATION[g][f] + delta) * 1000) / 1000;
        CALIBRATION[g][f] = nuevo;
      }

      // Actualizar valor mostrado
      const input = cont.querySelector(`.calib-value[data-grupo="${g}"][data-field="${f}"]`);
      if (input) input.textContent = nuevo.toFixed(2);
      // Recalcular COORDS y refrescar preview
      COORDS = buildCoords();
      refreshCalibPreview();
      // Reanalizar la imagen actual con la nueva calibración (en tiempo real).
      // Esto es CRÍTICO: sin esto, el usuario calibra pero el resultado mostrado
      // en la pestaña Escanear sigue siendo el del análisis original.
      if (STATE.lastRectifiedMat) {
        try { reclassifyLive(); } catch(e) { console.warn('reclassifyLive falló:', e); }
      }
    });
  });

  // Mostrar/ocultar preview segun haya imagen base
  if (CALIB_BASE_RECTIFIED_DATAURL) {
    document.getElementById('calibPreviewWrap').style.display = 'block';
    document.getElementById('calibNoImage').style.display = 'none';
    refreshCalibPreview();
  } else {
    document.getElementById('calibPreviewWrap').style.display = 'none';
    document.getElementById('calibNoImage').style.display = 'block';
  }
}

function calibRowHTML(grupo, field, label, value) {
  return `
    <div class="calib-row">
      <div class="calib-row-label">${label}</div>
      <div class="calib-controls">
        <button class="calib-btn" data-grupo="${grupo}" data-field="${field}" data-delta="-1">−1</button>
        <button class="calib-btn fine" data-grupo="${grupo}" data-field="${field}" data-delta="-0.1">−.1</button>
        <div class="calib-value" data-grupo="${grupo}" data-field="${field}">${value.toFixed(2)}</div>
        <button class="calib-btn fine" data-grupo="${grupo}" data-field="${field}" data-delta="0.1">+.1</button>
        <button class="calib-btn" data-grupo="${grupo}" data-field="${field}" data-delta="1">+1</button>
      </div>
    </div>
  `;
}

function refreshCalibPreview() {
  if (!CALIB_BASE_RECTIFIED_DATAURL) return;
  const canvas = document.getElementById('calibPreviewCanvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    // Dibujar todos los rectangulos de COORDS
    const halfPx = getRoiHalfPx();
    ctx.lineWidth = 2;
    for (const c of COORDS) {
      const cx = c.x * GEOM.PX_PER_MM;
      const cy = c.y * GEOM.PX_PER_MM;
      // Color por grupo
      if (c.grupo === 'ID') ctx.strokeStyle = '#00e68a';
      else if (c.grupo === 'P') ctx.strokeStyle = '#ff7dcc';
      else ctx.strokeStyle = '#ffb84d';
      ctx.strokeRect(cx - halfPx, cy - halfPx, halfPx * 2, halfPx * 2);
    }
  };
  img.src = CALIB_BASE_RECTIFIED_DATAURL;
}

function saveCalibration() {
  const ok = persistCalibration();
  if (ok) {
    toast('Calibración guardada permanentemente', 'success');
  } else {
    toast('No se pudo guardar (¿modo privado?)', 'error');
  }
  // Reanalizar la imagen actual con la calibración guardada (por si quedó algo desincronizado)
  if (STATE.lastRectifiedMat) {
    try { reclassifyLive(); } catch(_) {}
  }
}

function resetCalibration() {
  CALIBRATION = JSON.parse(JSON.stringify(CALIBRATION_DEFAULT));
  COORDS = buildCoords();
  renderCalibrationUI();
  toast('Calibración restaurada a valores por defecto', 'warn');
  // Reanalizar la imagen actual con la calibración default
  if (STATE.lastRectifiedMat) {
    try { reclassifyLive(); } catch(_) {}
  }
}

// Reset de calibración + persistencia + reclasificación inmediata.
// Pensado para el caso "la calibración guardada está rota y todo sale ambiguo".
function resetCalibrationAndReprocess() {
  CALIBRATION = JSON.parse(JSON.stringify(CALIBRATION_DEFAULT));
  COORDS = buildCoords();
  persistCalibration();   // sobrescribir el localStorage corrupto
  renderCalibrationUI();
  // Reclasificar la imagen actual con la calibración restaurada
  if (STATE.lastRectifiedMat) {
    try {
      reclassifyLive();
      toast('Calibración restaurada y reanalizada', 'success');
    } catch (e) {
      console.error(e);
      toast('Calibración restaurada (no se pudo reanalizar)', 'warn');
    }
  } else {
    toast('Calibración restaurada. Vuelve a escanear.', 'success');
  }
}
