// Cuenta (Etapa 2a): botón de la barra verde y diálogos de Entrar / Crear cuenta / Olvidé mi contraseña /
// Mi cuenta (verificar el correo, nombre visible, cambiar la contraseña, cerrar sesión).
// La cuenta es opcional: sin iniciar sesión la app funciona igual y las planillas quedan en el dispositivo.
// Firebase (cuenta.js) se carga recién cuando hace falta: al tocar el botón, o al abrir la app si ya había
// una sesión (marca CUENTA_KEY), así una app sin cuenta no carga nada de Firebase al arrancar.
// Nube (v0.0.10): con la sesión iniciada se carga nube.js (Firestore) y las planillas de la cuenta se sincronizan.
// v0.0.11: compartir (en nube.js y main.js) y «cerrar sesión en todos los dispositivos» del administrador de ANote...
const CUENTA_KEY = 'planillas-cuenta'; // correo de la sesión abierta (solo para saber si cargar Firebase al abrir)

let A = null; // módulo cuenta.js (cargado)
let N = null; // módulo nube.js (cargado con la sesión iniciada)
let user = null;
let ready = false;
let ui = null; // { $, esc, openDialog, closeDialog, snack, hideSnack, nube: ayudas de main.js para nube.js }
let leaving = false; // «Cerrar sesión» en curso (la nube ya se paró y limpió)

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* nada */ } };

const ICON_PERSONA = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20.2c.9-3.9 3.9-5.9 7.5-5.9s6.6 2 7.5 5.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

async function load() {
  if (A) return A;
  A = await import('./cuenta.js');
  await new Promise((resolve) => {
    let first = true;
    A.watchAuth((u) => {
      user = u;
      ready = true;
      lsSet(CUENTA_KEY, u ? (u.email || '?') : null);
      paintButton();
      if (u) startNube(u); else if (N && !leaving) N.stop();
      if (first) { first = false; resolve(); }
    });
  });
  return A;
}

async function startNube(u) {
  try {
    if (!N) N = await import('./nube.js');
    if (user && user.uid === u.uid) await N.start(u, { ...ui.nube, revoked: forcedSignOut });
  } catch (e) {
    console.warn('Nube', e);
    ui.snack('No se pudo conectar con la nube. Las planillas siguen en este dispositivo.');
  }
  if (ui.nube) ui.nube.status();
}

// Verificó el correo o cambió el nombre: la nube lo sabe (invitaciones, nombre que ven los demás)
const tellNube = () => { if (N && user) N.userChanged(user); };

// El administrador de ANote... cerró la sesión en todos los dispositivos (control/{uid}.revokedAt)
let forcing = false;
async function forcedSignOut() {
  if (forcing || !user) return;
  forcing = true; leaving = true;
  try {
    let ids = [];
    try { ids = N ? await Promise.race([N.leave(), new Promise((r) => setTimeout(() => r([]), 15000))]) : []; } catch { /* se cierra igual */ }
    try { await A.signOutUser(); } catch { /* nada */ }
    user = null; paintButton();
    if (ui.nube) await ui.nube.removedMany(ids || []);
    ui.openDialog('Sesión cerrada', '<p>El administrador de ANote... cerró tu sesión en todos tus dispositivos (es la misma cuenta). Las planillas de tu cuenta siguen en la nube: volvé a entrar para verlas.</p>',
      [{ label: 'Cerrar', value: null }]);
  } finally { forcing = false; leaving = false; }
}

const shownName = (u) => (u.displayName || '').trim() || (u.email || '').split('@')[0];
function paintButton() {
  const b = ui.$('btn-cuenta');
  if (!b) return;
  if (user) {
    const n = shownName(user);
    b.innerHTML = `<span class="avatar">${ui.esc((n[0] || '?').toUpperCase())}</span>${user.emailVerified ? '' : '<span class="avatar-dot"></span>'}`;
    b.setAttribute('aria-label', `Mi cuenta (${user.email})${user.emailVerified ? '' : ', falta verificar el correo'}`);
  } else {
    b.innerHTML = ICON_PERSONA;
    b.setAttribute('aria-label', 'Iniciar sesión (opcional)');
  }
}

