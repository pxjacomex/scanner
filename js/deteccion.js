// ============================================================================
// DETECCIÓN DE LA HOJA
// runPipeline: marcadores ArUco → homografía → imagen rectificada → gris →
// normalización por parches de tono (LUT) → features por casillero →
// clasificación → anotación. Funciones puras sobre matrices de OpenCV; leen
// STATE/DEBUG/COORDS/GEOM (js/estado.js) y no tocan el DOM.
// Incluye la RECTIFICACIÓN POR MITADES con los marcadores centrales 4 y 5 de
// la cabecera v2 (función rectificar) y el ANCLAJE a los cuadros impresos (al
// final del archivo), que corrige el corrimiento residual de las celdas cuando
// la hoja está doblada o la foto tiene distorsión.
// ============================================================================

// ============================================
// PIPELINE DE DETECCIÓN
// ============================================
function runPipeline(imgElement) {
  // 1. Cargar imagen como Mat
  const src = cv.imread(imgElement);

  // 2. Convertir a gris (sin downscale para preservar precisión espacial)
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // 3. Detectar ArUco DICT_4X4_50
  // OpenCV.js 4.10+ requiere 3 parametros: dictionary, detectorParams, refineParams
  const dictionary = cv.getPredefinedDictionary(cv.DICT_4X4_50);
  const corners = new cv.MatVector();
  const ids = new cv.Mat();
  const params = new cv.aruco_DetectorParameters();
  let refineParams = null;
  let detector = null;
  try {
    refineParams = new cv.aruco_RefineParameters(10, 3, true);
  } catch (e) {
    // Algunas builds no exponen aruco_RefineParameters; intentamos sin el
    refineParams = null;
  }

  try {
    if (refineParams) {
      detector = new cv.aruco_ArucoDetector(dictionary, params, refineParams);
    } else {
      detector = new cv.aruco_ArucoDetector(dictionary, params);
    }
    detector.detectMarkers(gray, corners, ids);
  } catch (e) {
    // Fallback a la API antigua (funcion global detectMarkers)
    if (typeof cv.detectMarkers === 'function') {
      cv.detectMarkers(gray, dictionary, corners, ids, params);
    } else {
      // Limpiar y propagar error
      gray.delete();
      corners.delete();
      ids.delete();
      params.delete();
      if (refineParams) refineParams.delete();
      dictionary.delete();
      throw new Error('No se pudo inicializar el detector ArUco. Versión de OpenCV.js incompatible.');
    }
  }

  // 4. Validar que hay 4 marcadores con IDs 0,1,2,3
  if (ids.rows < 4) {
    src.delete(); gray.delete(); corners.delete(); ids.delete();
    if (detector) detector.delete();
    params.delete();
    if (refineParams) refineParams.delete();
    dictionary.delete();
    return { ok: false, msg: `Solo se detectaron ${ids.rows} marcadores. Asegure los 4.` };
  }

  // Mapear ID a esquinas
  const idToCorners = {};
  for (let i = 0; i < ids.rows; i++) {
    const id = ids.data32S[i];
    const c = corners.get(i);
    // c es Mat 1x4 de Point2f, datos en c.data32F
    idToCorners[id] = [
      c.data32F[0], c.data32F[1],  // p0 x,y
      c.data32F[2], c.data32F[3],  // p1
      c.data32F[4], c.data32F[5],  // p2
      c.data32F[6], c.data32F[7],  // p3
    ];
    c.delete();
  }

  const expected = [0, 1, 2, 3];
  const missing = expected.filter(id => !(id in idToCorners));
  if (missing.length > 0) {
    src.delete(); gray.delete(); corners.delete(); ids.delete();
    if (detector) detector.delete();
    params.delete();
    if (refineParams) refineParams.delete();
    dictionary.delete();
    return { ok: false, msg: `Faltan marcadores: ${missing.join(',')}. Encuadre la cabecera completa.` };
  }

  // 5. Calcular centros de los 4 marcadores
  const centro = (id) => {
    const c = idToCorners[id];
    return [
      (c[0] + c[2] + c[4] + c[6]) / 4,
      (c[1] + c[3] + c[5] + c[7]) / 4,
    ];
  };

  // 6. Rectificar: homografía única con las 4 esquinas o, si hay marcadores
  //    centrales (cabecera v2), dos homografías unidas en la columna central.
  const rectInfo = rectificar(src, idToCorners, centro);
  const rectified = rectInfo.rectified;
  DEBUG.rectificacion = rectInfo.info;

  src.delete(); gray.delete(); corners.delete(); ids.delete();
  if (detector) detector.delete();
  params.delete();
  if (refineParams) refineParams.delete();
  dictionary.delete();

  // 7. Convertir a escala de grises (UNA vez, aquí)
  const grayRect = matToGray(rectified);

  // 7b. Anclaje: localizar en ESTA foto los cuadros impresos de cada celda y la
  //     tira de parches, y corregir las coordenadas de lectura (hoja doblada,
  //     distorsión). Deja STATE.coordsLectura / STATE.anclaje / DEBUG.anclaje.
  aplicarAnclaje(grayRect);

  // 8. Calibración de tonos: medir los 4 parches y construir la LUT
  //    que normaliza la imagen a la escala estándar [target_negro, target_blanco]
  const toneInfo = measureTonePatches(grayRect);
  DEBUG.toneInfo = toneInfo;
  const lut = buildToneLUT(toneInfo);
  DEBUG.toneLUT = lut;

  // 9. Aplicar la LUT a toda la imagen rectificada en gris -> imagen normalizada
  const grayNorm = applyLUT(grayRect, lut);

  // 10. Extraer features de cada ROI sobre la imagen NORMALIZADA y clasificar
  const features = extractFeatures(grayNorm);
  DEBUG.features = features;
  const classification = classify(features);

  // 11. Crear copia limpia de la imagen rectificada (a color) para el editor de calibracion
  const rectifiedClean = rectified.clone();

  // 12. Anotar la imagen rectificada con resultados
  annotateRectified(rectified, classification, features);

  // grayRect: gris ANTES de la LUT (se conserva para reaplicar LUT al ajustar parches)
  // grayNorm: gris YA normalizada (la usa el detector)
  return { ok: true, rectified, rectifiedClean, grayRect, grayNorm, classification, rectificacion: rectInfo.info };
}


