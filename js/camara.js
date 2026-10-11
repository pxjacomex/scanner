// ============================================================================
// CÁMARA: CAPTURA DE LA FOTO Y FLUJO DE PROCESAMIENTO
// onCapture recibe la foto del <input type="file" capture="environment">,
// processImage ejecuta el pipeline (runPipeline, en js/deteccion.js), guarda las
// matrices en STATE y muestra el resultado (renderScanResult, js/calificacion.js).
// ============================================================================

// ============================================
// CAPTURA DE IMAGEN
// ============================================
function onCapture(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      processImage(img);
    };
    img.src = ev.target.result;

    // Mostrar imagen capturada
    const previewImg = document.getElementById('capturedImg');
    previewImg.src = ev.target.result;
    previewImg.style.display = 'block';
    document.getElementById('empty').style.display = 'none';
    document.getElementById('resultCanvas').style.display = 'none';
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}


function showProcessing(text) {
  document.getElementById('processingText').textContent = text || 'Procesando...';
  document.getElementById('processing').classList.remove('hidden');
}
function hideProcessing() {
  document.getElementById('processing').classList.add('hidden');
}


// ============================================
// PIPELINE PRINCIPAL
// ============================================
function processImage(imgElement) {
  showProcessing('Detectando marcadores...');

  // Pequeño delay para que se vea el spinner
  setTimeout(() => {
    try {
      const result = runPipeline(imgElement);

      if (!result.ok) {
        hideProcessing();
        toast(result.msg, 'error');
        return;
      }

      // Mostrar la cabecera rectificada en el canvas
      cv.imshow('resultCanvas', result.rectified);
      document.getElementById('capturedImg').style.display = 'none';
      document.getElementById('resultCanvas').style.display = 'block';

      // Guardar dataURL para descarga/visualizacion completa (con anotaciones)
      STATE.lastRectifiedDataURL = document.getElementById('resultCanvas').toDataURL('image/png');

      // Liberar matrices anteriores y guardar las nuevas para uso posterior
      // (reclasificación al ajustar parámetros, vista de calibración, etc.)
      if (STATE.lastRectifiedMat) {
        try { STATE.lastRectifiedMat.delete(); } catch(_) {}
        STATE.lastRectifiedMat = null;
      }
      if (STATE.lastGrayNorm) {
        try { STATE.lastGrayNorm.delete(); } catch(_) {}
        STATE.lastGrayNorm = null;
      }
      if (STATE.lastGrayRect) {
        try { STATE.lastGrayRect.delete(); } catch(_) {}
        STATE.lastGrayRect = null;
      }
      if (result.rectifiedClean) {
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = result.rectifiedClean.cols;
        tmpCanvas.height = result.rectifiedClean.rows;
        cv.imshow(tmpCanvas, result.rectifiedClean);
        CALIB_BASE_RECTIFIED_DATAURL = tmpCanvas.toDataURL('image/png');
        STATE.lastRectifiedMat = result.rectifiedClean;
      }
      if (result.grayRect) {
        STATE.lastGrayRect = result.grayRect;
      }
      if (result.grayNorm) {
        STATE.lastGrayNorm = result.grayNorm;
      }

      result.rectified.delete();

      // Construir scan result
      STATE.currentScan = {
        ID: result.classification.ID,
        F: result.classification.F,
        P1: result.classification.P1,
        P2: result.classification.P2,
        P3: result.classification.P3,
        P4: result.classification.P4,
        P5: result.classification.P5,
        dudoso: result.classification.dudoso,
        ambiguos: result.classification.ambiguos,
      };

      renderScanResult();
      hideProcessing();
    } catch (err) {
      hideProcessing();
      console.error(err);
      toast('Error procesando: ' + err.message, 'error');
    }
  }, 50);
}
