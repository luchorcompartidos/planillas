// Prueba en Chrome (celular de 360 px) de la Etapa 2b-1 (v0.0.10): planillas propias en la nube, con dos
// "dispositivos" (dos contextos de Chrome: A y B) que comparten la nube simulada del servidor de prueba
// (pruebas/app/firestore-simulado.mjs + /__fs de armar.sh). Puntos: subir las planillas locales la primera vez
// (con pregunta), Mis planillas con "En tu cuenta" / "Solo en este dispositivo", ver en B lo de A, un cambio en B
// llega a A con la planilla abierta, sin conexión los cambios esperan, cambio en los dos lados → copia
// «(cambios de este dispositivo)», borrar en un lado borra en el otro, "Subir a mi cuenta" de una local, reglas
// que rechazan (aviso), cerrar sesión (se quitan las de la cuenta; aviso si hay cambios sin subir) y volver a entrar
// (vuelven, sin preguntar de nuevo).
// Antes: bash pruebas/app/armar.sh. Capturas en /tmp/app-capturas (nube-*.png).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const puppeteer = createRequire('/opt/npm-tools/')('puppeteer');
const SHOTS = '/tmp/app-capturas'; mkdirSync(SHOTS, { recursive: true });
const URL0 = 'http://localhost:8765/';
const MAIL = 'lucho@example.com'; const PASS = 'clave12345abc';
const CUENTAS = { [MAIL]: { uid: 'u1', pass: PASS, verified: true, name: 'Lucho' } };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let mal = 0;
const check = (name, ok, extra = '') => { if (!ok) mal++; console.log(`${ok ? 'OK ' : 'MAL'} ${name}${extra ? ` → ${extra}` : ''}`); };
const fsApi = (p, body) => fetch(`${URL0}__fs/${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}).then((r) => r.json());
const sheetsInCloud = async () => { const d = await fsApi('dump'); return Object.keys(d).filter((k) => /^sheets\/[^/]+$/.test(k)).map((k) => ({ id: k.split('/')[1], ...d[k] })); };
const cloudContent = async (id) => { const d = await fsApi('dump'); return JSON.parse(Object.keys(d).filter((k) => k.startsWith(`sheets/${id}/parts/`)).sort().map((k) => d[k].d).join('')); };

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errs = [];
async function device(name, { session }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulate({ viewport: { width: 360, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0 Mobile Safari/537.36' });
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (r.url().includes('api.github.com')) r.abort(); else r.continue(); });
  page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await page.evaluate((c, s, m) => { localStorage.clear(); localStorage.setItem('fb-sim-cuentas', JSON.stringify(c)); if (s) { localStorage.setItem('fb-sim-sesion', JSON.stringify(m)); localStorage.setItem('planillas-cuenta', m); } }, CUENTAS, session, MAIL);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.vb.on'); await wait(600);
  const d = {
    page,
    shot: (n) => page.screenshot({ path: `${SHOTS}/nube-${name}-${n}.png` }),
    tap: async (sel) => { await page.waitForSelector(sel, { visible: true }); await page.tap(sel); await wait(250); },
    txt: (sel) => page.$eval(sel, (x) => x.textContent.trim()).catch(() => ''),
    snack: () => page.$eval('#snackbar', (x) => (x.classList.contains('show') ? x.textContent : '')),
    dialogOpen: () => page.$eval('#dialog', (x) => !x.hidden),
    title: () => page.$eval('#dialog-title', (x) => x.textContent.trim()).catch(() => ''),
    files: () => page.evaluate(() => new Promise((ok) => { const r = indexedDB.open('planillas', 1); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').getAll(); q.onsuccess = () => ok(q.result); }; })),
    meta: () => page.evaluate(() => JSON.parse(localStorage.getItem('planillas-nube-u1') || 'null')),
    open: () => page.$eval('#file-title', (x) => x.textContent.trim()),
  };
  d.grid = async () => { if (!(await page.$eval('.vb[data-v="tabla"]', (x) => x.classList.contains('on')))) await d.tap('.vb[data-v="tabla"]'); };
  d.setCell = async (r, text) => {
    await d.grid();
    await page.$eval('#name-box', (x) => { x.value = ''; });
    await d.tap('#name-box'); await page.keyboard.type(r); await page.keyboard.press('Enter'); await wait(150);
    await d.tap('#formula');
    await page.$eval('#formula', (x) => { x.value = ''; });
    await page.keyboard.type(text); await page.keyboard.press('Enter'); await wait(500);
  };
  d.dialogBtn = async (label) => {
    const ok = await page.$$eval('#dialog-actions button, #dialog-body button', (bs, l) => { const b = bs.find((x) => x.textContent.trim() === l); if (b) b.click(); return !!b; }, label);
    await wait(300); return ok;
  };
  d.login = async () => {
    await d.tap('#btn-cuenta');
    await page.waitForSelector('#cta-mail', { visible: true });
    await page.$eval('#cta-mail', (x) => { x.value = ''; }); await d.tap('#cta-mail'); await page.keyboard.type(MAIL);
    await d.tap('#cta-pass'); await page.keyboard.type(PASS);
    await d.tap('#cta-go'); await wait(500);
  };
  d.waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(250); } return false; };
  d.filesOpen = async () => { await d.tap('#btn-files'); await wait(300); };
  d.filesClose = async () => { await d.tap('#files-close'); };
  d.fileItems = () => page.$$eval('#file-list li', (ls) => ls.map((l) => (l.classList.contains('file-sec') ? `## ${l.textContent.trim()}` : l.textContent.replace(/\s+/g, ' ').trim())));
  d.fileMenu = async (id, label) => {
    await page.$eval(`#file-list .file-item[data-id="${id}"] .file-more`, (b) => b.click());
    await wait(300);
    return page.$$eval('#menu-items button', (bs, l) => { const b = bs.find((x) => x.textContent.trim() === l); if (b) b.click(); return bs.map((x) => x.textContent.trim()); }, label);
  };
  d.openByName = async (name) => { await page.$$eval('#file-list .file-item', (ls, n) => { ls.find((x) => x.querySelector('b').textContent === n).querySelector('.file-open').click(); }, name); await wait(400); };
  return d;
}