// ============================================
// RECTIFICACIÓN (homografía única o por mitades)
// ============================================
// Con las 4 esquinas se obtiene UNA homografía: perfecta si la hoja es plana.
// La cabecera v2 añade los marcadores 4 (arriba) y 5 (abajo) en la columna
// central; si están, la cabecera se rectifica en dos mitades, cada una con su
// propia homografía (izquierda: 0-4-5-2; derecha: 4-1-3-5) y se unen en la
// columna de los marcadores centrales. Así un doblez por el centro, que una
// sola homografía no puede modelar, se absorbe como un cambio de plano.
// Antes de usarlos se comprueba que proyectados con la homografía única caigan
// cerca de su posición esperada (descarta ids falsos). Devuelve
// { rectified, info } con info = { modo, marcadores, desvioCentral_mm, costura_px }.
function rectificar(src, idToCorners, centro) {
  const PX = GEOM.PX_PER_MM;
  const P = STATE.detectorParams || DETECTOR_PARAMS_DEFAULT;
  const usarMitades = (typeof P.rectificar_por_mitades !== 'number') || P.rectificar_por_mitades > 0;
  const dst = (id) => [GEOM.MARCADORES_MM[id].x * PX, GEOM.MARCADORES_MM[id].y * PX];
  const homografia = (srcQuad, dstQuad) => {
    const s = cv.matFromArray(4, 1, cv.CV_32FC2, [].concat(...srcQuad));
    const d = cv.matFromArray(4, 1, cv.CV_32FC2, [].concat(...dstQuad));
    const H = cv.getPerspectiveTransform(s, d);
    s.delete(); d.delete();
    return H;
  };
  const warp = (H) => {
    const out = new cv.Mat();
    cv.warpPerspective(src, out, H, new cv.Size(GEOM.W_PX, GEOM.H_PX));
    return out;
  };
  const proyectar = (H, p) => {
    const h = H.data64F;
    const z = h[6] * p[0] + h[7] * p[1] + h[8];
    return [(h[0] * p[0] + h[1] * p[1] + h[2]) / z, (h[3] * p[0] + h[4] * p[1] + h[5]) / z];
  };

  const M0 = centro(0), M1 = centro(1), M2 = centro(2), M3 = centro(3);
  const info = {
    modo: 'simple',
    marcadores: Object.keys(idToCorners).map(Number).sort((a, b) => a - b),
    desvioCentral_mm: null,
    costura_px: null,
  };
  // Homografía única (respaldo y referencia para validar los centrales)
  const H = homografia([M0, M1, M3, M2], [dst(0), dst(1), dst(3), dst(2)]);
  let rectified = null;

  if (usarMitades && (4 in idToCorners) && (5 in idToCorners)) {
    const M4 = centro(4), M5 = centro(5);
    const p4 = proyectar(H, M4), p5 = proyectar(H, M5);
    const d4 = Math.hypot(p4[0] - dst(4)[0], p4[1] - dst(4)[1]) / PX;
    const d5 = Math.hypot(p5[0] - dst(5)[0], p5[1] - dst(5)[1]) / PX;
    info.desvioCentral_mm = { 4: d4, 5: d5 };
    if (d4 <= GEOM.TOL_MARCADOR_CENTRAL_MM && d5 <= GEOM.TOL_MARCADOR_CENTRAL_MM) {
      const HL = homografia([M0, M4, M5, M2], [dst(0), dst(4), dst(5), dst(2)]);
      const HR = homografia([M4, M1, M3, M5], [dst(4), dst(1), dst(3), dst(5)]);
      const izq = warp(HL), der = warp(HR);
      HL.delete(); HR.delete();
      const costura = Math.round(GEOM.MARCADORES_MM[4].x * PX);
      // Mitad izquierda tal cual; la derecha se copia a partir de la costura
      const roiDer = der.roi(new cv.Rect(costura, 0, GEOM.W_PX - costura, GEOM.H_PX));
      const roiDst = izq.roi(new cv.Rect(costura, 0, GEOM.W_PX - costura, GEOM.H_PX));
      roiDer.copyTo(roiDst);
      roiDer.delete(); roiDst.delete(); der.delete();
      rectified = izq;
      info.modo = 'dos_mitades';
      info.costura_px = costura;
    } else {
      info.motivo = 'marcadores centrales fuera de su posición esperada';
    }
  } else if (!usarMitades && (4 in idToCorners) && (5 in idToCorners)) {
    info.motivo = 'rectificación por mitades desactivada';
  }

  if (!rectified) rectified = warp(H);
  H.delete();
  return { rectified, info };
}


