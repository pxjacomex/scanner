// ============================================================================
// EDITOR DE PARÁMETROS DEL DETECTOR (pestaña Detector)
// Sliders de umbrales, parches de tono y sus vistas previas; reclasificación en
// vivo (reclassifyLive) reutilizando las matrices del último escaneo.
// ============================================================================

// ============================================
// EDITOR DE PARAMETROS DEL DETECTOR (sliders)
// ============================================
// Definición de los sliders: cada uno tiene path en STATE.detectorParams,
// rango min/max y step, además de etiqueta y descripción.
// Cada slider declara opcionalmente un `store`:
//   - 'detector' (default): vive en STATE.detectorParams
//   - 'lut': vive en STATE.tonePatches (parámetros del patrón de tonos)
// Cuando se ajusta un slider con store='lut', además de reclassifyLive
// debemos llamar a reapplyToneLUT() para regenerar lastGrayNorm con los
// nuevos parámetros del patrón.
//
// Los grupos están ORDENADOS según el orden de aplicación en el pipeline:
//   ① Medir parches (posición y tamaño del ROI sobre cada parche)
//   ② Construir LUT (a qué grises se mapean los obs medidos)
//   ③ Aplicar LUT → imagen normalizada
//   ④ Recortar ROI de cada casillero (margen interno)
//   ⑤ Calcular frac_oscura por celda (umbral_oscuro)
//   ⑥ Decidir por bloque (frac_min_pintada, frac_multi)
const PARAM_SLIDERS = [
  // ETAPA ① — MEDICIÓN DE LOS 4 PARCHES (entrada del pipeline LUT)
  {
    grupo: '① LUT · Posición de los 4 parches (mm)',
    items: [
      { path: 'coords.0.x', store: 'lut', label: 'Blanco · centro X', min: 160, max: 195, step: 0.1, decimals: 2,
        desc: 'Posición X del centro del parche BLANCO. Si el patrón está corrido respecto al diseño, ajusta aquí. Define dónde se mide el "blanco" para construir la LUT.' },
      { path: 'coords.0.y', store: 'lut', label: 'Blanco · centro Y', min: 13, max: 21, step: 0.1, decimals: 2,
        desc: 'Posición Y del centro del parche BLANCO en mm.' },
      { path: 'coords.1.x', store: 'lut', label: 'Gris claro · centro X', min: 160, max: 195, step: 0.1, decimals: 2,
        desc: 'Posición X del centro del parche GRIS CLARO en mm.' },
      { path: 'coords.1.y', store: 'lut', label: 'Gris claro · centro Y', min: 13, max: 21, step: 0.1, decimals: 2,
        desc: 'Posición Y del centro del parche GRIS CLARO en mm.' },
      { path: 'coords.2.x', store: 'lut', label: 'Gris oscuro · centro X', min: 160, max: 195, step: 0.1, decimals: 2,
        desc: 'Posición X del centro del parche GRIS OSCURO en mm.' },
      { path: 'coords.2.y', store: 'lut', label: 'Gris oscuro · centro Y', min: 13, max: 21, step: 0.1, decimals: 2,
        desc: 'Posición Y del centro del parche GRIS OSCURO en mm.' },
      { path: 'coords.3.x', store: 'lut', label: 'Negro · centro X', min: 160, max: 195, step: 0.1, decimals: 2,
        desc: 'Posición X del centro del parche NEGRO en mm.' },
      { path: 'coords.3.y', store: 'lut', label: 'Negro · centro Y', min: 13, max: 21, step: 0.1, decimals: 2,
        desc: 'Posición Y del centro del parche NEGRO en mm.' },
    ],
  },
  {
    grupo: '① LUT · Tamaño del ROI de cada parche',
    items: [
      { path: 'roi_w_mm', store: 'lut', label: 'Ancho ROI parche (mm)', min: 1.0, max: 6.0, step: 0.1, decimals: 1,
        desc: 'Ancho del rectángulo medido dentro de cada parche. Más pequeño = más robusto a desalineamientos, menos píxeles para promediar. El parche físico ronda los 6 mm; default 4.0 deja margen.' },
      { path: 'roi_h_mm', store: 'lut', label: 'Alto ROI parche (mm)', min: 0.5, max: 3.5, step: 0.1, decimals: 1,
        desc: 'Alto del rectángulo medido dentro de cada parche. Default 2.5 mm.' },
    ],
  },

  // ETAPA ② — CONSTRUCCIÓN DE LA LUT (cómo se mapea cada obs medido)
  {
    grupo: '② LUT · Targets (escala de salida)',
    items: [
      { path: 'targets.blanco', store: 'lut', label: 'Target Blanco', min: 150, max: 255, step: 1, decimals: 0,
        desc: 'Default 220. A qué nivel de gris se mapea el parche blanco (papel ecológico). Subirlo aclara toda la imagen final.' },
      { path: 'targets.gris_claro', store: 'lut', label: 'Target Gris claro', min: 100, max: 220, step: 1, decimals: 0,
        desc: 'Default 160. Bajo a propósito: hace la curva LUT más contrastante en la zona del umbral_oscuro=130, así que las letras guía y contornos impresos quedan claramente sobre 130 (no se cuentan).' },
      { path: 'targets.gris_osc', store: 'lut', label: 'Target Gris oscuro', min: 40, max: 160, step: 1, decimals: 0,
        desc: 'Default 50. Bajo a propósito: las marcas de lápiz leves quedan claramente bajo el umbral_oscuro y se cuentan correctamente como pintadas.' },
      { path: 'targets.negro', store: 'lut', label: 'Target Negro', min: 0, max: 100, step: 1, decimals: 0,
        desc: 'Default 20. La tinta/tóner saturado se mapea a este nivel. Tiene poco impacto en la decisión porque está muy bajo el umbral.' },
    ],
  },

  // (Aquí entre ② y ③: se aplica la LUT a la imagen → grayNorm. Sin parámetros.)

  // ETAPA ③ — ANCLAJE A LOS CUADROS IMPRESOS (compensa hojas dobladas)
  {
    grupo: '③ Anclaje a los cuadros impresos',
    items: [
      { path: 'anclaje_mm', label: 'Radio de búsqueda (mm)', min: 0, max: 8, step: 0.5, decimals: 1,
        desc: 'Antes de medir, cada celda se centra en el cuadro impreso más cercano y la tira de parches se localiza en su posición real. Compensa hojas dobladas o fotos con distorsión. Es el radio en X alrededor de la posición calibrada (en Y, la mitad). 0 = desactivado. Default 6.' },
    ],
  },

  // ETAPA ④ — RECORTE DE CADA CELDA (geometría del casillero)
  {
    grupo: '④ Recorte de la celda',
    items: [
      { path: 'roi_margin_pct', label: 'Margen interno del ROI', min: 0, max: 0.40, step: 0.01, decimals: 2,
        desc: 'Porcentaje del lado de la celda que se descarta del borde antes de medir. 0.20 evita el contorno impreso pero captura el rayón de lápiz interior.' },
    ],
  },

  // ETAPA ⑤ — CONTEO DE PÍXELES OSCUROS (clasificación por píxel)
  {
    grupo: '⑤ Conteo de píxeles oscuros',
    items: [
      { path: 'umbral_oscuro', label: 'Umbral de píxel oscuro', min: 0, max: 255, step: 1, decimals: 0,
        desc: 'Rango 0-255 (escala de la imagen normalizada). Un píxel se considera "oscuro" si su gris está por debajo de este valor. Tras la LUT, papel ~220 y marcas en 30-100. Default 130 separa cómodamente.' },
    ],
  },

  // ETAPA ⑥ — DECISIÓN POR BLOQUE (cuántas celdas pintadas hay y cuál gana)
  {
    grupo: '⑥ Decisión por bloque',
    items: [
      { path: 'frac_min_pintada', label: 'Fracción mínima pintada', min: 0, max: 1, step: 0.01, decimals: 2,
        desc: 'Fracción mínima de píxeles oscuros que debe tener una celda para considerarla pintada. Vacías ~0-2%, pintadas ~35-60%. Default 0.25.' },
      { path: 'frac_multi', label: 'Fracción múltiple-marcado', min: 0, max: 1, step: 0.01, decimals: 2,
        desc: 'Si la 2ª celda del bloque también supera este %, la respuesta sale AMBIGUA (hay 2+ marcas).' },
    ],
  },
];

