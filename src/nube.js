// Nube (Etapa 2b-1, v0.0.10): las planillas propias se guardan en Firestore (proyecto notas-pro-2026, el de ANote...)
// y se ven en todos los dispositivos con la misma cuenta. Se carga recién con la sesión iniciada (cuenta-ui.js).
//
// Firestore:
//   sheets/{id}           = { owner, memberIds: [uid], name, created, updated, rows, cols, ver, parts, size, by, at }
//   sheets/{id}/parts/{n} = { d: pedazo del JSON del contenido, v: ver }   (n = 0, 1, …)
// El contenido (cells, styles, colW, rowH, view, vista) va aparte, en partes de hasta PART caracteres, así la lista
// (la consulta por memberIds) baja poco y una planilla grande no pasa el límite de 1 MiB por documento.
// `ver` sube en 1 con cada envío (transacción): si la nube tiene otra `ver` que la última que vio este dispositivo,
// alguien la cambió en otro lado. Reglas: firestore-planillas.rules (se pegan en la consola, junto a las de ANote...).
//
// En el dispositivo, la copia de trabajo sigue en IndexedDB (store.js); acá se lleva, por cuenta, qué planillas son
// de la cuenta y en qué estado (localStorage `planillas-nube-<uid>`):
//   { [id]: { v: última ver vista, d: hay cambios sin subir, s: contador de cambios, x: borrada acá (falta en la nube) } }
// Sin conexión se sigue trabajando igual; los cambios se suben al volver la conexión.
// Hasta la Etapa 2c (sincronización por celda) no se fusiona: si la misma planilla cambió en los dos lados, queda la de
// la nube y lo de este dispositivo pasa a una copia «(cambios de este dispositivo)».
import {
  initializeFirestore, memoryLocalCache, doc, collection, query, where, onSnapshot, runTransaction, writeBatch,
  getDoc, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { fbApp } from './cuenta.js';
import { listFiles, getFile, putFile, deleteFile, newId, setStoreHooks, takeChanged } from './store.js';

const PART = 300000; // caracteres por parte: aun con acentos (hasta 3 bytes) queda por debajo de 1 MiB
const MAX_PARTS = 9; // una transacción admite hasta 10 MiB
const CONTENT = ['rows', 'cols', 'cells', 'styles', 'colW', 'rowH', 'view', 'vista'];

let db = null;
let uid = null;
let H = null; // ayudas de main.js: flush, askUpload, remoteChanged, remoteDeleted, removedMany, conflict, error, status
let meta = null;
let unsub = null;
let first = true;
let timer = 0;
let retry = 0;
let queue = Promise.resolve(); // todo (lo que llega y lo que se manda) pasa de a uno, en orden
let state = { error: '', synced: false };
let lastErrShown = '';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin lugar */ } };
const metaKey = (u) => `planillas-nube-${u}`;
const askedKey = (u) => `planillas-nube-preguntado-${u}`;
function loadMeta(u) { try { return JSON.parse(lsGet(metaKey(u))) || {}; } catch { return {}; } }
function saveMeta() { if (uid) lsSet(metaKey(uid), JSON.stringify(meta)); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (fn) => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };
const offline = () => navigator.onLine === false;

// Planillas de otras cuentas que quedaron en el dispositivo (sesión cerrada sin «Cerrar sesión»): no son locales.
function otherAccountIds() {
  const ids = new Set();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('planillas-nube-') || k.startsWith('planillas-nube-preguntado-') || k === metaKey(uid)) continue;
      Object.keys(JSON.parse(localStorage.getItem(k)) || {}).forEach((id) => ids.add(id));
    }
  } catch { /* nada */ }
  return ids;
}
async function localFiles() {
  const other = otherAccountIds();
  return (await listFiles()).filter((f) => !meta[f.id] && !other.has(f.id));
}