await fsApi('reset', {});

// ---------- 1. A: planilla local, después inicia sesión → pregunta si subir ----------
const A = await device('A', { session: false });
await A.setCell('A1', 'Producto'); await A.setCell('B1', 'Precio'); await A.setCell('A2', 'Yerba'); await A.setCell('B2', '1500');
await wait(500);
const idA = (await A.files())[0].id;
await A.filesOpen();
check('A sin sesión: la nota invita a iniciar sesión', (await A.txt('#files-note')).includes('Iniciá sesión'));
check('A sin sesión: sin secciones', !(await A.fileItems()).some((x) => x.startsWith('##')));
await A.filesClose();
await A.login();
check('A: aparece «Subir a tu cuenta» después de cerrar «Iniciar sesión»', await A.waitFor(async () => (await A.title()) === 'Subir a tu cuenta'), await A.title());
check('A: la pregunta dice 1 planilla', (await A.txt('#dialog-body')).includes('Tenés 1 planilla guardada solo en este dispositivo'));
await A.shot('1-pregunta');
await A.dialogBtn('Subirla');
check('A: la planilla sube a la nube', await A.waitFor(async () => (await sheetsInCloud()).some((s) => s.id === idA && s.ver === 1)));
const s1 = (await sheetsInCloud()).find((s) => s.id === idA);
check('nube: dueño y miembros', s1.owner === 'u1' && JSON.stringify(s1.memberIds) === '["u1"]' && s1.parts === 1, JSON.stringify({ owner: s1.owner, m: s1.memberIds, p: s1.parts }));
check('nube: contenido en parts/0', (await cloudContent(idA)).cells.B2 === '1500');
check('A: ya no tiene cambios sin subir', await A.waitFor(async () => (await A.meta())[idA]?.d === false));
await A.filesOpen();
const itemsA = await A.fileItems();
check('A: Mis planillas → "En tu cuenta" con la planilla "en la nube"', itemsA[0] === '## En tu cuenta' && itemsA[1].includes('en la nube'), JSON.stringify(itemsA));
check('A: la nota dice "Todo al día"', (await A.txt('#files-note')).includes('Todo al día en la nube'), await A.txt('#files-note'));
await A.shot('2-mis-planillas');
await A.filesClose();

