#!/bin/bash
# Arma la app para probarla en Chrome sin npm install (web, con @capacitor/* simulado) y la sirve en :8765.
# Uso (desde la raíz del repo): bash pruebas/app/armar.sh   → después: node pruebas/app/<prueba>.mjs
# Firebase (firebase/app y firebase/auth) también simulado: firebase-simulado.mjs (desde la v0.0.9).
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
  --alias:exceljs=/tmp/xb/exceljs.mjs --alias:jszip=/opt/npm-tools/node_modules/jszip/dist/jszip.min.js
sed -e 's#<script type="module" src="./src/main.js"></script>#<link rel="stylesheet" href="./assets/app.css"><script type="module" src="./assets/app.js"></script>#' \
    -e 's/__APP_VERSION__/0.0.4-prueba/g' $REPO/index.html > $D/index.html
ls -la $D/assets | head
pkill -f "app-prueba-servidor" 2>/dev/null || true
cat > /tmp/app-prueba-servidor.mjs <<'JS'
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join } from 'node:path';
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer(async (q, r) => {
  const p = join('/tmp/app-prueba', decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { const b = await readFile(p); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); }
}).listen(8765);
JS
nohup node /tmp/app-prueba-servidor.mjs > /tmp/app-prueba-servidor.log 2>&1 &
sleep 1; curl -s -o /dev/null -w "servidor %{http_code}\n" http://localhost:8765/
