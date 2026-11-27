// Prueba en Chrome (celular con toques): importar .xlsx y .csv, ver el formato, insertar columna (el formato
// se mueve), exportar .xlsx y .csv (descargas en /tmp/app-descargas) y recargar. Capturas en /tmp/app-capturas.
// Antes: bash pruebas/app/armar.sh
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
const puppeteer = createRequire('/opt/npm-tools/')('puppeteer');
const IN = process.env.IN || '/tmp/xlsx-salida';
const DL = '/tmp/app-descargas'; const SHOTS = '/tmp/app-capturas';
rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true }); mkdirSync(SHOTS, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 390, height: 780, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 15; moto g84 5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
await page.setRequestInterception(true);
page.on('request', (r) => (r.url().includes('api.github.com') ? r.abort() : r.continue()));
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function menuItem(text) {
  await page.waitForSelector('#menu:not([hidden])');
  const ok = await page.evaluate((t) => { const b = [...document.querySelectorAll('#menu-items button')].find((x) => x.textContent.startsWith(t)); if (b) b.click(); return !!b; }, text);
  if (!ok) throw new Error(`No está en el menú: ${text}`);
}
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle0' });
await page.waitForSelector('#grid td');

// 1. Importar tres archivos desde el ⋮ del archivo abierto
await page.tap('#btn-file-menu');
const [chooser] = await Promise.all([page.waitForFileChooser(), menuItem('Importar')]);
await chooser.accept([`${IN}/ida.xlsx`, `${IN}/lo/dificil.xlsx`, `${IN}/ida-pc.csv`]);
await page.waitForSelector('#dialog:not([hidden])', { timeout: 20000 });
console.log('AVISO:', await page.$eval('#dialog', (d) => d.innerText.replace(/\n+/g, ' | ')));
await shot('1-aviso');
await page.evaluate(() => document.querySelector('#dialog-actions button').click());
console.log('abierta:', await page.$eval('#file-title', (e) => e.textContent));
await shot('2-ida');
const css = await page.evaluate(() => { const td = (r) => document.querySelector(`#grid td[data-r="${r[0]}"][data-c="${r[1]}"]`).getAttribute('style'); return { A1: td([0, 0]), G2: td([1, 6]), H6: td([5, 7]) }; });
console.log('estilos en la grilla:', JSON.stringify(css));

// 2. Insertar una columna a la izquierda de A (mantener apretado el encabezado A = contextmenu): el formato se mueve
await page.evaluate(() => document.querySelector('#grid thead th[data-c="0"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
await menuItem('Insertar columna a la izquierda');
await wait(200);
const moved = await page.evaluate(() => ({ B1: document.querySelector('#grid td[data-r="0"][data-c="1"]').getAttribute('style'), A1: document.querySelector('#grid td[data-r="0"][data-c="0"]').getAttribute('style'), Bw: document.querySelector('#grid thead th[data-c="1"]').getAttribute('style') }));
console.log('después de insertar:', JSON.stringify(moved));
await page.evaluate(() => document.getElementById('snack-btn').click()); // Deshacer
await wait(200);
console.log('deshecho A1:', await page.evaluate(() => document.querySelector('#grid td[data-r="0"][data-c="0"]').getAttribute('style')));

// 3. Exportar .xlsx y los dos .csv desde el ⋮
for (const t of ['Exportar a Excel', 'Exportar a CSV con ;', 'Exportar a CSV con ,']) {
  await page.tap('#btn-file-menu'); await menuItem(t); await wait(1500);
}
// 4. Exportar otra planilla desde Mis planillas (⋮ de la lista)
await page.tap('#file-title'); await page.waitForSelector('#files:not([hidden])'); await wait(300);
await shot('3-mis-planillas');
console.log('lista:', await page.$$eval('.file-item b', (b) => b.map((x) => x.textContent).join(' / ')));
await page.evaluate(() => [...document.querySelectorAll('.file-item')].find((li) => li.querySelector('b').textContent.endsWith('Ventas')).querySelector('.file-more').click());
await menuItem('Exportar a Excel'); await wait(1500);
// 5. Abrir la de Ventas y la Ficha
await page.evaluate(() => [...document.querySelectorAll('.file-item')].find((li) => li.querySelector('b').textContent.endsWith('Ventas')).querySelector('.file-open').click());
await wait(300); await shot('4-ventas');
// 6. Recargar: se mantiene el formato
await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('#grid td');
console.log('tras recargar:', await page.$eval('#file-title', (e) => e.textContent), await page.evaluate(() => document.querySelector('#grid td[data-r="0"][data-c="1"]').getAttribute('style')));
await wait(500);
console.log('descargas:', readdirSync(DL).join(', '));
console.log('errores:', errs.length ? errs : 'ninguno');
await browser.close();
// Captura del menú ⋮ (nueva sesión, para ver que los textos entran en 390 px)
{
  const b2 = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p2 = await b2.newPage();
  await p2.emulate({ viewport: { width: 360, height: 640, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1) Chrome/106.0 Mobile Safari/537.36' });
  await p2.setRequestInterception(true); p2.on('request', (r) => (r.url().includes('api.github.com') ? r.abort() : r.continue()));
  await p2.goto('http://localhost:8765/', { waitUntil: 'networkidle0' }); await p2.waitForSelector('#grid td');
  await p2.tap('#btn-file-menu'); await new Promise((r) => setTimeout(r, 300));
  await p2.screenshot({ path: `${SHOTS}/5-menu-360.png` });
  await b2.close();
}
