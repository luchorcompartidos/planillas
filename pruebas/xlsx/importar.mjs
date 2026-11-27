// Importa .xlsx/.xls/.ods de /tmp/xlsx-salida (los arma dificil.py) y muestra celdas, estilos y avisos.
import { readFileSync } from 'node:fs';
import { importAny } from './transfer.js';
const OUT = process.env.OUT || '/tmp/xlsx-salida';
for (const f of ['dificil.xlsx', 'lo/dificil.xlsx', 'dificil.xls', 'dificil.ods']) {
  console.log(`\n=== ${f}`);
  try {
    const r = await importAny(f.split('/').pop(), readFileSync(`${OUT}/${f}`));
    for (const x of r.files) console.log(x.name, x.rows, 'x', x.cols, JSON.stringify(x.cells), '\n  estilos', JSON.stringify(x.styles), '\n  anchos', JSON.stringify(x.colW), 'altos', JSON.stringify(x.rowH));
    console.log('avisos:\n -', r.lost.join('\n - '));
  } catch (e) { console.log('ERROR:', e.constructor.name, e.message); }
}