// ============================================
// PIPELINE DE GRISES + LUT
// ============================================

// Convierte una matriz a escala de grises (1 canal). Devuelve un nuevo Mat.
// Acepta entradas RGBA, RGB o gris ya. La matriz original NO se elimina.
function matToGray(rect) {
  const out = new cv.Mat();
  const ch = rect.channels();
  if (ch === 4) {
    cv.cvtColor(rect, out, cv.COLOR_RGBA2GRAY);
  } else if (ch === 3) {
    cv.cvtColor(rect, out, cv.COLOR_RGB2GRAY);
  } else {
    rect.copyTo(out);
  }
  return out;
}

// Mide los 4 parches de calibración de tonos en la imagen rectificada en gris.
// Devuelve { obs, target, stds, boxes, names, monotonyOk, monotonyMsg }.
// Para robustez frente a manchas/reflejos, usa trim_mean (descarta el 10%
// extremo en cada cola).
function measureTonePatches(grayRect) {
  const tp = getTonePatches();
  // Desplazamiento de la tira de parches hallado por el anclaje (0 si no hay)
  const d = getParcheDesplazamiento();
  const result = { obs: [], target: [], stds: [], boxes: [], names: [],
                   monotonyOk: true, monotonyMsg: '', desplazamiento: d };
  const wPx = Math.round(tp.roi_w_mm * GEOM.PX_PER_MM);
  const hPx = Math.round(tp.roi_h_mm * GEOM.PX_PER_MM);
  for (const patch of tp.coords) {
    const cx = Math.round((patch.x + d.dx) * GEOM.PX_PER_MM);
    const cy = Math.round((patch.y + d.dy) * GEOM.PX_PER_MM);
    const x0 = Math.max(0, cx - Math.floor(wPx / 2));
    const y0 = Math.max(0, cy - Math.floor(hPx / 2));
    const x1 = Math.min(grayRect.cols, cx + Math.ceil(wPx / 2));
    const y1 = Math.min(grayRect.rows, cy + Math.ceil(hPx / 2));
    const roi = grayRect.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
    // FIX: roi.data en OpenCV.js apunta al buffer del Mat padre (con su step
    // original) y no respeta los límites del ROI. Clonamos para forzar un
    // buffer contiguo que sí contenga ÚNICAMENTE los píxeles del ROI.
    const roiClone = roi.clone();
    const data = roiClone.data;
    // trim_mean: ordenar y descartar 10% en cada cola, luego promediar el centro
    const arr = Array.from(data);
    arr.sort((a, b) => a - b);
    const cut = Math.floor(arr.length * 0.10);
    const trimmed = arr.slice(cut, arr.length - cut);
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < trimmed.length; i++) {
      sum += trimmed[i];
      sum2 += trimmed[i] * trimmed[i];
      n++;
    }
    const mean = sum / Math.max(n, 1);
    const std = Math.sqrt(Math.max(0, sum2 / Math.max(n, 1) - mean * mean));
    result.obs.push(mean);
    result.target.push(tp.targets[patch.id]);
    result.stds.push(std);
    result.boxes.push({ x0, y0, x1, y1 });
    result.names.push(patch.id);
    roiClone.delete();
    roi.delete();
  }
  // Validación de monotonía: el orden esperado es
  //   obs[blanco] > obs[gris_claro] > obs[gris_osc] > obs[negro]
  // (los nombres están en el orden 0=blanco, 1=gris_claro, 2=gris_osc, 3=negro
  //  porque coords se itera en ese orden).
  const minDelta = (typeof tp.monotonia_min_delta === 'number') ? tp.monotonia_min_delta : 5;
  const fallos = [];
  for (let i = 0; i < 3; i++) {
    const a = result.obs[i], b = result.obs[i + 1];
    if (a - b < minDelta) {
      fallos.push(`${result.names[i]}(${a.toFixed(0)}) y ${result.names[i+1]}(${b.toFixed(0)})`);
    }
  }
  if (fallos.length > 0) {
    result.monotonyOk = false;
    result.monotonyMsg = 'No se respeta el orden esperado (claro→oscuro). Posibles parches contaminados u ocultos: ' + fallos.join(', ') + '.';
  }
  return result;
}

