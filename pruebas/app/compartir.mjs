// Prueba en Chrome (celular de 360 px) de la Etapa 2b-2a (v0.0.11): compartir planillas. Tres cuentas en tres
// "dispositivos" (contextos de Chrome): L = Lucho (dueño), A = Ana (verificada), B = Beto (sin verificar al principio).
// La nube simulada del servidor de armar.sh aplica una copia en JavaScript de firestore-planillas.rules.
// Puntos: invitar (editar / ver), invitaciones pendientes, banda y aceptar, «Compartidas conmigo», editar y que llegue
// al dueño, pasar a «Solo puede ver» (modo solo lectura; las reglas rechazan), pasar a ver con cambios sin subir →
// copia «(mis cambios)», correo sin verificar (no ve invitaciones; al verificar, sí), quitar a alguien, salir de una
// compartida, borrar una compartida (también sus invitaciones) y «cerrar sesión en todos los dispositivos» del
// administrador de ANote... (control/{uid}.revokedAt).
// Antes: bash pruebas/app/armar.sh. Capturas en /tmp/app-capturas (comp-*.png).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const puppeteer = createRequire('/opt/npm-tools/')('puppeteer');
const SHOTS = '/tmp/app-capturas'; mkdirSync(SHOTS, { recursive: true });
const URL0 = 'http://localhost:8765/';
const PASS = 'clave12345abc';
const L_MAIL = 'lucho@example.com'; const A_MAIL = 'ana@example.com'; const B_MAIL = 'beto@example.com';
const CUENTAS = {
  [L_MAIL]: { uid: 'u1', pass: PASS, verified: true, name: 'Lucho' },
  [A_MAIL]: { uid: 'u2', pass: PASS, verified: true, name: 'Ana' },
  [B_MAIL]: { uid: 'u3', pass: PASS, verified: false, name: 'Beto' },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let mal = 0;
const check = (name, ok, extra = '') => { if (!ok) mal++; console.log(`${ok ? 'OK ' : 'MAL'} ${name}${extra ? ` → ${extra}` : ''}`); };
const fsApi = (p, body) => fetch(`${URL0}__fs/${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}).then((r) => r.json());
const dump = () => fsApi('dump');
const sheet = async (id) => (await dump())[`sheets/${id}`];
const content = async (id) => { const d = await dump(); return JSON.parse(Object.keys(d).filter((k) => k.startsWith(`sheets/${id}/parts/`)).sort().map((k) => d[k].d).join('')); };
const invitesIn = async () => { const d = await dump(); return Object.keys(d).filter((k) => k.startsWith('sheetInvites/')).map((k) => ({ id: k.split('/')[1], ...d[k] })); };

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errs = [];
async function device(name, mail) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulate({ viewport: { width: 360, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0 Mobile Safari/537.36' });
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (r.url().includes('api.github.com')) r.abort(); else r.continue(); });
  page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  // Sesión iniciada desde antes (y ya se preguntó si subir las locales: la vacía no cuenta)
  await page.evaluate((c, m, u) => {
    localStorage.clear(); localStorage.setItem('fb-sim-cuentas', JSON.stringify(c));
    localStorage.setItem('fb-sim-sesion', JSON.stringify(m)); localStorage.setItem('fb-sim-sesion-t', String(Date.now()));
    localStorage.setItem('planillas-cuenta', m); localStorage.setItem(`planillas-nube-preguntado-${u}`, '1');
  }, CUENTAS, mail, CUENTAS[mail].uid);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.vb.on'); await wait(1200);
  const d = {
    page,
    shot: (n) => page.screenshot({ path: `${SHOTS}/comp-${name}-${n}.png` }),
    tap: async (sel) => { await page.waitForSelector(sel, { visible: true }); await page.tap(sel); await wait(250); },
    txt: (sel) => page.$eval(sel, (x) => x.textContent.replace(/\s+/g, ' ').trim()).catch(() => ''),
    visible: (sel) => page.$eval(sel, (x) => !x.hidden && x.offsetParent !== null).catch(() => false),
    snack: () => page.$eval('#snackbar', (x) => (x.classList.contains('show') ? x.textContent : '')),
    title: () => page.$eval('#dialog-title', (x) => x.textContent.trim()).catch(() => ''),
    dialogOpen: () => page.$eval('#dialog', (x) => !x.hidden),
    files: () => page.evaluate(() => new Promise((ok) => { const r = indexedDB.open('planillas', 1); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').getAll(); q.onsuccess = () => ok(q.result); }; })),
    file: async (id) => (await d.files()).find((f) => f.id === id),
    open: () => page.$eval('#file-title', (x) => x.textContent.trim()),
    meta: () => page.evaluate((u) => JSON.parse(localStorage.getItem(`planillas-nube-${u}`) || 'null'), CUENTAS[mail].uid),
  };
  d.waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(250); } return false; };
  d.grid = async () => { if (!(await page.$eval('.vb[data-v="tabla"]', (x) => x.classList.contains('on')))) await d.tap('.vb[data-v="tabla"]'); };
  d.goto = async (r) => { await d.grid(); await page.$eval('#name-box', (x) => { x.value = ''; }); await d.tap('#name-box'); await page.keyboard.type(r); await page.keyboard.press('Enter'); await wait(150); };
  d.setCell = async (r, text) => {
    await d.goto(r);
    await d.tap('#formula');
    await page.$eval('#formula', (x) => { x.value = ''; });
    await page.keyboard.type(text); await page.keyboard.press('Enter'); await wait(500);
  };
  d.menu = async (label) => {
    await d.tap('#btn-file-menu');
    return page.$$eval('#menu-items button', (bs, l) => { const b = bs.find((x) => x.textContent.trim() === l); const all = bs.map((x) => x.textContent.trim()); if (b) b.click(); return all; }, label);
  };
  d.dialogBtn = async (label) => {
    const ok = await page.$$eval('#dialog-actions button, #dialog-body button', (bs, l) => { const b = bs.find((x) => x.textContent.trim() === l); if (b) b.click(); return !!b; }, label);
    await wait(400); return ok;
  };
  d.closeDialog = async () => { if (await d.dialogOpen()) await d.dialogBtn('Cerrar'); };
  d.filesOpen = async () => { await d.tap('#btn-files'); await wait(400); };
  d.filesClose = async () => { await d.tap('#files-close'); };
  d.fileItems = () => page.$$eval('#file-list li', (ls) => ls.map((l) => (l.classList.contains('file-sec') ? `## ${l.textContent.trim()}` : l.textContent.replace(/\s+/g, ' ').trim())));
  d.fileMenu = async (id, label) => {
    await page.$eval(`#file-list .file-item[data-id="${id}"] .file-more`, (b) => b.click());
    await wait(300);
    return page.$$eval('#menu-items button', (bs, l) => { const b = bs.find((x) => x.textContent.trim() === l); const all = bs.map((x) => x.textContent.trim()); if (b) b.click(); return all; }, label);
  };
  d.openId = async (id) => { await page.evaluate((x) => localStorage.setItem('planillas-ultimo', x), id); await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('.vb.on'); await wait(1500); };
  d.invite = async (mail2, role) => {
    await page.waitForSelector('#sh-mail', { visible: true });
    await page.$eval('#sh-mail', (x) => { x.value = ''; });
    await d.tap('#sh-mail'); await page.keyboard.type(mail2);
    await page.select('#sh-role', role);
    await d.tap('#sh-go'); await wait(600);
  };
  return d;
}

await fsApi('reset', {});

// ---------- 1. Lucho arma una planilla en su cuenta y la comparte ----------
const L = await device('L', L_MAIL);
await L.setCell('A1', 'Producto'); await L.setCell('B1', 'Precio'); await L.setCell('A2', 'Yerba'); await L.setCell('B2', '1500');
const id = (await L.files())[0].id;
// Era local: ⋮ → Compartir explica que primero hay que subirla
await L.menu('Compartir…');
check('L: local → «primero tiene que estar en tu cuenta»', (await L.txt('#dialog-body')).includes('Subir a mi cuenta'), await L.txt('#dialog-body'));
await L.closeDialog();
await L.filesOpen(); await L.fileMenu(id, 'Subir a mi cuenta'); await L.filesClose();
check('L: la planilla está en su cuenta', await L.waitFor(async () => (await sheet(id))?.ver >= 1 && (await L.meta())[id]?.d === false));
const menuL = await L.menu('Compartir…');
check('L: ⋮ tiene «Compartir…»', menuL.includes('Compartir…'), JSON.stringify(menuL.slice(0, 3)));
check('L: se abre «Compartir»', (await L.title()) === 'Compartir');
check('L: solo él, como Dueño', (await L.txt('#sh-body')).includes('Lucho (vos)') && (await L.txt('#sh-body')).includes('Dueño'), await L.txt('#sh-body'));
await L.invite('Ana@Example.com', 'edit');
check('L: invitación a Ana en la nube (correo en minúsculas)', (await invitesIn()).some((i) => i.id === `${id}_${A_MAIL}` && i.role === 'edit' && i.from === 'u1' && i.fromName === 'Lucho'), JSON.stringify(await invitesIn()));
check('L: su nombre quedó en la planilla (members)', (await sheet(id)).members?.u1?.name === 'Lucho');
await L.invite(B_MAIL, 'view');
check('L: aparecen las dos invitaciones sin aceptar', await L.waitFor(async () => ((await L.txt('#sh-body')).match(/Invitación sin aceptar/g) || []).length === 2), await L.txt('#sh-body'));
await L.invite(L_MAIL, 'edit');
check('L: no deja invitarse a sí mismo', (await L.snack()).includes('tu propio correo'), await L.snack());
await L.shot('1-compartir');
await L.closeDialog();

// ---------- 2. Ana (verificada) ve la invitación y la acepta ----------
const A = await device('A', A_MAIL);
check('A: banda de invitación', await A.waitFor(async () => (await A.visible('#invites-banner')) && (await A.txt('#invites-text')).includes('Lucho te compartió')), await A.txt('#invites-text'));
await A.shot('2-banda');
await A.tap('#invites-action');
check('A: «Compartidas con vos» con la planilla y el permiso', (await A.txt('#inv-body')).includes('Puede editar'), await A.txt('#inv-body'));
await A.page.$eval('#inv-body [data-si]', (b) => b.click());
check('A: se acepta y se abre sola', await A.waitFor(async () => (await A.file(id)) && (await A.page.evaluate(() => localStorage.getItem('planillas-ultimo'))) === id), await A.snack());
check('nube: Ana es miembro con «edit»', JSON.stringify((await sheet(id)).memberIds) === '["u1","u2"]' && (await sheet(id)).roles?.u2 === 'edit' && (await sheet(id)).members?.u2?.email === A_MAIL);
check('nube: la invitación de Ana se borró', !(await invitesIn()).some((i) => i.email === A_MAIL));
check('A: banda «De Lucho · Podés editar»', await A.waitFor(async () => (await A.txt('#share-banner')).includes('De Lucho') && (await A.txt('#share-banner')).includes('Podés editar')), await A.txt('#share-banner'));
check('A: la banda de invitación se fue', !(await A.visible('#invites-banner')));
await A.filesOpen();
const itA = await A.fileItems();
check('A: Mis planillas → «Compartidas conmigo»', itA.includes('## Compartidas conmigo') && itA.some((x) => x.includes('de Lucho · puede editar')), JSON.stringify(itA));
const mA = await A.fileMenu(id, null);
check('A: menú con «Personas con acceso…» y «Salir de la planilla»', mA.includes('Personas con acceso…') && mA.includes('Salir de la planilla') && !mA.includes('Borrar'), JSON.stringify(mA));
await A.page.$eval('#scrim', (x) => x.click()); await wait(200);
await A.shot('3-mis-planillas');
await A.filesClose();

// ---------- 3. Ana edita → le llega a Lucho ----------
await L.openId(id);
await A.setCell('B2', '1800');
check('nube: el cambio de Ana subió', await A.waitFor(async () => (await content(id)).cells.B2 === '1800', 10000));
check('nube: lo subió Ana (by = u2), dueño y miembros iguales', (await sheet(id)).by === 'u2' && (await sheet(id)).owner === 'u1' && (await sheet(id)).memberIds.length === 2);
check('L: lo recibe con la planilla abierta', await L.waitFor(async () => (await L.file(id)).cells.B2 === '1800'));
check('L: aviso «con cambios de Ana»', await L.waitFor(async () => (await L.snack()).includes('cambios de Ana'), 3000), await L.snack());
check('L: banda «Compartida con 1 persona»', await L.waitFor(async () => (await L.txt('#share-banner')).includes('Compartida con 1 persona')), await L.txt('#share-banner'));
await A.page.evaluate(() => { const r = indexedDB.open('planillas', 1); void r; });
// Ana renombra (puede editar): el nombre sube
await A.filesOpen(); await A.fileMenu(id, 'Renombrar');
await A.page.waitForSelector('#dialog-input', { visible: true });
await A.page.$eval('#dialog-input', (x) => { x.value = 'Precios'; }); await A.dialogBtn('Guardar');
check('L: le llega el nombre nuevo', await L.waitFor(async () => (await L.file(id)).name === 'Precios'), (await L.file(id)).name);
await A.filesClose();

// ---------- 4. Lucho pasa a Ana a «Solo puede ver» ----------
await L.menu('Compartir…');
await L.page.waitForSelector('[data-rol="u2"]');
await L.page.select('[data-rol="u2"]', 'view'); await wait(600);
check('nube: Ana con «view»', (await sheet(id)).roles?.u2 === 'view');
await L.closeDialog();
check('A: banda «Solo podés ver»', await A.waitFor(async () => (await A.txt('#share-banner')).includes('Solo podés ver')), await A.txt('#share-banner'));
check('A: sin Cortar / Pegar / Borrar', !(await A.visible('#btn-cut')) && !(await A.visible('#btn-paste')) && !(await A.visible('#btn-clear')) && (await A.visible('#btn-copy')));
await A.goto('C3');
await A.page.focus('#grid-wrap'); await A.page.keyboard.type('x'); await wait(300);
check('A: escribir en la grilla no edita (aviso)', (await A.snack()).includes('Solo podés ver') && !(await A.file(id)).cells.C3, await A.snack());
check('A: la barra de fórmula es de solo lectura', await A.page.$eval('#formula', (x) => x.readOnly));
await A.tap('.vb[data-v="ficha"]');
check('A: la Ficha es de solo lectura (sin + Nuevo)', await A.page.$$eval('#ficha-fields input', (is) => is.length > 0 && is.every((i) => i.readOnly)) && !(await A.visible('#f-new')));
await A.shot('4-solo-ver');
// Las reglas también lo impiden: un envío directo de Ana se rechaza
const directo = await A.page.evaluate(async (sid) => {
  const h = { 'x-auth': JSON.stringify({ uid: 'u2', email: 'ana@example.com', verified: true }), 'content-type': 'application/json' };
  const r = await fetch('/__fs/commit', { method: 'POST', headers: h, body: JSON.stringify({ writes: [{ op: 'update', path: `sheets/${sid}`, data: { name: 'Hackeada', ver: 99 } }], checks: [] }) });
  return (await r.json()).error;
}, id);
check('reglas: «Solo puede ver» no puede cambiarla', directo === 'permission-denied', directo);
const directo2 = await A.page.evaluate(async (sid) => {
  const h = { 'x-auth': JSON.stringify({ uid: 'u2', email: 'ana@example.com', verified: true }), 'content-type': 'application/json' };
  const r = await fetch('/__fs/commit', { method: 'POST', headers: h, body: JSON.stringify({ writes: [{ op: 'update', path: `sheets/${sid}`, data: { 'roles.u2': 'edit' } }], checks: [] }) });
  return (await r.json()).error;
}, id);
check('reglas: no puede darse permiso de editar', directo2 === 'permission-denied', directo2);

// ---------- 5. Editora con cambios sin subir que pasa a «ver» → copia «(mis cambios)» ----------
await L.menu('Compartir…'); await L.page.waitForSelector('[data-rol="u2"]');
await L.page.select('[data-rol="u2"]', 'edit'); await wait(600); await L.closeDialog();
check('A: vuelve a «Podés editar»', await A.waitFor(async () => (await A.txt('#share-banner')).includes('Podés editar')));
await A.page.evaluate(() => { window.__fssim.offline = true; });
await A.setCell('A3', 'Mate (Ana sin conexión)');
await wait(800);
await L.menu('Compartir…'); await L.page.waitForSelector('[data-rol="u2"]');
await L.page.select('[data-rol="u2"]', 'view'); await wait(600); await L.closeDialog();
await A.page.evaluate(() => { window.__fssim.offline = false; });
check('A: aparece una copia suya «Precios (mis cambios)» con A3', await A.waitFor(async () => (await A.files()).some((f) => f.name === 'Precios (mis cambios)' && f.cells.A3 === 'Mate (Ana sin conexión)'), 12000), JSON.stringify((await A.files()).map((f) => f.name)));
check('A: la compartida vuelve a la de la nube (sin A3)', await A.waitFor(async () => !(await A.file(id)).cells.A3));
check('nube: la compartida no tiene A3', !(await content(id)).cells.A3);
check('nube: la copia es de Ana', await A.waitFor(async () => Object.values(await dump()).some((x) => x && x.name === 'Precios (mis cambios)' && x.owner === 'u2' && x.memberIds.length === 1)));

// ---------- 6. Beto sin verificar: no ve la invitación; al verificar, sí ----------
const B = await device('B', B_MAIL);
await wait(1500);
check('B: sin verificar no hay banda de invitación', !(await B.visible('#invites-banner')));
await B.filesOpen();
check('B: Mis planillas pide verificar el correo', (await B.txt('#files-note')).includes('Verificá tu correo'), await B.txt('#files-note'));
await B.filesClose();
await B.page.evaluate((m) => window.__fbsim.verificar(m), B_MAIL);
await B.tap('#btn-cuenta');
await B.page.waitForSelector('#cta-verif-ok', { visible: true });
await B.tap('#cta-verif-ok');
check('B: al verificar aparece la invitación', await B.waitFor(async () => (await B.visible('#invites-banner')) && (await B.txt('#invites-text')).includes('Lucho te compartió')), await B.txt('#invites-text'));
await B.closeDialog();
await B.tap('#invites-action');
check('B: dice «Solo puede ver»', (await B.txt('#inv-body')).includes('Solo puede ver'));
await B.page.$eval('#inv-body [data-si]', (b) => b.click());
check('B: aceptada (solo ver)', await B.waitFor(async () => (await B.file(id)) && (await B.txt('#share-banner')).includes('Solo podés ver')), await B.txt('#share-banner'));
check('L: «Compartida con 2 personas»', await L.waitFor(async () => (await L.txt('#share-banner')).includes('2 personas')), await L.txt('#share-banner'));
await L.menu('Compartir…');
check('L: Compartir lista a los tres sin invitaciones pendientes', await L.waitFor(async () => { const t = await L.txt('#sh-body'); return t.includes('Ana') && t.includes('Beto') && !t.includes('Invitación sin aceptar'); }), await L.txt('#sh-body'));
await L.shot('5-tres');

// ---------- 7. Lucho quita a Beto ----------
await L.page.$eval('[data-quitar="u3"]', (b) => b.click()); await wait(200);
check('L: pide tocar «Quitar» otra vez', (await L.snack()).includes('otra vez'));
await L.page.$eval('[data-quitar="u3"]', (b) => b.click()); await wait(600);
check('nube: Beto ya no es miembro', !(await sheet(id)).memberIds.includes('u3') && !(await sheet(id)).roles?.u3);
await L.closeDialog();
check('B: se le quita del dispositivo con aviso', await B.waitFor(async () => !(await B.file(id))), JSON.stringify((await B.files()).map((f) => f.name)));
check('B: aviso «ya no está compartida con vos»', await B.waitFor(async () => (await B.snack()).includes('ya no está compartida con vos'), 3000), await B.snack());
check('B: queda otra planilla abierta, sin banda', (await B.open()) !== 'Precios' && !(await B.visible('#share-banner')));

// ---------- 8. Ana sale de la planilla ----------
await A.filesOpen();
await A.fileMenu(id, 'Salir de la planilla');
check('A: pregunta «¿Salir de…?»', (await A.title()).startsWith('¿Salir de'), await A.title());
await A.dialogBtn('Salir');
check('nube: Ana ya no es miembro', await A.waitFor(async () => JSON.stringify((await sheet(id)).memberIds) === '["u1"]' && !(await sheet(id)).members?.u2));
check('nube: la planilla sigue (no se borró)', !!(await sheet(id)) && (await content(id)).cells.A1 === 'Producto');
check('A: ya no la tiene', !(await A.file(id)));
check('L: la banda de compartida se va', await L.waitFor(async () => !(await L.visible('#share-banner'))));

// ---------- 9. Lucho borra una compartida con una invitación pendiente → se borran las invitaciones ----------
await L.menu('Compartir…'); await L.invite(A_MAIL, 'view'); await L.closeDialog();
check('nube: invitación nueva a Ana', (await invitesIn()).some((i) => i.email === A_MAIL && i.sheetId === id));
check('A: le llega la banda', await A.waitFor(async () => (await A.visible('#invites-banner'))));
await L.filesOpen();
await L.fileMenu(id, 'Borrar');
await L.dialogBtn('Borrar');
check('nube: planilla e invitación borradas', await L.waitFor(async () => !(await sheet(id)) && !(await invitesIn()).some((i) => i.sheetId === id)));
check('A: la banda de invitación se va', await A.waitFor(async () => !(await A.visible('#invites-banner'))));
await L.filesClose();

// ---------- 10. Administrador de ANote...: cerrar sesión en todos los dispositivos ----------
await fsApi('put', { path: 'control/u1', data: { by: 'admin', at: Date.now(), revokedAt: Date.now() + 1000 } });
check('L: sesión cerrada por el administrador', await L.waitFor(async () => (await L.title()) === 'Sesión cerrada' && (await L.txt('#dialog-body')).includes('administrador de ANote'), 8000), await L.title());
check('L: sin sesión y sin planillas de la cuenta', !(await L.page.evaluate(() => localStorage.getItem('planillas-cuenta'))) && !(await L.meta()));
await L.shot('6-revocada');
// Un pedido viejo (anterior al inicio de sesión) no cierra nada
await fsApi('put', { path: 'control/u2', data: { by: 'admin', at: 1, revokedAt: 1000 } });
await wait(2500);
check('A: un pedido anterior a su inicio de sesión no la saca', !!(await A.page.evaluate(() => localStorage.getItem('planillas-cuenta'))) && (await A.title()) !== 'Sesión cerrada');

console.log(`errores de la página: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
console.log(mal || errs.length ? `${mal} MAL` : 'todo OK');
await browser.close();
process.exit(mal || errs.length ? 1 : 0);
