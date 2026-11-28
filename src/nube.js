// Nube (Etapa 2b-1, v0.0.10): las planillas propias se guardan en Firestore (proyecto notas-pro-2026, el de ANote...)
// y se ven en todos los dispositivos con la misma cuenta. Se carga recién con la sesión iniciada (cuenta-ui.js).
// Compartir (Etapa 2b-2a, v0.0.11): invitar por correo con permiso «Puede editar» o «Solo puede ver», como las notas
// de ANote...; el dueño cambia permisos y quita personas; los demás pueden salir. Además, respeta «cerrar sesión en
// todos los dispositivos» del administrador de ANote... (control/{uid}.revokedAt).
//
// Firestore:
//   sheets/{id}           = { owner, memberIds: [uid], roles: { uid: 'edit'|'view' }, members: { uid: { name, email } },
//                             name, created, updated, rows, cols, ver, parts, size, by, at }
//   sheets/{id}/parts/{n} = { d: pedazo del JSON del contenido, v: ver }   (n = 0, 1, …)
//   sheetInvites/{id}_{correo} = { sheetId, email, role, from, fromName, fromEmail, sheetName, status, created }
//     (las ve quien tiene ese correo, verificado; las acepta agregándose a memberIds con el permiso de la invitación)
// El contenido (cells, styles, colW, rowH, view, vista) va aparte, en partes de hasta PART caracteres, así la lista
// (la consulta por memberIds) baja poco y una planilla grande no pasa el límite de 1 MiB por documento.
// `ver` sube en 1 con cada envío (transacción): si la nube tiene otra `ver` que la última que vio este dispositivo,
// alguien la cambió en otro lado. Reglas: firestore-planillas.rules (se pegan en la consola, junto a las de ANote...).
//
// En el dispositivo, la copia de trabajo sigue en IndexedDB (store.js); acá se lleva, por cuenta, qué planillas son
// de la cuenta y en qué estado (localStorage `planillas-nube-<uid>`):
//   { [id]: { v: última ver vista, d: hay cambios sin subir, s: contador de cambios, x: borrada acá (falta en la nube),
//            o: dueño (solo si es de otro), r: mi permiso si es de otro ('edit' | 'view'), on: nombre del dueño,
//            n: personas con acceso (si es más de 1), q: salir (compartida por otro, borrada acá) } }
// Sin conexión se sigue trabajando igual; los cambios se suben al volver la conexión.
// Hasta la Etapa 2c (sincronización por celda) no se fusiona: si la misma planilla cambió en los dos lados, queda la de
// la nube y lo de este dispositivo pasa a una copia «(cambios de este dispositivo)».
import {
  initializeFirestore, memoryLocalCache, doc, collection, query, where, onSnapshot, runTransaction, writeBatch,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { fbApp, currentUser } from './cuenta.js';
import { listFiles, getFile, putFile, deleteFile, newId, setStoreHooks, takeChanged } from './store.js';

const PART = 300000; // caracteres por parte: aun con acentos (hasta 3 bytes) queda por debajo de 1 MiB
const MAX_PARTS = 9; // una transacción admite hasta 10 MiB
const CONTENT = ['rows', 'cols', 'cells', 'styles', 'colW', 'rowH', 'view', 'vista'];

let db = null;
let uid = null;
let H = null; // ayudas de main.js: flush, askUpload, remoteChanged, remoteDeleted, removedMany, conflict, error, status,
//                shared (cambió quién tiene acceso o mi permiso), invites (lista de invitaciones), revoked (cuenta-ui.js)
let me = null; // { uid, name, email, verified }
let docs = new Map(); // id → datos chicos de la planilla en la nube (dueño, miembros, permisos), sin el contenido
let invites = [];
let unsubInv = null;
let unsubCtl = null;
let authTime = 0;
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
  setMe(user);
  docs = new Map(); invites = [];
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
  listenInvites();
  watchControl(user);
  schedule(0);
  await askUploadOnce();
}

function setMe(u) {
  const email = String(u.email || '').trim().toLowerCase();
  me = { uid: u.uid, name: (u.displayName || '').trim() || email.split('@')[0], email, verified: !!u.emailVerified };
}
// La cuenta cambió (verificó el correo o cambió el nombre visible): se vuelven a pedir las invitaciones.
export function userChanged(u) {
  if (!uid || !u || u.uid !== uid) return;
  const was = me && me.verified;
  setMe(u);
  if (!was && me.verified) { stopInvites(); listenInvites(); }
}

