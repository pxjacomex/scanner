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
  // Cabecera en uso (5 o 10 preguntas): fija la geometría y carga la calibración
  // y el patrón de tonos guardados para esa cabecera (o sus valores por defecto)
  aplicarPlantilla(loadPlantilla(), { persistir: false });
  renderPlantillaUI();

  // Tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchSection(t.dataset.section));
  });

  // File input
  document.getElementById('fileInput').addEventListener('change', onCapture);

  // Clave y escaneos guardados en el dispositivo (sobreviven a una recarga)
  loadClave();
  loadResultados();
  recomputeAllScores();

  // Render clave UI
  renderClaveOpciones();
  renderClaveUI('1');
  renderClaveUI('2');

  // Render calibracion UI
  renderCalibrationUI();

  // Render parametros UI
  renderParamsUI();

  // Grupos de estudiantes y datos de exportación (pestaña Resultados)
  initGruposUI();

  // Inicializar tabla
  renderTable();
}


// ============================================
// CABECERA EN USO (5 o 10 preguntas)
// ============================================
// Refleja STATE.plantilla en la interfaz: selector, proporción del lienzo de
// la foto y nota de la pestaña Clave.
function renderPlantillaUI() {
  const p = getPlantilla();
  document.querySelectorAll('#plantillaSelector .seg-btn').forEach(b => {
    const activo = b.dataset.plantilla === p.id;
    b.classList.toggle('active', activo);
    b.setAttribute('aria-checked', activo ? 'true' : 'false');
  });
  const preview = document.getElementById('preview');
  if (preview) preview.style.aspectRatio = `${GEOM.RECT_W_MM} / ${GEOM.RECT_H_MM}`;
  const nota = document.getElementById('claveNotaPlantilla');
  if (nota) nota.textContent = `Cabecera de ${p.nombre} (se elige en la pestaña Escanear).`;
}

// Cambia la cabecera que lee el escáner y refresca todas las pantallas que
// dependen de ella. Si hay una foto cargada, se vuelve a procesar con la nueva
// geometría.
function seleccionarPlantilla(id) {
  if (!PLANTILLAS[id]) return;
  if (id === STATE.plantilla) { renderPlantillaUI(); return; }
  aplicarPlantilla(id);
  renderPlantillaUI();
  renderClaveOpciones();
  renderClaveUI('1');
  renderClaveUI('2');
  renderCalibrationUI();
  renderParamsUI();
  recomputeAllScores();
  renderTable();
  // El escaneo en pantalla se leyó con la otra cabecera: se repite la lectura
  // sobre la misma foto, o se descarta si no hay foto.
  const reprocesado = reprocesarUltimaFoto();
  if (!reprocesado && STATE.currentScan) discardScan();
  toast(`Cabecera de ${PLANTILLAS[id].nombre}`, 'success');
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