// Devuelve el "store" raíz que contiene el path del item.
function getParamStore(item) {
  if (!item) return STATE.detectorParams;
  if (item.store === 'lut') return STATE.tonePatches;
  return STATE.detectorParams;
}

// Encuentra el descriptor del item por path (recorriendo PARAM_SLIDERS).
function findParamItem(path) {
  for (const sec of PARAM_SLIDERS) {
    for (const it of sec.items) if (it.path === path) return it;
  }
  return null;
}

function getParamValue(path) {
  const item = findParamItem(path);
  const root = getParamStore(item);
  const parts = path.split('.');
  let v = root;
  for (const p of parts) v = v[p];
  return v;
}

function setParamValue(path, value) {
  const item = findParamItem(path);
  const root = getParamStore(item);
  const parts = path.split('.');
  let obj = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    obj = obj[k];
  }
  obj[parts[parts.length - 1]] = value;
}

function renderParamsUI() {
  const cont = document.getElementById('paramsControls');
  if (!cont) return;
  cont.innerHTML = '';

  for (const seccion of PARAM_SLIDERS) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'param-group';
    let html = `<div class="param-group-title">${seccion.grupo}</div>`;
    for (const item of seccion.items) {
      const val = getParamValue(item.path);
      // Convertimos el path a un id válido para CSS (los puntos no son válidos)
      const safeId = 'preview-' + item.path.replace(/\./g, '_');
      html += `
        <div class="param-row">
          <div class="param-row-head">
            <span class="param-name">${item.label}</span>
            <span class="param-value" data-path="${item.path}">${val.toFixed(item.decimals)}</span>
          </div>
          <input type="range" data-path="${item.path}" data-decimals="${item.decimals}"
                 min="${item.min}" max="${item.max}" step="${item.step}" value="${val}">
          <div class="param-preview" id="${safeId}" data-path="${item.path}"></div>
          <div class="param-desc">${item.desc}</div>
        </div>
      `;
    }
    groupDiv.innerHTML = html;
    cont.appendChild(groupDiv);
  }

  // Eventos de los sliders
  cont.querySelectorAll('input[type="range"]').forEach(slider => {
    slider.addEventListener('input', () => {
      const path = slider.dataset.path;
      const decimals = parseInt(slider.dataset.decimals, 10);
      const v = parseFloat(slider.value);
      setParamValue(path, v);
      // Actualizar valor mostrado
      const span = cont.querySelector(`.param-value[data-path="${path}"]`);
      if (span) span.textContent = v.toFixed(decimals);
      // Si el slider modifica parámetros LUT, hay que reaplicar la LUT antes
      // de reclasificar (porque cambia lastGrayNorm).
      const item = findParamItem(path);
      if (item && item.store === 'lut') {
        reapplyToneLUT();
      }
      // Reclasificar en vivo (regenera DEBUG.features y DEBUG.classification)
      reclassifyLive();
      // Refrescar TODAS las previews (algunas dependen de varios parámetros)
      renderAllParamPreviews();
    });
  });

  // Mostrar estado inicial: si hay imagen disponible, ocultar el aviso y mostrar el resumen
  const noImage = document.getElementById('paramsNoImage');
  const live = document.getElementById('paramsLiveResult');
  if (STATE.lastRectifiedMat || DEBUG.features) {
    noImage.style.display = 'none';
    live.style.display = 'block';
    reclassifyLive();
    renderAllParamPreviews();
  } else {
    noImage.style.display = 'block';
    live.style.display = 'none';
  }
}

