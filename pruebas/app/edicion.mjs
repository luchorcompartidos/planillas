// Prueba en Chrome (celular de 360 px con toques, y PC con teclado) de la Etapa 1e (v0.0.8): escribir en la celda
// misma, ancho de columnas y alto de filas (arrastrando, doble toque y desde el menú), elegir rangos (mantener
// apretado y arrastrar, encabezados, cuadro de nombre, Mayús + flechas), copiar / cortar / pegar (dentro de la app
// con formato, desde y hacia el portapapeles como texto con tabuladores, llenar un rango), borrar un rango con
// Deshacer y editar desde el Reporte manteniendo apretada una celda.
// Antes: bash pruebas/app/armar.sh. Capturas en /tmp/app-capturas (edic-*.png).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const puppeteer = createRequire('/opt/npm-tools/')('puppeteer');
const SHOTS = '/tmp/app-capturas'; mkdirSync(SHOTS, { recursive: true });
const URL0 = 'http://localhost:8765/';

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(URL0, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const page = await browser.newPage();
await page.emulate({ viewport: { width: 360, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0 Mobile Safari/537.36' });
await page.setRequestInterception(true);
page.on('request', (r) => (r.url().includes('api.github.com') ? r.abort() : r.continue()));
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const shot = (n) => page.screenshot({ path: `${SHOTS}/edic-${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let mal = 0;
const check = (name, ok, extra = '') => { if (!ok) mal++; console.log(`${ok ? 'OK ' : 'MAL'} ${name}${extra ? ` → ${extra}` : ''}`); };
const menuItem = (t) => page.evaluate((t) => [...document.querySelectorAll('#menu-items button')].find((x) => x.textContent.startsWith(t)).click(), t);
const center = (sel) => page.$eval(sel, (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
const td = (r, c) => `#grid td[data-r="${r}"][data-c="${c}"]`;
const tapCell = async (r, c) => { const p = await center(td(r, c)); await page.touchscreen.tap(p.x, p.y); await wait(120); };
const name = () => page.$eval('#name-box', (x) => x.value);
const cellTxt = (r, c) => page.$eval(td(r, c), (x) => x.textContent);
const tapBtn = async (id) => { await page.tap(id); await wait(250); };
const setName = async (v) => { await page.$eval('#name-box', (x, v) => { x.focus(); x.value = v; x.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, v); await wait(150); };

await page.goto(URL0, { waitUntil: 'networkidle0' });
await page.waitForSelector('.vb.on');
await page.tap('.vb[data-v="tabla"]'); await wait(300);

// 1. Escribir en la celda misma: primer toque elige, segundo toque abre el cuadro sobre la celda
await tapCell(1, 1);
await tapCell(0, 0);
check('primer toque: sin cuadro de edición', await page.$eval('#cell-ed', (x) => x.hidden));
await tapCell(0, 0);
const ed = await page.evaluate(() => {
  const e = document.getElementById('cell-ed'); const t = document.querySelector('#grid td[data-r="0"][data-c="0"]');
  const a = e.getBoundingClientRect(); const b = t.getBoundingClientRect();
  return { hidden: e.hidden, focus: document.activeElement === e, dx: Math.abs(a.left - b.left), dy: Math.abs(a.top - b.top) };
});
check('segundo toque: cuadro sobre A1 con el foco', !ed.hidden && ed.focus && ed.dx < 2 && ed.dy < 2, JSON.stringify(ed));
await page.keyboard.type('Producto');
check('barra de fórmula sincronizada', (await page.$eval('#formula', (x) => x.value)) === 'Producto');
check('la celda muestra lo que se escribe', (await cellTxt(0, 0)) === 'Producto');
await page.keyboard.press('Enter'); await wait(150);
check('Enter: guarda y sigue escribiendo en A2 (celular)', (await name()) === 'A2' && !(await page.$eval('#cell-ed', (x) => x.hidden)));
await page.keyboard.type('Yerba'); await page.keyboard.press('Enter'); await wait(100);
await page.keyboard.type('Café con leche y medialunas'); await page.keyboard.press('Enter'); await wait(100);
await page.keyboard.type('Té'); await wait(50);
await tapCell(0, 1); // tocar otra celda guarda
check('tocar otra celda guarda y cierra el cuadro', (await cellTxt(3, 0)) === 'Té' && await page.$eval('#cell-ed', (x) => x.hidden));
// Escribir desde la barra de fórmula (como antes) también anda
await page.tap('#formula'); await wait(100);
await page.keyboard.type('Importe'); await page.keyboard.press('Enter'); await wait(100);
check('barra de fórmula: sigue en la barra', (await cellTxt(0, 1)) === 'Importe' && (await page.evaluate(() => document.activeElement.id)) === 'formula');
for (const v of ['100', '250,5', '80']) { await page.keyboard.type(v); await page.keyboard.press('Enter'); await wait(80); }
await page.$eval('#formula', (x) => x.blur()); await wait(100);
check('valores cargados en B', (await cellTxt(1, 1)) === '100' && (await cellTxt(3, 1)) === '80');
await shot('1-escribir');

// 2. Ancho de columna arrastrando el borde del encabezado (con el dedo)
await page.tap('#grid thead th[data-c="0"]'); await wait(150);
check('tocar el encabezado elige la columna entera', (await name()) === 'A1:A50', await name());
const h0 = await center('#grid thead th[data-c="0"] .rz-c');
const w0 = await page.$eval('#grid thead th[data-c="0"]', (x) => x.offsetWidth);
await page.touchscreen.touchStart(h0.x, h0.y);
for (let i = 1; i <= 6; i++) { await page.touchscreen.touchMove(h0.x + i * 10, h0.y); await wait(30); }
await page.touchscreen.touchEnd(); await wait(300);
const w1 = await page.$eval('#grid thead th[data-c="0"]', (x) => x.offsetWidth);
const w1td = await page.$eval(td(5, 0), (x) => x.offsetWidth);
check('arrastrar el borde ensancha la columna A', w1 >= w0 + 50 && Math.abs(w1 - w1td) < 2, `${w0} → ${w1} (celda ${w1td})`);
check('aviso con Deshacer', (await page.$eval('#snack-text', (x) => x.textContent)).startsWith('Ancho de columna A') && !(await page.$eval('#snack-btn', (x) => x.hidden)));
await shot('2-ancho');
await page.evaluate(() => document.getElementById('snack-btn').click()); await wait(200);
check('Deshacer vuelve al ancho anterior', (await page.$eval('#grid thead th[data-c="0"]', (x) => x.offsetWidth)) === w0);
// Doble toque en el borde: ajustar al contenido ("Café con leche y medialunas")
const h1 = await center('#grid thead th[data-c="0"] .rz-c');
await page.touchscreen.tap(h1.x, h1.y); await wait(80); await page.touchscreen.tap(h1.x, h1.y); await wait(300);
const fit = await page.evaluate(() => { const t = document.querySelector('#grid td[data-r="2"][data-c="0"]'); return { w: t.offsetWidth, sw: t.scrollWidth, cw: t.clientWidth }; });
check('doble toque: ajusta el ancho al texto más largo', fit.w > w0 + 40 && fit.sw <= fit.cw + 1, JSON.stringify(fit));
// Alto de fila arrastrando el borde de abajo del número
const r0 = await center('#grid tbody th[data-r="1"] .rz-r');
const hh0 = await page.$eval('#grid tbody th[data-r="1"]', (x) => x.offsetHeight);
await page.touchscreen.touchStart(r0.x, r0.y);
for (let i = 1; i <= 4; i++) { await page.touchscreen.touchMove(r0.x, r0.y + i * 8); await wait(30); }
await page.touchscreen.touchEnd(); await wait(300);
const hh1 = await page.$eval(td(1, 3), (x) => x.offsetHeight);
check('arrastrar el borde de la fila 2 la agranda', hh1 >= hh0 + 25, `${hh0} → ${hh1}`);
// Desde el menú: Ancho de columna… (px exactos) y Alto normal
await setName('B1');
await page.tap('#btn-more'); await page.waitForSelector('#menu:not([hidden])'); await menuItem('Ancho de columna B');
await page.waitForSelector('#dialog-input'); await page.$eval('#dialog-input', (x) => { x.value = '150'; });
await page.evaluate(() => [...document.querySelectorAll('#dialog-actions button')].find((b) => b.textContent === 'Aplicar').click()); await wait(300);
check('menú: ancho de B = 150 px', (await page.$eval('#grid thead th[data-c="1"]', (x) => x.offsetWidth)) === 150);
await setName('A2');
await page.tap('#btn-more'); await page.waitForSelector('#menu:not([hidden])'); await menuItem('Alto normal'); await wait(300);
check('menú: alto normal de la fila 2', (await page.$eval(td(1, 3), (x) => x.offsetHeight)) === hh0);

// 3. Elegir un rango: mantener apretado un instante y arrastrar (con el dedo)
await tapCell(6, 2);
const a = await center(td(1, 0)); const b = await center(td(3, 1));
await page.touchscreen.touchStart(a.x, a.y); await wait(400);
for (let i = 1; i <= 5; i++) { await page.touchscreen.touchMove(a.x + ((b.x - a.x) * i) / 5, a.y + ((b.y - a.y) * i) / 5); await wait(40); }
await page.touchscreen.touchEnd(); await wait(250);
check('mantener y arrastrar elige A2:B4', (await name()) === 'A2:B4', await name());
check('6 celdas marcadas', (await page.$$eval('#grid td.rng', (x) => x.length)) === 6);
await shot('3-rango');
// Arrastrar sin esperar: desplaza (no elige)
await tapCell(8, 1);
const c0 = await center(td(8, 1));
await page.touchscreen.touchStart(c0.x, c0.y);
for (let i = 1; i <= 5; i++) { await page.touchscreen.touchMove(c0.x, c0.y - i * 20); await wait(16); }
await page.touchscreen.touchEnd(); await wait(250);
check("arrastrar enseguida no elige rango (desplaza)", (await name()) === "B9", await name());

// 4. Copiar y pegar dentro de la app (con formato), llenar un rango, cortar
await setName('A2:B4');
await tapBtn('#btn-copy');
check('Copiar: aviso', (await page.$eval('#snack-text', (x) => x.textContent)).startsWith('Copiado A2:B4 (6 celdas)'));
const tsv = await page.evaluate(() => navigator.clipboard.readText().catch((e) => `ERROR ${e.message}`));
check('al portapapeles va texto con tabuladores', tsv === 'Yerba\t100\r\nCafé con leche y medialunas\t250,5\r\nTé\t80', JSON.stringify(tsv));
await setName('D6');
await tapBtn('#btn-paste');
check('Pegar en D6: D6:E8 con los valores', (await cellTxt(5, 3)) === 'Yerba' && (await cellTxt(7, 4)) === '80' && (await name()) === 'D6:E8', await name());
await page.evaluate(() => document.getElementById('snack-btn').click()); await wait(200);
check('Deshacer el pegado', (await cellTxt(5, 3)) === '' && (await cellTxt(7, 4)) === '');
// Un valor sobre un rango lo llena
await setName('B2'); await tapBtn('#btn-copy');
await setName('G1:H3'); await tapBtn('#btn-paste');
const fill = [];
for (let r = 0; r < 3; r++) for (let c = 6; c < 8; c++) fill.push(await cellTxt(r, c));
check('un valor pegado sobre G1:H3 llena las 6', fill.every((x) => x === '100'), fill.join(','));
// Cortar G1:H3 y pegar en J1: el origen queda vacío
await setName('G1:H3'); await tapBtn('#btn-cut');
await setName('J1'); await tapBtn('#btn-paste');
check('Cortar y pegar: mueve (G1 vacía, J1:K3 con datos)', (await cellTxt(0, 6)) === '' && (await cellTxt(2, 10)) === '100');
// Desde otra app (Excel/Sheets): texto con tabuladores y comillas
await page.evaluate(() => navigator.clipboard.writeText('Nombre\tNota\r\n"Pérez, ""el Tano"""\t7\r\n"Línea 1\nLínea 2"\t9\r\n'));
await setName('A20'); await tapBtn('#btn-paste');
check('pegar de afuera: 3 filas × 2 columnas', (await cellTxt(19, 0)) === 'Nombre' && (await cellTxt(20, 0)) === 'Pérez, "el Tano"' && (await cellTxt(21, 0)) === 'Línea 1\nLínea 2' && (await cellTxt(21, 1)) === '9');
// Borrar un rango con Deshacer
await setName('A20:B22'); await tapBtn('#btn-clear');
check('Borrar el rango', (await cellTxt(19, 0)) === '' && (await cellTxt(21, 1)) === '');
await page.evaluate(() => document.getElementById('snack-btn').click()); await wait(200);
check('Deshacer el borrado', (await cellTxt(19, 0)) === 'Nombre');
await shot('4-pegar');

// 5. Menú de celda con el rango: Copiar/Cortar/Pegar del rango
await setName('A2:B3');
await page.$eval(td(1, 1), (x) => x.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
await page.waitForSelector('#menu:not([hidden])');
const mt = await page.evaluate(() => ({ t: document.getElementById('menu-title').textContent, items: [...document.querySelectorAll('#menu-items button')].map((x) => x.textContent) }));
check('menú dentro del rango: actúa sobre A2:B3', mt.t === 'Rango A2:B3' && mt.items.includes('Copiar A2:B3') && mt.items.includes('Ajustar ancho al contenido'), JSON.stringify(mt).slice(0, 200));
await page.evaluate(() => document.getElementById('scrim').click()); await wait(150);

// Se limpia lo de las pruebas de pegar (para que el Reporte tenga solo A1:B4)
for (const r of ['G1:K3', 'A20:B22', 'D6:E8']) { await setName(r); await tapBtn('#btn-clear'); }

// 6. Recargar: anchos guardados en la planilla
await wait(600);
await page.reload({ waitUntil: 'networkidle0' }); await wait(400);
check('tras recargar: B sigue en 150 px y A ajustada', (await page.$eval('#grid thead th[data-c="1"]', (x) => x.offsetWidth)) === 150
  && (await page.$eval('#grid thead th[data-c="0"]', (x) => x.offsetWidth)) === fit.w);

// 7. Reporte: mantener apretada una celda → cambiar el valor (con sugerencias), Deshacer, Ver ficha
await page.tap('.vb[data-v="reporte"]'); await wait(400);
const repCell = '#rep-table tbody tr[data-r="2"] td[data-c="1"]';
await page.$eval(repCell, (x) => x.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
await page.waitForSelector('#dialog-input');
const dlg = await page.evaluate(() => ({ t: document.getElementById('dialog-title').textContent, sub: document.querySelector('.dialog-sub').textContent, v: document.getElementById('dialog-input').value }));
check('Reporte: diálogo para cambiar Importe de la fila 3', dlg.t === 'Importe' && dlg.v === '250,5' && dlg.sub.includes('fila 3'), JSON.stringify(dlg));
await shot('5-reporte-editar');
await page.$eval('#dialog-input', (x) => { x.value = '300'; });
await page.evaluate(() => [...document.querySelectorAll('#dialog-actions button')].find((b) => b.textContent === 'Guardar').click()); await wait(250);
check('Reporte: valor cambiado en la tabla', (await page.$eval(repCell, (x) => x.textContent)) === '300');
check('Reporte: total actualizado', (await page.$eval('#rep-total', (x) => x.textContent)).includes('480'), await page.$eval('#rep-total', (x) => x.textContent));
await page.evaluate(() => document.getElementById('snack-btn').click()); await wait(250);
check('Reporte: Deshacer', (await page.$eval(repCell, (x) => x.textContent)) === '250,5');
await page.$eval(repCell, (x) => x.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
await page.waitForSelector('#dialog-input');
await page.evaluate(() => [...document.querySelectorAll('#dialog-actions button')].find((b) => b.textContent === 'Ver ficha').click()); await wait(300);
check('Reporte: "Ver ficha" abre el registro', (await page.$eval('.vb.on', (x) => x.dataset.v)) === 'ficha' && (await page.$eval('#f-pos', (x) => x.textContent)) === 'Registro 2 de 3');
// Tocar una fila sigue abriendo la Ficha
await page.tap('.vb[data-v="reporte"]'); await wait(300);
await page.tap('#rep-table tbody tr[data-r="1"] td'); await wait(300);
check('Reporte: tocar la fila sigue abriendo la Ficha', (await page.$eval('.vb.on', (x) => x.dataset.v)) === 'ficha');

// 8. PC con teclado: escribir directo, Mayús + flechas, Ctrl+C / Ctrl+V (eventos del navegador)
const pc = await browser.newPage();
await pc.setViewport({ width: 1100, height: 700 });
await pc.setRequestInterception(true);
pc.on('request', (r) => (r.url().includes('api.github.com') ? r.abort() : r.continue()));
pc.on('pageerror', (e) => errs.push(e.message));
await pc.goto(URL0, { waitUntil: 'networkidle0' }); await wait(300);
await pc.click('.vb[data-v="tabla"]'); await wait(300);
await pc.click('#grid td[data-r="0"][data-c="3"]'); await wait(100);
await pc.keyboard.type('x'); await wait(100);
check('PC: escribir con la celda elegida abre el cuadro en la celda', !(await pc.$eval('#cell-ed', (x) => x.hidden)) && (await pc.$eval('#cell-ed', (x) => x.value)) === 'x');
await pc.keyboard.press('Escape'); await wait(100);
await pc.click('#grid td[data-r="1"][data-c="0"]'); await wait(100);
await pc.keyboard.down('Shift'); await pc.keyboard.press('ArrowDown'); await pc.keyboard.press('ArrowRight'); await pc.keyboard.up('Shift'); await wait(100);
check('PC: Mayús + flechas elige A2:B3', (await pc.$eval('#name-box', (x) => x.value)) === 'A2:B3');
const copied = await pc.evaluate(() => {
  const dt = new DataTransfer();
  document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
  return dt.getData('text/plain');
});
check('PC: Ctrl+C (evento copy) pone el rango con tabuladores', copied === 'Yerba\t100\r\nCafé con leche y medialunas\t250,5', JSON.stringify(copied));
await pc.click('#grid td[data-r="9"][data-c="0"]'); await wait(100);
await pc.evaluate(() => {
  const dt = new DataTransfer(); dt.setData('text/plain', 'uno\tdos\r\ntres\tcuatro');
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await wait(200);
check('PC: Ctrl+V (evento paste) pega 2 × 2 en A10', (await pc.$eval('#grid td[data-r="9"][data-c="0"]', (x) => x.textContent)) === 'uno' && (await pc.$eval('#grid td[data-r="10"][data-c="1"]', (x) => x.textContent)) === 'cuatro');
// Mouse: apretar y arrastrar elige un rango
const m1 = await pc.$eval('#grid td[data-r="0"][data-c="0"]', (x) => { const b = x.getBoundingClientRect(); return { x: b.left + 10, y: b.top + 8 }; });
const m2 = await pc.$eval('#grid td[data-r="2"][data-c="2"]', (x) => { const b = x.getBoundingClientRect(); return { x: b.left + 10, y: b.top + 8 }; });
await pc.mouse.move(m1.x, m1.y); await pc.mouse.down(); await pc.mouse.move(m2.x, m2.y, { steps: 6 }); await pc.mouse.up(); await wait(150);
check('PC: arrastrar con el mouse elige A1:C3', (await pc.$eval('#name-box', (x) => x.value)) === 'A1:C3');
// Mouse en el borde de la columna D
const bd = await pc.$eval('#grid thead th[data-c="3"] .rz-c', (x) => { const b = x.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
const wd0 = await pc.$eval('#grid thead th[data-c="3"]', (x) => x.offsetWidth);
await pc.mouse.move(bd.x, bd.y); await pc.mouse.down(); await pc.mouse.move(bd.x - 40, bd.y, { steps: 5 }); await pc.mouse.up(); await wait(250);
check('PC: arrastrar el borde de D la achica', (await pc.$eval('#grid thead th[data-c="3"]', (x) => x.offsetWidth)) <= wd0 - 35);
await pc.screenshot({ path: `${SHOTS}/edic-6-pc.png` });

console.log('errores de la página:', errs.length ? errs : 'ninguno');
console.log(mal ? `${mal} MAL` : 'todo OK');
await browser.close();
