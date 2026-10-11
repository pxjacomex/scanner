// ============================================================================
// ARRANQUE Y UTILIDADES DE INTERFAZ
// initApp (se llama desde onCVReady), navegación por pestañas, modales y toasts.
// Usa funciones de los demás archivos de js/, pero solo en tiempo de ejecución
// (cuando OpenCV ya cargó), así que el orden de carga no le afecta.
// ============================================================================

// ============================================
// INICIALIZACION
// ============================================
function initApp() {
  // Cargar parametros del detector (siempre, para tener defaults disponibles antes de cualquier scan)
  loadDetectorParams();
  // Cargar el patrón de tonos (coords/tamaño/targets de los 4 parches)
  STATE.tonePatches = loadTonePatches();

  // Cargar calibracion guardada (si existe)
  const cargada = loadCalibration();
  if (cargada) {
    COORDS = buildCoords();
    console.log('Calibracion cargada de localStorage');
  }

  // Tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchSection(t.dataset.section));
  });

  // File input
  document.getElementById('fileInput').addEventListener('change', onCapture);

  // Render clave UI
  renderClaveUI('1');
  renderClaveUI('2');

  // Render calibracion UI
  renderCalibrationUI();

  // Render parametros UI
  renderParamsUI();

  // Inicializar tabla
  renderTable();
}


function switchSection(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.section === name));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'section-' + name));
  // En Calibrar y Detector, eliminar el padding inferior del body para que
  // los botones de acción lleguen hasta el fondo de la pantalla.
  document.body.classList.toggle('calib-mode', name === 'calib' || name === 'params');
  // Refrescar preview de calibracion al entrar a la tab
  if (name === 'calib') {
    renderCalibrationUI();
    // Mostrar el resultado actual con la calibración vigente
    if (STATE.lastRectifiedMat) {
      try { reclassifyLive(); } catch(_) {}
    }
  }
  if (name === 'params') {
    renderParamsUI();
  }
}


// ============================================
// MODALES
// ============================================
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}


// ============================================
// TOAST
// ============================================
function toast(msg, type = 'success') {
  const stack = document.getElementById('toastStack');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}
