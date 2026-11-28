#!/bin/bash
# Arma la app para probarla en Chrome sin npm install (web, con @capacitor/* simulado) y la sirve en :8765.
# Uso (desde la raíz del repo): bash pruebas/app/armar.sh   → después: node pruebas/app/<prueba>.mjs
# Firebase (firebase/app y firebase/auth) también simulado: firebase-simulado.mjs (desde la v0.0.9).
# firebase/firestore simulado (v0.0.10): firestore-simulado.mjs, con los datos en este mismo servidor (/__fs/...), así
# dos contextos de Chrome (dos "dispositivos") comparten la nube. POST /__fs/reset la vacía; POST /__fs/deny {on}
# simula reglas que rechazan todo (permission-denied); GET /__fs/dump muestra lo guardado. Desde la v0.0.11 aplica
# una copia en JavaScript de las reglas (firestore-planillas.rules) con la cuenta de cada pedido; POST /__fs/put escribe
# sin reglas (como la consola de Firebase, por ejemplo control/{uid}).
# ExcelJS sale del paquete que arma pruebas/xlsx/correr.sh (/tmp/xb/exceljs.mjs); jszip de /opt/npm-tools.
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd)
D=/tmp/app-prueba; ESB=$(ls /opt/npm-tools/node_modules/@esbuild/linux-x64/bin/esbuild 2>/dev/null || command -v esbuild)
[ -f /tmp/xb/exceljs.mjs ] || { echo "Primero: bash pruebas/xlsx/correr.sh pruebas/xlsx/ida-vuelta.mjs (arma ExcelJS)"; exit 1; }
rm -rf $D && mkdir -p $D && cp -r $REPO/public/* $D/
S=$REPO/pruebas/app/capacitor-simulado.mjs
A=""; for m in core app keyboard status-bar filesystem share; do A="$A --alias:@capacitor/$m=$S"; done
"$ESB" $REPO/src/main.js --bundle --format=esm --splitting --outdir=$D/assets --entry-names=app --log-level=error \
  --target=chrome94 --define:__APP_VERSION__='"0.0.4-prueba"' $A \
  --alias:firebase/app=$REPO/pruebas/app/firebase-simulado.mjs --alias:firebase/auth=$REPO/pruebas/app/firebase-simulado.mjs \
  --alias:firebase/firestore=$REPO/pruebas/app/firestore-simulado.mjs \
  --alias:exceljs=/tmp/xb/exceljs.mjs --alias:jszip=/opt/npm-tools/node_modules/jszip/dist/jszip.min.js
sed -e 's#<script type="module" src="./src/main.js"></script>#<link rel="stylesheet" href="./assets/app.css"><script type="module" src="./assets/app.js"></script>#' \
    -e 's/__APP_VERSION__/0.0.4-prueba/g' $REPO/index.html > $D/index.html
ls -la $D/assets | head
pkill -f "app-prueba-servidor" 2>/dev/null || true
cat > /tmp/app-prueba-servidor.mjs <<'JS'
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join } from 'node:path';
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// Nube simulada (firestore-simulado.mjs). Con una copia en JavaScript de las reglas de firestore-planillas.rules (v0.0.11)
let fs = {}; let deny = false;
const json = (r, x) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(x)); };
const body = (q) => new Promise((ok) => { const b = []; q.on('data', (c) => b.push(c)); q.on('end', () => { const t = Buffer.concat(b).toString('utf8'); ok(t ? JSON.parse(t) : {}); }); });
const ts = (x) => { if (x && typeof x === 'object') { if (x.__ts === 1 && Object.keys(x).length === 1) return Date.now(); for (const k of Object.keys(x)) x[k] = ts(x[k]); } return x; };
const cl = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
function applyUpdate(cur, patch) {
  const out = cl(cur);
  for (const [k, v] of Object.entries(patch)) {
    const ks = k.split('.'); let o = out;
    for (const p of ks.slice(0, -1)) { if (!o[p] || typeof o[p] !== 'object') o[p] = {}; o = o[p]; }
    const last = ks[ks.length - 1];
    if (v && v.__op === 'del') delete o[last];
    else if (v && v.__op === 'union') { const a = Array.isArray(o[last]) ? o[last] : []; v.v.forEach((x) => { if (!a.includes(x)) a.push(x); }); o[last] = a; }
    else if (v && v.__op === 'remove') o[last] = (Array.isArray(o[last]) ? o[last] : []).filter((x) => !v.v.includes(x));
    else o[last] = ts(v);
  }
  return out;
}
// ---- Reglas (copia de firestore-planillas.rules + lo de ANote que usa) ----
const role = (d, u) => (d.roles || {})[u] || 'view';
const canEdit = (d, A) => !!d && (d.owner === A.uid || ((d.memberIds || []).includes(A.uid) && role(d, A.uid) === 'edit'));
const changed = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
const sameArr = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function canRead(path, d, A) {
  if (!A) return false;
  const s = path.split('/');
  if (s[0] === 'control') return s[1] === A.uid;
  if (s[0] === 'sheets' && s.length === 2) return (d.memberIds || []).includes(A.uid);
  if (s[0] === 'sheets' && s[2] === 'parts') { const p = fs[`sheets/${s[1]}`]; return !!p && (p.memberIds || []).includes(A.uid); }
  if (s[0] === 'sheetInvites') return (A.verified && d.email === A.email) || d.from === A.uid;
  return false;
}
function canWrite(path, before, after, A, afterState) {
  if (!A) return false;
  const s = path.split('/');
  if (s[0] === 'sheets' && s.length === 2) {
    if (!before) return after.owner === A.uid && sameArr(after.memberIds, [A.uid]) && Number.isInteger(after.ver);
    if (!after) return before.owner === A.uid;
    if (!Number.isInteger(after.ver)) return false;
    const ch = changed(after, before);
    const onlyMem = ch.every((k) => ['memberIds', 'roles', 'members'].includes(k));
    if (before.owner === A.uid) return after.owner === before.owner && (after.memberIds || []).includes(A.uid);
    if (canEdit(before, A) && !ch.some((k) => ['owner', 'memberIds', 'roles', 'members'].includes(k))) return true;
    if ((before.memberIds || []).includes(A.uid) && onlyMem && sameArr(after.memberIds, before.memberIds.filter((x) => x !== A.uid))) return true;
    const inv = fs[`sheetInvites/${s[1]}_${A.email}`];
    if (A.verified && !(before.memberIds || []).includes(A.uid) && inv && onlyMem
      && sameArr(after.memberIds, [...before.memberIds, A.uid])
      && changed(after.roles || {}, before.roles || {}).every((k) => k === A.uid) && (after.roles || {})[A.uid] === inv.role
      && changed(after.members || {}, before.members || {}).every((k) => k === A.uid)) return true;
    return false;
  }
  if (s[0] === 'sheets' && s[2] === 'parts') {
    const pb = fs[`sheets/${s[1]}`]; const pa = afterState[`sheets/${s[1]}`];
    return (!!pb && canEdit(pb, A)) || (!!pa && pa.owner === A.uid);
  }
  if (s[0] === 'sheetInvites') {
    if (!after) return (A.verified && before.email === A.email) || before.from === A.uid;
    const sh = fs[`sheets/${after.sheetId}`];
    return after.from === A.uid && !!sh && sh.owner === A.uid && s[1] === `${after.sheetId}_${after.email}`
      && after.email === after.email.toLowerCase() && ['edit', 'view'].includes(after.role);
  }
  return false;
}
const matches = (d, w) => w.every((c) => (c.op === 'array-contains' ? Array.isArray(d[c.field]) && d[c.field].includes(c.value) : d[c.field] === c.value));
async function fsApi(q, r, u) {
  const a = u.pathname.slice(6); const g = (k) => u.searchParams.get(k);
  let A = null; try { A = JSON.parse(q.headers['x-auth'] || 'null'); } catch { A = null; }
  if (a === 'reset') { fs = {}; deny = false; return json(r, { ok: 1 }); }
  if (a === 'deny') { deny = !!(await body(q)).on; return json(r, { ok: 1 }); }
  if (a === 'dump') return json(r, fs);
  if (a === 'put') { const b = await body(q); fs[b.path] = b.data; return json(r, { ok: 1 }); } // desde la prueba (como la consola)
  if (deny) return json(r, { error: 'permission-denied' });
  if (a === 'doc') {
    const p = g('path'); const d = fs[p] ?? null;
    if (d && !canRead(p, d, A)) return json(r, { error: 'permission-denied' });
    if (!d && p.startsWith('sheets/') && p.split('/').length === 2 && !A) return json(r, { error: 'permission-denied' });
    return json(r, { data: d });
  }
  if (a === 'col') {
    const base = g('path'); const n = base.split('/').length + 1; const w = JSON.parse(g('where') || '[]');
    const rows = Object.keys(fs).filter((p) => p.startsWith(`${base}/`) && p.split('/').length === n)
      .filter((p) => matches(fs[p], w)).sort().map((p) => ({ path: p, data: fs[p] }));
    if (rows.some((x) => !canRead(x.path, x.data, A))) return json(r, { error: 'permission-denied' });
    return json(r, { rows });
  }
  if (a === 'commit') {
    const { writes, checks } = await body(q);
    for (const c of checks) if (JSON.stringify(fs[c.path] ?? null) !== c.json) return json(r, { error: 'aborted' });
    const next = { ...fs };
    for (const w of writes) {
      if (w.op === 'set') next[w.path] = ts(w.data);
      else if (w.op === 'update') { if (!next[w.path]) return json(r, { error: 'not-found' }); next[w.path] = applyUpdate(next[w.path], w.data); } else delete next[w.path];
    }
    for (const w of writes) if (!canWrite(w.path, fs[w.path] ?? null, next[w.path] ?? null, A, next)) return json(r, { error: 'permission-denied' });
    fs = next;
    return json(r, { ok: 1 });
  }
  return json(r, { error: 'not-found' });
}
http.createServer(async (q, r) => {
  const u0 = new URL(q.url, 'http://x');
  if (u0.pathname.startsWith('/__fs/')) return fsApi(q, r, u0);
  const p = join('/tmp/app-prueba', decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { const b = await readFile(p); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); }
}).listen(8765);
JS
nohup node /tmp/app-prueba-servidor.mjs > /tmp/app-prueba-servidor.log 2>&1 &
sleep 1; curl -s -o /dev/null -w "servidor %{http_code}\n" http://localhost:8765/