// ---------- 2. B: misma cuenta, otro dispositivo ----------
const B = await device('B', { session: true });
check('B: no pregunta (su única local está vacía)', await B.waitFor(async () => !!(await B.meta()), 5000) && !(await B.dialogOpen()));
check('B: baja la planilla de A', await B.waitFor(async () => (await B.files()).some((f) => f.id === idA && f.cells.B2 === '1500')));
await B.filesOpen();
const itemsB = await B.fileItems();
check('B: "En tu cuenta" + "Solo en este dispositivo" (Planilla 1 vacía)', itemsB[0] === '## En tu cuenta' && itemsB.includes('## Solo en este dispositivo'), JSON.stringify(itemsB));
await B.shot('3-mis-planillas');
const nameA = (await A.files()).find((f) => f.id === idA).name;
check('B: la planilla de A se llama igual', (await B.files()).find((f) => f.id === idA).name === nameA, nameA);
await B.filesClose();

// ---------- 3. Cambio en B → llega a A (abierta) ----------
// Las dos se llaman "Planilla 1": se abre por id
await B.page.evaluate((id) => localStorage.setItem('planillas-ultimo', id), idA);
await B.page.reload({ waitUntil: 'networkidle0' }); await wait(1200);
await B.setCell('B2', '1800');
check('B: sube el cambio (ver 2)', await B.waitFor(async () => (await sheetsInCloud()).find((s) => s.id === idA).ver === 2, 10000));
check('A: recibe el cambio con la planilla abierta', await A.waitFor(async () => (await A.files()).find((f) => f.id === idA).cells.B2 === '1800', 8000));
check('A: aviso de cambios de otro dispositivo', await A.waitFor(async () => (await A.snack()).includes('se actualizó con cambios de otro dispositivo'), 3000), await A.snack());
check('A: la barra de fórmula muestra lo nuevo al elegir B2', await (async () => { await A.page.$eval('#name-box', (x) => { x.value = ''; }); await A.tap('#name-box'); await A.page.keyboard.type('B2'); await A.page.keyboard.press('Enter'); await wait(200); return (await A.page.$eval('#formula', (x) => x.value)) === '1800'; })());
await A.setCell('C1', 'Stock');
check('A: su cambio sube sobre el de B (ver 3, B2 sigue 1800)', await A.waitFor(async () => { const s = (await sheetsInCloud()).find((x) => x.id === idA); return s.ver === 3 && (await cloudContent(idA)).cells.B2 === '1800' && (await cloudContent(idA)).cells.C1 === 'Stock'; }, 10000));
check('B: recibe C1', await B.waitFor(async () => (await B.files()).find((f) => f.id === idA).cells.C1 === 'Stock', 8000));

// ---------- 4. Sin conexión en A, cambios en los dos lados → copia ----------
await A.page.evaluate(() => { window.__fssim.offline = true; });
await A.setCell('A3', 'Mate (A sin conexión)');
await wait(3500);
check('A sin conexión: queda "sin subir"', (await A.meta())[idA].d === true);
await A.filesOpen();
check('A sin conexión: la nota lo dice', (await A.txt('#files-note')).length > 0 && (await A.fileItems()).some((x) => x.includes('sin subir')), JSON.stringify(await A.fileItems()));
await A.shot('4-sin-conexion');
await A.filesClose();
await B.setCell('A4', 'Bombilla (B)');
check('B: sube (ver 4)', await B.waitFor(async () => (await sheetsInCloud()).find((s) => s.id === idA).ver === 4, 10000));
await A.page.evaluate(() => { window.__fssim.offline = false; window.dispatchEvent(new Event('online')); });
check('A: al volver la conexión queda la de la nube (con A4 de B)', await A.waitFor(async () => (await A.files()).find((f) => f.id === idA).cells.A4 === 'Bombilla (B)', 10000));
const copia = await A.waitFor(async () => (await A.files()).some((f) => f.name.endsWith('(cambios de este dispositivo)')), 5000);
check('A: lo suyo quedó en una copia «(cambios de este dispositivo)»', copia);
const cp = (await A.files()).find((f) => f.name.endsWith('(cambios de este dispositivo)'));
check('A: la copia tiene A3 y no A4', cp && cp.cells.A3 === 'Mate (A sin conexión)' && !cp.cells.A4);
check('la copia también sube a la nube', await A.waitFor(async () => (await sheetsInCloud()).some((s) => s.id === cp.id), 10000));
check('B: recibe la copia', await B.waitFor(async () => (await B.files()).some((f) => f.id === cp.id), 8000));

