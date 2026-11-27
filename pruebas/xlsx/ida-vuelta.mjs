// Exporta una planilla con formato a .xlsx y .csv, la vuelve a importar y compara.
import { writeFileSync, readFileSync } from 'node:fs';
import { toXlsx, toCsv, importAny, excelValue } from './transfer.js';
const OUT = process.env.OUT || '/tmp/xlsx-salida';
const file = {
  id: 'x', name: 'Prueba: formato/ñandú', created: Date.UTC(2026, 10, 27), updated: Date.UTC(2026, 10, 27),
  rows: 50, cols: 12,
  cells: { A1: 'Nombre', B1: 'Precio', C1: 'Fecha', D1: 'Hora', E1: '%', F1: 'Código', G1: 'Nota',
    A2: 'Café', B2: '3,5', C2: '27/11/2026', D2: '08:30', E2: '50%', F2: '00123', G2: 'línea 1\nlínea 2',
    A3: 'Té "verde"', B3: '1234.56', C3: '01/02/2026 14:05', E3: '12,5%', F3: '+5491112345678', G3: 'con; punto y coma',
    A4: 'VERDADERO', B4: '-0.001', C4: '31/02/2026', D4: '1e3' },
  styles: { A1: { b: 1, bg: '#1E7B4F', fc: '#FFFFFF', ha: 'center', bd: { b: { st: 'medium', c: '#000000' } } },
    B1: { b: 1, i: 1, u: 1 }, C1: { s: 1, fn: 'Arial', fs: 14 }, G2: { wr: 1, va: 'top' },
    B2: { nf: '"$" #,##0.00' }, H6: { bg: '#FFFF00', bd: { t: { st: 'thin', c: '#FF0000' }, r: { st: 'dashed', c: '#0000FF' }, l: { st: 'double', c: '#000000' } } } },
  colW: { 0: 20, 6: 30.5 }, rowH: { 1: 40 },
};
const x = await toXlsx(file);
const buf = Buffer.from(await x.arrayBuffer());
writeFileSync(`${OUT}/ida.xlsx`, buf);
writeFileSync(`${OUT}/ida-pc.csv`, Buffer.from(await toCsv(file, ';').arrayBuffer()));
writeFileSync(`${OUT}/ida-coma.csv`, Buffer.from(await toCsv(file, ',').arrayBuffer()));
const back = await importAny('ida.xlsx', buf);
const f2 = back.files[0];
let bad = 0;
const sorted = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sorted(o[k])])) : o);
const eq = (got, want, what) => { const A = JSON.stringify(sorted(want)); const B = JSON.stringify(sorted(got)); if (A !== B) { bad++; console.log('DIFERENTE', what, '\n  esperado', A, '\n  vuelto  ', B); } };
const expected = { ...file.cells, B2: '3.5', B4: '-0.001', D4: '1000', E3: '12.5%' }; // números quedan con punto
eq(f2.cells, expected, 'cells');
eq(f2.styles, { ...file.styles, C2: { nf: 'dd/mm/yyyy' }, D2: { nf: 'hh:mm' }, E2: { nf: '0%' }, C3: { nf: 'dd/mm/yyyy hh:mm' }, E3: { nf: '0.00%' } }, 'styles');
eq(f2.colW, file.colW, 'colW'); eq(f2.rowH, file.rowH, 'rowH');
console.log('avisos:', back.lost);
for (const sep of ['pc', 'coma']) {
  const c = await importAny(`ida-${sep}.csv`, readFileSync(`${OUT}/ida-${sep}.csv`));
  const exp = { ...file.cells }; if (sep === 'coma') { exp.B2 = '3.5'; exp.E3 = '12.5%'; } else { exp.B3 = '1234,56'; exp.B4 = '-0,001'; exp.E3 = '12,5%'; }
  eq(c.files[0].cells, exp, `csv ${sep} (sep detectado "${c.sep}")`);
}
console.log(excelValue('00123'), excelValue('31/02/2026'), excelValue('1e3'));
console.log(bad ? `${bad} diferencias` : 'IDA Y VUELTA OK');
// CSV viejo de Excel en Windows (windows-1252) y TSV
const latin = Buffer.from('Año;Café\r\n2026;"3,5"\r\n', 'latin1');
const l = await importAny('viejo.csv', latin);
console.log('windows-1252:', JSON.stringify(l.files[0].cells), l.sep);
const tsv = await importAny('datos.tsv', Buffer.from('a\tb, c\n1\t2\n'));
console.log('tsv:', JSON.stringify(tsv.files[0].cells));