// Para todo (sin borrar nada): sesión vencida o cerrada desde otro lado. Las planillas quedan en el dispositivo y
// se vuelven a sincronizar cuando entra la misma cuenta.
export function stop() {
  if (unsub) { try { unsub(); } catch { /* nada */ } }
  unsub = null;
  stopInvites();
  if (unsubCtl) { try { unsubCtl(); } catch { /* nada */ } }
  unsubCtl = null;
  clearTimeout(timer); clearTimeout(retry);
  setStoreHooks(null);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onHidden);
  uid = null; meta = null; docs = new Map(); invites = [];
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
  const ids = new Set(); const dirty = new Set(); const shared = new Map();
  for (const [id, m] of Object.entries(meta)) {
    if (m.x) continue;
    ids.add(id);
    if (m.d) dirty.add(id);
    if (m.o || m.n > 1) shared.set(id, { role: m.o ? (m.r || 'view') : 'owner', ownerName: m.on || '', n: m.n || 1 });
  }
  return { ids, dirty, shared, invites: invites.length, verified: !!(me && me.verified), error: state.error, synced: state.synced, offline: offline() };
}
// Mi permiso en una planilla de la cuenta: 'owner' (mía), 'edit' o 'view' (compartida por otro). null si no es de la cuenta.
export function role(id) {
  const m = uid && meta[id];
  if (!m || m.x) return null;
  return m.o ? (m.r || 'view') : 'owner';
}
export async function pending() {
  if (!uid) return 0;
  if (H) await H.flush();
  return Object.values(meta).filter((m) => m.d || m.x).length;
}
export function adopt(id) {
  if (!uid || !id || meta[id]) return;
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
  if (m.o && m.r !== 'edit') return; // solo puede ver: lo de acá (la vista del Reporte) no se sube
  m.d = true; m.s = (m.s || 0) + 1;
  saveMeta();
  schedule(2500); // se juntan los cambios seguidos (escribir varias celdas) en un solo envío
}
function onLocalDel(id) {
  const m = meta && meta[id];
  if (!m) return;
  if (m.o) meta[id] = { v: m.v, x: true, q: true, o: m.o }; // compartida por otro: borrarla acá = salir de la planilla
  else if (m.v > 0) meta[id] = { v: m.v, x: true }; else delete meta[id];
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
  if (m.o && m.r !== 'edit') { m.d = false; saveMeta(); return; } // solo puede ver
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
  let conflict = false; let gone = false; let newVer = 0; let after = null;
  await runTransaction(db, async (t) => {
    conflict = false; gone = false;
    const snap = await t.get(ref);
    const cur = snap.exists() ? snap.data() : null;
    const rv = cur ? cur.ver || 0 : 0;
    if (!cur && m.o) { gone = true; return; } // era de otro y ya no está (o ya no tengo acceso): la quita la escucha
    if (cur && rv !== m.v) { conflict = true; return; }
    newVer = Math.max(rv, m.v) + 1;
    const data = {
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
    };
    // Si ya existe, solo se cambia el contenido (dueño, miembros y permisos quedan como están: así puede subir
    // también quien tiene «Puede editar»).
    if (cur) t.update(ref, data); else t.set(ref, { owner: uid, memberIds: [uid], ...data });
    after = cur ? { owner: cur.owner, memberIds: cur.memberIds || [], roles: cur.roles || {}, members: cur.members || {}, name: data.name }
      : { owner: uid, memberIds: [uid], roles: {}, members: {}, name: data.name };
    parts.forEach((d, i) => t.set(doc(db, 'sheets', id, 'parts', String(i)), { d, v: newVer }));
    for (let i = parts.length; i < (cur ? cur.parts || 0 : 0); i++) t.delete(doc(db, 'sheets', id, 'parts', String(i)));
  });
  if (gone) return;
  if (conflict) {
    // Cambió en otro dispositivo: se trae la de la nube (y lo de acá queda en una copia)
    const snap = await getDoc(ref);
    if (snap.exists()) await remoteDoc(id, snap.data());
    return;
  }
  const mm = meta && meta[id];
  if (!mm) return;
  const had = docs.has(id);
  if (after) docs.set(id, after);
  if (!had && after) H.shared(id); // ya se puede compartir (la hoja «Compartir» abierta se redibuja)
  mm.v = newVer;
  if (mm.s === seq) mm.d = false;
  saveMeta();
}

