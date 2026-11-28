// Prueba en Chrome (celular de 360 px con toques) de la Etapa 1d-2 del Reporte (v0.0.7): "Configurar vista"
// (tema, densidad, franjas, encabezado, acento, columnas visibles y su orden, primera columna fija, etiquetas y sus
// colores, buscador, columna de filtros, orden, agrupar con subtotales y plegables, columna y cálculo del total,
// barra de total, resumen arriba), Restablecer + Deshacer, ajustes guardados al recargar, índices de la vista al
// insertar/borrar columnas en la Grilla, pestañas en orden Reporte / Ficha / Grilla.
// Antes: bash pruebas/app/armar.sh. Capturas en /tmp/app-capturas (vista-*.png).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const puppeteer = createRequire('/opt/npm-tools/')('puppeteer');
const SHOTS = '/tmp/app-capturas'; mkdirSync(SHOTS, { recursive: true });
const CAT = ['Limpieza', 'Almacén', 'Bebidas'];
const datos = [];
let csv = 'Producto;Categoría;Importe;Estado\r\n';
for (let i = 1; i <= 30; i++) {
  const d = { p: `Producto ${i}`, c: CAT[i % 3], imp: i * 10, e: i % 4 === 0 ? 'Pendiente' : 'Pagado' };
  datos.push(d);
  csv += `${d.p};${d.c};${d.imp};${d.e}\r\n`;
}
writeFileSync('/tmp/vista.csv', csv);
const fmt = (n, d = 0) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 0) });
const sub = (c) => fmt(datos.filter((d) => d.c === c).reduce((a, d) => a + d.imp, 0));

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 360, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0 Mobile Safari/537.36' });
await page.setRequestInterception(true);
page.on('request', (r) => (r.url().includes('api.github.com') ? r.abort() : r.continue()));
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const shot = (n) => page.screenshot({ path: `${SHOTS}/vista-${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let mal = 0;
const check = (name, ok, extra = '') => { if (!ok) mal++; console.log(`${ok ? 'OK ' : 'MAL'} ${name}${extra ? ` → ${extra}` : ''}`); };
const estado = () => page.evaluate(() => ({
  th: [...document.querySelectorAll('#rep-table thead th')].map((t) => t.textContent.replace(/[▲▼]/g, '')),
  rows: [...document.querySelectorAll('#rep-table tbody tr:not(.grupo)')].map((tr) => tr.querySelector('td').textContent),
  grupos: [...document.querySelectorAll('#rep-table tr.grupo')].map((tr) => tr.textContent),
  total: document.getElementById('rep-total').textContent,
  cls: document.getElementById('reporte').className,
}));
const setSel = async (k, v) => { await page.$eval(`#cfg-body select[data-k="${k}"]`, (s, v) => { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, String(v)); await wait(120); };
const setChk = async (sel, on) => { await page.$eval(`#cfg-body ${sel}`, (i, on) => { i.checked = on; i.dispatchEvent(new Event('change', { bubbles: true })); }, on); await wait(120); };
const menuItem = (t) => page.evaluate((t) => [...document.querySelectorAll('#menu-items button')].find((x) => x.textContent.startsWith(t)).click(), t);

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle0' });
await page.waitForSelector('.vb.on');
check('pestañas Reporte, Ficha, Grilla; nueva en Reporte', (await page.$$eval('#viewbar .vb', (b) => b.map((x) => x.dataset.v).join())) === 'reporte,ficha,tabla'
  && (await page.$eval('.vb.on', (b) => b.dataset.v)) === 'reporte');
check('reporte vacío con botones a Ficha y Grilla', (await page.$$('#rep-empty [data-go]')).length === 2);
await page.tap('#btn-file-menu'); await page.waitForSelector('#menu:not([hidden])');
const [chooser] = await Promise.all([page.waitForFileChooser(), menuItem('Importar')]);
await chooser.accept(['/tmp/vista.csv']);
await page.waitForSelector('#rep-table tbody tr', { timeout: 20000 }); await wait(300);

// Abrir Configurar vista desde el ⋮
await page.tap('#btn-file-menu'); await page.waitForSelector('#menu:not([hidden])'); await menuItem('Configurar vista'); await wait(200);
check('panel Configurar vista abierto', !(await page.$eval('#config', (x) => x.hidden)));
await shot('1-panel');

// Agrupar por Categoría: grupos ordenados, subtotales, etiquetas neutras en la columna agrupada
await setSel('agruparCol', 1);
let e = await estado();
check('3 grupos ordenados', e.grupos.length === 3 && e.grupos[0].includes('Almacén') && e.grupos[2].includes('Limpieza'), e.grupos.join(' | '));
check('subtotal por grupo (suma de Importe)', e.grupos[0].includes(`Total: ${sub('Almacén')}`), e.grupos[0]);
check('etiqueta neutra en la columna agrupada', await page.$eval('#rep-table tbody tr:not(.grupo) td:nth-child(2) .tag', (t) => t.classList.contains('tn')));
check('total abajo con grupos', e.total.includes('30 registros · 3 grupos') && e.total.includes(`Total Importe: ${fmt(datos.reduce((a, d) => a + d.imp, 0))}`), e.total);
await page.tap('#cfg-ok'); await wait(150);
await shot('2-agrupado');
// Plegar un grupo tocándolo
await page.evaluate(() => document.querySelector('#rep-table tr.grupo').click()); await wait(150);
e = await estado();
check('grupo plegado (oculta sus 10 filas)', e.rows.length === 20 && e.grupos[0].startsWith('▸'), `${e.rows.length} ${e.grupos[0].slice(0, 12)}`);
await page.tap('#btn-file-menu'); await page.waitForSelector('#menu:not([hidden])'); await menuItem('Plegar todos'); await wait(150);
check('plegar todos', (await estado()).rows.length === 0);
await page.tap('#btn-file-menu'); await page.waitForSelector('#menu:not([hidden])'); await menuItem('Desplegar todos'); await wait(150);
check('desplegar todos', (await estado()).rows.length === 30);

// Panel: cálculo promedio, columna del total, resumen arriba, densidad, acento, encabezado, franjas
await page.tap('#rep-cfg'); await wait(200);
await setSel('calculo', 'promedio');
e = await estado();
check('cálculo Promedio', e.total.includes('Promedio Importe: 155'), e.total);
check('subtotal con Promedio', e.grupos[0].includes('Promedio: '), e.grupos[0]);
await setSel('calculo', 'max'); e = await estado();
check('cálculo Máximo', e.total.includes('Máximo Importe: 300'), e.total);
await setSel('calculo', 'cantidad'); await setSel('totalCol', 3); e = await estado();
check('Cantidad sobre una columna de texto (Estado)', e.total.includes('Cantidad Estado: 30'), e.total);
await setSel('calculo', 'suma'); e = await estado();
check('volver a Suma con columna de texto → total automático', e.total.includes('Total Importe'), e.total);
await setChk('input[data-k="resumen"]', true);
check('resumen arriba', (await page.$$eval('#rep-resumen .rc', (x) => x.map((c) => c.textContent))).join('|').startsWith('Registros30|Total Importe'));
await setSel('densidad', 'compacta');
await page.evaluate(() => document.querySelector('#cfg-body [data-acento="azul"]').click()); await wait(120);
await setChk('input[data-k="encabezado"]', false);
await setChk('input[data-k="franjas"]', false);
e = await estado();
check('clases: compacta, sin encabezado, acento azul', /compacta/.test(e.cls) && /sin-encab/.test(e.cls) && /ac-azul/.test(e.cls), e.cls);
check('sin franjas', (await page.$$('#rep-table tr.f')).length === 0);
const head = await page.$eval('#rep-table thead th', (t) => getComputedStyle(t).backgroundColor);
check('encabezado no destacado (fondo de barra)', head !== 'rgb(30, 123, 79)', head);
await shot('3-panel-cambios');

// Columnas: ocultar Estado, mover Importe arriba de Categoría, primera columna no fija
await setChk('input[data-colvis="3"]', false);
await page.evaluate(() => document.querySelector('#cfg-body [data-mv="2"][data-d="-1"]').click()); await wait(120);
await setChk('input[data-k="fijarPrimera"]', false);
e = await estado();
check('columnas: Estado oculta e Importe antes que Categoría', e.th.join('|') === 'Producto|Importe|Categoría', e.th.join('|'));
check('primera columna no fija', (await page.$$('#rep-table .fija')).length === 0);

// Etiquetas: elegir columnas (Categoría y Estado) y cambiar un color
await setSel('tagmode', 'elegir');
await setChk('input[data-k="tagcol-3"]', true);
await setChk('input[data-colvis="3"]', true);
await page.$eval('#cfg-body select[data-color="Bebidas"]', (s) => { s.value = '7'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(120);
check('color elegido en el panel (Rojo = t7)', await page.$eval('#cfg-body select[data-color="Bebidas"]', (s) => s.parentElement.querySelector('.tag').className) === 'tag t7');
check('grupo Bebidas con el color elegido', await page.evaluate(() => !!document.querySelector('#rep-table tr.grupo .tag.t7')));
check('Estado como etiquetas', await page.evaluate(() => [...document.querySelectorAll('#rep-table tbody tr:not(.grupo)')][0].querySelectorAll('.tag').length === 2));

// Filtros: chips por Estado; buscador apagado
await setSel('filtroCol', 3);
check('chips por Estado', (await page.$$eval('#rep-chips .chip', (b) => b.map((x) => x.dataset.v))).join('|') === '|Pagado|Pendiente');
await setChk('input[data-k="buscador"]', false);
check('buscador oculto', await page.$eval('#rep-q', (x) => x.hidden));
// Orden desde el panel
await setSel('ordenCol', 2); await setSel('ordenDir', -1);
e = await estado();
check('orden Importe ▼ dentro de cada grupo', e.rows[0] === 'Producto 28' && e.rows[1] === 'Producto 25', e.rows.slice(0, 2).join('|'));
// Sin agrupar
await setSel('agruparCol', '');
e = await estado();
check('sin agrupar: sin filas de grupo y orden global', e.grupos.length === 0 && e.rows[0] === 'Producto 30');
await setSel('agruparCol', 1);
await page.tap('#cfg-ok'); await wait(150);
await shot('4-configurado');

// Recargar: los ajustes siguen (están en la planilla)
await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('#rep-table tbody tr'); await wait(300);
e = await estado();
check('al recargar sigue todo', e.grupos.length === 3 && /compacta/.test(e.cls) && e.th.join('|') === 'Producto|Importe|Categoría|Estado' && e.rows[0] === 'Producto 28', `${e.th.join('|')} ${e.rows[0]}`);

// Grilla: insertar una columna antes de B → la vista sigue apuntando a las mismas columnas
await page.tap('.vb[data-v="tabla"]'); await wait(200);
await page.evaluate(() => document.querySelector('#grid td[data-r="0"][data-c="1"]').click()); await wait(100);
await page.tap('#btn-more'); await page.waitForSelector('#menu:not([hidden])'); await menuItem('Insertar columna a la izquierda'); await wait(200);
await page.$eval('#grid td[data-r="0"][data-c="1"]', (td) => td.click()); await wait(50);
await page.focus('#formula'); await page.type('#formula', 'Código'); await page.keyboard.press('Enter'); await wait(100);
await page.tap('.vb[data-v="reporte"]'); await wait(200);
e = await estado();
check('columna insertada: agrupado y orden siguen en las mismas columnas', e.grupos.length === 3 && e.grupos[0].includes('Almacén') && e.rows[0] === 'Producto 28', `${e.grupos[0]} ${e.rows[0]}`);
check('columna nueva visible en su lugar natural', e.th.join('|') === 'Producto|Código|Importe|Categoría|Estado', e.th.join('|'));
// Borrar la columna agrupada (Categoría, ahora C) → vuelve a sin agrupar
await page.tap('.vb[data-v="tabla"]'); await wait(200);
await page.$eval('#grid td[data-r="0"][data-c="2"]', (td) => td.click()); await wait(50);
await page.tap('#btn-more'); await page.waitForSelector('#menu:not([hidden])'); await menuItem('Borrar columna C'); await wait(200);
await page.tap('.vb[data-v="reporte"]'); await wait(200);
e = await estado();
check('columna agrupada borrada → sin grupos', e.grupos.length === 0, e.th.join('|'));
// Deshacer (desde el aviso, que dura 6 s) devuelve también la vista
await page.tap('.vb[data-v="tabla"]'); await wait(150);
await page.evaluate(() => document.getElementById('snack-btn').click()); await wait(200);
await page.tap('.vb[data-v="reporte"]'); await wait(200);
check('Deshacer devuelve columna y agrupado', (await estado()).grupos.length === 3);

// Restablecer y Deshacer
await page.tap('#rep-cfg'); await wait(200);
await page.tap('#cfg-reset'); await wait(200);
e = await estado();
check('Restablecer: vuelve a lo automático', e.grupos.length === 0 && !/compacta/.test(e.cls) && e.rows[0] === 'Producto 1', `${e.rows[0]} ${e.cls}`);
await page.evaluate(() => document.getElementById('snack-btn').click()); await wait(200);
check('Deshacer el restablecer', (await estado()).grupos.length === 3);
await page.tap('#cfg-ok');
// Tema desde el panel
await page.tap('#rep-cfg'); await wait(150); await setSel('tema', 'claro');
check('tema claro desde el panel', (await estado()).cls.includes('claro'));
await shot('5-claro');
await setSel('tema', 'oscuro'); await page.tap('#cfg-ok');
console.log('errores de la página:', errs.length ? errs : 'ninguno');
console.log(mal ? `${mal} MAL` : 'todo OK');
await browser.close();
