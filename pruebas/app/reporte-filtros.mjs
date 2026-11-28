// Prueba en Chrome (celular de 360 px con toques) de la Etapa 1d-1b del Reporte (v0.0.6): etiquetas de color
// automáticas, filtros rápidos (chips), buscador (sin acentos ni mayúsculas), ordenar tocando el título
// (▲ → ▼ → sin orden; vacías al final; texto con números en orden natural), total y cantidad según lo filtrado,
// "Ver todos" cuando no hay resultados, tocar una fila filtrada → Ficha, y estado nuevo al cambiar de planilla.
// Antes: bash pruebas/app/armar.sh. Capturas en /tmp/app-capturas (filt-*.png).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const puppeteer = createRequire('/opt/npm-tools/')('puppeteer');
const SHOTS = '/tmp/app-capturas'; mkdirSync(SHOTS, { recursive: true });
const N = 30;
const CAT = ['Limpieza', 'Almacén', 'Bebidas'];
const datos = [];
let csv = 'Producto;Categoría;Importe;Nota\r\n';
for (let i = 1; i <= N; i++) {
  const d = { p: `Producto ${i}`, c: CAT[i % 3], imp: i === 5 ? '' : (i * 10.5).toFixed(2).replace('.', ','), nota: i % 7 === 0 ? 'Revisar precio' : '' };
  datos.push(d);
  csv += `${d.p};${d.c};${d.imp};${d.nota}\r\n`;
}
writeFileSync('/tmp/filt.csv', csv);
const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const suma = (f) => fmt(datos.filter(f).reduce((a, d) => a + (d.imp ? Number(d.imp.replace(',', '.')) : 0), 0));

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 360, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0 Mobile Safari/537.36' });
await page.setRequestInterception(true);
page.on('request', (r) => (r.url().includes('api.github.com') ? r.abort() : r.continue()));
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const shot = (n) => page.screenshot({ path: `${SHOTS}/filt-${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let mal = 0;
const check = (name, ok, extra = '') => { if (!ok) mal++; console.log(`${ok ? 'OK ' : 'MAL'} ${name}${extra ? ` → ${extra}` : ''}`); };
const estado = () => page.evaluate(() => ({
  rows: [...document.querySelectorAll('#rep-table tbody tr')].map((tr) => tr.querySelector('td').textContent),
  total: document.getElementById('rep-total').textContent,
  chips: [...document.querySelectorAll('#rep-chips .chip')].map((b) => `${b.textContent}${b.classList.contains('on') ? '*' : ''}`),
  empty: document.getElementById('rep-empty').hidden ? '' : document.getElementById('rep-empty').textContent,
}));
const chip = (v) => page.evaluate((v) => [...document.querySelectorAll('#rep-chips .chip')].find((b) => b.dataset.v === v).click(), v);
const titulo = (t) => page.evaluate((t) => [...document.querySelectorAll('#rep-table thead th')].find((th) => th.textContent.startsWith(t)).click(), t);
const buscar = async (t) => { await page.$eval('#rep-q', (i) => { i.value = ''; }); if (t) await page.type('#rep-q', t); else await page.$eval('#rep-q', (i) => i.dispatchEvent(new Event('input'))); await wait(350); };

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle0' });
await page.waitForSelector('.vb.on');
await page.tap('#btn-file-menu');
await page.waitForSelector('#menu:not([hidden])');
const [chooser] = await Promise.all([page.waitForFileChooser(), page.evaluate(() => [...document.querySelectorAll('#menu-items button')].find((x) => x.textContent.startsWith('Importar')).click())]);
await chooser.accept(['/tmp/filt.csv']);
await page.waitForSelector('#rep-table tbody tr', { timeout: 20000 });
await wait(300);

// Etiquetas: Categoría (3 valores repetidos); Producto (todos distintos) y Nota (1 solo valor) no
let e = await estado();
const tags = await page.evaluate(() => {
  const th = [...document.querySelectorAll('#rep-table thead th')].map((t) => t.textContent);
  const conTag = [...document.querySelectorAll('#rep-table tbody tr:first-child td')].map((td) => !!td.querySelector('.tag'));
  const colorCelda = {}; document.querySelectorAll('#rep-table td .tag').forEach((t) => { colorCelda[t.textContent] = t.className; });
  const colorChip = {}; document.querySelectorAll('#rep-chips .chip.tag').forEach((b) => { colorChip[b.dataset.v] = b.className.replace(/ ?chip| ?on/g, '').trim(); });
  return { th, conTag, colorCelda, colorChip, fondo: getComputedStyle(document.querySelector('#rep-table td .tag')).backgroundColor };
});
check('etiquetas solo en Categoría', tags.conTag.join(',') === 'false,true,false,false', `${tags.th.join('|')} ${tags.conTag.join(',')}`);
check('3 colores distintos', new Set(Object.values(tags.colorCelda)).size === 3, JSON.stringify(tags.colorCelda));
check('chip y celda con el mismo color', CAT.every((c) => tags.colorCelda[c] === tags.colorChip[c]), JSON.stringify(tags.colorChip));
check('chips ordenados con cantidades', e.chips.join('|') === 'Todos 30*|Almacén 10|Bebidas 10|Limpieza 10', e.chips.join('|'));
check('total completo', e.total === `${N} registrosTotal Importe: ${suma(() => true)}`, e.total);
await shot('1-etiquetas');

// Filtro rápido
await chip('Bebidas'); await wait(200); e = await estado();
check('chip Bebidas filtra', e.rows.length === 10 && e.chips.includes('Bebidas 10*'), `${e.rows.length} ${e.chips.join('|')}`);
check('total y cantidad de lo filtrado', e.total === `10 de ${N} registrosTotal Importe: ${suma((d) => d.c === 'Bebidas')}`, e.total);
await shot('2-chip');
await chip('Bebidas'); await wait(200); e = await estado();
check('tocar el chip activo lo apaga', e.rows.length === N && e.chips[0] === 'Todos 30*');

// Buscador: sin acentos ni mayúsculas, en todas las columnas; los chips cuentan lo buscado
await buscar('ALMACEN'); e = await estado();
check('buscar "ALMACEN" encuentra Almacén', e.rows.length === 10 && e.chips.join('|') === 'Todos 10*|Almacén 10|Bebidas 0|Limpieza 0', e.chips.join('|'));
await buscar('revisar'); e = await estado();
check('busca también en otras columnas (Nota)', e.rows.length === datos.filter((d) => d.nota).length, String(e.rows.length));
await chip('Limpieza'); await wait(200);
await buscar('almacén'); e = await estado();
check('búsqueda + chip sin resultados: aviso', e.rows.length === 0 && e.empty.includes('Ningún registro') && e.total.startsWith(`0 de ${N}`), `${e.empty} / ${e.total}`);
await shot('3-sin-resultados');
await page.tap('#rep-limpiar'); await wait(300); e = await estado();
check('"Ver todos" limpia búsqueda y filtro', e.rows.length === N && await page.$eval('#rep-q', (i) => i.value) === '' && e.chips[0] === 'Todos 30*');

// Ordenar tocando el título
await titulo('Importe'); await wait(200); e = await estado();
check('Importe ▲ (vacía al final)', e.rows[0] === 'Producto 1' && e.rows[N - 1] === 'Producto 5', `${e.rows[0]} … ${e.rows[N - 1]}`);
const ind = await page.evaluate(() => [...document.querySelectorAll('#rep-table thead th')].map((t) => t.getAttribute('aria-sort')).join(','));
check('indicador en el título', ind === 'none,none,ascending,none', ind);
await titulo('Importe'); await wait(200); e = await estado();
check('Importe ▼ (vacía al final)', e.rows[0] === `Producto ${N}` && e.rows[N - 1] === 'Producto 5', `${e.rows[0]} … ${e.rows[N - 1]}`);
await shot('4-orden');
await titulo('Importe'); await wait(200); e = await estado();
check('tercer toque: orden de la planilla', e.rows[0] === 'Producto 1' && e.rows[4] === 'Producto 5');
await titulo('Producto'); await titulo('Producto'); await wait(200); e = await estado();
check('texto con números en orden natural (▼)', e.rows.slice(0, 3).join('|') === 'Producto 30|Producto 29|Producto 28', e.rows.slice(0, 3).join('|'));
await titulo('Categoría'); await wait(200); e = await estado();
check('orden por Categoría ▲', e.rows[0] === 'Producto 1' && e.rows[10] === 'Producto 2', `${e.rows[0]} / ${e.rows[10]}`);

// Filtro + orden + tocar una fila → Ficha de esa fila; al volver se mantiene
await chip('Limpieza'); await titulo('Importe'); await titulo('Importe'); await wait(200); e = await estado();
check('chip + orden ▼', e.rows[0] === 'Producto 30' && e.rows.length === 10, `${e.rows[0]} ${e.rows.length}`);
await page.tap('#rep-table tbody tr:nth-child(2) td:nth-child(3)'); await wait(300);
check('fila filtrada abre su Ficha', (await page.$eval('#f-pos', (x) => x.textContent)).startsWith('Registro 27 '), await page.$eval('#f-pos', (x) => x.textContent));
await page.tap('.vb[data-v="reporte"]'); await wait(200); e = await estado();
check('al volver sigue filtrado y ordenado', e.rows[0] === 'Producto 30' && e.chips.includes('Limpieza 10*'));

// Tema claro: la etiqueta cambia de color
const oscuro = tags.fondo;
await page.tap('#rep-tema'); await wait(150);
const claro = await page.evaluate(() => getComputedStyle(document.querySelector('#rep-table td .tag')).backgroundColor);
check('etiquetas con paleta clara', claro !== oscuro, `${oscuro} → ${claro}`);
await shot('5-claro');
await page.tap('#rep-tema'); await page.tap('#rep-tema'); await wait(150); // vuelve a oscuro

// Otra planilla: búsqueda y filtro empiezan de cero (el orden queda guardado en la planilla, v0.0.7); sin registros no hay buscador
await page.tap('#file-title'); await page.waitForSelector('#files:not([hidden])'); await wait(200);
await page.evaluate(() => [...document.querySelectorAll('.file-item')].find((li) => !li.classList.contains('current')).querySelector('.file-open').click());
await wait(300); await page.tap('.vb[data-v="reporte"]'); await wait(200);
check('planilla vacía: sin buscador', await page.$eval('#rep-herr', (x) => x.hidden));
await page.tap('#file-title'); await page.waitForSelector('#files:not([hidden])'); await wait(200);
await page.evaluate(() => [...document.querySelectorAll('.file-item')].find((li) => !li.classList.contains('current')).querySelector('.file-open').click());
await wait(300); e = await estado();
// Desde la v0.0.7 el orden se guarda en la planilla (vista.orden): búsqueda y filtro empiezan de cero, el orden sigue
check('al cambiar de planilla: filtro de cero y orden guardado', e.rows[0] === 'Producto 30' && e.chips[0] === 'Todos 30*', `${e.rows[0]} ${e.chips[0]}`);
console.log('errores de la página:', errs.length ? errs : 'ninguno');
console.log(mal ? `${mal} MAL` : 'todo OK');
await browser.close();
