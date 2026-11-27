// Archivos (planillas) guardados en este dispositivo: IndexedDB, con respaldo en localStorage
// si IndexedDB no está disponible (modo privado de algunos navegadores).
// Archivo = { id, name, created, updated, rows, cols, cells: { "A1": "texto" }, styles, colW, rowH }
// (styles/colW/rowH desde la v0.0.4: formato traído al importar .xlsx; detalle en transfer.js)

const DB_NAME = 'planillas';
const STORE = 'files';
const LS_FALLBACK = 'planillas-archivos-v1';
const LS_PENDING = 'planillas-pendiente'; // copia sincrónica al salir de la app (IndexedDB es asíncrono)

let dbPromise = null;

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

export async function putFile(file) {
  const db = await openDb();
  if (db) { await tx(db, 'readwrite', (st) => st.put(file)); return; }
  const all = lsAll(); all[file.id] = file; lsWrite(all);
}

export async function deleteFile(id) {
  const db = await openDb();
  if (db) { await tx(db, 'readwrite', (st) => st.delete(id)); return; }
  const all = lsAll(); delete all[id]; lsWrite(all);
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
  // Más nueva, o igual de nueva pero con otra vista (cambiar de vista no cambia la fecha; v0.0.5)
  const pu = p.updated || 0; const cu = cur ? cur.updated || 0 : 0;
  if (!cur || pu > cu || (pu === cu && p.view && p.view !== cur.view)) await putFile(p);
  clearPending();
}