async function pushDelete(id) {
  const ref = doc(db, 'sheets', id);
  if (meta[id].q) {
    // Compartida por otro: salir (me saco de memberIds); para los demás sigue igual
    try { await updateDoc(ref, { memberIds: arrayRemove(uid), [`roles.${uid}`]: deleteField(), [`members.${uid}`]: deleteField() }); } catch (e) {
      if (e?.code !== 'not-found' && e?.code !== 'permission-denied') throw e; // ya no está o ya no tenía acceso
    }
    delete meta[id]; docs.delete(id);
    saveMeta();
    return;
  }
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const ps = await getDocs(collection(db, 'sheets', id, 'parts'));
    const b = writeBatch(db);
    ps.forEach((p) => b.delete(p.ref));
    b.delete(ref);
    await b.commit();
    // Invitaciones que quedaron sin aceptar
    try {
      const inv = await getDocs(query(collection(db, 'sheetInvites'), where('sheetId', '==', id), where('from', '==', uid)));
      for (const x of inv.docs) await deleteDoc(x.ref);
    } catch (e) { console.warn('Nube: invitaciones de una planilla borrada', e); }
  }
  delete meta[id]; docs.delete(id);
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

// Dueño, miembros y mi permiso, para la interfaz y para saber qué se puede subir
function shareBits(d) {
  const o = d.owner && d.owner !== uid ? d.owner : undefined;
  const mem = d.members || {};
  const n = (d.memberIds || []).length;
  return { o, r: o ? ((d.roles || {})[uid] === 'edit' ? 'edit' : 'view') : undefined, on: o ? (mem[o]?.name || mem[o]?.email || '') : undefined, n: n > 1 ? n : undefined };
}
function applyShare(m, d) {
  const b = shareBits(d);
  let ch = false;
  for (const k of ['o', 'r', 'on', 'n']) {
    if (m[k] !== b[k]) { ch = true; if (b[k] === undefined) delete m[k]; else m[k] = b[k]; }
  }
  return ch;
}
async function remoteDoc(id, d) {
  docs.set(id, { owner: d.owner, memberIds: d.memberIds || [], roles: d.roles || {}, members: d.members || {}, name: d.name || '' });
  const m0 = meta[id];
  if (m0 && m0.x) return; // se borró acá: la nube se borra en el próximo envío
  if (m0) {
    const wasEdit = !m0.o || m0.r === 'edit';
    if (applyShare(m0, d)) {
      // Me pasaron a «Solo puede ver» con cambios sin subir: lo de acá queda en una copia mía
      if (wasEdit && m0.o && m0.r !== 'edit' && m0.d) {
        await H.flush();
        const local = await getFile(id);
        if (local) await keepCopy(local, `${local.name} (mis cambios)`);
        m0.d = false; m0.v = 0; // se vuelve a bajar la de la nube
      }
      saveMeta();
      H.shared(id);
    }
  }
  if (m0 && (d.ver || 0) <= m0.v) return; // ya la tenemos (o es lo que mandó este mismo dispositivo)
  const content = await fetchContent(id, d);
  if (!content || !uid) return;
  await H.flush(); // lo que se está escribiendo pasa al archivo antes de decidir
  const m = meta[id];
  if (m && m.x) return;
  const local = await getFile(id);
  if (m && m.d && local) {
    // Cambió en los dos lados: lo de este dispositivo queda en una copia (hasta la Etapa 2c, que fusiona por celda)
    const copy = await keepCopy(local, `${local.name} (cambios de este dispositivo)`);
    H.conflict(local.name, copy.name);
  }
  const file = { id, name: d.name || 'Planilla', created: d.created || Date.now(), updated: d.updated || Date.now(), ...content };
  if (local && local.view) file.view = local.view; // la vista (Reporte, Ficha, Grilla) es de cada dispositivo
  await putFile(file, true);
  meta[id] = { v: d.ver || 0, d: false, s: 0 };
  applyShare(meta[id], d);
  saveMeta();
  const mem = d.members || {};
  const by = d.by && d.by !== uid ? (mem[d.by]?.name || mem[d.by]?.email || 'otra persona') : null;
  H.remoteChanged(id, !local, by);
}
// Copia mía (nueva, en la cuenta) de una planilla, para no perder lo de este dispositivo
async function keepCopy(local, name) {
  const copy = { ...JSON.parse(JSON.stringify(local)), id: newId(), name, updated: Date.now() };
  meta[copy.id] = { v: 0, d: true, s: 1 };
  saveMeta();
  await putFile(copy, true);
  schedule(0);
  return copy;
}

