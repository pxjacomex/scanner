// ============================================================================
// ESTADO Y CONFIGURACIÓN
// Estado global de la app (STATE, DEBUG), parámetros del detector, geometría y
// calibración de coordenadas, patrón de tonos, y su persistencia en localStorage.
// No depende de ningún otro archivo de js/. Debe cargarse primero.
// ============================================================================

// ============================================
// ESTADO GLOBAL
// ============================================
const STATE = {
  cvReady: false,
  // Resultado del escaneo actual (antes de guardar)
  currentScan: null,
  // Tabla de resultados [{id, F, P1..P5, score, dudoso, fecha}]
  results: [],
  // Clave de respuestas por formato
  clave: {
    "1": { P1: null, P2: null, P3: null, P4: null, P5: null },
    "2": { P1: null, P2: null, P3: null, P4: null, P5: null }
  },
  // Para resolver duplicado
  pendingScan: null,
  pendingResolver: null,
  // Imagen rectificada actual (para visualizacion/descarga)
  lastRectifiedDataURL: null,
  // Última matriz rectificada SIN anotar (a color, para la vista de calibración)
  lastRectifiedMat: null,
  // Última imagen rectificada en GRIS, ANTES de la LUT.
  // Se conserva para reaplicar la LUT cuando el usuario ajusta los
  // parámetros LUT (coords/tamaño/targets de los parches).
  lastGrayRect: null,
  // Última imagen final en gris normalizada por la LUT.
  // El detector la usa internamente y reclassifyLive la consume al ajustar parámetros.
  lastGrayNorm: null,
  // Parámetros del detector (configurables vía slider)
  detectorParams: null,  // se inicializa con DETECTOR_PARAMS_DEFAULT
  // Patrón de calibración de tonos (4 parches). Inicializado con TONE_PATCHES_DEFAULT
  // o con la versión persistida en localStorage.
  tonePatches: null,
  // Coordenadas con las que se leyeron las celdas en el último escaneo: las de
  // COORDS ancladas a los cuadros impresos (ver anclarCasillas en js/deteccion.js).
  // null = se usan las coordenadas calibradas (COORDS) tal cual.
  coordsLectura: null,
  // Resumen del último anclaje: desplazamiento por grupo, parches, etc.
  anclaje: null,
};

// ============================================
// PARAMETROS DEL DETECTOR (ajustables vía sliders)
// ============================================
// Versión simplificada (v4): el detector trabaja sobre una imagen
// NORMALIZADA mediante una LUT calibrada con los 4 parches de tonos
// impresos en la plantilla.
const DETECTOR_PARAMS_DEFAULT = {
  // Umbral absoluto de gris para considerar un píxel "oscuro" (en escala
  // normalizada 0-255). Después de la LUT, papel limpio ~220, marca de
  // lápiz/tinta ~30-100. Un umbral de 130 separa cómodamente.
  umbral_oscuro: 130,

  // Fracción mínima de píxeles oscuros que debe tener una celda para
  // considerarla pintada. En imagen normalizada, las vacías quedan en 0-2%
  // y las pintadas en 35-60%. Un umbral de 0.25 deja margen amplio.
  frac_min_pintada: 0.25,

  // Si la 2ª celda del bloque también supera esta fracción de píxeles oscuros,
  // se considera que hay 2+ marcas y la respuesta sale AMBIGUA.
  frac_multi: 0.25,

  // Margen interno del ROI: porcentaje del lado que se descarta del borde
  // para no incluir el contorno impreso del casillero.
  roi_margin_pct: 0.20,

  // Anclaje a los cuadros impresos: antes de medir, cada celda se centra en el
  // cuadro impreso más cercano y la tira de parches de tono se localiza en su
  // posición real. Compensa hojas dobladas o fotos con distorsión, donde la
  // homografía de los 4 marcadores deja las zonas de lectura corridas varios
  // mm. Valor = radio de búsqueda en X (mm) alrededor de la posición calibrada;
  // en Y se busca la mitad. 0 = desactivado.
  anclaje_mm: 6,

  // Rectificación por mitades (cabecera v2): si se detectan los marcadores
  // centrales 4 y 5, la cabecera se rectifica con dos homografías (mitad
  // izquierda: 0-4-5-2; mitad derecha: 4-1-3-5) unidas en la columna central.
  // Un doblez en el centro de la hoja, que una homografía única no puede
  // modelar, queda absorbido por el cambio de plano. Sin marcadores centrales
  // (hojas v1) se usa siempre la homografía única. 1 = activo, 0 = desactivado.
  rectificar_por_mitades: 1,
};

