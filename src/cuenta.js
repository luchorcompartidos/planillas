// Cuenta (Etapa 2a): inicio de sesión con correo y contraseña de Firebase, la misma cuenta de ANote...
// (proyecto notas-pro-2026). Solo el SDK web de Firebase Auth: sin plugin nativo, así que anda igual en la web
// y en el APK (también en Android 5, sin depender de Play services). Google llega en otro paso.
// Esta etapa no escribe nada en Firestore (en particular, no toca directory/{uid} de ANote...).
// Copiado y achicado de src/firebase.js del repo notas.
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, EmailAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, reload, reauthenticateWithCredential, updatePassword, onAuthStateChanged, signOut,
} from 'firebase/auth';
import { firebaseConfig } from './firebase-config.js';

let auth = null;
// Sin resolver de ventanas emergentes (no hace falta para correo y contraseña): no carga el iframe de
// Firebase, que dentro del WebView del APK no anda. La sesión queda en IndexedDB (o localStorage).
export function fbAuth() {
  if (!auth) {
    const app = initializeApp(firebaseConfig);
    auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    auth.languageCode = 'es'; // correos de verificación y de recuperación en castellano
  }
  return auth;
}

export const watchAuth = (cb) => onAuthStateChanged(fbAuth(), cb);
export const currentUser = () => fbAuth().currentUser;

// Al tocar el link del correo, la página de Firebase ofrece "Continuar" y vuelve a Planillas.
const ACTION_SETTINGS = { url: 'https://luchorcompartidos.github.io/planillas/' };
async function withAction(fn) {
  try { return await fn(ACTION_SETTINGS); } catch (e) {
    if (/unauthorized-continue-uri|invalid-continue-uri|missing-continue-uri/.test(e?.code || '')) return fn(undefined);
    throw e;
  }
}

export const norm = (e) => String(e || '').trim().toLowerCase();
const providerIds = (user) => (user?.providerData || []).map((p) => p.providerId);
export const hasGoogle = (user) => providerIds(user).includes('google.com');
export const hasPassword = (user) => providerIds(user).includes('password');

export const signInEmail = (email, password) => signInWithEmailAndPassword(fbAuth(), norm(email), password);

export async function signUpEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(fbAuth(), norm(email), password);
  try { await updateProfile(cred.user, { displayName: name }); } catch (e) { console.warn('Nombre visible', e); }
  try { await sendVerification(cred.user); } catch (e) { console.warn('Correo de verificación', e); }
  return cred;
}

export const sendVerification = (user = currentUser()) => withAction((s) => sendEmailVerification(user, s));
export const resetPassword = (email) => withAction((s) => sendPasswordResetEmail(fbAuth(), norm(email), s));
export const setDisplayName = (name) => updateProfile(currentUser(), { displayName: name });

// Vuelve a leer la cuenta del servidor (por ejemplo, para ver si ya verificó el correo).
export async function refreshUser() {
  const user = currentUser();
  if (!user) return null;
  await reload(user);
  await user.getIdToken(true);
  return currentUser();
}

// Cambiar la contraseña: se confirma la actual (reautenticar) y se pone la nueva. Firebase cierra las sesiones de
// los otros dispositivos (al renovar su token, hasta 1 hora), también las de ANote...: es la misma cuenta.
export async function changePassword(current, next) {
  const user = currentUser();
  const email = norm((user.providerData || []).find((p) => p.providerId === 'password')?.email || user.email);
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, current));
  await updatePassword(user, next);
  await user.getIdToken(true);
  return currentUser();
}

// Contraseña fuerte (la misma regla que ANote...): 10 caracteres o más, con letras y números, sin el correo.
export function passwordProblem(password, email = '') {
  const p = String(password || '');
  if (p.length < 10) return 'La contraseña tiene que tener 10 caracteres o más.';
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(p) || !/\d/.test(p)) return 'La contraseña tiene que tener letras y números.';
  const user = norm(email).split('@')[0];
  if (user && p.toLowerCase().includes(user)) return 'La contraseña no puede contener tu correo.';
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|abcdefghij|qwertyuiop)/i.test(p)) return 'La contraseña es muy fácil de adivinar.';
  return null;
}

export const signOutUser = () => signOut(fbAuth());

export function authErrorMessage(e) {
  const code = e?.code || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(code)) {
    return 'Correo o contraseña incorrectos. Si en ANote... entrás con Google, en Planillas todavía no se puede (llega en una próxima versión).';
  }
  if (code === 'auth/network-request-failed') return 'Sin conexión: probá de nuevo cuando tengas internet.';
  if (code === 'auth/invalid-email') return 'El correo no es válido.';
  if (code === 'auth/missing-password') return 'Falta la contraseña.';
  if (code === 'auth/email-already-in-use') return 'Ya hay una cuenta con ese correo (puede ser la de ANote...): usá «Entrar» o «Olvidé mi contraseña».';
  if (code === 'auth/weak-password') return 'La contraseña es muy débil.';
  if (code === 'auth/too-many-requests') return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
  if (code === 'auth/user-disabled') return 'Esta cuenta está inhabilitada.';
  if (code === 'auth/requires-recent-login') return 'Por seguridad, cerrá sesión, volvé a entrar y repetí el cambio.';
  if (code === 'auth/operation-not-allowed') return 'El inicio con correo no está habilitado en Firebase.';
  return `No se pudo completar: ${e?.message || code || 'error desconocido'}`;
}
