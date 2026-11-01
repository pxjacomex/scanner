// ============================================================================
// PESTAÑA GUARDADAS: pruebas generadas (IndexedDB), importar/exportar y copia
// de seguridad completa (banco + pruebas).
// ============================================================================
'use strict';

const GUARDADAS = { lista: [] };

async function guardadasCargar() {
  try {
    GUARDADAS.lista = (await bdTodos(BD_PRUEBAS)).map(normalizarPrueba).filter(Boolean);
  } catch (e) {
    GUARDADAS.lista = [];
    toast('No se pudieron leer las pruebas guardadas: ' + e.message, 'error');
  }
  GUARDADAS.lista.sort((a, b) => (b.modificada || '').localeCompare(a.modificada || ''));
}

async function guardadasRender() {
  await guardadasCargar();
  const cont = document.getElementById('guardadasItems');
  const badge = document.getElementById('badgeGuardadas');
  badge.textContent = GUARDADAS.lista.length;
  badge.style.display = GUARDADAS.lista.length ? '' : 'none';
  if (GUARDADAS.lista.length === 0) {
    cont.innerHTML = '<div class="vacio">Todavía no hay pruebas guardadas. Al generar las formas A y B en "Armar", la prueba se guarda aquí automáticamente.</div>';
    return;
  }
  cont.innerHTML = GUARDADAS.lista.map((p) => {
    const n = p.formas ? p.formas.A.items.length : p.items.length;
    const claves = p.formas ? `<div class="item-claves"><span>A: <code>${escapeHtml(claveTexto(p.formas.A))}</code></span><span>B: <code>${escapeHtml(claveTexto(p.formas.B))}</code></span></div>` : '';
    return `
      <div class="item-pregunta">
        <div class="item-cuerpo">
          <div class="item-meta">
            <span class="badge ${p.formas ? 'ok' : 'warn'}">${p.formas ? 'Formas generadas' : 'Sin generar'}</span>
            <span class="badge">${n} pregunta${n === 1 ? '' : 's'}</span>
            ${p.curso ? `<span class="badge tema">${escapeHtml(p.curso)}</span>` : ''}
          </div>
          <div class="item-titulo">${escapeHtml(p.titulo.trim() || 'Prueba sin título')}</div>
          <div class="field-note">${p.formas ? 'Generada el ' + fechaCorta(p.formas.generada) : 'Modificada el ' + fechaCorta(p.modificada)}${p.fecha ? ' · fecha impresa: ' + escapeHtml(p.fecha) : ''}</div>
          ${claves}
          <div class="item-acciones">
            ${p.formas ? `<button class="btn btn-primary btn-mini" onclick="guardadaVer('${p.id}')">👁️ Ver e imprimir</button>` : ''}
            <button class="btn btn-ghost btn-mini" onclick="guardadaEditar('${p.id}')">✏️ Editar en Armar</button>
            <button class="btn btn-ghost btn-mini" onclick="guardadaDuplicar('${p.id}')">⧉ Duplicar</button>
            <button class="btn btn-ghost btn-mini" onclick="guardadaExportar('${p.id}')">⬇️ Exportar</button>
            <button class="btn btn-ghost btn-mini peligro" onclick="guardadaEliminar('${p.id}')">🗑️ Eliminar</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function guardadaPorId(id) { return GUARDADAS.lista.find((p) => p.id === id); }

async function guardadaVer(id) {
  const p = guardadaPorId(id);
  if (!p) return;
  await vistaMostrar(p);
}

function guardadaEditar(id) {
  const p = guardadaPorId(id);
  if (p) armarCargarPrueba(p);
}

async function guardadaDuplicar(id) {
  const p = guardadaPorId(id);
  if (!p) return;
  const copia = copiaProfunda(p);
  copia.id = uid('p');
  copia.titulo = (copia.titulo || 'Prueba') + ' (copia)';
  copia.creada = copia.modificada = ahoraISO();
  try {
    await bdGuardar(BD_PRUEBAS, copia);
    await guardadasRender();
    toast('Prueba duplicada');
  } catch (e) { toast('No se pudo duplicar: ' + e.message, 'error'); }
}

async function guardadaEliminar(id) {
  const p = guardadaPorId(id);
  if (!p) return;
  const ok = await confirmar('¿Eliminar esta prueba guardada?', (p.titulo || 'Prueba sin título') + '. Esta acción no se puede deshacer.');
  if (!ok) return;
  try {
    await bdEliminar(BD_PRUEBAS, id);
    if (VISTA.prueba && VISTA.prueba.id === id) await vistaMostrar(null);
    await guardadasRender();
    toast('Prueba eliminada');
  } catch (e) { toast('No se pudo eliminar: ' + e.message, 'error'); }
}

function guardadaExportar(id) {
  const p = guardadaPorId(id);
  if (!p) return;
  const nombre = `prueba_${nombreArchivoSeguro(p.titulo, 'sin_titulo')}_${fechaParaNombre()}.json`;
  descargarArchivo(nombre, JSON.stringify({ tipo: 'prueba-generador-omr', version: 1, exportado: ahoraISO(), prueba: p }, null, 1), 'application/json');
  toast('Prueba exportada: ' + nombre);
}

async function pruebaImportarArchivo(file) {
  if (!file) return;
  try {
    const datos = JSON.parse(await leerArchivoTexto(file));
    const raw = datos && datos.prueba ? datos.prueba : datos;
    const p = normalizarPrueba(raw);
    if (!p || (!p.items.length && !p.formas)) throw new Error('El archivo no contiene una prueba');
    await guardadasCargar();
    if (GUARDADAS.lista.some((q) => q.id === p.id)) {
      p.id = uid('p');
      p.titulo = (p.titulo || 'Prueba') + ' (importada)';
    }
    p.modificada = ahoraISO();
    await bdGuardar(BD_PRUEBAS, p);
    // Las preguntas que la prueba trae en su copia y no están en el banco se
    // añaden para poder volver a mezclarla.
    if (p.formas && p.formas.snapshot) {
      const porId = bancoPorId();
      const nuevas = Object.values(p.formas.snapshot).filter((s) => s && s.id && !porId.has(s.id) && s.pregunta).map((s) => s.pregunta);
      if (nuevas.length) await bancoFusionar(nuevas, 'Preguntas de la prueba');
    }
    await guardadasRender();
    toast('Prueba importada: ' + (p.titulo || 'sin título'));
  } catch (e) {
    toast('No se pudo importar la prueba: ' + e.message, 'error');
  }
}

// ---- Copia de seguridad completa ----
async function respaldoExportar() {
  try {
    const preguntas = await bdTodos(BD_PREGUNTAS);
    const pruebas = await bdTodos(BD_PRUEBAS);
    const nombre = `respaldo_generador_${fechaParaNombre()}.json`;
    descargarArchivo(nombre, JSON.stringify({ tipo: 'respaldo-generador-omr', version: 1, exportado: ahoraISO(), preguntas, pruebas, borrador: ARMADO.prueba }, null, 1), 'application/json');
    toast(`Respaldo exportado (${preguntas.length} preguntas, ${pruebas.length} pruebas)`);
  } catch (e) { toast('No se pudo exportar: ' + e.message, 'error'); }
}

async function respaldoImportarArchivo(file) {
  if (!file) return;
  try {
    const datos = JSON.parse(await leerArchivoTexto(file));
    if (!datos || datos.tipo !== 'respaldo-generador-omr') throw new Error('El archivo no es un respaldo del generador');
    const preguntas = (datos.preguntas || []).map(normalizarPregunta).filter(Boolean);
    const pruebas = (datos.pruebas || []).map(normalizarPrueba).filter(Boolean);
    if (preguntas.length) await bdGuardarVarios(BD_PREGUNTAS, preguntas);
    if (pruebas.length) await bdGuardarVarios(BD_PRUEBAS, pruebas);
    await bancoCargar();
    await guardadasRender();
    armarRender();
    toast(`Respaldo restaurado: ${preguntas.length} preguntas y ${pruebas.length} pruebas (las existentes con el mismo id se actualizaron)`);
  } catch (e) { toast('No se pudo restaurar: ' + e.message, 'error'); }
}