// ---------- 5. Borrar en B → se borra en A ----------
await B.filesOpen();
await B.fileMenu(cp.id, 'Borrar'); await wait(300);
check('B: el aviso de borrar dice "de tu cuenta y de todos tus dispositivos"', (await B.txt('#dialog-body')).includes('de tu cuenta y de todos tus dispositivos'));
await B.dialogBtn('Borrar');
check('nube: la copia se borró (con sus partes)', await B.waitFor(async () => { const d = await fsApi('dump'); return !Object.keys(d).some((k) => k.startsWith(`sheets/${cp.id}`)); }, 8000));
check('A: la copia se borró', await A.waitFor(async () => !(await A.files()).some((f) => f.id === cp.id), 8000));

check('nube: una sola copia (sin copias de más) y la principal en ver 4', (await sheetsInCloud()).length === 1 && (await sheetsInCloud())[0].ver === 4, JSON.stringify((await sheetsInCloud()).map((x) => [x.name, x.ver])));
// ---------- 6. B: «Subir a mi cuenta» de la local vacía ----------
const localB = (await B.files()).find((f) => f.id !== idA && !(f.name || '').includes('cambios'));
await B.filesClose(); await B.filesOpen();
const menuB = await B.fileMenu(localB.id, 'Subir a mi cuenta');
check('B: la local tiene «Subir a mi cuenta»', menuB.includes('Subir a mi cuenta'), JSON.stringify(menuB));
check('B: la local sube', await B.waitFor(async () => (await sheetsInCloud()).some((s) => s.id === localB.id), 8000));
check('A: recibe la de B', await A.waitFor(async () => (await A.files()).some((f) => f.id === localB.id), 8000));
await B.filesClose();

// ---------- 7. Reglas que rechazan ----------
await fsApi('deny', { on: true });
await A.setCell('D1', 'Rechazado');
check('A: aviso de reglas', await A.waitFor(async () => (await A.snack()).includes('reglas de Planillas'), 8000), await A.snack());
await A.shot('5-reglas');
await fsApi('deny', { on: false });
// La escucha cortada por las reglas se reintenta sola al minuto; con 'online' (volvió la conexión) enseguida
for (const d of [A, B]) await d.page.evaluate(() => window.dispatchEvent(new Event('online')));

// ---------- 8. Cerrar sesión con cambios sin subir (A sin conexión) ----------
await A.page.evaluate(() => { window.__fssim.offline = true; });
await A.setCell('D2', 'Pendiente');
await A.tap('#btn-cuenta');
await A.page.$$eval('#cta-form button', (bs) => { const b = bs.find((x) => /Cerrar sesión/.test(x.textContent)); if (b) b.click(); });
await wait(500);
check('A: aviso de cambios sin subir al cerrar sesión', (await A.txt('#dialog-body')).includes('todavía no se subieron'), (await A.txt('#dialog-body')).slice(0, 160));
await A.shot('6-cerrar-pendiente');
await A.page.evaluate(() => { window.__fssim.offline = false; });
await A.page.$eval('#cta-go', (b) => b.click());
check('A: sesión cerrada', await A.waitFor(async () => (await A.snack()).includes('Sesión cerrada'), 15000), await A.snack());
const filesAfter = await A.files();
check('A: se quitaron las planillas de la cuenta del dispositivo', !filesAfter.some((f) => f.id === idA || f.id === localB.id), JSON.stringify(filesAfter.map((f) => f.name)));
check('A: queda una planilla abierta (nueva, local)', filesAfter.length === 1 && (await A.open()).length > 0);
check('A: lo pendiente llegó a subirse al cerrar (D2)', (await cloudContent(idA)).cells.D2 === 'Pendiente');
check('A: sin meta de la cuenta', (await A.meta()) === null);