async function remoteRemoved(id) {
  const m = meta[id];
  if (!m || m.x) return;
  await H.flush();
  docs.delete(id);
  if (meta[id] && meta[id].o) {
    // Compartida por otro: me sacaron el acceso o el dueño la borró. Si había cambios sin subir, quedan en una copia mía.
    const local = await getFile(id);
    let copy = null;
    if (meta[id].d && local) copy = await keepCopy(local, `${local.name} (mis cambios)`);
    delete meta[id];
    saveMeta();
    await deleteFile(id, true);
    H.remoteDeleted(id, { unshared: true, name: local ? local.name : '', copy: copy ? copy.name : '' });
    return;
  }
  if (meta[id] && meta[id].d) { meta[id] = { v: 0, d: true, s: 1 }; saveMeta(); schedule(0); return; } // con cambios: se vuelve a subir
  delete meta[id];
  saveMeta();
  await deleteFile(id, true);
  H.remoteDeleted(id);
}

// ---------- Compartir (v0.0.11) ----------
const need = () => { if (!uid) throw Object.assign(new Error('Sin sesión'), { code: 'unauthenticated' }); if (offline()) throw Object.assign(new Error('Sin conexión'), { code: 'unavailable' }); };
const ROLES = ['edit', 'view'];

// Quién tiene acceso a una planilla de la cuenta (para la hoja «Compartir»)
export function shareInfo(id) {
  const m = uid && meta[id];
  if (!m || m.x) return null;
  const d = docs.get(id);
  const r = m.o ? (m.r || 'view') : 'owner';
  const people = [];
  if (d) {
    for (const u of d.memberIds) {
      const x = d.members[u] || {};
      const self = u === uid;
      people.push({
        uid: u, me: self, role: u === d.owner ? 'owner' : (d.roles[u] === 'edit' ? 'edit' : 'view'),
        name: x.name || (self ? me.name : ''), email: x.email || (self ? me.email : ''),
      });
    }
    people.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
  }
  return { role: r, uploaded: !!d && m.v > 0, people, verified: !!me.verified, myEmail: me.email };
}

export async function invite(id, email, r) {
  need();
  const e = String(email || '').trim().toLowerCase();
  const d = docs.get(id);
  if (!d || d.owner !== uid) throw Object.assign(new Error('Solo el dueño invita'), { code: 'permission-denied' });
  if (!ROLES.includes(r)) r = 'view';
  const ref = doc(db, 'sheets', id);
  // El dueño queda con nombre y correo en la planilla, para que lo vean los demás
  const mine = d.members[uid];
  if (!mine || mine.name !== me.name || mine.email !== me.email) {
    await updateDoc(ref, { [`members.${uid}`]: { name: me.name, email: me.email } });
    d.members[uid] = { name: me.name, email: me.email };
  }
  await setDoc(doc(db, 'sheetInvites', `${id}_${e}`), {
    sheetId: id, email: e, role: r, from: uid, fromName: me.name, fromEmail: me.email,
    sheetName: d.name || '', status: 'pending', created: Date.now(),
  });
}
// Invitaciones sin aceptar de una planilla mía (las ve solo quien invitó). cb(lista); devuelve cómo dejar de escuchar.
export function watchSheetInvites(id, cb) {
  if (!uid) { cb([]); return () => {}; }
  return onSnapshot(query(collection(db, 'sheetInvites'), where('sheetId', '==', id), where('from', '==', uid)),
    (s) => cb(s.docs.map((x) => ({ id: x.id, ...x.data() })).filter((i) => i.status === 'pending')),
    (e) => { console.warn('Nube: invitaciones de la planilla', e); cb([]); });
}
export async function cancelInvite(inviteId) { need(); await deleteDoc(doc(db, 'sheetInvites', inviteId)); }
export async function setRole(id, u, r) {
  need();
  if (!ROLES.includes(r)) return;
  await updateDoc(doc(db, 'sheets', id), { [`roles.${u}`]: r });
}
export async function removeMember(id, u) {
  need();
  await updateDoc(doc(db, 'sheets', id), { memberIds: arrayRemove(u), [`roles.${u}`]: deleteField(), [`members.${u}`]: deleteField() });
}