// Construye una LUT (Uint8Array de 256 entradas) que mapea g_observado a
// g_normalizado mediante interpolación lineal por tramos entre los 4 puntos
// (obs[i] -> target[i]). Fuera del rango se extrapola linealmente con la
// pendiente del tramo extremo y se clampa a [0, 255].
function buildToneLUT(toneInfo) {
  // Necesitamos los puntos de control ORDENADOS por obs creciente para interp.
  const pts = toneInfo.obs.map((o, i) => ({ obs: o, tgt: toneInfo.target[i] }));
  pts.sort((a, b) => a.obs - b.obs);
  const xs = pts.map(p => p.obs);
  const ys = pts.map(p => p.tgt);

  // Pendientes de los segmentos extremos (para extrapolación)
  const m_low  = (ys[1] - ys[0]) / Math.max(1e-6, xs[1] - xs[0]);
  const m_high = (ys[ys.length - 1] - ys[ys.length - 2]) / Math.max(1e-6, xs[xs.length - 1] - xs[xs.length - 2]);

  const lut = new Uint8Array(256);
  for (let g = 0; g < 256; g++) {
    let v;
    if (g <= xs[0]) {
      v = ys[0] + m_low * (g - xs[0]);
    } else if (g >= xs[xs.length - 1]) {
      v = ys[ys.length - 1] + m_high * (g - xs[xs.length - 1]);
    } else {
      // Interpolación lineal: encontrar segmento
      let i = 0;
      while (i < xs.length - 1 && g > xs[i + 1]) i++;
      const t = (g - xs[i]) / Math.max(1e-6, xs[i + 1] - xs[i]);
      v = ys[i] + t * (ys[i + 1] - ys[i]);
    }
    lut[g] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return { lut, xs, ys };  // xs, ys para diagnóstico/preview
}

// Aplica una LUT a un Mat de grises. Devuelve un nuevo Mat normalizado.
function applyLUT(grayMat, lutObj) {
  const lut = lutObj.lut;
  const out = new cv.Mat(grayMat.rows, grayMat.cols, cv.CV_8UC1);
  const src = grayMat.data;
  const dst = out.data;
  const N = src.length;
  for (let i = 0; i < N; i++) dst[i] = lut[src[i]];
  return out;
}

// Reconstruye STATE.lastGrayNorm desde STATE.lastGrayRect aplicando la LUT
// con los parámetros actuales del patrón de tonos. Se llama cuando el usuario
// modifica las coordenadas, tamaño ROI o targets de los parches.
// Actualiza también DEBUG.toneInfo y DEBUG.toneLUT.
function reapplyToneLUT() {
  if (!STATE.cvReady || !STATE.lastGrayRect) return false;
  try {
    // Reanclar con los parámetros/coordenadas vigentes (los parches pueden
    // haberse movido con los sliders).
    reanclar();
    const toneInfo = measureTonePatches(STATE.lastGrayRect);
    DEBUG.toneInfo = toneInfo;
    const lutObj = buildToneLUT(toneInfo);
    DEBUG.toneLUT = lutObj;
    if (STATE.lastGrayNorm) {
      try { STATE.lastGrayNorm.delete(); } catch(_) {}
    }
    STATE.lastGrayNorm = applyLUT(STATE.lastGrayRect, lutObj);
    return true;
  } catch (e) {
    console.error('reapplyToneLUT falló:', e);
    return false;
  }
}


// ============================================
// EXTRACCION DE FEATURES (sobre imagen YA NORMALIZADA en gris)
// ============================================
// Recibe una imagen en escala de grises (Mat 1 canal) ya normalizada por la
// LUT. Para cada celda, calcula:
//   - mean_gris: promedio del ROI
//   - frac_oscura: % de píxeles con gris < UMBRAL_OSCURO (parámetro)
function extractFeatures(grayNorm) {
  if (!STATE.detectorParams) {
    STATE.detectorParams = JSON.parse(JSON.stringify(DETECTOR_PARAMS_DEFAULT));
  }
  const P = STATE.detectorParams;
  const halfPx = getRoiHalfPx();
  const margenPct = (typeof P.roi_margin_pct === 'number') ? P.roi_margin_pct : 0.20;
  const umbralOscuro = P.umbral_oscuro;
  const features = {};

  // Diagnóstico: stats globales de la imagen normalizada
  let mn = 255, mx = 0;
  const N = grayNorm.data.length;
  for (let i = 0; i < N; i += 100) {
    if (grayNorm.data[i] < mn) mn = grayNorm.data[i];
    if (grayNorm.data[i] > mx) mx = grayNorm.data[i];
  }
  DEBUG.imageInfo = {
    rectWidth: grayNorm.cols,
    rectHeight: grayNorm.rows,
    channels: 1,
    grayMin: mn, grayMax: mx,
    graySample: [
      grayNorm.data[0],
      grayNorm.data[Math.floor(N / 4)],
      grayNorm.data[Math.floor(N / 2)],
      grayNorm.data[Math.floor(N * 3 / 4)],
      grayNorm.data[N - 1],
    ],
  };

  for (const c of getCoordsLectura()) {
    const cx = Math.round(c.x * GEOM.PX_PER_MM);
    const cy = Math.round(c.y * GEOM.PX_PER_MM);
    const x0 = Math.max(0, cx - halfPx);
    const y0 = Math.max(0, cy - halfPx);
    const x1 = Math.min(grayNorm.cols, cx + halfPx);
    const y1 = Math.min(grayNorm.rows, cy + halfPx);
    if (x1 <= x0 || y1 <= y0) { features[c.id] = null; continue; }

    const w = x1 - x0, h = y1 - y0;
    const margenX = Math.round(w * margenPct);
    const margenY = Math.round(h * margenPct);
    const xa = x0 + margenX, ya = y0 + margenY;
    const xb = x1 - margenX, yb = y1 - margenY;
    if (xb <= xa || yb <= ya) { features[c.id] = null; continue; }

    const roi = grayNorm.roi(new cv.Rect(xa, ya, xb - xa, yb - ya));
    // FIX: roi.data en OpenCV.js apunta al buffer del Mat padre (con su step
    // original) y no respeta los límites del ROI. Clonamos para forzar un
    // buffer contiguo que sí contenga ÚNICAMENTE los píxeles del ROI.
    const roiClone = roi.clone();
    const data = roiClone.data;
    const Nr = data.length;
    let sum = 0, oscuros = 0;
    for (let i = 0; i < Nr; i++) {
      sum += data[i];
      if (data[i] < umbralOscuro) oscuros++;
    }
    features[c.id] = {
      mean_gris: sum / Nr,
      frac_oscura: oscuros / Nr,
    };
    roiClone.delete();
    roi.delete();
  }
  return features;
}


// ============================================
// CLASIFICADOR (algoritmo simplificado v5)
// Decide bloque por bloque usando sólo frac_oscura.
// ============================================
function buildGroups() {
  const grupos = {};
  grupos.D1 = []; grupos.D2 = [];
  for (let i = 0; i < 10; i++) {
    grupos.D1.push({ id: `D1_${i}`, etiqueta: String(i) });
    grupos.D2.push({ id: `D2_${i}`, etiqueta: String(i) });
  }
  grupos.F = [{ id: 'F_1', etiqueta: '1' }, { id: 'F_2', etiqueta: '2' }];
  for (const q of ['P1', 'P2', 'P3', 'P4', 'P5']) {
    grupos[q] = ['A', 'B', 'C', 'D'].map(l => ({ id: `${q}_${l}`, etiqueta: l }));
  }
  return grupos;
}

function classify(features) {
  if (!STATE.detectorParams) {
    STATE.detectorParams = JSON.parse(JSON.stringify(DETECTOR_PARAMS_DEFAULT));
  }
  const P = STATE.detectorParams;
  const FRAC_MIN_PINTADA = P.frac_min_pintada;
  const FRAC_MULTI       = P.frac_multi;

  const grupos = buildGroups();
  const obligatorios = new Set(['D1', 'D2', 'F']);
  const decisiones = {};
  const detalles = {};

  for (const grupo in grupos) {
    const miembros = grupos[grupo];
    // Construir scores: cada celda contribuye con su frac_oscura
    const scores = miembros.map(m => {
      const f = features[m.id];
      return {
        id: m.id,
        etiqueta: m.etiqueta,
        frac_oscura: f ? (f.frac_oscura || 0) : 0,
        mean_gris: f ? f.mean_gris : 255,
      };
    });
    // Ordenar por frac_oscura descendente (la más pintada al primer lugar)
    scores.sort((a, b) => b.frac_oscura - a.frac_oscura);
    const ganador = scores[0];
    const segundo = scores[1] || { etiqueta: null, frac_oscura: 0, mean_gris: 255 };
    detalles[grupo] = { scores, ganador, segundo };

    const esObligatorio = obligatorios.has(grupo);

    // Lógica de decisión simplificada:
    // 1) Si la celda más oscura no llega al umbral mínimo -> bloque vacío
    if (ganador.frac_oscura < FRAC_MIN_PINTADA) {
      decisiones[grupo] = esObligatorio ? 'AMBIGUO' : null;
      continue;
    }
    // 2) Si la SEGUNDA celda también supera el umbral de múltiple -> AMBIGUO
    if (segundo.frac_oscura >= FRAC_MULTI) {
      decisiones[grupo] = 'AMBIGUO';
      continue;
    }
    // 3) Caso normal: el ganador del bloque es la respuesta
    decisiones[grupo] = ganador.etiqueta;
  }

  DEBUG.classification = { decisiones, detalles };

  const ambiguos = [];
  for (const k in decisiones) if (decisiones[k] === 'AMBIGUO') ambiguos.push(k);

  const idStr = (decisiones.D1 === 'AMBIGUO' ? '?' : (decisiones.D1 || '?'))
              + (decisiones.D2 === 'AMBIGUO' ? '?' : (decisiones.D2 || '?'));

  return {
    ID: idStr,
    F: decisiones.F === 'AMBIGUO' ? '?' : (decisiones.F || '?'),
    P1: decisiones.P1,
    P2: decisiones.P2,
    P3: decisiones.P3,
    P4: decisiones.P4,
    P5: decisiones.P5,
    dudoso: ambiguos.length > 0,
    ambiguos,
    detalles,
  };
}




// ============================================
// ANOTAR IMAGEN RECTIFICADA
// ============================================
function annotateRectified(rect, classification, features) {
  // Primero, dibujar TODOS los ROIs en gris claro (para diagnóstico visual)
  const halfPx = getRoiHalfPx();
  for (const c of getCoordsLectura()) {
    const cx = Math.round(c.x * GEOM.PX_PER_MM);
    const cy = Math.round(c.y * GEOM.PX_PER_MM);
    cv.rectangle(rect,
      new cv.Point(cx - halfPx, cy - halfPx),
      new cv.Point(cx + halfPx, cy + halfPx),
      [120, 120, 120, 180], 1);
  }

  const grupos = buildGroups();

  // Para cada grupo, marcar el ganador en color
  const ganadores = {
    D1: classification.ID[0],
    D2: classification.ID[1],
    F: classification.F,
    P1: classification.P1,
    P2: classification.P2,
    P3: classification.P3,
    P4: classification.P4,
    P5: classification.P5,
  };

  for (const grupo in ganadores) {
    const valor = ganadores[grupo];
    if (!valor || valor === '?') {
      // Marcar todos los del grupo como dudosos
      if (classification.ambiguos.includes(grupo)) {
        for (const m of grupos[grupo]) {
          drawROIBox(rect, m.id, [255, 184, 77, 255]);  // amarillo
        }
      }
      continue;
    }
    const target = grupos[grupo].find(m => m.etiqueta === valor);
    if (target) {
      drawROIBox(rect, target.id, [0, 230, 138, 255]);  // verde
    }
  }
}

function drawROIBox(rect, roiId, color) {
  const c = getCoordsLectura().find(x => x.id === roiId);
  if (!c) return;
  const halfPx = getRoiHalfPx();
  const cx = Math.round(c.x * GEOM.PX_PER_MM);
  const cy = Math.round(c.y * GEOM.PX_PER_MM);
  cv.rectangle(rect,
    new cv.Point(cx - halfPx, cy - halfPx),
    new cv.Point(cx + halfPx, cy + halfPx),
    color, 2);
}


// ============================================
// ANCLAJE A LOS CUADROS IMPRESOS
// ============================================
// La homografía se calcula con los 4 marcadores de los extremos. Si la hoja
// está doblada o arrugada, el centro de la cabecera queda corrido varios mm
// (medido: hasta 3,75 mm con casillas de 4,2 mm y paso de 6,7 mm), y las zonas
// de lectura caen entre dos cuadros. Aquí se corrige ANTES de medir:
//   1) detectarCuadrosImpresos: umbral adaptativo + contornos → centros (mm)
//      de todos los cuadros de ~roi_size mm de la imagen rectificada.
//   2) anclarCasillas: para cada grupo (fila D1, D2, F, P1…P5) se busca el
//      desplazamiento (dx, dy) que hace coincidir el MAYOR número de celdas
//      con un cuadro detectado (así no se confunde con la casilla vecina), y
//      cada celda se centra en su cuadro; las tapadas por el garabato toman el
//      desplazamiento de la fila.
//   3) anclarParches: la tira de 4 parches se localiza con una plantilla de
//      4 bandas (correlación normalizada) y se desplazan sus coordenadas.
// Todo sobre la imagen en gris ANTES de la LUT. Cuesta unos milisegundos.
const ANCLAJE = {
  TOLERANCIA_MM: 1.3,      // distancia máxima celda↔cuadro para considerarlos el mismo
  PASO_BUSQUEDA_MM: 0.25,  // resolución de la búsqueda del desplazamiento
  DEDUP_MM: 1.5,           // cuadros más cercanos que esto son el mismo (anillo exterior/interior)
  UMBRAL_BLOQUE: 41,       // adaptiveThreshold: tamaño del vecindario (px, impar)
  UMBRAL_C: 12,            // adaptiveThreshold: constante restada
  PARCHE_SCORE_MIN: 0.6,   // correlación mínima para aceptar la posición de la tira
  INTERIOR_MIN_FRAC: 0.7,  // interior del cuadro >= 70 % del nivel del papel (si no, es una forma rellena)
};

// Nivel de gris del papel: mediana de una muestra de píxeles (barato).
function nivelPapel(grayRect) {
  const d = grayRect.data, hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 97) { hist[d[i]]++; n++; }
  let acc = 0;
  for (let g = 0; g < 256; g++) { acc += hist[g]; if (acc >= n / 2) return g; }
  return 255;
}

