// Reemplaza firebase/firestore en la prueba (v0.0.10). Los datos viven en el servidor de prueba (armar.sh, /__fs),
// así dos "dispositivos" (dos contextos de Chrome) comparten la misma nube. Solo lo que usa src/nube.js.
// Desde la prueba: window.__fssim.offline = true (sin conexión) y window.__fssim.lecturas / .escrituras.
const SIM = (window.__fssim = window.__fssim || { offline: false, lecturas: 0, escrituras: 0 });
const err = (code) => Object.assign(new Error(`Firestore: ${code}`), { code });
async function api(path, body) {
  if (SIM.offline) { await new Promise((r) => setTimeout(r, 50)); throw err('unavailable'); }
  const r = await fetch(`/__fs/${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (j.error) throw err(j.error);
  return j;
}
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const TS = { __ts: 1 };

export const memoryLocalCache = () => ({ kind: 'memory' });
export function initializeFirestore(app, opts) { return { app, opts }; }
export const serverTimestamp = () => TS;

export function doc(_db, ...seg) { const path = seg.join('/'); return { type: 'doc', path, id: seg[seg.length - 1] }; }
export function collection(_db, ...seg) { return { type: 'col', path: seg.join('/') }; }
export const where = (field, op, value) => ({ field, op, value });
export const query = (col, w) => ({ ...col, where: w });

function docSnap(path, data) {
  const id = path.split('/').pop();
  return { id, ref: { type: 'doc', path, id }, exists: () => data != null, data: () => clone(data) };
}
function querySnap(rows, changes) {
  const docs = rows.map((r) => docSnap(r.path, r.data));
  return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f), docChanges: () => changes || [], metadata: { fromCache: false } };
}

export async function getDoc(ref) { SIM.lecturas++; const j = await api(`doc?path=${encodeURIComponent(ref.path)}`); return docSnap(ref.path, j.data); }
async function list(q) {
  const w = q.where ? `&field=${encodeURIComponent(q.where.field)}&contains=${encodeURIComponent(q.where.value)}` : '';
  const j = await api(`col?path=${encodeURIComponent(q.path)}${w}`);
  SIM.lecturas += j.rows.length || 1;
  return j.rows;
}
export async function getDocs(q) { return querySnap(await list(q)); }

// Escucha: pide la consulta cada 1 s (deja ratos sin red: las pruebas esperan "networkidle0") y arma los cambios (added / modified / removed)
export function onSnapshot(q, next, onError) {
  let prev = null; let stop = false; let t = 0;
  const tick = async () => {
    if (stop) return;
    try {
      const rows = await list(q);
      const now = new Map(rows.map((r) => [r.path, JSON.stringify(r.data)]));
      const changes = [];
      if (!prev) rows.forEach((r) => changes.push({ type: 'added', doc: docSnap(r.path, r.data) }));
      else {
        rows.forEach((r) => {
          if (!prev.has(r.path)) changes.push({ type: 'added', doc: docSnap(r.path, r.data) });
          else if (prev.get(r.path) !== now.get(r.path)) changes.push({ type: 'modified', doc: docSnap(r.path, r.data) });
        });
        for (const [p, d] of prev) if (!now.has(p)) changes.push({ type: 'removed', doc: docSnap(p, JSON.parse(d)) });
      }
      const first = !prev;
      prev = now;
      if (first || changes.length) next(querySnap(rows, changes));
    } catch (e) {
      if (e.code !== 'unavailable') { stop = true; onError(e); return; }
      // sin conexión: el SDK real reintenta solo; acá también
    }
    if (!stop) t = setTimeout(tick, 1000);
  };
  tick();
  return () => { stop = true; clearTimeout(t); };
}

function batchOps() {
  const writes = [];
  return {
    writes,
    set(ref, data) { writes.push({ op: 'set', path: ref.path, data: clone(data) }); },
    delete(ref) { writes.push({ op: 'delete', path: ref.path }); },
  };
}
export function writeBatch() {
  const b = batchOps();
  return { set: b.set, delete: b.delete, commit: async () => { SIM.escrituras += b.writes.length; await api('commit', { writes: b.writes, checks: [] }); } };
}

// Transacción: lo leído se manda como condición; si cambió en el servidor, se repite (como el SDK real)
export async function runTransaction(_db, fn) {
  for (let i = 0; i < 5; i++) {
    const checks = []; const b = batchOps();
    const t = {
      get: async (ref) => { const j = await api(`doc?path=${encodeURIComponent(ref.path)}`); SIM.lecturas++; checks.push({ path: ref.path, json: JSON.stringify(j.data ?? null) }); return docSnap(ref.path, j.data); },
      set: (ref, data) => { b.set(ref, data); return t; },
      delete: (ref) => { b.delete(ref); return t; },
    };
    const out = await fn(t);
    if (!b.writes.length) return out;
    try { await api('commit', { writes: b.writes, checks }); SIM.escrituras += b.writes.length; return out; } catch (e) {
      if (e.code !== 'aborted') throw e;
    }
  }
  throw err('aborted');
}