// ---------- Arranque y cierre ----------
export async function start(user, helpers) {
  if (uid === user.uid) return;
  if (uid) stop();
  H = helpers;
  uid = user.uid;
  meta = loadMeta(uid);
  first = true;
  state = { error: '', synced: false };
  if (!db) db = initializeFirestore(fbApp(), { localCache: memoryLocalCache() });
  // Cambios hechos sin la nube cargada (por ejemplo, la copia recuperada al abrir la app)
  for (const id of takeChanged()) { const m = meta[id]; if (m && !m.x) { m.d = true; m.s = (m.s || 0) + 1; } }
  saveMeta();
  setStoreHooks({ put: onLocalPut, del: onLocalDel });
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onHidden);
  listen();
  schedule(0);
  await askUploadOnce();
}

// Para todo (sin borrar nada): sesión vencida o cerrada desde otro lado. Las planillas quedan en el dispositivo y
// se vuelven a sincronizar cuando entra la misma cuenta.
export function stop() {
  if (unsub) { try { unsub(); } catch { /* nada */ } }
  unsub = null;
  clearTimeout(timer); clearTimeout(retry);
  setStoreHooks(null);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onHidden);
  uid = null; meta = null;
}

// «Cerrar sesión»: intenta subir lo pendiente, para y quita del dispositivo las planillas de la cuenta (siguen en la
// nube). Devuelve los ids quitados.
export async function leave() {
  if (!uid) return [];
  try { await syncNow(8000); } catch { /* sin conexión: ya se avisó */ }
  const u = uid;
  const ids = Object.keys(meta);
  stop();
  for (const id of ids) { try { await deleteFile(id, true); } catch { /* nada */ } }
  lsSet(metaKey(u), null);
  return ids;
}

// ---------- Estado para la interfaz ----------
export function info() {
  if (!uid) return null;
  const ids = new Set(); const dirty = new Set();
  for (const [id, m] of Object.entries(meta)) { if (m.x) continue; ids.add(id); if (m.d) dirty.add(id); }
  return { ids, dirty, error: state.error, synced: state.synced, offline: offline() };
}
export async function pending() {
  if (!uid) return 0;
  if (H) await H.flush();
  return Object.values(meta).filter((m) => m.d || m.x).length;
}
export function adopt(id) {
  if (!uid || !id) return;
  meta[id] = { v: 0, d: true, s: 1 };
  saveMeta();
  schedule(0);
}
export const isAccount = (id) => !!(uid && meta[id] && !meta[id].x);
export async function syncNow(timeout = 10000) {
  if (!uid) return;
  if (H) await H.flush();
  clearTimeout(timer);
  await Promise.race([run(pushAll), wait(timeout)]);
}

// ---------- Primera vez con la cuenta en este dispositivo: ¿subir las planillas locales? ----------
async function askUploadOnce() {
  const u = uid;
  if (lsGet(askedKey(u))) return;
  const locals = await localFiles();
  const withData = locals.filter((f) => Object.keys(f.cells || {}).length);
  if (!withData.length) { lsSet(askedKey(u), '1'); return; }
  const yes = await H.askUpload(withData.length);
  if (uid !== u) return;
  lsSet(askedKey(u), '1');
  if (!yes) return;
  for (const f of locals) meta[f.id] = { v: 0, d: true, s: 1 };
  saveMeta();
  H.status();
  schedule(0);
}
export async function localCount() { return uid ? (await localFiles()).length : 0; }

// ---------- Cambios hechos en este dispositivo ----------
function onLocalPut(file) {
  const m = meta && meta[file.id];
  if (!m || m.x) return;
  m.d = true; m.s = (m.s || 0) + 1;
  saveMeta();
  schedule(2500); // se juntan los cambios seguidos (escribir varias celdas) en un solo envío
}
function onLocalDel(id) {
  const m = meta && meta[id];
  if (!m) return;
  if (m.v > 0) meta[id] = { v: m.v, x: true }; else delete meta[id];
  saveMeta();
  schedule(0);
}
function onOnline() { schedule(0); if (!unsub && uid) listen(); }
function onHidden() { if (document.hidden && uid) schedule(0); }

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => { run(pushAll); }, ms);
}