// ==========================================================================
// PREVIEWS DE LOS SLIDERS DE LA PESTAÑA DETECTOR (versión simplificada v2)
// Cada slider muestra una visualización adaptada a lo que controla:
//  - umbral_oscuro: histograma de grises (imagen normalizada) con línea
//                   vertical en el umbral. Permite ver la brecha entre
//                   los píxeles del papel (claros) y los de las marcas.
//  - frac_min_pintada: matriz de las 42 celdas con su fO; verde si pasa.
//  - frac_multi: bloques con sus celdas que pasan; rojo si hay 2+ marcas.
//  - roi_margin_pct: dos celdas (pintada+vacía) con el rectángulo medido.
// Además mostramos siempre el ESTADO DE LA LUT al inicio: los 4 parches
// observados vs su target, para que el usuario sepa que la calibración
// de tonos está funcionando.
// ==========================================================================

const PARAM_PREVIEW_BUILDERS = {
  // Anclaje a los cuadros impresos
  'anclaje_mm':       buildPreviewAnclaje,
  // Decisión / ROI
  'umbral_oscuro':    buildPreviewUmbralOscuro,
  'frac_min_pintada': buildPreviewFracMin,
  'frac_multi':       buildPreviewFracMulti,
  'roi_margin_pct':   buildPreviewRoiMargin,
  // Patrón LUT - posición de los parches (8 sliders comparten preview)
  'coords.0.x':       buildPreviewPatchPosition,
  'coords.0.y':       buildPreviewPatchPosition,
  'coords.1.x':       buildPreviewPatchPosition,
  'coords.1.y':       buildPreviewPatchPosition,
  'coords.2.x':       buildPreviewPatchPosition,
  'coords.2.y':       buildPreviewPatchPosition,
  'coords.3.x':       buildPreviewPatchPosition,
  'coords.3.y':       buildPreviewPatchPosition,
  // Patrón LUT - tamaño ROI (mismo preview para ancho y alto)
  'roi_w_mm':         buildPreviewPatchRoiSize,
  'roi_h_mm':         buildPreviewPatchRoiSize,
  // Patrón LUT - targets (los 4 sliders comparten la curva)
  'targets.blanco':     buildPreviewLutCurve,
  'targets.gris_claro': buildPreviewLutCurve,
  'targets.gris_osc':   buildPreviewLutCurve,
  'targets.negro':      buildPreviewLutCurve,
};

function renderAllParamPreviews() {
  if (!DEBUG.classification || !DEBUG.features) return;
  for (const path in PARAM_PREVIEW_BUILDERS) {
    const safeId = 'preview-' + path.replace(/\./g, '_');
    const el = document.getElementById(safeId);
    if (!el) continue;
    try {
      PARAM_PREVIEW_BUILDERS[path](el, path);
    } catch (e) {
      console.warn('Preview falló para', path, e);
    }
  }
}

const GRUPOS_ORDEN = ['D1','D2','F','P1','P2','P3','P4','P5'];

