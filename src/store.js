// Archivos (planillas) guardados en este dispositivo: IndexedDB, con respaldo en localStorage
// si IndexedDB no está disponible (modo privado de algunos navegadores).
// Archivo = { id, name, created, updated, rows, cols, cells: { "A1": "texto" }, styles, colW, rowH }
// (styles/colW/rowH desde la v0.0.4: formato traído al importar .xlsx; detalle en transfer.js)
// Nube (v0.0.10): las planillas de la cuenta también viven acá (copia de trabajo); cuáles son y si tienen
// cambios sin subir lo lleva nube.js aparte (localStorage), no el archivo. Cada cambio hecho desde la app
// avisa a nube.js (setStoreHooks) o, si la nube no está cargada, queda anotado en LS_CHANGED.

const DB_NAME = 'planillas';
const STORE = 'files';
const LS_FALLBACK = 'planillas-archivos-v1';
const LS_PENDING = 'planillas-pendiente'; // copia sincrónica al salir de la app (IndexedDB es asíncrono)

const LS_CHANGED = 'planillas-cambios'; // ids cambiados sin la nube cargada (nube.js los toma al arrancar)

let dbPromise = null;
let hooks = null; // { put(file), del(id) } de nube.js

export function setStoreHooks(h) { hooks = h || null; }
function markChanged(id) {
  try {
    const set = JSON.parse(localStorage.getItem(LS_CHANGED) || '[]');
    if (!set.includes(id)) { set.push(id); localStorage.setItem(LS_CHANGED, JSON.stringify(set)); }
  } catch { /* sin lugar */ }
}
export function takeChanged() {
  let set = [];
  try { set = JSON.parse(localStorage.getItem(LS_CHANGED) || '[]'); localStorage.removeItem(LS_CHANGED); } catch { set = []; }
  return Array.isArray(set) ? set : [];
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let out;
    const r = fn(st);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ---- Respaldo en localStorage ----
function lsAll() {
  try { return JSON.parse(localStorage.getItem(LS_FALLBACK)) || {}; } catch { return {}; }
}
function lsWrite(all) { localStorage.setItem(LS_FALLBACK, JSON.stringify(all)); }

export async function storageKind() {
  return (await openDb()) ? 'IndexedDB' : 'localStorage';
}

export async function listFiles() {
  const db = await openDb();
  const all = db ? await tx(db, 'readonly', (st) => st.getAll()) : Object.values(lsAll());
  return (all || []).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function getFile(id) {
  const db = await openDb();
  if (db) return (await tx(db, 'readonly', (st) => st.get(id))) || null;
  return lsAll()[id] || null;
}

// fromCloud = true: lo escribe nube.js con lo bajado de la nube (no cuenta como cambio para subir)
export async function putFile(file, fromCloud = false) {
  const db = await openDb();
  if (db) await tx(db, 'readwrite', (st) => st.put(file));
  else { const all = lsAll(); all[file.id] = file; lsWrite(all); }
  if (!fromCloud) { if (hooks) hooks.put(file); else markChanged(file.id); }
}

export async function deleteFile(id, fromCloud = false) {
  const db = await openDb();
  if (db) await tx(db, 'readwrite', (st) => st.delete(id));
  else { const all = lsAll(); delete all[id]; lsWrite(all); }
  if (!fromCloud && hooks) hooks.del(id);
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Copia sincrónica al salir: si IndexedDB no llegó a guardar, se recupera al volver a abrir
export function savePending(file) {
  try { localStorage.setItem(LS_PENDING, JSON.stringify(file)); } catch { /* sin lugar */ }
}
export function clearPending() {
  try { localStorage.removeItem(LS_PENDING); } catch { /* nada */ }
}
export async function recoverPending() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(LS_PENDING)); } catch { p = null; }
  if (!p || !p.id || !p.cells) { clearPending(); return; }
  const cur = await getFile(p.id);
  // Más nueva, o igual de nueva pero con otra vista o con otros ajustes del Reporte
  // (cambiar de vista o "Configurar vista" no cambian la fecha; v0.0.5 y v0.0.7)
  const pu = p.updated || 0; const cu = cur ? cur.updated || 0 : 0;
  const otraVista = cur && ((p.view && p.view !== cur.view) || JSON.stringify(p.vista || null) !== JSON.stringify(cur.vista || null));
  if (!cur || pu > cu || (pu === cu && otraVista)) await putFile(p);
  clearPending();
}
