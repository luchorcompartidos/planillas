#!/bin/bash
# Prueba de src/transfer.js (importar/exportar .xlsx y .csv) con la ExcelJS real, sin npm install.
# Uso (desde la raíz del repo): bash pruebas/xlsx/correr.sh pruebas/xlsx/ida-vuelta.mjs
# ExcelJS no tiene dist en su repo: se arma con esbuild desde lib/ (exceljs.browser.js sin core-js),
# con saxes, xmlchars, buffer, events y readable-stream 3 bajados de GitHub a /tmp/libs (una vez).
# Deja los archivos en /tmp/xlsx-salida para mirarlos con openpyxl o LibreOffice (soffice --headless).
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd)
PRUEBA=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
L=/tmp/libs; X=/tmp/xb; W=/tmp/xlsx-prueba; OUT=${OUT:-/tmp/xlsx-salida}
ESB=$(ls /opt/npm-tools/node_modules/@esbuild/linux-x64/bin/esbuild 2>/dev/null || command -v esbuild)
mkdir -p $L $X $OUT
if [ ! -f $X/exceljs.mjs ]; then
  [ -d $L/exceljs ] || git clone -q --depth 1 https://github.com/exceljs/exceljs $L/exceljs
  for r in lddubeau/saxes lddubeau/xmlchars feross/buffer beatgammit/base64-js feross/ieee754 browserify/events; do
    [ -d $L/$(basename $r) ] || git clone -q --depth 1 https://github.com/$r $L/$(basename $r)
  done
  [ -d $L/readable-stream3 ] || git clone -q --depth 1 --branch v3.6.2 https://github.com/nodejs/readable-stream $L/readable-stream3
  grep -v "core-js\|regenerator" $L/exceljs/lib/exceljs.browser.js > $L/exceljs/lib/excel-entry.js
  echo "import E from '$L/exceljs/lib/excel-entry.js'; export default E;" > $X/entry.js
  echo 'module.exports = {};' > $X/stub-empty.js
  echo "module.exports = { inspect: { custom: Symbol('inspect') }, debuglog: () => () => {}, deprecate: (f) => f, inherits: require('inherits') };" > $X/stub-util.js
  cat > $X/inject.js <<'JS'
import { Buffer as B } from 'buffer';
export const Buffer = B;
export const process = { nextTick: (f, ...a) => Promise.resolve().then(() => f(...a)), env: {}, version: 'v16.0.0', versions: {}, browser: true, platform: 'browser', cwd: () => '/' };
export const setImmediate = (f, ...a) => setTimeout(() => f(...a), 0);
export const global = globalThis;
JS
  RS=$L/readable-stream3/readable-browser.js
  NODE_PATH=/opt/npm-tools/node_modules "$ESB" $X/entry.js --bundle --platform=browser --format=esm --outfile=$X/exceljs.mjs --log-level=error \
    --alias:saxes=$L/saxes/src/saxes.ts --alias:xmlchars=$L/xmlchars/src --alias:buffer=$L/buffer/index.js \
    --alias:base64-js=$L/base64-js/index.js --alias:ieee754=$L/ieee754/index.js --alias:events=$L/events/events.js \
    --alias:stream=$RS --alias:readable-stream=$RS --alias:util=$X/stub-util.js --alias:fast-csv=$X/stub-empty.js \
    --alias:fs=$X/stub-empty.js --alias:crypto=$X/stub-empty.js --alias:path=$X/stub-empty.js --inject:$X/inject.js
fi
rm -rf $W && mkdir -p $W && cp "$PRUEBA" $W/ && cp $REPO/src/transfer.js $REPO/src/refs.js $W/
"$ESB" "$W/$(basename "$PRUEBA")" --bundle --platform=node --format=esm --outfile=$W/salida.mjs --log-level=error --alias:exceljs=$X/exceljs.mjs --alias:jszip=/opt/npm-tools/node_modules/jszip
cd $W && OUT=$OUT node salida.mjs