async function pushAll() {
  if (!uid || offline()) { if (H) H.status(); return; }
  try {
    for (const id of Object.keys(meta || {})) {
      if (!uid) return;
      const m = meta[id];
      if (!m) continue;
      if (m.x) await pushDelete(id);
      else if (m.d && !m.big) await pushOne(id);
    }
    setError(null);
  } catch (e) {
    console.warn('Nube: subir', e);
    setError(e);
    clearTimeout(retry);
    retry = setTimeout(() => schedule(0), e?.code === 'permission-denied' ? 60000 : 20000);
  }
  if (H) H.status();
}

// Partes del JSON. No se corta en el medio de un par sustituto (emoji y otros fuera del plano básico): un pedazo
// suelto no es texto válido y Firestore lo guardaría roto.
function chunks(json) {
  const out = [];
  let i = 0;
  while (i < json.length) {
    let j = Math.min(i + PART, json.length);
    const c = json.charCodeAt(j - 1);
    if (j < json.length && c >= 0xD800 && c <= 0xDBFF) j--;
    out.push(json.slice(i, j));
    i = j;
  }
  return out.length ? out : ['{}'];
}

async function pushOne(id) {
  const f = await getFile(id);
  const m = meta[id];
  if (!m) return;
  if (!f) { delete meta[id]; saveMeta(); return; }
  const seq = m.s;
  const body = {};
  for (const k of CONTENT) if (f[k] !== undefined) body[k] = f[k];
  const json = JSON.stringify(body);
  const parts = chunks(json);
  if (parts.length > MAX_PARTS) {
    m.big = true; saveMeta();
    H.error(`"${f.name}" es demasiado grande para la nube: queda solo en este dispositivo.`);
    return;
  }
  const ref = doc(db, 'sheets', id);
  let conflict = false; let newVer = 0;
  await runTransaction(db, async (t) => {
    conflict = false;
    const snap = await t.get(ref);
    const cur = snap.exists() ? snap.data() : null;
    const rv = cur ? cur.ver || 0 : 0;
    if (cur && rv !== m.v) { conflict = true; return; }
    newVer = Math.max(rv, m.v) + 1;
    t.set(ref, {
      owner: cur ? cur.owner : uid,
      memberIds: cur ? cur.memberIds : [uid],
      name: f.name || '',
      created: f.created || Date.now(),
      updated: f.updated || Date.now(),
      rows: f.rows || 0,
      cols: f.cols || 0,
      ver: newVer,
      parts: parts.length,
      size: json.length,
      by: uid,
      at: serverTimestamp(),
    });
    parts.forEach((d, i) => t.set(doc(db, 'sheets', id, 'parts', String(i)), { d, v: newVer }));
    for (let i = parts.length; i < (cur ? cur.parts || 0 : 0); i++) t.delete(doc(db, 'sheets', id, 'parts', String(i)));
  });
  if (conflict) {
    // Cambió en otro dispositivo: se trae la de la nube (y lo de acá queda en una copia)
    const snap = await getDoc(ref);
    if (snap.exists()) await remoteDoc(id, snap.data());
    return;
  }
  const mm = meta && meta[id];
  if (!mm) return;
  mm.v = newVer;
  if (mm.s === seq) mm.d = false;
  saveMeta();
}

async function pushDelete(id) {
  const ref = doc(db, 'sheets', id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const ps = await getDocs(collection(db, 'sheets', id, 'parts'));
    const b = writeBatch(db);
    ps.forEach((p) => b.delete(p.ref));
    b.delete(ref);
    await b.commit();
  }
  delete meta[id];
  saveMeta();
}

// ---------- Lo que llega de la nube ----------
function listen() {
  if (unsub || !uid) return;
  const u = uid;
  const q = query(collection(db, 'sheets'), where('memberIds', 'array-contains', u));
  unsub = onSnapshot(q, (snap) => { run(() => onSnapshotData(snap, u)).catch((e) => { console.warn('Nube: bajar', e); setError(e); H.status(); }); }, (e) => {
    console.warn('Nube: escuchar', e);
    unsub = null;
    setError(e);
    if (H) H.status();
    setTimeout(() => { if (uid === u) listen(); }, e?.code === 'permission-denied' ? 60000 : 20000);
  });
}