// Helper: lista todas las celdas con su feature, ordenadas por grupo
function listarTodasLasCeldas() {
  const grupos = buildGroups();
  const out = [];
  for (const grupo of GRUPOS_ORDEN) {
    for (const m of grupos[grupo]) {
      const f = DEBUG.features[m.id];
      out.push({ grupo, etiqueta: m.etiqueta, id: m.id, feat: f });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Preview 1: umbral_oscuro
// Histograma de grises de la imagen normalizada SOLO en las regiones de
// las celdas (no en todo el fondo, para que el histograma refleje lo que
// realmente decide el detector). Línea vertical roja en el umbral actual.
// Los píxeles a la izquierda del umbral son los que cuentan como "oscuros".
// ---------------------------------------------------------------------------
function buildPreviewUmbralOscuro(el, path) {
  const umbral = STATE.detectorParams.umbral_oscuro;
  if (!STATE.lastGrayNorm) {
    el.innerHTML = `<div class="pv-foot">Sin imagen normalizada disponible</div>`;
    return;
  }

  // Construir histograma de grises sumando los ROIs de TODAS las celdas
  const halfPx = getRoiHalfPx();
  const margenPct = STATE.detectorParams.roi_margin_pct;
  const NB = 32; // 32 bins (8 niveles por bin)
  const hist = new Array(NB).fill(0);
  let total = 0;

  const g = STATE.lastGrayNorm;
  for (const c of COORDS) {
    const cx = Math.round(c.x * GEOM.PX_PER_MM);
    const cy = Math.round(c.y * GEOM.PX_PER_MM);
    const x0 = Math.max(0, cx - halfPx);
    const y0 = Math.max(0, cy - halfPx);
    const x1 = Math.min(g.cols, cx + halfPx);
    const y1 = Math.min(g.rows, cy + halfPx);
    if (x1 <= x0 || y1 <= y0) continue;
    const w = x1 - x0, h = y1 - y0;
    const mx = Math.round(w * margenPct), my = Math.round(h * margenPct);
    const xa = x0 + mx, ya = y0 + my;
    const xb = x1 - mx, yb = y1 - my;
    if (xb <= xa || yb <= ya) continue;
    // Recorrer ROI
    const stride = g.cols;
    for (let y = ya; y < yb; y++) {
      const base = y * stride;
      for (let x = xa; x < xb; x++) {
        const v = g.data[base + x];
        const bin = Math.min(NB - 1, Math.floor(v * NB / 256));
        hist[bin]++;
        total++;
      }
    }
  }
  const maxH = Math.max(...hist, 1);
  const umbralBin = umbral * NB / 256;

  let html = `<div class="pv-title">Histograma de grises en celdas · línea = umbral ${umbral}</div>`;
  html += `<div class="pv-uo-hist" style="--threshold-pct:${(umbralBin/NB)*100}%">`;
  for (let i = 0; i < NB; i++) {
    const valIni = Math.floor(i * 256 / NB);
    const valFin = Math.floor((i+1) * 256 / NB);
    const h = (hist[i] / maxH) * 100;
    const cls = (valFin <= umbral) ? 'pv-uo-bar-osc' : 'pv-uo-bar-claro';
    html += `<div class="pv-uo-bar ${cls}" style="height:${h}%" title="${valIni}-${valFin}: ${hist[i]}px"></div>`;
  }
  html += `</div>`;
  // Etiquetas en el eje
  html += `<div class="pv-uo-axis"><span>0</span><span>64</span><span>128</span><span>192</span><span>255</span></div>`;
  // Resumen
  let oscuros = 0;
  for (let i = 0; i < NB; i++) {
    const valFin = Math.floor((i+1) * 256 / NB);
    if (valFin <= umbral) oscuros += hist[i];
  }
  const pct = total > 0 ? (oscuros / total * 100) : 0;
  html += `<div class="pv-foot">${pct.toFixed(1)}% del total son píxeles "oscuros". `
       +  `Verde = oscuros (cuentan), gris = claros (no).</div>`;
  el.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Preview 2: frac_min_pintada
// Las 42 celdas como cuadritos. Verde si su fO supera el umbral; gris si no.
// ---------------------------------------------------------------------------
function buildPreviewFracMin(el, path) {
  const umbral = STATE.detectorParams.frac_min_pintada;
  const todas = listarTodasLasCeldas();

  let html = `<div class="pv-title">Celdas que pasan el umbral de "pintada" (${(umbral*100).toFixed(0)}%)</div>`;
  html += `<div class="pv-cells-grid">`;
  for (const c of todas) {
    const fo = c.feat ? (c.feat.frac_oscura || 0) : 0;
    const pasa = fo >= umbral;
    const cls = pasa ? 'pv-cell-on' : 'pv-cell-off';
    const lbl = (c.grupo === 'D1' || c.grupo === 'D2') ? c.etiqueta
              : (c.grupo === 'F') ? 'F'+c.etiqueta : c.grupo+c.etiqueta;
    html += `<div class="pv-cell ${cls}" title="${c.id} fO=${(fo*100).toFixed(0)}%">`
         +  `<div class="pv-cell-lbl">${lbl}</div>`
         +  `<div class="pv-cell-val">${(fo*100).toFixed(0)}</div>`
         +  `</div>`;
  }
  html += `</div>`;
  const pintadas = todas.filter(c => c.feat && (c.feat.frac_oscura || 0) >= umbral).length;
  html += `<div class="pv-foot">${pintadas} de 42 celdas pasan · valores en %</div>`;
  el.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Preview 3: frac_multi
// Por cada bloque, indicar cuántas celdas superan el umbral.
// Verde si =1, rojo si ≥2 (multi-marcado), gris si =0.
// ---------------------------------------------------------------------------
function buildPreviewFracMulti(el, path) {
  const umbral = STATE.detectorParams.frac_multi;
  const det = DEBUG.classification.detalles;

  let html = `<div class="pv-title">Bloques con 2+ celdas sobre el umbral (${(umbral*100).toFixed(0)}%)</div>`;
  html += `<div class="pv-blocks">`;
  for (const grupo of GRUPOS_ORDEN) {
    if (!det[grupo]) continue;
    const sobreUmbral = det[grupo].scores.filter(s => s.frac_oscura >= umbral);
    let estado = 'pv-block-empty', icono = '–';
    if (sobreUmbral.length >= 2) { estado = 'pv-block-multi'; icono = '⚠'; }
    else if (sobreUmbral.length === 1) { estado = 'pv-block-ok'; icono = '✓'; }

    const labels = sobreUmbral
      .sort((a,b) => b.frac_oscura - a.frac_oscura)
      .map(s => `${s.etiqueta}(${(s.frac_oscura*100).toFixed(0)})`)
      .join(' ');
    html += `<div class="pv-block ${estado}">`
         +  `<div class="pv-block-name">${icono} ${grupo}</div>`
         +  `<div class="pv-block-detail">${labels || '—'}</div>`
         +  `</div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Preview 4: roi_margin_pct
// Dos mini-imágenes: una celda pintada y una vacía, con el rectángulo
// de medición sobre el área que efectivamente se usa.
// Trabaja sobre la imagen NORMALIZADA en gris (lastGrayNorm).
// ---------------------------------------------------------------------------
function buildPreviewRoiMargin(el, path) {
  const margenPct = STATE.detectorParams.roi_margin_pct;
  if (!STATE.lastGrayNorm) {
    el.innerHTML = `<div class="pv-foot">Sin imagen normalizada disponible</div>`;
    return;
  }

  const todas = listarTodasLasCeldas().filter(c => c.feat);
  if (todas.length === 0) { el.innerHTML = ''; return; }
  todas.sort((a,b) => (b.feat.frac_oscura || 0) - (a.feat.frac_oscura || 0));
  const pintada = todas[0];
  const vacia = todas[Math.floor(todas.length * 0.6)];

  function dibujarCelda(canvas, c) {
    if (!c) return;
    const halfPx = getRoiHalfPx();
    const coord = COORDS.find(co => co.id === c.id);
    if (!coord) return;
    const cxp = Math.round(coord.x * GEOM.PX_PER_MM);
    const cyp = Math.round(coord.y * GEOM.PX_PER_MM);
    const x0 = Math.max(0, cxp - halfPx);
    const y0 = Math.max(0, cyp - halfPx);
    const w = halfPx * 2;
    const h = halfPx * 2;
    const SCALE = 3;
    canvas.width = w * SCALE;
    canvas.height = h * SCALE;
    const ctx = canvas.getContext('2d');
    // Dibujar la región (recorte de la imagen normalizada en gris)
    const tmp = document.createElement('canvas');
    tmp.width = STATE.lastGrayNorm.cols;
    tmp.height = STATE.lastGrayNorm.rows;
    cv.imshow(tmp, STATE.lastGrayNorm);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, x0, y0, w, h, 0, 0, w*SCALE, h*SCALE);
    // Rectángulo de medición (con margen interno)
    const mx = w * margenPct;
    const my = h * margenPct;
    ctx.strokeStyle = '#00e68a';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx*SCALE, my*SCALE, (w-2*mx)*SCALE, (h-2*my)*SCALE);
    // Borde exterior
    ctx.strokeStyle = '#5eb8ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas.width-1, canvas.height-1);
  }

  el.innerHTML = `
    <div class="pv-title">Área medida (verde) tras descartar el ${(margenPct*100).toFixed(0)}% del borde · imagen normalizada</div>
    <div class="pv-roi-pair">
      <div class="pv-roi-item">
        <canvas class="pv-roi-canvas" id="pv-roi-pintada"></canvas>
        <div class="pv-roi-lbl">Pintada (${pintada.id}) fO=${(pintada.feat.frac_oscura*100).toFixed(0)}%</div>
      </div>
      <div class="pv-roi-item">
        <canvas class="pv-roi-canvas" id="pv-roi-vacia"></canvas>
        <div class="pv-roi-lbl">Vacía (${vacia.id}) fO=${(vacia.feat.frac_oscura*100).toFixed(0)}%</div>
      </div>
    </div>
  `;
  dibujarCelda(document.getElementById('pv-roi-pintada'), pintada);
  dibujarCelda(document.getElementById('pv-roi-vacia'), vacia);
}

// ---------------------------------------------------------------------------
// Preview · Posición de un parche LUT (común a las 8 sliders coords.X.Y)
// Muestra la región exacta de la imagen rectificada donde se está midiendo
// el parche en cuestión, con el rectángulo del ROI superpuesto en verde.
// El "obs" medido se imprime al pie. Como cualquier slider coord.X.Y afecta
// los 4 parches en la columna del cuerpo de la preview, dibujamos los 4
// parches en una grilla y resaltamos el activo.
// ---------------------------------------------------------------------------
function buildPreviewPatchPosition(el, path) {
  if (!STATE.lastGrayRect) {
    el.innerHTML = `<div class="pv-foot">Sin imagen disponible</div>`;
    return;
  }
  const tp = getTonePatches();
  const dP = getParcheDesplazamiento();   // corrección del anclaje (0 si no hay)
  // El path tiene formato 'coords.<idx>.x' o 'coords.<idx>.y'
  const m = path.match(/^coords\.(\d+)\.(x|y)$/);
  const activeIdx = m ? parseInt(m[1], 10) : -1;

  const wPx = Math.round(tp.roi_w_mm * GEOM.PX_PER_MM);
  const hPx = Math.round(tp.roi_h_mm * GEOM.PX_PER_MM);
  const PAD_MM = 1.5; // contexto alrededor del ROI

  // Necesitamos lastGrayRect (gris pre-LUT) en un canvas para recortar
  const tmp = document.createElement('canvas');
  tmp.width = STATE.lastGrayRect.cols;
  tmp.height = STATE.lastGrayRect.rows;
  cv.imshow(tmp, STATE.lastGrayRect);

  el.innerHTML = `
    <div class="pv-title">ROIs de los 4 parches sobre la imagen rectificada (gris pre-LUT)</div>
    <div class="pv-tone-grid"></div>
    <div class="pv-foot" id="pv-tone-foot-${path.replace(/\./g,'_')}"></div>
  `;
  const grid = el.querySelector('.pv-tone-grid');
  const obs = (DEBUG.toneInfo && DEBUG.toneInfo.obs) || [null, null, null, null];

  for (let i = 0; i < 4; i++) {
    const c = tp.coords[i];
    const cxp = Math.round((c.x + dP.dx) * GEOM.PX_PER_MM);
    const cyp = Math.round((c.y + dP.dy) * GEOM.PX_PER_MM);
    const padPx = Math.round(PAD_MM * GEOM.PX_PER_MM);
    const cropW = wPx + padPx * 2;
    const cropH = hPx + padPx * 2;
    const cropX = Math.max(0, cxp - cropW / 2);
    const cropY = Math.max(0, cyp - cropH / 2);

    const card = document.createElement('div');
    card.className = 'pv-tone-card' + (i === activeIdx ? ' pv-tone-card-active' : '');
    const SCALE = 2;
    card.innerHTML = `
      <canvas width="${cropW * SCALE}" height="${cropH * SCALE}"></canvas>
      <div class="pv-tone-card-lbl">${c.id}<br>obs=${obs[i] != null ? obs[i].toFixed(0) : '–'}</div>
    `;
    grid.appendChild(card);
    const canvas = card.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Dibujar el recorte
    ctx.drawImage(tmp, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    // Dibujar rectángulo del ROI
    const roiX = (cxp - cropX - wPx / 2) * SCALE;
    const roiY = (cyp - cropY - hPx / 2) * SCALE;
    ctx.strokeStyle = (i === activeIdx) ? '#00e68a' : 'rgba(0,230,138,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(roiX, roiY, wPx * SCALE, hPx * SCALE);
    // Marcador de centro
    ctx.fillStyle = '#ff5577';
    const cxOnCanvas = (cxp - cropX) * SCALE;
    const cyOnCanvas = (cyp - cropY) * SCALE;
    ctx.fillRect(cxOnCanvas - 2, cyOnCanvas - 2, 4, 4);
  }

  // Pie con info del parche activo
  const foot = document.getElementById(`pv-tone-foot-${path.replace(/\./g,'_')}`);
  if (foot && activeIdx >= 0) {
    const c = tp.coords[activeIdx];
    const obsV = obs[activeIdx];
    const tgt = tp.targets[c.id];
    const monOk = DEBUG.toneInfo && DEBUG.toneInfo.monotonyOk;
    foot.innerHTML = `Parche ajustado: <strong>${c.id}</strong> · centro = (${c.x.toFixed(2)}, ${c.y.toFixed(2)}) mm · obs ${obsV != null ? obsV.toFixed(0) : '–'} → target ${tgt}` +
                     (monOk ? '' : '  ·  <span style="color:var(--error)">⚠ orden de tonos roto</span>');
  }
}

// ---------------------------------------------------------------------------
// Preview · Tamaño del ROI del parche (común a roi_w_mm y roi_h_mm)
// Muestra los 4 parches con el ROI dibujado al tamaño actual.
// Imprime el "std" observado en cada parche: si el ROI es demasiado grande
// y captura bordes, std sube; si es chico, std baja.
// ---------------------------------------------------------------------------
function buildPreviewPatchRoiSize(el, path) {
  if (!STATE.lastGrayRect) {
    el.innerHTML = `<div class="pv-foot">Sin imagen disponible</div>`;
    return;
  }
  const tp = getTonePatches();
  const dP = getParcheDesplazamiento();   // corrección del anclaje (0 si no hay)
  const wPx = Math.round(tp.roi_w_mm * GEOM.PX_PER_MM);
  const hPx = Math.round(tp.roi_h_mm * GEOM.PX_PER_MM);
  const PAD_MM = 2.0;

  const tmp = document.createElement('canvas');
  tmp.width = STATE.lastGrayRect.cols;
  tmp.height = STATE.lastGrayRect.rows;
  cv.imshow(tmp, STATE.lastGrayRect);

  el.innerHTML = `
    <div class="pv-title">ROI ${tp.roi_w_mm.toFixed(1)} × ${tp.roi_h_mm.toFixed(1)} mm sobre los 4 parches · std bajo = ROI bien dentro</div>
    <div class="pv-tone-grid"></div>
  `;
  const grid = el.querySelector('.pv-tone-grid');
  const obs = (DEBUG.toneInfo && DEBUG.toneInfo.obs) || [];
  const stds = (DEBUG.toneInfo && DEBUG.toneInfo.stds) || [];

  for (let i = 0; i < 4; i++) {
    const c = tp.coords[i];
    const cxp = Math.round((c.x + dP.dx) * GEOM.PX_PER_MM);
    const cyp = Math.round((c.y + dP.dy) * GEOM.PX_PER_MM);
    const padPx = Math.round(PAD_MM * GEOM.PX_PER_MM);
    const cropW = Math.max(wPx, 60) + padPx * 2;
    const cropH = Math.max(hPx, 40) + padPx * 2;
    const cropX = Math.max(0, cxp - cropW / 2);
    const cropY = Math.max(0, cyp - cropH / 2);

    // Color del std: bajo=verde, alto=rojo
    const stdVal = stds[i] || 0;
    const stdHi = stdVal > 8;
    const stdMid = stdVal > 4 && stdVal <= 8;

    const card = document.createElement('div');
    card.className = 'pv-tone-card';
    const SCALE = 2;
    card.innerHTML = `
      <canvas width="${cropW * SCALE}" height="${cropH * SCALE}"></canvas>
      <div class="pv-tone-card-lbl">${c.id}<br>std=<span style="color:${stdHi ? 'var(--error)' : (stdMid ? 'var(--warn)' : 'var(--accent)')}">${stdVal.toFixed(1)}</span></div>
    `;
    grid.appendChild(card);
    const canvas = card.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    // ROI rectangle
    const roiX = (cxp - cropX - wPx / 2) * SCALE;
    const roiY = (cyp - cropY - hPx / 2) * SCALE;
    ctx.strokeStyle = stdHi ? '#ff5577' : (stdMid ? '#ffb84d' : '#00e68a');
    ctx.lineWidth = 2;
    ctx.strokeRect(roiX, roiY, wPx * SCALE, hPx * SCALE);
  }
}

// ---------------------------------------------------------------------------
// Preview · Curva de la LUT (común a los 4 sliders de targets)
// Muestra la curva de transferencia g_observado → g_normalizado con los
// 4 puntos de control marcados. Línea vertical del umbral_oscuro como
// referencia. El target "ajustado" se resalta. Al lado, una franja de la
// imagen final actualmente normalizada para ver el efecto.
// ---------------------------------------------------------------------------
function buildPreviewLutCurve(el, path) {
  if (!STATE.lastGrayNorm) {
    el.innerHTML = `<div class="pv-foot">Sin imagen disponible</div>`;
    return;
  }
  const tp = getTonePatches();
  const lutObj = DEBUG.toneLUT;
  const toneInfo = DEBUG.toneInfo;
  const umbral = STATE.detectorParams.umbral_oscuro;

  // El path es 'targets.<id>'; identificamos el target activo
  const m = path.match(/^targets\.(.+)$/);
  const activeKey = m ? m[1] : null;

  const canvasId = 'pv-lut-curve-' + path.replace(/\./g, '_');
  const stripCanvasId = 'pv-lut-strip-' + path.replace(/\./g, '_');

  el.innerHTML = `
    <div class="pv-title">Curva LUT · línea naranja = umbral oscuro (${umbral})</div>
    <canvas class="pv-lut-curve" id="${canvasId}" width="220" height="120"></canvas>
    <div class="pv-foot" id="pv-lut-foot-${path.replace(/\./g,'_')}"></div>
    <div class="pv-title" style="margin-top:8px">Imagen final tras aplicar la LUT</div>
    <div class="pv-bc-strip-wrap">
      <canvas class="pv-bc-strip" id="${stripCanvasId}"></canvas>
    </div>
  `;

  // Dibujar la curva
  const cv2 = document.getElementById(canvasId);
  const ctx2 = cv2.getContext('2d');
  ctx2.fillStyle = '#0a0a0f';
  ctx2.fillRect(0, 0, cv2.width, cv2.height);
  // Diagonal de referencia
  ctx2.strokeStyle = '#444';
  ctx2.lineWidth = 1;
  ctx2.setLineDash([2, 3]);
  ctx2.beginPath();
  ctx2.moveTo(0, cv2.height);
  ctx2.lineTo(cv2.width, 0);
  ctx2.stroke();
  ctx2.setLineDash([]);
  // Línea vertical del umbral
  ctx2.strokeStyle = '#ffb84d';
  ctx2.lineWidth = 1;
  const xUmbral = (umbral / 255) * cv2.width;
  ctx2.beginPath();
  ctx2.moveTo(xUmbral, 0);
  ctx2.lineTo(xUmbral, cv2.height);
  ctx2.stroke();
  // Línea horizontal del umbral (también muestra a qué altura cae)
  ctx2.strokeStyle = 'rgba(255,184,77,0.3)';
  ctx2.beginPath();
  const yUmbral = cv2.height - (umbral / 255) * cv2.height;
  ctx2.moveTo(0, yUmbral);
  ctx2.lineTo(cv2.width, yUmbral);
  ctx2.stroke();
  // Curva LUT actual
  if (lutObj && lutObj.lut) {
    ctx2.strokeStyle = '#00e68a';
    ctx2.lineWidth = 2;
    ctx2.beginPath();
    for (let g = 0; g <= 255; g++) {
      const v = lutObj.lut[g];
      const x = (g / 255) * cv2.width;
      const y = cv2.height - (v / 255) * cv2.height;
      if (g === 0) ctx2.moveTo(x, y);
      else ctx2.lineTo(x, y);
    }
    ctx2.stroke();
  }
  // Puntos de control: obs vs target
  if (toneInfo) {
    for (let i = 0; i < 4; i++) {
      const obs = toneInfo.obs[i];
      const tgt = toneInfo.target[i];
      const x = (obs / 255) * cv2.width;
      const y = cv2.height - (tgt / 255) * cv2.height;
      const isActive = (toneInfo.names[i] === activeKey);
      ctx2.fillStyle = isActive ? '#ff5577' : '#5eb8ff';
      const r = isActive ? 5 : 3;
      ctx2.beginPath();
      ctx2.arc(x, y, r, 0, Math.PI * 2);
      ctx2.fill();
    }
  }

  // Pie: descripción del target activo
  const foot = document.getElementById(`pv-lut-foot-${path.replace(/\./g,'_')}`);
  if (foot && activeKey && toneInfo) {
    const idx = toneInfo.names.indexOf(activeKey);
    if (idx >= 0) {
      foot.innerHTML = `Punto ajustado: <strong>${activeKey}</strong>: obs ${toneInfo.obs[idx].toFixed(0)} → target <strong>${toneInfo.target[idx]}</strong>` +
                       `${toneInfo.monotonyOk ? '' : ' · <span style="color:var(--error)">⚠ orden roto</span>'}`;
    }
  }

  // Franja de la imagen final actual (D1 row)
  const FRANJA_Y_MM = 11.75, FRANJA_X0_MM = 14, FRANJA_X1_MM = 80, FRANJA_H_MM = 5;
  const PX = GEOM.PX_PER_MM;
  const fx0 = Math.max(0, Math.round(FRANJA_X0_MM * PX));
  const fx1 = Math.min(STATE.lastGrayNorm.cols, Math.round(FRANJA_X1_MM * PX));
  const fyc = Math.round(FRANJA_Y_MM * PX);
  const halfH = Math.round(FRANJA_H_MM * PX / 2);
  const fy0 = Math.max(0, fyc - halfH);
  const fy1 = Math.min(STATE.lastGrayNorm.rows, fyc + halfH);
  const tmp = document.createElement('canvas');
  tmp.width = STATE.lastGrayNorm.cols;
  tmp.height = STATE.lastGrayNorm.rows;
  cv.imshow(tmp, STATE.lastGrayNorm);
  const cv1 = document.getElementById(stripCanvasId);
  const fw = fx1 - fx0, fh = fy1 - fy0;
  const SCALE_W = Math.min(1.5, 320 / fw);
  cv1.width = Math.round(fw * SCALE_W);
  cv1.height = Math.round(fh * SCALE_W);
  const ctx = cv1.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, fx0, fy0, fw, fh, 0, 0, cv1.width, cv1.height);
}



function buildPreviewAnclaje(el, path) {
  if (!STATE.lastGrayRect) {
    el.innerHTML = `<div class="pv-foot">Sin imagen disponible</div>`;
    return;
  }
  const a = STATE.anclaje;
  if (!a) {
    el.innerHTML = `<div class="pv-foot">Anclaje desactivado: se leen las coordenadas calibradas tal cual.</div>`;
    return;
  }
  const signo = (v) => (v >= 0 ? '+' : '') + v.toFixed(2);
  let filas = '';
  for (const g of ['D1', 'D2', 'F', 'P1', 'P2', 'P3', 'P4', 'P5']) {
    const r = a.porGrupo[g];
    if (!r) continue;
    const desp = Math.hypot(r.dx_mm, r.dy_mm);
    const color = r.ancladas === 0 ? 'var(--error)' : (desp > 2 ? 'var(--warn)' : 'var(--accent)');
    filas += `<div>${g.padEnd(2)}: <span style="color:${color}">${signo(r.dx_mm)}, ${signo(r.dy_mm)} mm</span> · ${r.ancladas}/${r.de} celdas con cuadro</div>`;
  }
  const p = a.parches;
  const parchesTxt = (p.score >= ANCLAJE.PARCHE_SCORE_MIN)
    ? `${signo(p.dx_mm)}, ${signo(p.dy_mm)} mm (correlación ${p.score.toFixed(2)})`
    : `no localizada (correlación ${p.score.toFixed(2)}); se usan las coordenadas calibradas`;
  el.innerHTML = `
    <div class="pv-title">Desplazamiento (x, y) aplicado a cada grupo respecto a la calibración</div>
    <div class="pv-foot" style="font-family:ui-monospace,monospace;line-height:1.7;white-space:pre-wrap">${filas}<div>Tira de parches: ${parchesTxt}</div><div>Cuadros impresos detectados: ${a.cuadrosDetectados} · desplazamiento máximo: ${a.maxDesplazamiento_mm.toFixed(2)} mm</div></div>
  `;
}

function reclassifyLive() {
  // Reclasifica la imagen actual con los parámetros vigentes del detector.
  // Trabaja directamente sobre STATE.lastGrayNorm. Si el usuario ajustó los
  // parámetros del patrón de tonos, debe llamarse antes a reapplyToneLUT()
  // para regenerar lastGrayNorm.
  if (!STATE.cvReady) return;

  // Reanclar celdas y parches con la calibración/parámetros vigentes
  reanclar();

  let classification = null;
  if (STATE.lastGrayNorm) {
    try {
      const features = extractFeatures(STATE.lastGrayNorm);
      DEBUG.features = features;
      classification = classify(features);
    } catch (e) {
      console.error('Error reclasificando:', e);
      return;
    }
  } else if (DEBUG.features) {
    classification = classify(DEBUG.features);
  } else {
    return;
  }

  // Helper: actualiza un panel "live" (existe en pestaña Detector y en pestaña Calibrar)
  function updateLivePanel(idID, idF, idQ) {
    const valID = document.getElementById(idID);
    const valF  = document.getElementById(idF);
    const cellID = valID ? valID.parentElement : null;
    const cellF  = valF  ? valF.parentElement  : null;
    if (valID) valID.textContent = classification.ID;
    if (valF)  valF.textContent  = classification.F;
    if (cellID) cellID.classList.toggle('warn', classification.ID.includes('?'));
    if (cellF)  cellF.classList.toggle('warn', classification.F === '?');

    const qCont = document.getElementById(idQ);
    if (qCont) {
      qCont.innerHTML = '';
      for (let i = 1; i <= 5; i++) {
        const q = `P${i}`;
        const v = classification[q];
        const cell = document.createElement('div');
        cell.className = 'params-q-cell';
        let display, cls = '';
        if (v === 'AMBIGUO') { display = '?'; cls = 'dudoso'; }
        else if (v) { display = v; cls = 'detected'; }
        else { display = '–'; }
        if (cls) cell.classList.add(cls);
        cell.innerHTML = `<div class="ql">${q}</div><div class="qv">${display}</div>`;
        qCont.appendChild(cell);
      }
    }
  }

  // Actualizar AMBOS paneles "live"
  updateLivePanel('paramsValID', 'paramsValF', 'paramsValQ');
  updateLivePanel('calibValID',  'calibValF',  'calibValQ');

  // Mostrar el panel calibLiveResult si hay imagen rectificada disponible
  const calibLive = document.getElementById('calibLiveResult');
  if (calibLive) {
    calibLive.style.display = STATE.lastRectifiedMat ? 'block' : 'none';
  }

  // Si estamos viendo el resultado de un escaneo en la pestaña Escanear,
  // sincronizar también ese resultado con los nuevos parámetros.
  if (STATE.currentScan) {
    STATE.currentScan.ID = classification.ID;
    STATE.currentScan.F  = classification.F;
    STATE.currentScan.P1 = classification.P1;
    STATE.currentScan.P2 = classification.P2;
    STATE.currentScan.P3 = classification.P3;
    STATE.currentScan.P4 = classification.P4;
    STATE.currentScan.P5 = classification.P5;
    STATE.currentScan.dudoso = classification.dudoso;
    STATE.currentScan.ambiguos = classification.ambiguos;
    // Sólo re-renderizamos el panel de scan si está visible
    const scanResultEl = document.getElementById('scanResult');
    if (scanResultEl && !scanResultEl.classList.contains('hidden')) {
      renderScanResult();
    }
    // Re-anotar la imagen del canvas en la pestaña scan, si tenemos la base limpia
    if (STATE.lastRectifiedMat) {
      try {
        const reAnotada = STATE.lastRectifiedMat.clone();
        annotateRectified(reAnotada, classification, DEBUG.features);
        const scanCanvas = document.getElementById('resultCanvas');
        if (scanCanvas) cv.imshow(scanCanvas, reAnotada);
        STATE.lastRectifiedDataURL = scanCanvas ? scanCanvas.toDataURL('image/png') : STATE.lastRectifiedDataURL;
        reAnotada.delete();
      } catch (e) {
        console.warn('No se pudo re-anotar el canvas:', e);
      }
    }
  }

  // Refrescar las vistas previas de la pestaña Detector (si están en pantalla)
  if (typeof renderAllParamPreviews === 'function') {
    try { renderAllParamPreviews(); } catch(_) {}
  }
}

function saveDetectorParams() {
  const ok1 = persistDetectorParams();
  const ok2 = persistTonePatches();
  if (ok1 && ok2) toast('Parámetros guardados', 'success');
  else toast('No se pudo guardar (¿modo privado?)', 'error');
}

function resetDetectorParams() {
  STATE.detectorParams = JSON.parse(JSON.stringify(DETECTOR_PARAMS_DEFAULT));
  STATE.tonePatches = JSON.parse(JSON.stringify(TONE_PATCHES_DEFAULT));
  // Reaplicar LUT con los nuevos targets/coords/ROI defaults
  reapplyToneLUT();
  renderParamsUI();
  reclassifyLive();
  toast('Parámetros restaurados a valores por defecto', 'warn');
}