const STORAGE_KEY_PARAMS = 'omr_detector_params_v4';  // v4 = LUT con parches ajustables

function loadDetectorParams() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PARAMS);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge con default por si añadimos parámetros nuevos en el futuro
      const merged = JSON.parse(JSON.stringify(DETECTOR_PARAMS_DEFAULT));
      for (const k in parsed) {
        if (typeof parsed[k] === 'number' && k in merged) {
          merged[k] = parsed[k];
        }
      }
      STATE.detectorParams = merged;
      return true;
    }
  } catch (e) {
    console.warn('Error cargando parametros:', e);
  }
  STATE.detectorParams = JSON.parse(JSON.stringify(DETECTOR_PARAMS_DEFAULT));
  return false;
}

function persistDetectorParams() {
  try {
    localStorage.setItem(STORAGE_KEY_PARAMS, JSON.stringify(STATE.detectorParams));
    return true;
  } catch (e) {
    console.warn('Error guardando parametros:', e);
    return false;
  }
}

// Variables de diagnostico
const DEBUG = {
  imageInfo: null,
  classification: null,
  features: null,
};

// ============================================
// SISTEMA DE CALIBRACION
// ============================================
// Estructura: cada grupo tiene un x0 (primer casillero), una y comun, un paso x.
// Tambien hay un parametro global roi_size que afecta a TODOS los casilleros.
// Las coordenadas individuales se derivan de estos parametros.
// Valores derivados de la plantilla (templates/plantilla_A4.pdf, misma geometría
// en v1 y v2): casilleros de 4.0 mm cada 6.8 mm; filas en y = 14.00/20.80 mm de
// página (código) y 14.03/20.83 (preguntas); F en y = 5.70. Convertidos al marco
// con x - 1.56, y - 1.05 (ver GEOM).
const CALIBRATION_DEFAULT = {
  D1: { x0: 15.44,  y: 12.95, paso_x: 6.80 },
  D2: { x0: 15.44,  y: 19.75, paso_x: 6.80 },
  F:  { x0: 185.54, y: 4.65,  paso_x: 6.80 },
  P1: { x0: 95.23,  y: 12.98, paso_x: 6.80 },
  P2: { x0: 95.23,  y: 19.78, paso_x: 6.80 },
  P3: { x0: 133.63, y: 12.98, paso_x: 6.80 },
  P4: { x0: 133.63, y: 19.78, paso_x: 6.80 },
  P5: { x0: 172.04, y: 13.00, paso_x: 6.80 },
  // Tamaño común de todos los casilleros (lado del cuadrado, en mm). El cuadro
  // impreso mide 4.0 mm; 4.2 deja 0.1 mm de holgura por lado.
  roi_size: 4.2,
};

// Calibracion activa (cargada de localStorage al inicio, o default)
let CALIBRATION = JSON.parse(JSON.stringify(CALIBRATION_DEFAULT));

// v2 = marco en mm reales (las calibraciones guardadas con el marco antiguo no sirven)
const STORAGE_KEY_CALIB = 'omr_calibration_v2';

function loadCalibration() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CALIB);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validar que tenga los grupos esperados
      const ok = ['D1','D2','F','P1','P2','P3','P4','P5'].every(k =>
        parsed[k] && typeof parsed[k].x0 === 'number' &&
        typeof parsed[k].y === 'number' && typeof parsed[k].paso_x === 'number'
      );
      if (ok) {
        // Migrar: si el preset antiguo no tiene roi_size, usar el default
        if (typeof parsed.roi_size !== 'number') {
          parsed.roi_size = CALIBRATION_DEFAULT.roi_size;
        }
        CALIBRATION = parsed;
        return true;
      }
    }
  } catch (e) {
    console.warn('Error cargando calibracion:', e);
  }
  return false;
}

function persistCalibration() {
  try {
    localStorage.setItem(STORAGE_KEY_CALIB, JSON.stringify(CALIBRATION));
    return true;
  } catch (e) {
    console.warn('Error guardando calibracion:', e);
    return false;
  }
}