async function onSnapshotData(snap, u) {
  if (uid !== u) return;
  for (const ch of snap.docChanges()) {
    if (uid !== u) return;
    if (ch.type === 'removed') await remoteRemoved(ch.doc.id);
    else await remoteDoc(ch.doc.id, ch.doc.data());
  }
  if (first) {
    first = false;
    // Borradas en otro dispositivo mientras este estaba sin conexión
    const ids = new Set(snap.docs.map((x) => x.id));
    for (const [id, m] of Object.entries(meta)) if (!ids.has(id) && !m.x && m.v > 0) await remoteRemoved(id);
    state.synced = true;
  }
  if (!snap.metadata || !snap.metadata.fromCache) setError(null);
  H.status();
}

async function fetchContent(id, d) {
  for (let i = 0; i < 3; i++) {
    const ps = await getDocs(collection(db, 'sheets', id, 'parts'));
    const arr = [];
    ps.forEach((p) => { arr[Number(p.id)] = p.data(); });
    const mine = arr.slice(0, d.parts || 1);
    if (mine.length === (d.parts || 1) && mine.every((x) => x && x.v === d.ver)) {
      try { return JSON.parse(mine.map((x) => x.d).join('')); } catch { return null; }
    }
    if (mine.some((x) => x && x.v > d.ver)) return null; // ya hay una más nueva: llega en el próximo aviso
    await wait(800);
  }
  return null;
}

async function remoteDoc(id, d) {
  const m0 = meta[id];
  if (m0 && m0.x) return; // se borró acá: la nube se borra en el próximo envío
  if (m0 && (d.ver || 0) <= m0.v) return; // ya la tenemos (o es lo que mandó este mismo dispositivo)
  const content = await fetchContent(id, d);
  if (!content || !uid) return;
  await H.flush(); // lo que se está escribiendo pasa al archivo antes de decidir
  const m = meta[id];
  if (m && m.x) return;
  const local = await getFile(id);
  if (m && m.d && local) {
    // Cambió en los dos lados: lo de este dispositivo queda en una copia (hasta la Etapa 2c, que fusiona por celda)
    const copy = { ...JSON.parse(JSON.stringify(local)), id: newId(), name: `${local.name} (cambios de este dispositivo)`, updated: Date.now() };
    meta[copy.id] = { v: 0, d: true, s: 1 };
    saveMeta();
    await putFile(copy, true);
    H.conflict(local.name, copy.name);
    schedule(0);
  }
  const file = { id, name: d.name || 'Planilla', created: d.created || Date.now(), updated: d.updated || Date.now(), ...content };
  if (local && local.view) file.view = local.view; // la vista (Reporte, Ficha, Grilla) es de cada dispositivo
  await putFile(file, true);
  meta[id] = { v: d.ver || 0, d: false, s: 0 };
  saveMeta();
  H.remoteChanged(id, !local);
}

async function remoteRemoved(id) {
  const m = meta[id];
  if (!m || m.x) return;
  await H.flush();
  if (meta[id] && meta[id].d) { meta[id] = { v: 0, d: true, s: 1 }; saveMeta(); schedule(0); return; } // con cambios: se vuelve a subir
  delete meta[id];
  saveMeta();
  await deleteFile(id, true);
  H.remoteDeleted(id);
}

// ---------- Errores ----------
function errText(e) {
  const code = e?.code || '';
  if (code === 'permission-denied') return 'La nube rechazó el cambio. ¿Están pegadas en Firebase las reglas de Planillas (firestore-planillas.rules)?';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'Sin conexión con la nube: los cambios se suben cuando vuelva.';
  if (code === 'resource-exhausted') return 'La nube llegó al límite del plan gratuito por hoy: los cambios se suben más tarde.';
  return `No se pudo sincronizar con la nube (${e?.message || code || 'error desconocido'}).`;
}
function setError(e) {
  state.error = e ? errText(e) : '';
  if (state.error && state.error !== lastErrShown && H) { lastErrShown = state.error; H.error(state.error); }
  if (!e) lastErrShown = '';
}