// ---------- 9. Volver a entrar: vuelven, sin preguntar ----------
await A.login();
check('A: vuelven las planillas de la cuenta', await A.waitFor(async () => (await A.files()).some((f) => f.id === idA && f.cells.D2 === 'Pendiente'), 10000));
await wait(1500);
check('A: no vuelve a preguntar', (await A.title()) !== 'Subir a tu cuenta' || !(await A.dialogOpen()), await A.title());
await A.filesOpen();
await A.shot('7-de-vuelta');
console.log('A:', JSON.stringify(await A.fileItems()));
check('nube: la principal tiene D1 y D2', (await cloudContent(idA)).cells.D1 === 'Rechazado' && (await cloudContent(idA)).cells.D2 === 'Pendiente', JSON.stringify((await cloudContent(idA)).cells));

// ---------- 6b. Planilla grande (en varias partes): importar en A → B la recibe entera → borrar ----------
{
  const { writeFileSync } = await import('node:fs');
  const filas = ['Código;Descripción larga con acentos'];
  for (let i = 1; i <= 12000; i++) filas.push(`${i};Artículo número ${i} — descripción bastante larga para ocupar lugar ñandú ${i % 7 ? '' : '🧉🧉'}`);
  writeFileSync('/tmp/grande-nube.csv', filas.join('\r\n'));
  if (!(await A.page.$eval('#files', (x) => x.hidden))) await A.filesClose();
  await A.filesOpen();
  const [chooser] = await Promise.all([A.page.waitForFileChooser(), A.page.tap('#files-import')]);
  await chooser.accept(['/tmp/grande-nube.csv']); await wait(2500);
  const g = await A.waitFor(async () => (await sheetsInCloud()).some((x) => x.name.startsWith('grande-nube') && x.parts > 1), 15000);
  const sg = (await sheetsInCloud()).find((x) => x.name.startsWith('grande-nube'));
  check('grande: la importada va a la cuenta, en varias partes', g, sg ? `${sg.parts} partes, ${sg.size} caracteres` : 'no está');
  const gB = sg && await B.waitFor(async () => { const f = (await B.files()).find((x) => x.id === sg.id); const fa = (await A.files()).find((x) => x.id === sg.id); return f && fa && Object.keys(f.cells).length === Object.keys(fa.cells).length && JSON.stringify(f.cells) === JSON.stringify(fa.cells) && f.cells.B9997.endsWith('ñandú 🧉🧉'); }, 15000);
  const fB = sg && (await B.files()).find((x) => x.id === sg.id);
  check('grande: B la recibe entera', gB, fB ? `${Object.keys(fB.cells).length} celdas, B9997=${fB.cells.B9997}` : 'no llegó');
  await B.filesOpen(); await B.fileMenu(sg.id, 'Borrar'); await wait(300); await B.dialogBtn('Borrar');
  check('grande: borrada con todas sus partes', await B.waitFor(async () => { const d = await fsApi('dump'); return !Object.keys(d).some((k) => k.startsWith(`sheets/${sg.id}`)); }, 10000));
  check('grande: A la quita', await A.waitFor(async () => !(await A.files()).some((x) => x.id === sg.id), 8000));
  await B.filesClose();
  if (!(await A.page.$eval('#files', (x) => x.hidden))) await A.filesClose();
}

console.log(errs.length ? `errores: ${JSON.stringify(errs)}` : 'errores de la página: ninguno');
console.log(mal ? `${mal} MAL` : 'todo OK');
await browser.close();
