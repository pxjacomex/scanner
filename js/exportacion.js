// ============================================================================
// EXPORTACIÓN: CSV, COMPARTIR Y DESCARGA DE LA IMAGEN RECTIFICADA
// Genera el CSV de resultados, lo comparte con la Web Share API (o lo descarga)
// y permite ver/descargar la imagen rectificada del último escaneo.
// ============================================================================

// ============================================
// EXPORTACIÓN
// ============================================
function buildCSV() {
  const headers = ['#', 'ID', 'Forma', 'P1', 'P2', 'P3', 'P4', 'P5', 'Aciertos', 'Nota', 'Dudoso', 'Fecha'];
  const lines = [headers.join(',')];
  STATE.results.forEach((r, i) => {
    const fmtP = v => v === 'AMBIGUO' ? '?' : (v || '');
    const notaStr = r._nota !== null && r._nota !== undefined ? r._nota.toFixed(2) : '';
    const aciertosStr = r._aciertos !== null && r._aciertos !== undefined ? r._aciertos : '';
    lines.push([
      i + 1, r.ID, r.F,
      fmtP(r.P1), fmtP(r.P2), fmtP(r.P3), fmtP(r.P4), fmtP(r.P5),
      aciertosStr, notaStr,
      r.dudoso ? 'Si' : 'No',
      r.fecha
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  });
  return lines.join('\n');
}

function exportCSV() {
  if (STATE.results.length === 0) return;
  const csv = '\uFEFF' + buildCSV();  // BOM UTF-8 para Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resultados_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV descargado', 'success');
}

async function shareResults() {
  if (STATE.results.length === 0) return;
  const csv = '\uFEFF' + buildCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const file = new File([blob], `resultados_${new Date().toISOString().slice(0, 10)}.csv`, { type: 'text/csv' });

  // Construir resumen de texto
  const conNota = STATE.results.filter(r => r._nota !== null && r._nota !== undefined);
  let summary = `📊 Resultados del examen\n`;
  summary += `Total: ${STATE.results.length} estudiantes\n`;
  if (conNota.length > 0) {
    const avg = conNota.reduce((a, r) => a + r._nota, 0) / conNota.length;
    summary += `Promedio: ${avg.toFixed(2)}\n`;
  }
  summary += '\n';
  STATE.results.slice(-15).forEach(r => {
    const nota = r._nota !== null && r._nota !== undefined ? r._nota.toFixed(2) : '—';
    summary += `${r.ID} (F${r.F}): ${nota}${r.dudoso ? ' ⚠' : ''}\n`;
  });

  // Intentar Web Share API con archivo
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Resultados del examen',
        text: summary
      });
      return;
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    }
  }

  // Fallback: solo texto
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Resultados', text: summary });
      return;
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    }
  }

  // Último fallback: copiar al portapapeles
  try {
    await navigator.clipboard.writeText(summary);
    toast('Resumen copiado al portapapeles', 'success');
  } catch (e) {
    toast('No se pudo compartir', 'error');
  }
}


// ============================================
// VISUALIZACION DE IMAGEN RECTIFICADA
// ============================================
function showRectifiedFull() {
  if (!STATE.lastRectifiedDataURL) {
    toast('No hay imagen rectificada disponible', 'warn');
    return;
  }
  const canvas = document.getElementById('rectModalCanvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    document.getElementById('rectModal').classList.add('show');
  };
  img.src = STATE.lastRectifiedDataURL;
}

function downloadRectified() {
  if (!STATE.lastRectifiedDataURL) {
    toast('No hay imagen rectificada disponible', 'warn');
    return;
  }
  const a = document.createElement('a');
  a.download = `rectificada_${Date.now()}.png`;
  a.href = STATE.lastRectifiedDataURL;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast('Imagen descargada', 'success');
}