// Invitaciones para mí (necesitan el correo verificado: las reglas no dejan verlas sin eso)
function listenInvites() {
  if (unsubInv || !uid) return;
  if (!me.verified || !me.email) { invites = []; if (H) H.invites(invites); return; }
  const u = uid;
  let refreshed = false;
  const go = () => {
    unsubInv = onSnapshot(query(collection(db, 'sheetInvites'), where('email', '==', me.email)), (s) => {
      if (uid !== u) return;
      const all = s.docs.map((x) => ({ id: x.id, ...x.data() })).filter((i) => i.status === 'pending');
      // Ya aceptada (por ejemplo, desde otro dispositivo): la invitación sobra
      all.filter((i) => docs.has(i.sheetId)).forEach((i) => { deleteDoc(doc(db, 'sheetInvites', i.id)).catch(() => {}); });
      invites = all.filter((i) => !docs.has(i.sheetId));
      H.invites(invites);
    }, async (e) => {
      unsubInv = null;
      console.warn('Nube: invitaciones', e);
      // Recién verificado: el token todavía no lo sabe. Se renueva una vez y se vuelve a intentar.
      if (e?.code === 'permission-denied' && !refreshed) {
        refreshed = true;
        try { await currentUser()?.getIdToken(true); } catch { /* nada */ }
        if (uid === u && !unsubInv) go();
        return;
      }
      setTimeout(() => { if (uid === u && !unsubInv) listenInvites(); }, 60000);
    });
  };
  go();
}
function stopInvites() { if (unsubInv) { try { unsubInv(); } catch { /* nada */ } } unsubInv = null; }
export const invitesList = () => invites.slice();

export async function acceptInvite(inv) {
  need();
  const ref = doc(db, 'sheets', inv.sheetId);
  if (!docs.has(inv.sheetId)) {
    try {
      await updateDoc(ref, { memberIds: arrayUnion(uid), [`roles.${uid}`]: inv.role === 'edit' ? 'edit' : 'view', [`members.${uid}`]: { name: me.name, email: me.email } });
    } catch (e) {
      if (e?.code === 'not-found') { await deleteDoc(doc(db, 'sheetInvites', inv.id)).catch(() => {}); throw Object.assign(new Error('La planilla ya no existe'), { code: 'gone' }); }
      throw e;
    }
  }
  await deleteDoc(doc(db, 'sheetInvites', inv.id));
}
export async function declineInvite(inv) { need(); await deleteDoc(doc(db, 'sheetInvites', inv.id)); }

// ---------- «Cerrar sesión en todos los dispositivos» del administrador de ANote... (control/{uid}.revokedAt) ----------
// Solo se lee (las reglas de ANote... dejan que cada uno lea el suyo). Si el pedido es posterior al inicio de esta
// sesión y viene del servidor (no de una copia), se cierra la sesión.
const tsMs = (t) => (t == null ? 0 : typeof t === 'number' ? t : typeof t.toMillis === 'function' ? t.toMillis() : (t.seconds || 0) * 1000);
async function watchControl(user) {
  const u = user.uid;
  try { authTime = Date.parse((await user.getIdTokenResult()).authTime) || 0; } catch { authTime = 0; }
  if (uid !== u || unsubCtl) return;
  unsubCtl = onSnapshot(doc(db, 'control', u), { includeMetadataChanges: true }, (snap) => {
    if (uid !== u || !snap.exists()) return;
    const rev = tsMs(snap.data().revokedAt);
    if (rev && authTime && rev > authTime && !(snap.metadata && snap.metadata.fromCache) && H && H.revoked) H.revoked();
  }, (e) => console.warn('Nube: pedidos del administrador', e));
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