// Genera las 42 coordenadas a partir de la calibracion actual
function buildCoords() {
  const coords = [];
  const D1 = CALIBRATION.D1;
  const D2 = CALIBRATION.D2;
  const F  = CALIBRATION.F;
  for (let i = 0; i < 10; i++) {
    coords.push({ id: `D1_${i}`, x: D1.x0 + i * D1.paso_x, y: D1.y, grupo: 'ID' });
  }
  for (let i = 0; i < 10; i++) {
    coords.push({ id: `D2_${i}`, x: D2.x0 + i * D2.paso_x, y: D2.y, grupo: 'ID' });
  }
  const letras = ['A','B','C','D'];
  for (const q of ['P1','P2','P3','P4','P5']) {
    const cfg = CALIBRATION[q];
    for (let i = 0; i < 4; i++) {
      coords.push({ id: `${q}_${letras[i]}`, x: cfg.x0 + i * cfg.paso_x, y: cfg.y, grupo: 'P' });
    }
  }
  coords.push({ id: 'F_1', x: F.x0,            y: F.y, grupo: 'F' });
  coords.push({ id: 'F_2', x: F.x0 + F.paso_x, y: F.y, grupo: 'F' });
  return coords;
}

// COORDS se recalcula cada vez que cambia la calibracion
let COORDS = buildCoords();

// Coordenadas con las que se LEEN las celdas: las ancladas al último escaneo
// si existen (STATE.coordsLectura, ver js/deteccion.js), si no, COORDS.
function getCoordsLectura() {
  return STATE.coordsLectura || COORDS;
}

// Helper: tamaño del casillero en pixels (medio lado).
// Usa el valor de CALIBRATION.roi_size si existe, sino el default geometrico.
function getRoiHalfPx() {
  const sizeMm = (CALIBRATION && typeof CALIBRATION.roi_size === 'number')
    ? CALIBRATION.roi_size : GEOM.ROI_SIZE_MM;
  return Math.round(sizeMm / 2 * GEOM.PX_PER_MM);
}

// Constantes de geometría (en mm REALES de la hoja).
// El marco rectificado se define con los centros de los marcadores de esquina,
// medidos sobre el PDF de la plantilla (idénticos en v1 y v2): M0 en
// (6.56, 6.05) mm de página, M1 a 196.77 mm a la derecha y M2 a 13.80 mm abajo.
// Con M0 en (OFFSET_X, OFFSET_Y) del marco, un punto de la hoja se convierte así:
//   x_marco = 5 + (x_pagina - 6.56),  y_marco = 5 + (y_pagina - 6.05).
// Antes se usaban 194.9 y 11.85 (medidos sobre fotos), lo que comprimía el
// marco un 1 % en X y un 14 % en Y; todas las coordenadas por defecto de abajo
// están derivadas ya con el marco real.
const GEOM = {
  PX_PER_MM: 15,
  OFFSET_X_MM: 5, OFFSET_Y_MM: 5,
  RECT_W_MM: 207, RECT_H_MM: 24,
  M0_M1_MM: 196.77,   // distancia entre centros M0 y M1 (PDF)
  M0_M2_MM: 13.80,    // distancia entre centros M0 y M2 (PDF)
  ROI_SIZE_MM: 4.2,
};
GEOM.W_PX = Math.round(GEOM.RECT_W_MM * GEOM.PX_PER_MM);
GEOM.H_PX = Math.round(GEOM.RECT_H_MM * GEOM.PX_PER_MM);

// Posición de cada marcador ArUco en el marco rectificado (mm).
// - 0..3 (esquinas) definen el marco.
// - 4 y 5 (columna central, solo en la cabecera v2): centros medidos en el PDF
//   en (122.98, 14.01) y (122.98, 20.79) mm de página → marco (121.42, 12.96)
//   y (121.42, 19.74).
GEOM.MARCADORES_MM = {
  0: { x: GEOM.OFFSET_X_MM,                 y: GEOM.OFFSET_Y_MM },
  1: { x: GEOM.OFFSET_X_MM + GEOM.M0_M1_MM, y: GEOM.OFFSET_Y_MM },
  2: { x: GEOM.OFFSET_X_MM,                 y: GEOM.OFFSET_Y_MM + GEOM.M0_M2_MM },
  3: { x: GEOM.OFFSET_X_MM + GEOM.M0_M1_MM, y: GEOM.OFFSET_Y_MM + GEOM.M0_M2_MM },
  4: { x: 121.42, y: 12.96 },
  5: { x: 121.42, y: 19.74 },
};
// Si, proyectados con la homografía de las esquinas, los marcadores centrales
// caen a más de esta distancia de su posición esperada, se consideran falsos y
// se usa la homografía única.
GEOM.TOL_MARCADOR_CENTRAL_MM = 15;