// ---------- Ayudas para los formularios dentro del diálogo ----------
function form(title, html) {
  // El aviso de error va justo arriba del botón principal (o al final, si no hay botones).
  const err = '<p class="dialog-error" id="cta-err" hidden></p>';
  const i = html.indexOf('<div class="cta-acts">');
  const body = i >= 0 ? html.slice(0, i) + err + html.slice(i) : html + err;
  ui.openDialog(title, `<form class="cta-form" id="cta-form" novalidate>${body}</form>`, [{ label: 'Cerrar', value: null }]);
  const f = ui.$('cta-form');
  f.addEventListener('submit', (e) => e.preventDefault());
  return f;
}
const field = (id, label, type, value = '', extra = '') => `<label class="cta-lbl" for="${id}">${label}</label>
  <input class="dialog-input" id="${id}" type="${type}" value="${ui.esc(value)}" ${extra}>`;
const pwField = (id, label, auto) => field(id, label, 'password', '', `autocomplete="${auto}" autocapitalize="off" spellcheck="false"`);
const showPw = '<label class="cta-chk"><input type="checkbox" id="cta-ver"> Mostrar la contraseña</label>';
function wireShowPw(f) {
  const v = f.querySelector('#cta-ver');
  if (v) v.addEventListener('change', () => f.querySelectorAll('input[type="password"], input[data-pw]').forEach((i) => { i.dataset.pw = '1'; i.type = v.checked ? 'text' : 'password'; }));
}
function setErr(text) {
  const e = ui.$('cta-err');
  if (!e) return;
  e.textContent = text || '';
  e.hidden = !text;
}
// Corre una acción con los botones del formulario apagados y muestra el error abajo (sin cerrar el diálogo).
async function busy(btn, label, fn) {
  const f = ui.$('cta-form');
  const btns = f ? [...f.querySelectorAll('button')] : [];
  const old = btn.textContent;
  btns.forEach((b) => { b.disabled = true; });
  btn.textContent = label;
  setErr('');
  try { await fn(); } catch (e) {
    console.warn(e);
    setErr(A ? A.authErrorMessage(e) : `No se pudo cargar el inicio de sesión: ${e?.message || e}`);
  } finally {
    if (btn.isConnected) { btns.forEach((b) => { b.disabled = false; }); btn.textContent = old; }
  }
}
const val = (id) => (ui.$(id)?.value || '');
// Enter en el último campo = botón principal
function enterSubmits(f, btn) {
  f.querySelectorAll('input:not([type="checkbox"])').forEach((i) => i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
  }));
}
const focusFirst = (f) => { const i = f.querySelector('input:not([type="checkbox"])'); if (i) i.focus(); };

const NOTA_CUENTA = '<p class="dialog-sub">Opcional. Es la misma cuenta de ANote... (con correo y contraseña). Con la sesión iniciada, tus planillas se guardan en tu cuenta y las ves en todos tus dispositivos. Sin iniciar sesión, Planillas anda igual y las planillas quedan solo en este dispositivo.</p>';

// ---------- Entrar ----------
function showLogin(email = lsGet('planillas-cuenta-ultimo') || '') {
  const f = form('Iniciar sesión', `${NOTA_CUENTA}
    ${field('cta-mail', 'Correo', 'email', email, 'autocomplete="username" autocapitalize="off" spellcheck="false" inputmode="email"')}
    ${pwField('cta-pass', 'Contraseña', 'current-password')}
    ${showPw}
    <div class="cta-acts"><button class="cta-btn" id="cta-go" type="button">Entrar</button></div>
    <div class="cta-links"><button class="text-btn" id="cta-new" type="button">Crear cuenta</button><button class="text-btn" id="cta-forgot" type="button">Olvidé mi contraseña</button></div>
    <p class="dialog-sub">¿En ANote... entrás con Google? En Planillas, el inicio con Google llega en una próxima versión. Mientras tanto, podés pasar a «Contraseña propia» desde ANote... (⋮ Menú → Seguridad de la cuenta) y entrar acá con ese correo.</p>`);
  wireShowPw(f);
  const go = ui.$('cta-go');
  go.addEventListener('click', () => busy(go, 'Entrando…', async () => {
    const mail = val('cta-mail').trim(); const pass = val('cta-pass');
    if (!mail || !pass) { setErr('Escribí el correo y la contraseña.'); return; }
    await load();
    await A.signInEmail(mail, pass);
    lsSet('planillas-cuenta-ultimo', A.norm(mail));
    ui.closeDialog();
    ui.snack(`Sesión iniciada: ${A.norm(mail)}`);
    if (A.currentUser() && !A.currentUser().emailVerified) setTimeout(showAccount, 300);
  }));
  enterSubmits(f, go);
  ui.$('cta-new').addEventListener('click', () => showSignUp(val('cta-mail').trim()));
  ui.$('cta-forgot').addEventListener('click', () => showForgot(val('cta-mail').trim()));
  if (email) ui.$('cta-pass').focus(); else focusFirst(f);
}

