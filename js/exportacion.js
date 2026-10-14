// ============================================================================
// EXPORTACIÓN: CSV, COMPARTIR Y DESCARGA DE LA IMAGEN RECTIFICADA
// Genera el CSV de resultados, lo comparte con la Web Share API (o lo descarga)
// y permite ver/descargar la imagen rectificada del último escaneo.
// ============================================================================

// ============================================
// EXPORTACIÓN
// ============================================
// Clave de respuestas para el nombre del archivo: "Clave_1_A_2_C_3_B_4_D_5_A"
// con la clave del formato 1 ("-" si una pregunta no tiene respuesta definida).
// Si el formato 2 tiene clave y es distinta, se añade "_F2_1_B_2_D_3_A_4_C_5_B".
function claveParaNombre() {
  const Q = ['P1', 'P2', 'P3', 'P4', 'P5'];
  const seg = (c) => Q.map((q, i) => `${i + 1}_${(c && c[q]) || '-'}`).join('_');
  const c1 = STATE.clave['1'] || {}, c2 = STATE.clave['2'] || {};
  let s = 'Clave_' + seg(c1);
  const f2Definida = Q.some(q => c2[q]);
  const distinta = Q.some(q => (c1[q] || null) !== (c2[q] || null));
  if (f2Definida && distinta) s += '_F2_' + seg(c2);
  return s;
}

// Nombre del CSV exportado:
//   <grupo>_<evaluación>_Clave_1_<A/D>_2_<A/D>_3_<A/D>_4_<A/D>_5_<A/D>__<fecha>.csv
// Sin grupo elegido se usa "SinGrupo"; sin nombre de evaluación, "Resultados".
// Para el nombre del archivo se quitan los acentos (física → fisica) y se
// sustituyen por "_" los caracteres que no admiten los sistemas de archivos
// (/ \ : * ? " < > |) y los no ASCII; el texto original se conserva en la
// cabecera del CSV.
function nombreArchivoCSV() {
  const limpiar = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ').trim();
  const grupo = limpiar(STATE.exportConfig && STATE.exportConfig.grupo) || 'SinGrupo';
  const evaluacion = limpiar(getNombreEvaluacion()) || 'Resultados';
  const fecha = new Date().toISOString().slice(0, 10);
  return `${grupo}_${evaluacion}_${claveParaNombre()}__${fecha}.csv`;
}

// Contenido del CSV. Columnas: #, ID, alumno_email (del grupo elegido), Forma,
// P1..P5, Aciertos, nota (la columna se titula con el nombre de la evaluación,
// entre comillas; "Nota" si no se escribió ninguno), Dudoso, Fecha.
function buildCSV() {
  const evaluacion = getNombreEvaluacion();
  const colNota = evaluacion ? `"${evaluacion.replace(/"/g, '""')}"` : 'Nota';
  const grupo = getGrupoSeleccionado();
  const headers = ['#', 'ID', 'alumno_email', 'Forma', 'P1', 'P2', 'P3', 'P4', 'P5', 'Aciertos', colNota, 'Dudoso', 'Fecha'];
  const lines = [headers.join(',')];
  STATE.results.forEach((r, i) => {
    const fmtP = v => v === 'AMBIGUO' ? '?' : (v || '');
    const notaStr = r._nota !== null && r._nota !== undefined ? r._nota.toFixed(2) : '';
    const aciertosStr = r._aciertos !== null && r._aciertos !== undefined ? r._aciertos : '';
    lines.push([
      i + 1, r.ID, emailDeAlumno(r.ID, grupo), r.F,
      fmtP(r.P1), fmtP(r.P2), fmtP(r.P3), fmtP(r.P4), fmtP(r.P5),
      aciertosStr, notaStr,
      r.dudoso ? 'Si' : 'No',
      r.fecha
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  });
  return lines.join('\n');
}

// Cuántos escaneos no tienen correo en el grupo elegido (para avisar al exportar).
function sinCorreoEnGrupo() {
  const grupo = getGrupoSeleccionado();
  if (!grupo) return 0;
  return STATE.results.filter(r => !emailDeAlumno(r.ID, grupo)).length;
}

function exportCSV() {
  if (STATE.results.length === 0) return;
  const csv = '\uFEFF' + buildCSV();  // BOM UTF-8 para Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivoCSV();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const sinCorreo = sinCorreoEnGrupo();
  toast(sinCorreo ? `CSV descargado · ${sinCorreo} ID${sinCorreo === 1 ? '' : 's'} sin correo en el grupo` : 'CSV descargado', sinCorreo ? 'warn' : 'success');
}

async function shareResults() {
  if (STATE.results.length === 0) return;
  const csv = '\uFEFF' + buildCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const file = new File([blob], nombreArchivoCSV(), { type: 'text/csv' });

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
