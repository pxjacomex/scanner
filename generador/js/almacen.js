// ============================================================================
// ALMACENAMIENTO LOCAL
// El banco de preguntas y las pruebas generadas viven en IndexedDB (admite
// imágenes sin el límite de ~5 MB de localStorage). El borrador de la prueba
// que se está armando y los ajustes van en localStorage. Todo queda en el
// dispositivo: no hay servidor.
// ============================================================================
'use strict';

const BD_NOMBRE = 'generador-omr';
const BD_VERSION = 1;
const BD_PREGUNTAS = 'preguntas';
const BD_PRUEBAS = 'pruebas';

const LS_BORRADOR = 'generador_borrador_v1';
const LS_AJUSTES = 'generador_ajustes_v1';

let _bd = null;

function bdAbrir() {
  if (_bd) return Promise.resolve(_bd);
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('Este navegador no tiene IndexedDB')); return; }
    const req = indexedDB.open(BD_NOMBRE, BD_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BD_PREGUNTAS)) db.createObjectStore(BD_PREGUNTAS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BD_PRUEBAS)) db.createObjectStore(BD_PRUEBAS, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      _bd = req.result;
      _bd.onversionchange = () => { _bd.close(); _bd = null; };
      resolve(_bd);
    };
    req.onerror = () => reject(req.error || new Error('No se pudo abrir la base de datos'));
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña'));
  });
}

function bdPeticion(store, modo, fn) {
  return bdAbrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const os = tx.objectStore(store);
    let resultado;
    const req = fn(os);
    if (req) {
      req.onsuccess = () => { resultado = req.result; };
      req.onerror = () => reject(req.error);
    }
    tx.oncomplete = () => resolve(resultado);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
  }));
}

function bdGuardar(store, obj) { return bdPeticion(store, 'readwrite', (os) => os.put(obj)); }
function bdObtener(store, id) { return bdPeticion(store, 'readonly', (os) => os.get(id)); }
function bdTodos(store) { return bdPeticion(store, 'readonly', (os) => os.getAll()); }
function bdEliminar(store, id) { return bdPeticion(store, 'readwrite', (os) => os.delete(id)); }
function bdLimpiar(store) { return bdPeticion(store, 'readwrite', (os) => os.clear()); }

// Guarda varios objetos en una sola transacción.
function bdGuardarVarios(store, objs) {
  return bdAbrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    objs.forEach((o) => os.put(o));
    tx.oncomplete = () => resolve(objs.length);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
  }));
}

// ---- localStorage ----
function lsLeer(clave, porDefecto) {
  try {
    const s = localStorage.getItem(clave);
    return s ? JSON.parse(s) : porDefecto;
  } catch (_) { return porDefecto; }
}

function lsEscribir(clave, valor) {
  try {
    if (valor === undefined || valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (e) {
    console.warn('No se pudo guardar en localStorage:', e);
    return false;
  }
}
