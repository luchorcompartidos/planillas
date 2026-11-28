// Prueba en Chrome (celular de 360 px con toques) de la Etapa 2a (v0.0.9): cuenta opcional con correo y contraseña,
// con Firebase simulado (pruebas/app/firebase-simulado.mjs, sin red). Sin sesión no se carga Firebase al abrir;
// crear cuenta (validaciones), verificar el correo, nombre visible, cambiar la contraseña, recargar (la sesión
// sigue), cerrar sesión, entrar (error y bien), olvidé mi contraseña, textos de Mis planillas y de la versión,
// y que escribir en los diálogos no toque la grilla.
// Antes: bash pruebas/app/armar.sh. Capturas en /tmp/app-capturas (cta-*.png).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const puppeteer = createRequire('/opt/npm-tools/')('puppeteer');
const SHOTS = '/tmp/app-capturas'; mkdirSync(SHOTS, { recursive: true });
const URL0 = 'http://localhost:8765/';

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 360, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0 Mobile Safari/537.36' });
await page.setRequestInterception(true);
const pedidos = [];
page.on('request', (r) => { pedidos.push(r.url()); if (r.url().includes('api.github.com')) r.abort(); else r.continue(); });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const shot = (n) => page.screenshot({ path: `${SHOTS}/cta-${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let mal = 0;
const check = (name, ok, extra = '') => { if (!ok) mal++; console.log(`${ok ? 'OK ' : 'MAL'} ${name}${extra ? ` → ${extra}` : ''}`); };
const tap = async (sel) => { await page.waitForSelector(sel, { visible: true }); await page.tap(sel); await wait(250); };
const type = async (sel, text) => { await page.$eval(sel, (x) => { x.value = ''; }); await tap(sel); await page.keyboard.type(text); };
const txt = (sel) => page.$eval(sel, (x) => x.textContent.trim()).catch(() => '');
const title = () => txt('#dialog-title');
const errTxt = () => page.$eval('#cta-err', (x) => (x.hidden ? '' : x.textContent)).catch(() => '');
const dialogOpen = () => page.$eval('#dialog', (x) => !x.hidden);
const snackTxt = () => page.$eval('#snackbar', (x) => (x.classList.contains('show') ? x.textContent : ''));
const btnHtml = () => page.$eval('#btn-cuenta', (x) => x.innerHTML);
const cuentaCargada = () => pedidos.some((u) => /\/assets\/cuenta-[^/]*\.js/.test(u));
const MAIL = 'prueba.planillas@example.com';

await page.goto(URL0, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.vb.on'); await wait(700);
await page.tap('.vb[data-v="tabla"]'); await wait(300); // en la Grilla (para ver que los diálogos no la tocan)

// 1. Sin sesión: ícono de persona y Firebase sin cargar
check('sin sesión: ícono de persona', (await btnHtml()).includes('<svg'));
check('sin sesión: Firebase no se carga al abrir', !cuentaCargada());
const barra = await page.$eval('.appbar', (x) => ({ w: x.scrollWidth, cw: x.clientWidth }));
check('la barra verde entra en 360 px', barra.w <= barra.cw, JSON.stringify(barra));
await shot('1-barra');

// 2. Iniciar sesión → Crear cuenta
await tap('#btn-cuenta');
check('se abre «Iniciar sesión»', (await title()) === 'Iniciar sesión');
check('ahora sí se carga Firebase', cuentaCargada());
await shot('2-entrar');
await tap('#cta-new');
check('«Crear cuenta»', (await title()) === 'Crear cuenta');
await tap('#cta-go');
check('sin nombre: aviso', (await errTxt()).startsWith('Escribí tu nombre'), await errTxt());
await type('#cta-name', 'Lucho');
await type('#cta-mail', MAIL);
await type('#cta-pass', 'corta1');
await tap('#cta-go');
check('contraseña corta: aviso', (await errTxt()).includes('10 caracteres'), await errTxt());
await type('#cta-pass', 'prueba.planillas123');
await tap('#cta-go');
check('contraseña con el correo: aviso', (await errTxt()).includes('no puede contener tu correo'), await errTxt());
await type('#cta-pass', 'Hoja2026Verde');
await type('#cta-pass2', 'Hoja2026Verd');
await tap('#cta-go');
check('no coinciden: aviso', (await errTxt()).includes('no coinciden'), await errTxt());
await tap('#cta-ver');
check('«Mostrar la contraseña» muestra las dos', await page.$$eval('#cta-pass, #cta-pass2', (xs) => xs.every((x) => x.type === 'text')));
await type('#cta-pass2', 'Hoja2026Verde');
await shot('3-crear');
await tap('#cta-go'); await wait(400);
check('cuenta creada: diálogo', (await title()) === 'Cuenta creada', await title());
check('aviso «Falta verificar el correo»', (await txt('.cta-warn')).startsWith('Falta verificar'));
const correos = await page.evaluate(() => window.__fbsim.correos);
check('se mandó el correo de verificación con «Continuar» a Planillas', correos.some((c) => c.tipo === 'verificar' && c.a === MAIL && c.url === 'https://luchorcompartidos.github.io/planillas/'), JSON.stringify(correos));
const b1 = await btnHtml();
check('botón: inicial L y punto de «sin verificar»', b1.includes('>L<') && b1.includes('avatar-dot'), b1);
await shot('4-creada');

// 3. Verificar el correo
await tap('#cta-verif-ok'); await wait(300);
check('«Ya lo verifiqué» sin verificar: aviso', (await errTxt()).includes('Todavía figura sin verificar'), await errTxt());
await tap('#cta-verif-again'); await wait(200);
check('«Reenviar el correo»', (await page.evaluate(() => window.__fbsim.correos.filter((c) => c.tipo === 'verificar').length)) === 2);
await page.evaluate((m) => window.__fbsim.verificar(m), MAIL);
await tap('#cta-verif-ok'); await wait(300);
check('verificado: «✓ Correo verificado»', (await txt('.cta-ok')).includes('Correo verificado') && (await title()) === 'Mi cuenta');
check('verificado: sin punto en el botón', !(await btnHtml()).includes('avatar-dot'));

// 4. Nombre visible
await tap('#cta-name');
await type('#cta-name', 'Mario');
await page.keyboard.press('Enter'); await wait(300);
check('nombre cambiado (Enter guarda)', (await title()) === 'Mi cuenta' && (await btnHtml()).includes('>M<') && (await txt('.cta-quien b')) === 'Mario');

// 5. Cambiar la contraseña
await tap('#cta-pw');
await type('#cta-cur', 'otraCualquiera99');
await type('#cta-pass', 'Planilla2027Azul');
await type('#cta-pass2', 'Planilla2027Azul');
await tap('#cta-go'); await wait(300);
check('actual mal: «La contraseña actual no es correcta.»', (await errTxt()) === 'La contraseña actual no es correcta.', await errTxt());
await type('#cta-cur', 'Planilla2027Azul');
await tap('#cta-go'); await wait(200);
check('nueva igual a la actual: aviso', (await errTxt()).includes('distinta de la actual'), await errTxt());
await type('#cta-cur', 'Hoja2026Verde');
await tap('#cta-go'); await wait(400);
check('contraseña cambiada', (await title()) === 'Mi cuenta' && (await snackTxt()).includes('Contraseña cambiada'));
await shot('5-mi-cuenta');
await page.tap('#dialog-actions .text-btn'); await wait(200);
check('«Cerrar» cierra el diálogo', !(await dialogOpen()));

// 6. Mis planillas y versión
await tap('#btn-files');
check('Mis planillas: dice la sesión', (await txt('#files-note')).includes(`Sesión iniciada: ${MAIL}`));
await tap('#files-close');
await tap('#btn-version');
check('Versión: dice la cuenta y la Etapa 2a', (await txt('#dialog-body')).includes(`sesión iniciada (${MAIL})`) && (await txt('#dialog-body')).includes('Etapa 2a'));
await page.tap('#dialog-actions .text-btn'); await wait(200);

// 7. Recargar: la sesión sigue
await page.reload({ waitUntil: 'networkidle0' }); await wait(900);
await page.waitForSelector('#grid td[data-r="0"][data-c="0"]');
check('al recargar, la sesión sigue (inicial M)', (await btnHtml()).includes('>M<'), await btnHtml());

// 8. Cerrar sesión
await tap('#btn-cuenta');
await tap('#cta-out');
check('confirmación de cerrar sesión', (await title()) === 'Cerrar sesión');
await tap('#cta-go'); await wait(300);
check('sesión cerrada: ícono de persona y aviso', (await btnHtml()).includes('<svg') && (await snackTxt()).includes('Sesión cerrada'));

// 9. Entrar: mal y bien; el correo queda escrito
await tap('#btn-cuenta');
check('el correo de la última sesión ya está escrito', (await page.$eval('#cta-mail', (x) => x.value)) === MAIL);
await type('#cta-pass', 'Hoja2026Verde');
await tap('#cta-go'); await wait(300);
check('contraseña vieja: «Correo o contraseña incorrectos…» (menciona Google)', (await errTxt()).startsWith('Correo o contraseña incorrectos') && (await errTxt()).includes('Google'), await errTxt());
await shot('6-error');
// Escribir en el diálogo no toca la grilla
const a1antes = await page.$eval('#grid td[data-r="0"][data-c="0"]', (x) => x.textContent);
await type('#cta-pass', 'Planilla2027Azul');
await page.keyboard.press('Enter'); await wait(400);
check('Enter en la contraseña entra', !(await dialogOpen()) && (await snackTxt()).includes('Sesión iniciada'));
check('escribir en el diálogo no cambió la grilla', (await page.$eval('#grid td[data-r="0"][data-c="0"]', (x) => x.textContent)) === a1antes);

// 10. Crear con un correo que ya existe, y Olvidé mi contraseña (sin sesión)
await tap('#btn-cuenta'); await tap('#cta-out'); await tap('#cta-go'); await wait(300);
await tap('#btn-cuenta'); await tap('#cta-new');
await type('#cta-name', 'Otro'); await type('#cta-mail', MAIL.toUpperCase());
await type('#cta-pass', 'Distinta2026x'); await type('#cta-pass2', 'Distinta2026x');
await tap('#cta-go'); await wait(300);
check('correo ya usado (con mayúsculas): aviso de ANote...', (await errTxt()).includes('Ya hay una cuenta con ese correo'), await errTxt());
await tap('#cta-back');
await tap('#cta-forgot');
check('«Olvidé mi contraseña» con el correo ya escrito', (await title()) === 'Olvidé mi contraseña' && (await page.$eval('#cta-mail', (x) => x.value)).toLowerCase() === MAIL);
await tap('#cta-go'); await wait(300);
check('«Correo enviado» y correo de recuperación', (await title()) === 'Correo enviado' && (await page.evaluate(() => window.__fbsim.correos.some((c) => c.tipo === 'recuperar'))));
await shot('7-olvide');
await tap('#dialog-actions .text-btn'); // «Iniciar sesión»
check('desde «Correo enviado» se vuelve a «Iniciar sesión»', (await title()) === 'Iniciar sesión');

check('sin errores de JavaScript', errs.length === 0, errs.join(' | '));
console.log(mal ? `\n${mal} MAL` : '\nTODO OK');
await browser.close();
process.exit(mal ? 1 : 0);