// Devuelve los cuadros impresos detectados: [{x, y, w, h}] en mm (centros).
function detectarCuadrosImpresos(grayRect) {
  const PX = GEOM.PX_PER_MM;
  const lado = getRoiHalfPx() * 2;   // lado esperado del cuadro, en px
  // Un cuadro impreso está HUECO (papel con una letra tenue). Las formas con el
  // interior oscuro (marcadores ArUco centrales, manchas, casillas muy pintadas)
  // se descartan: no sirven de ancla y podrían desplazar una fila.
  const umbralInterior = nivelPapel(grayRect) * ANCLAJE.INTERIOR_MIN_FRAC;
  const bin = new cv.Mat();
  cv.adaptiveThreshold(grayRect, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV,
    ANCLAJE.UMBRAL_BLOQUE, ANCLAJE.UMBRAL_C);
  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  cv.findContours(bin, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  const cuadros = [];
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const b = cv.boundingRect(c);
    c.delete();
    const ok = b.width > lado * 0.7 && b.width < lado * 1.45 &&
               b.height > lado * 0.7 && b.height < lado * 1.45 &&
               Math.abs(b.width - b.height) < lado * 0.3;
    if (!ok) continue;   // letras, marcadores ArUco de esquina, parches, texto: fuera
    // Interior (40 % central): debe ser claro
    const ix = b.x + Math.round(b.width * 0.3), iy = b.y + Math.round(b.height * 0.3);
    const iw = Math.max(1, Math.round(b.width * 0.4)), ih = Math.max(1, Math.round(b.height * 0.4));
    const interior = grayRect.roi(new cv.Rect(ix, iy, iw, ih));
    const mediaInterior = cv.mean(interior)[0];
    interior.delete();
    if (mediaInterior < umbralInterior) continue;
    const q = { x: (b.x + b.width / 2) / PX, y: (b.y + b.height / 2) / PX, w: b.width / PX, h: b.height / PX };
    if (!cuadros.some(u => Math.hypot(u.x - q.x, u.y - q.y) < ANCLAJE.DEDUP_MM)) cuadros.push(q);
  }
  contours.delete(); hier.delete(); bin.delete();
  return cuadros;
}