// ============================================
// PATRÓN DE CALIBRACIÓN DE TONOS (4 parches)
// ============================================
// La plantilla incluye 4 parches de gris en la fila inferior derecha.
// Sirven como referencia ABSOLUTA para normalizar la imagen y eliminar
// variaciones de iluminación/exposición entre escaneos.
//
// VALORES POR DEFECTO (calibrados con la plantilla de referencia).
// El usuario puede ajustarlos mediante la pestaña Detector y se persisten
// junto a los demás parámetros del detector.
const TONE_PATCHES_DEFAULT = {
  // Coordenadas en mm (centro del parche en el espacio rectificado)
  // Derivadas de la plantilla: tira de 4 bandas de 6.225 mm desde x = 171.40 mm
  // de página, centro vertical en y = 20.54 (v1: 4.9 mm de alto; v2: 6.4 mm).
  coords: [
    { id: 'blanco',     x: 172.95, y: 19.49 },
    { id: 'gris_claro', x: 179.18, y: 19.49 },
    { id: 'gris_osc',   x: 185.40, y: 19.49 },
    { id: 'negro',      x: 191.63, y: 19.49 },
  ],
  // Tamaño del ROI por parche (más pequeño que el parche real para evitar bordes)
  roi_w_mm: 4.0,
  roi_h_mm: 2.5,
  // VALORES NOMINALES (target de la normalización).
  //
  // Calibrados con dos plantillas reales (papel ecológico, condiciones de
  // iluminación distintas). Los grises medios (gris_claro=160, gris_osc=50)
  // se eligieron BAJOS a propósito para que la curva LUT sea más
  // contrastante en la zona crítica del umbral_oscuro=130:
  //   - los píxeles del CONTORNO IMPRESO y de las LETRAS GUÍA de los
  //     casilleros (originales ~140-180) caen claramente sobre 130
  //     después del LUT, así que NO se cuentan como "oscuros".
  //   - los píxeles del LÁPIZ pintado (originales ~30-100) caen claramente
  //     bajo 130, así que SÍ se cuentan.
  // Resultado en pruebas: brecha pintadas/vacías ~34-40% (vs ~17-32% antes).
  targets: {
    blanco:     220,  // papel ecológico iluminado
    gris_claro: 160,  // BAJO a propósito: más contraste justo en la zona del umbral
    gris_osc:   50,   // BAJO a propósito: las marcas leves quedan claramente oscuras
    negro:      20,   // tinta/tóner saturado
  },
  // Si la medición observada de un parche desvía más de este número de niveles
  // del observado del parche INMEDIATAMENTE más oscuro/claro (orden esperado
  // blanco > gris_claro > gris_osc > negro), se considera que un parche está
  // contaminado/oculto y se levanta una bandera de calibración sospechosa.
  monotonia_min_delta: 5,
};

// La estructura "viva" se mantiene en STATE.tonePatches para poder ajustarla.
// Se inicializa con el default, se sobreescribe desde localStorage si hay
// una versión persistida.
// v3 = marco en mm reales (ver GEOM)
const STORAGE_KEY_TONE_PATCHES = 'omr_tone_patches_v3';

function loadTonePatches() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TONE_PATCHES);
    if (stored) {
      const parsed = JSON.parse(stored);
      const merged = JSON.parse(JSON.stringify(TONE_PATCHES_DEFAULT));
      // Merge defensivo: solo aceptamos los campos que conocemos
      if (Array.isArray(parsed.coords) && parsed.coords.length === 4) {
        for (let i = 0; i < 4; i++) {
          if (typeof parsed.coords[i].x === 'number') merged.coords[i].x = parsed.coords[i].x;
          if (typeof parsed.coords[i].y === 'number') merged.coords[i].y = parsed.coords[i].y;
        }
      }
      if (typeof parsed.roi_w_mm === 'number') merged.roi_w_mm = parsed.roi_w_mm;
      if (typeof parsed.roi_h_mm === 'number') merged.roi_h_mm = parsed.roi_h_mm;
      if (parsed.targets) {
        for (const k of ['blanco','gris_claro','gris_osc','negro']) {
          if (typeof parsed.targets[k] === 'number') merged.targets[k] = parsed.targets[k];
        }
      }
      return merged;
    }
  } catch (e) {
    console.warn('Error cargando tone patches:', e);
  }
  return JSON.parse(JSON.stringify(TONE_PATCHES_DEFAULT));
}

function persistTonePatches() {
  try {
    localStorage.setItem(STORAGE_KEY_TONE_PATCHES, JSON.stringify(STATE.tonePatches));
    return true;
  } catch (e) {
    console.warn('Error guardando tone patches:', e);
    return false;
  }
}

// Compatibilidad: TONE_PATCHES sigue exportándose como una "vista" del estado actual.
// Las funciones del pipeline lo leen, pero el código usa STATE.tonePatches para mutaciones.
function getTonePatches() {
  return STATE.tonePatches || TONE_PATCHES_DEFAULT;
}
