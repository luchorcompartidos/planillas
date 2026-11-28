// Reemplaza firebase/app y firebase/auth en la prueba (sin red): cuentas en localStorage ('fb-sim-cuentas')
// y sesión en 'fb-sim-sesion'. Desde la prueba: window.__fbsim.verificar(correo), .correos (lo "enviado").
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const cuentas = () => LS.get('fb-sim-cuentas', {});
const guardar = (c) => LS.set('fb-sim-cuentas', c);
const err = (code) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });
const lento = () => new Promise((r) => setTimeout(r, 60));
window.__fbsim = window.__fbsim || { correos: [], verificar: (m) => { const c = cuentas(); if (c[m]) { c[m].verified = true; guardar(c); } } };

let auth = null; const oyentes = [];
const hacerUser = (m) => { const a = cuentas()[m]; if (!a) return null; return { uid: a.uid, email: m, displayName: a.name || null, emailVerified: !!a.verified, providerData: [{ providerId: 'password', email: m }], getIdToken: async () => 'tok', getIdTokenResult: async () => ({ authTime: new Date(LS.get('fb-sim-sesion-t', Date.now())).toUTCString() }) }; };
const avisar = () => oyentes.forEach((f) => f(auth.currentUser));
const entrar = (m) => { LS.set('fb-sim-sesion', m); LS.set('fb-sim-sesion-t', Date.now()); auth.currentUser = hacerUser(m); avisar(); return { user: auth.currentUser }; };

export const initializeApp = (cfg) => ({ cfg });
export const indexedDBLocalPersistence = 'idb'; export const browserLocalPersistence = 'ls';
export function initializeAuth() { auth = { currentUser: null, languageCode: null }; const m = LS.get('fb-sim-sesion', null); if (m) auth.currentUser = hacerUser(m); return auth; }
export function onAuthStateChanged(_a, cb) { oyentes.push(cb); setTimeout(() => cb(auth.currentUser), 30); return () => {}; }
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export async function signInWithEmailAndPassword(_a, m, p) {
  await lento();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) throw err('auth/invalid-email');
  const a = cuentas()[m]; if (!a || a.pass !== p) throw err('auth/invalid-credential');
  return entrar(m);
}
export async function createUserWithEmailAndPassword(_a, m, p) {
  await lento(); const c = cuentas(); if (c[m]) throw err('auth/email-already-in-use');
  c[m] = { uid: `u${Object.keys(c).length + 1}`, pass: p, verified: false }; guardar(c); return entrar(m);
}
export async function updateProfile(u, { displayName }) { const c = cuentas(); c[u.email].name = displayName; guardar(c); u.displayName = displayName; auth.currentUser = hacerUser(u.email); }
export async function sendEmailVerification(u, s) { window.__fbsim.correos.push({ tipo: 'verificar', a: u.email, url: s?.url }); }
export async function sendPasswordResetEmail(_a, m, s) { await lento(); window.__fbsim.correos.push({ tipo: 'recuperar', a: m, url: s?.url }); }
export async function reload(u) { await lento(); auth.currentUser = hacerUser(u.email); }
export async function reauthenticateWithCredential(u, cr) { await lento(); if (cuentas()[u.email].pass !== cr.password) throw err('auth/invalid-credential'); }
export async function updatePassword(u, p) { const c = cuentas(); c[u.email].pass = p; guardar(c); }
export async function signOut() { localStorage.removeItem('fb-sim-sesion'); auth.currentUser = null; avisar(); }