// Ancla las coordenadas `coords` (formato de COORDS) a los cuadros detectados.
// Devuelve { coords: [...con x,y corregidos y `anclada`], porGrupo: {...}, cuadros: n }.
function anclarCasillas(grayRect, coords, radioMm) {
  const cuadros = detectarCuadrosImpresos(grayRect);
  const TOL = ANCLAJE.TOLERANCIA_MM, PASO = ANCLAJE.PASO_BUSQUEDA_MM;
  const radioY = Math.max(1, radioMm / 2);
  const grupos = {};
  for (const c of coords) {
    const g = c.id.split('_')[0];
    (grupos[g] = grupos[g] || []).push(c);
  }
  const masCercano = (cand, x, y) => {
    let best = null, dmin = Infinity;
    for (const q of cand) {
      const d = Math.hypot(q.x - x, q.y - y);
      if (d < dmin) { dmin = d; best = q; }
    }
    return { q: best, d: dmin };
  };
  const porGrupo = {}, porId = {};
  for (const g in grupos) {
    const celdas = grupos[g];
    const xs = celdas.map(c => c.x), ys = celdas.map(c => c.y);
    const cand = cuadros.filter(q =>
      q.x > Math.min(...xs) - radioMm - TOL && q.x < Math.max(...xs) + radioMm + TOL &&
      q.y > Math.min(...ys) - radioY - TOL && q.y < Math.max(...ys) + radioY + TOL);
    // Mínimo de celdas con cuadro para fiarse del desplazamiento (evita que un
    // contorno suelto desplace toda la fila).
    const minN = celdas.length >= 10 ? 3 : (celdas.length >= 4 ? 2 : 1);
    let best = { n: 0, dist: Infinity, dx: 0, dy: 0 };
    if (cand.length) {
      for (let dx = -radioMm; dx <= radioMm + 1e-9; dx += PASO) {
        for (let dy = -radioY; dy <= radioY + 1e-9; dy += PASO) {
          let n = 0, dist = 0;
          for (const c of celdas) {
            const d = masCercano(cand, c.x + dx, c.y + dy).d;
            if (d < TOL) { n++; dist += d; }
          }
          if (n > best.n || (n === best.n && n > 0 && dist < best.dist)) best = { n, dist, dx, dy };
        }
      }
    }
    const fiable = best.n >= minN;
    const dx = fiable ? best.dx : 0, dy = fiable ? best.dy : 0;
    porGrupo[g] = { cuadros: cand.length, ancladas: fiable ? best.n : 0, de: celdas.length, dx_mm: dx, dy_mm: dy };
    for (const c of celdas) {
      const m = fiable ? masCercano(cand, c.x + dx, c.y + dy) : { q: null, d: Infinity };
      porId[c.id] = (m.q && m.d < TOL)
        ? { x: m.q.x, y: m.q.y, anclada: true }
        : { x: c.x + dx, y: c.y + dy, anclada: false };
    }
  }
  const out = coords.map(c => Object.assign({}, c, porId[c.id] || {}));
  return { coords: out, porGrupo, cuadros: cuadros.length };
}