// ---------- Crear cuenta ----------
function showSignUp(email = '') {
  const f = form('Crear cuenta', `
    ${field('cta-name', 'Nombre visible', 'text', '', 'autocomplete="name" autocapitalize="words"')}
    ${field('cta-mail', 'Correo', 'email', email, 'autocomplete="username" autocapitalize="off" spellcheck="false" inputmode="email"')}
    ${pwField('cta-pass', 'Contraseña (10 caracteres o más, con letras y números)', 'new-password')}
    ${pwField('cta-pass2', 'Repetir la contraseña', 'new-password')}
    ${showPw}
    <p class="dialog-sub">Usá una contraseña que no uses en otro lado (la cuenta con contraseña es de un solo factor). Te vamos a mandar un correo para verificar que es tuyo (mirá también en spam).</p>
    <div class="cta-acts"><button class="text-btn" id="cta-back" type="button">Ya tengo cuenta</button><button class="cta-btn" id="cta-go" type="button">Crear cuenta</button></div>`);
  wireShowPw(f);
  const go = ui.$('cta-go');
  go.addEventListener('click', () => busy(go, 'Creando…', async () => {
    const name = val('cta-name').trim(); const mail = val('cta-mail').trim();
    const pass = val('cta-pass'); const pass2 = val('cta-pass2');
    if (!name) { setErr('Escribí tu nombre (se va a ver al compartir planillas, más adelante).'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { setErr('El correo no es válido.'); return; }
    await load();
    const prob = A.passwordProblem(pass, mail);
    if (prob) { setErr(prob); return; }
    if (pass !== pass2) { setErr('Las dos contraseñas no coinciden.'); return; }
    await A.signUpEmail(name, mail, pass);
    lsSet('planillas-cuenta-ultimo', A.norm(mail));
    await A.refreshUser().catch(() => {});
    user = A.currentUser(); paintButton();
    showAccount({ created: true });
  }));
  enterSubmits(f, go);
  ui.$('cta-back').addEventListener('click', () => showLogin(val('cta-mail').trim()));
  focusFirst(f);
}

// ---------- Olvidé mi contraseña ----------
function showForgot(email = '') {
  const f = form('Olvidé mi contraseña', `
    <p>Te mandamos un correo con un link para elegir una contraseña nueva (mirá también en spam). Vale también para ANote...: es la misma cuenta.</p>
    ${field('cta-mail', 'Correo', 'email', email, 'autocomplete="username" autocapitalize="off" spellcheck="false" inputmode="email"')}
    <div class="cta-acts"><button class="text-btn" id="cta-back" type="button">Volver</button><button class="cta-btn" id="cta-go" type="button">Mandar el correo</button></div>`);
  const go = ui.$('cta-go');
  go.addEventListener('click', () => busy(go, 'Mandando…', async () => {
    const mail = val('cta-mail').trim();
    if (!mail) { setErr('Escribí el correo.'); return; }
    await load();
    await A.resetPassword(mail);
    ui.openDialog('Correo enviado', `<p>Si hay una cuenta con <b>${ui.esc(A.norm(mail))}</b>, te llega un correo con el link para elegir la contraseña nueva. Después, volvé y entrá con ella.</p>`,
      [{ label: 'Cerrar', value: null }]);
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'text-btn'; back.textContent = 'Iniciar sesión';
    back.addEventListener('click', () => showLogin(A.norm(mail)));
    ui.$('dialog-actions').prepend(back);
  }));
  enterSubmits(f, go);
  focusFirst(f);
}

// ---------- Mi cuenta ----------
async function showAccount({ created = false } = {}) {
  if (!user) { showLogin(); return; }
  const u = user;
  const verif = u.emailVerified
    ? '<p class="cta-ok">✓ Correo verificado</p>'
    : `<p class="cta-warn"><b>Falta verificar el correo.</b> ${created ? 'Te mandamos un correo' : 'Buscá el correo que te mandamos'} con el link (mirá también en spam). Hasta verificarlo no vas a poder ver las planillas que te compartan.</p>
       <div class="cta-links"><button class="text-btn" id="cta-verif-ok" type="button">Ya lo verifiqué</button><button class="text-btn" id="cta-verif-again" type="button">Reenviar el correo</button></div>`;
  const f = form(created ? 'Cuenta creada' : 'Mi cuenta', `
    <p class="cta-quien"><span class="avatar big">${ui.esc((shownName(u)[0] || '?').toUpperCase())}</span><span><b>${ui.esc(shownName(u))}</b><br><small>${ui.esc(u.email || '')}</small></span></p>
    ${verif}
    <p class="dialog-sub">Las planillas de tu cuenta se guardan en la nube y las ves en todos tus dispositivos donde entres con esta cuenta (también sin conexión: los cambios se suben al volver). Las que están «Solo en este dispositivo» se suben desde Mis planillas (⋮ → Subir a mi cuenta).</p>
    <div class="cta-menu">
      <button class="menu-item" id="cta-name" type="button">Cambiar el nombre visible</button>
      ${A.hasPassword(u) ? '<button class="menu-item" id="cta-pw" type="button">Cambiar la contraseña</button>' : ''}
      <button class="menu-item danger" id="cta-out" type="button">Cerrar sesión</button>
    </div>`);
  void f;
  const ok = ui.$('cta-verif-ok');
  if (ok) {
    ok.addEventListener('click', () => busy(ok, 'Revisando…', async () => {
      user = await A.refreshUser(); paintButton();
      if (user.emailVerified) { tellNube(); ui.snack('Correo verificado'); showAccount(); } else setErr('Todavía figura sin verificar. Tocá el link del correo y probá de nuevo.');
    }));
    const again = ui.$('cta-verif-again');
    again.addEventListener('click', () => busy(again, 'Mandando…', async () => {
      await A.sendVerification();
      ui.snack(`Correo de verificación enviado a ${u.email}`);
    }));
  }
  ui.$('cta-name').addEventListener('click', showName);
  const pw = ui.$('cta-pw');
  if (pw) pw.addEventListener('click', showChangePw);
  ui.$('cta-out').addEventListener('click', confirmSignOut);
}

function showName() {
  const f = form('Nombre visible', `${field('cta-name', 'Nombre', 'text', shownName(user), 'autocomplete="name" autocapitalize="words"')}
    <div class="cta-acts"><button class="text-btn" id="cta-back" type="button">Volver</button><button class="cta-btn" id="cta-go" type="button">Guardar</button></div>`);
  const go = ui.$('cta-go');
  go.addEventListener('click', () => busy(go, 'Guardando…', async () => {
    const name = val('cta-name').trim();
    if (!name) { setErr('Escribí un nombre.'); return; }
    await A.setDisplayName(name);
    user = A.currentUser(); paintButton(); tellNube();
    ui.snack('Nombre guardado');
    showAccount();
  }));
  enterSubmits(f, go);
  ui.$('cta-back').addEventListener('click', () => showAccount());
  const i = ui.$('cta-name'); i.focus(); i.select();
}

function showChangePw() {
  const f = form('Cambiar la contraseña', `
    ${pwField('cta-cur', 'Contraseña actual', 'current-password')}
    ${pwField('cta-pass', 'Contraseña nueva (10 caracteres o más, con letras y números)', 'new-password')}
    ${pwField('cta-pass2', 'Repetir la nueva', 'new-password')}
    ${showPw}
    <p class="dialog-sub">Vale también para ANote... (es la misma cuenta). Los otros dispositivos con la sesión abierta la van a cerrar solos (puede tardar hasta una hora).</p>
    <div class="cta-links"><button class="text-btn" id="cta-forgot" type="button">No me acuerdo de la actual</button></div>
    <div class="cta-acts"><button class="text-btn" id="cta-back" type="button">Volver</button><button class="cta-btn" id="cta-go" type="button">Cambiar</button></div>`);
  wireShowPw(f);
  const go = ui.$('cta-go');
  go.addEventListener('click', () => busy(go, 'Cambiando…', async () => {
    const cur = val('cta-cur'); const pass = val('cta-pass'); const pass2 = val('cta-pass2');
    if (!cur) { setErr('Escribí la contraseña actual.'); return; }
    const prob = A.passwordProblem(pass, user.email);
    if (prob) { setErr(prob); return; }
    if (pass === cur) { setErr('La nueva tiene que ser distinta de la actual.'); return; }
    if (pass !== pass2) { setErr('Las dos contraseñas nuevas no coinciden.'); return; }
    try { await A.changePassword(cur, pass); } catch (e) {
      if (['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials'].includes(e?.code)) { setErr('La contraseña actual no es correcta.'); return; }
      throw e;
    }
    ui.snack('Contraseña cambiada');
    showAccount();
  }));
  enterSubmits(f, go);
  ui.$('cta-back').addEventListener('click', () => showAccount());
  const forgot = ui.$('cta-forgot');
  forgot.addEventListener('click', () => busy(forgot, 'Mandando…', async () => {
    await A.resetPassword(user.email);
    ui.snack(`Te mandamos el correo para elegir una nueva a ${user.email}`);
  }));
  focusFirst(f);
}

async function confirmSignOut() {
  const n = N ? await N.pending() : 0;
  const aviso = n
    ? `<p class="dialog-error">${n === 1 ? 'Hay 1 planilla con cambios que todavía no se subieron' : `Hay ${n} planillas con cambios que todavía no se subieron`} a la nube (¿sin conexión?). Si cerrás sesión ahora, esos cambios se pierden.</p>`
    : '';
  form('Cerrar sesión', `<p>¿Cerrar la sesión de <b>${ui.esc(user.email || '')}</b> en este dispositivo? Las planillas de tu cuenta se quitan de este dispositivo y siguen en la nube (vuelven al entrar de nuevo). Las que están solo en este dispositivo quedan.</p>${aviso}
    <div class="cta-acts"><button class="text-btn" id="cta-back" type="button">Volver</button><button class="cta-btn danger" id="cta-go" type="button">${n ? 'Cerrar sesión igual' : 'Cerrar sesión'}</button></div>`);
  const go = ui.$('cta-go');
  go.addEventListener('click', () => busy(go, 'Cerrando…', async () => {
    leaving = true;
    try {
      const ids = N ? await N.leave() : [];
      await A.signOutUser();
      user = null; paintButton();
      ui.closeDialog();
      if (ui.nube) await ui.nube.removedMany(ids);
      ui.snack('Sesión cerrada');
    } finally { leaving = false; }
  }));
  ui.$('cta-back').addEventListener('click', () => showAccount());
}

// ---------- Inicio ----------
async function onButton() {
  if (ui.hideSnack) ui.hideSnack(); // un aviso viejo no tapa el diálogo
  if (!ready) {
    const b = ui.$('btn-cuenta');
    b.disabled = true;
    try { await load(); } catch (e) {
      console.warn(e);
      ui.snack('No se pudo cargar el inicio de sesión. Revisá la conexión y probá de nuevo.');
      return;
    } finally { b.disabled = false; }
  }
  if (user) showAccount(); else showLogin();
}

export function initCuenta(helpers) {
  ui = helpers;
  paintButton();
  ui.$('btn-cuenta').addEventListener('click', onButton);
  // Ya había una sesión: se carga Firebase para restaurarla (sin apuro, después de abrir la planilla).
  if (lsGet(CUENTA_KEY)) {
    setTimeout(async () => {
      try {
        await load();
        // Si volvió del link de verificación, se actualiza el estado (sin conexión, queda como estaba).
        if (user && !user.emailVerified && navigator.onLine !== false) {
          try { user = await A.refreshUser(); paintButton(); if (user?.emailVerified) { tellNube(); ui.snack('Correo verificado'); } } catch { /* sin conexión */ }
        }
      } catch (e) { console.warn('Cuenta', e); }
    }, 400);
  }
}

export const cuentaUser = () => user;
// Para main.js: estado de la nube (null sin sesión o sin nube cargada) y planillas nuevas que van a la cuenta.
export const nubeInfo = () => (N && user ? N.info() : null);
export const nubeAdopt = (id) => { if (N && user) N.adopt(id); };
export const nubeIsAccount = (id) => !!(N && user && N.isAccount(id));
export const nubeSyncNow = () => (N && user ? N.syncNow() : Promise.resolve());
// Compartir (v0.0.11): el módulo de la nube (null sin sesión) y abrir «Mi cuenta» (para verificar el correo)
export const nubeMod = () => (N && user ? N : null);
export const openAccount = () => onButton();
