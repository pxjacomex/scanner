// ============================================================================
// ARRANQUE Y UTILIDADES DE INTERFAZ DEL GENERADOR
// Pestañas, modales, toasts, confirmaciones y registro del service worker.
// ============================================================================
'use strict';

async function initGenerador() {
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchSection(t.dataset.section)));

  // Cerrar modales tocando el fondo o con Escape
  document.querySelectorAll('.modal-bg').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m && m.dataset.fijo !== '1') cerrarModal(m.id); }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-bg.show').forEach((m) => { if (m.dataset.fijo !== '1') cerrarModal(m.id); });
  });

  // Archivos
  document.getElementById('bancoImportarInput').addEventListener('change', (e) => { bancoImportarArchivo(e.target.files[0]); e.target.value = ''; });
  document.getElementById('pruebaImportarInput').addEventListener('change', (e) => { pruebaImportarArchivo(e.target.files[0]); e.target.value = ''; });
  document.getElementById('respaldoImportarInput').addEventListener('change', (e) => { respaldoImportarArchivo(e.target.files[0]); e.target.value = ''; });

  try { await bdAbrir(); } catch (e) { toast('Sin base de datos local: ' + e.message, 'error'); }
  armarCargarBorrador();          // antes del banco: la lista marca "en la prueba"
  await bancoCargar();
  armarRender();
  await guardadasRender();
  cargarCabecera().catch((e) => toast(e.message, 'error'));
  registrarServiceWorker();

  // Primera visita con el banco vacío: ofrecer los ejemplos
  if (BANCO.preguntas.length === 0 && !lsLeer(LS_AJUSTES, {}).ejemplosOfrecidos) {
    lsEscribir(LS_AJUSTES, Object.assign(lsLeer(LS_AJUSTES, {}), { ejemplosOfrecidos: true }));
    const ok = await confirmar('El banco está vacío', '¿Cargar unas preguntas de ejemplo de Física para ver cómo funciona? Luego puedes borrarlas.');
    if (ok) await bancoCargarEjemplos();
  }
}

function switchSection(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.section === name));
  document.querySelectorAll('.section').forEach((s) => s.classList.toggle('active', s.id === 'section-' + name));
  if (name === 'vista') setTimeout(vistaAjustarEscala, 0);
  if (name === 'banco') bancoRender();
  if (name === 'armar') armarRender();
  window.scrollTo({ top: 0 });
}

// ---- Modales ----
function abrirModal(id) { document.getElementById(id).classList.add('show'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('show'); }

let _confirmarResolver = null;
function confirmar(titulo, texto) {
  document.getElementById('confirmarTitulo').textContent = titulo;
  document.getElementById('confirmarTexto').textContent = texto || '';
  abrirModal('modalConfirmar');
  return new Promise((resolve) => { _confirmarResolver = resolve; });
}
function confirmarResponder(valor) {
  cerrarModal('modalConfirmar');
  if (_confirmarResolver) { _confirmarResolver(valor); _confirmarResolver = null; }
}

// ---- Toasts ----
function toast(msg, tipo) {
  const stack = document.getElementById('toastStack');
  const t = document.createElement('div');
  t.className = 'toast ' + (tipo || 'success');
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 300);
  }, tipo === 'error' ? 6000 : 3500);
}

// ---- Service worker (solo en https:// o localhost) ----
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado:', e));
}

window.addEventListener('error', (e) => {
  if (e && e.message) toast('Error: ' + e.message, 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  toast('Error: ' + (r && r.message ? r.message : String(r)), 'error');
});

document.addEventListener('DOMContentLoaded', initGenerador);