// Localiza la tira de 4 parches de tono. Devuelve { dx_mm, dy_mm, score }.
function anclarParches(grayRect, tp, radioMm) {
  const PX = GEOM.PX_PER_MM;
  const xs = tp.coords.map(p => p.x);
  const paso = (xs[3] - xs[0]) / 3;                       // separación entre parches (≈6.1 mm)
  const bw = Math.round(paso * PX);
  const bh = Math.round(Math.max(2, tp.roi_h_mm + 1) * PX);
  // Plantilla: 4 bandas claro→oscuro (solo importa la forma; la correlación es normalizada)
  const strip = new cv.Mat(bh, bw * 4, cv.CV_8UC1, new cv.Scalar(255));
  [240, 170, 100, 40].forEach((v, i) => {
    cv.rectangle(strip, new cv.Point(i * bw, 0), new cv.Point((i + 1) * bw - 1, bh - 1), new cv.Scalar(v), -1);
  });
  const cx = (xs[0] + xs[3]) / 2 * PX;
  const cy = (tp.coords[0].y + tp.coords[3].y) / 2 * PX;
  const sx = Math.round(radioMm * PX), sy = Math.round(Math.max(1, radioMm / 2) * PX);
  const w = strip.cols, h = strip.rows;
  const x0 = Math.max(0, Math.round(cx - w / 2) - sx), y0 = Math.max(0, Math.round(cy - h / 2) - sy);
  const x1 = Math.min(grayRect.cols, Math.round(cx + w / 2) + sx), y1 = Math.min(grayRect.rows, Math.round(cy + h / 2) + sy);
  let out = { dx_mm: 0, dy_mm: 0, score: 0 };
  if (x1 - x0 > w && y1 - y0 > h) {
    const roi = grayRect.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
    const res = new cv.Mat();
    cv.matchTemplate(roi, strip, res, cv.TM_CCOEFF_NORMED);
    const mm = cv.minMaxLoc(res);
    out.score = mm.maxVal;
    if (mm.maxVal >= ANCLAJE.PARCHE_SCORE_MIN) {
      out.dx_mm = (x0 + mm.maxLoc.x + w / 2 - cx) / PX;
      out.dy_mm = (y0 + mm.maxLoc.y + h / 2 - cy) / PX;
    }
    roi.delete(); res.delete();
  }
  strip.delete();
  return out;
}

