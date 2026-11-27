// Prueba en Chrome (celular con toques) de la vista Reporte (v0.0.5): importar un .csv (abre en Reporte),
// filas/columnas vacías del medio ocultas, total de la última columna numérica, tema oscuro → claro → sistema,
// tocar una fila → Ficha, volver (misma posición), Grilla en la fila tocada, vista recordada por planilla.
// Antes: bash pruebas/app/armar.sh. Capturas en /tmp/app-capturas (rep-*.png).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const puppeteer = createRequire('/opt/npm-tools/')('puppeteer');
const SHOTS = '/tmp/app-capturas'; mkdirSync(SHOTS, { recursive: true });
const N = 40; // filas, para que haya que deslizar
let csv = 'Producto;Categoría;;Cantidad;Importe;Código\r\n';
for (let i = 1; i <= N; i++) csv += `Producto con nombre largo ${i};${['Almacén', 'Limpieza', 'Bebidas'][i % 3]};;${i};${(i * 100.25).toFixed(2).replace('.', ',')};00${i}\r\n`;
csv += ';;;;;\r\n;;;;;\r\nÚltimo;Bebidas;;1;0,5;\r\n'; // dos filas vacías en el medio
writeFileSync('/tmp/rep.csv', csv);
const esperado = (Array.from({ length: N }, (_, i) => (i + 1) * 100.25).reduce((a, b) => a + b, 0) + 0.5).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 360, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0 Mobile Safari/537.36' });
await page.setRequestInterception(true);
page.on('request', (r) => (r.url().includes('api.github.com') ? r.abort() : r.continue()));
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${SHOTS}/rep-${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra = '') => console.log(`${ok ? 'OK ' : 'MAL'} ${name}${extra ? ` → ${extra}` : ''}`);
const vista = () => page.$eval('.vb.on', (b) => b.dataset.v);

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle0' });
await page.waitForSelector('#grid td');
check('planilla nueva abre en Grilla', await vista() === 'tabla');
await shot('0-grilla');
await page.tap('#btn-file-menu');
await page.waitForSelector('#menu:not([hidden])');
const [chooser] = await Promise.all([page.waitForFileChooser(), page.evaluate(() => [...document.querySelectorAll('#menu-items button')].find((x) => x.textContent.startsWith('Importar')).click())]);
await chooser.accept(['/tmp/rep.csv']);
await page.waitForSelector('#rep-table tbody tr', { timeout: 20000 });
await wait(300);
check('importada abre en Reporte', await vista() === 'reporte');
const info = await page.evaluate(() => ({
  heads: [...document.querySelectorAll('#rep-table thead th')].map((t) => t.textContent),
  rows: document.querySelectorAll('#rep-table tbody tr').length,
  total: document.getElementById('rep-total').textContent,
  claro: document.getElementById('reporte').classList.contains('claro'),
  numCols: [...document.querySelectorAll('#rep-table thead th.num')].map((t) => t.textContent),
  bg: getComputedStyle(document.querySelector('#rep-table tbody tr:nth-child(2) td')).backgroundColor,
}));
check('columna vacía del medio oculta', info.heads.join('|') === 'Producto|Categoría|Cantidad|Importe|Código', info.heads.join('|'));
check('filas vacías ocultas', info.rows === N + 1, String(info.rows));
check('Código (00..) no es numérica', info.numCols.join('|') === 'Cantidad|Importe', info.numCols.join('|'));
check('total de Importe', info.total.includes(`${N + 1} registrosTotal Importe: ${esperado}`), info.total);
check('oscuro por defecto y franja', !info.claro && info.bg === 'rgb(27, 34, 30)', info.bg);
await shot('1-oscuro');
// Deslizar a la derecha y abajo: encabezado y primera columna fijos
await page.evaluate(() => { const s = document.getElementById('rep-scroll'); s.scrollTop = 600; s.scrollLeft = 200; });
await wait(200);
const fijo = await page.evaluate(() => {
  const s = document.getElementById('rep-scroll').getBoundingClientRect();
  const th = document.querySelector('#rep-table thead th').getBoundingClientRect();
  const td = document.querySelector('#rep-table tbody tr:nth-child(20) td').getBoundingClientRect();
  return { thTop: Math.round(th.top - s.top), tdLeft: Math.round(td.left - s.left) };
});
check('encabezado y primera columna fijos', fijo.thTop === 0 && fijo.tdLeft === 0, JSON.stringify(fijo));
await shot('2-deslizado');
// Tema: oscuro → claro → sistema → oscuro
await page.tap('#rep-tema'); await wait(150);
check('pasa a claro', await page.$eval('#reporte', (r) => r.classList.contains('claro')));
await shot('3-claro');
await page.tap('#rep-tema'); await wait(150);
console.log('   sistema:', await page.$eval('#rep-tema', (b) => b.textContent));
await page.tap('#rep-tema'); await wait(150);
check('vuelve a oscuro', !(await page.$eval('#reporte', (r) => r.classList.contains('claro'))));
await page.tap('#rep-tema'); await wait(150); // queda en claro, para ver que se recuerda
// Tocar la fila 20 del reporte → Ficha de esa fila
const pos = await page.evaluate(() => document.getElementById('rep-scroll').scrollTop);
const r20 = await page.$eval('#rep-table tbody tr:nth-child(20)', (tr) => tr.dataset.r);
await page.evaluate(() => document.querySelector('#rep-table tbody tr:nth-child(20) td:nth-child(2)').scrollIntoView({ block: 'center' }));
const posTap = await page.evaluate(() => document.getElementById('rep-scroll').scrollTop);
await page.tap('#rep-table tbody tr:nth-child(20) td:nth-child(2)'); await wait(300);
check('tocar fila abre la Ficha', await vista() === 'ficha', await page.$eval('#f-pos', (e) => e.textContent));
check('Ficha en el registro tocado', (await page.$eval('#f-pos', (e) => e.textContent)).startsWith(`Registro ${r20} `));
await shot('4-ficha');
await page.tap('.vb[data-v="reporte"]'); await wait(200);
check('vuelve al reporte en la misma posición', await page.evaluate(() => document.getElementById('rep-scroll').scrollTop) === posTap, `${pos}/${posTap}`);
await page.tap('.vb[data-v="tabla"]'); await wait(200);
check('Grilla en la fila tocada', await page.$eval('#name-box', (e) => e.value) === `A${+r20 + 1}`, await page.$eval('#name-box', (e) => e.value));
await page.tap('.vb[data-v="reporte"]'); await wait(200);
// Recargar: la planilla importada sigue en Reporte y el tema claro se recuerda
await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('#rep-table tbody tr'); await wait(200);
check('al recargar sigue en Reporte con tema claro', await vista() === 'reporte' && await page.$eval('#reporte', (r) => r.classList.contains('claro')));
// La otra planilla (nueva) sigue en Grilla
await page.tap('#file-title'); await page.waitForSelector('#files:not([hidden])'); await wait(200);
await page.evaluate(() => [...document.querySelectorAll('.file-item')].find((li) => !li.classList.contains('current')).querySelector('.file-open').click());
await wait(300);
check('cada planilla recuerda su vista', await vista() === 'tabla');
await page.tap('.vb[data-v="reporte"]'); await wait(200);
check('reporte vacío con aviso', !(await page.$eval('#rep-empty', (e) => e.hidden)), await page.$eval('#rep-empty', (e) => e.textContent.slice(0, 40)));
await shot('5-vacio');
console.log('errores:', errs.length ? errs : 'ninguno');
await browser.close();