// Calcula el anclaje para `grayRect` con la calibración y parámetros vigentes
// y lo deja en STATE.coordsLectura / STATE.anclaje / DEBUG.anclaje.
// Con anclaje_mm = 0 (o sin imagen) se vuelve a las coordenadas calibradas.
function aplicarAnclaje(grayRect) {
  const P = STATE.detectorParams || DETECTOR_PARAMS_DEFAULT;
  const radio = (typeof P.anclaje_mm === 'number') ? P.anclaje_mm : 0;
  STATE.coordsLectura = null;
  STATE.anclaje = null;
  if (radio > 0 && grayRect) {
    try {
      const casillas = anclarCasillas(grayRect, COORDS, radio);
      const parches = anclarParches(grayRect, getTonePatches(), radio);
      let maxDesp = 0;
      for (const g in casillas.porGrupo) {
        const r = casillas.porGrupo[g];
        maxDesp = Math.max(maxDesp, Math.hypot(r.dx_mm, r.dy_mm));
      }
      STATE.coordsLectura = casillas.coords;
      STATE.anclaje = {
        radio_mm: radio,
        porGrupo: casillas.porGrupo,
        cuadrosDetectados: casillas.cuadros,
        parches,
        maxDesplazamiento_mm: maxDesp,
      };
    } catch (e) {
      console.warn('Anclaje falló; se usan las coordenadas calibradas:', e);
      STATE.coordsLectura = null;
      STATE.anclaje = null;
    }
  }
  DEBUG.anclaje = STATE.anclaje;
  return STATE.anclaje;
}

// Vuelve a anclar la última imagen (tras cambiar calibración o parámetros).
function reanclar() {
  return aplicarAnclaje(STATE.lastGrayRect);
}

// Desplazamiento (mm) a aplicar a las coordenadas de los parches de tono.
function getParcheDesplazamiento() {
  const a = STATE.anclaje;
  if (a && a.parches && a.parches.score >= ANCLAJE.PARCHE_SCORE_MIN) {
    return { dx: a.parches.dx_mm, dy: a.parches.dy_mm };
  }
  return { dx: 0, dy: 0 };
}
