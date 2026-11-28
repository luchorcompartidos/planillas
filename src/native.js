// Integración con Android (copiado y achicado de ANote...). En la web estas funciones no hacen nada.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = Capacitor.isNativePlatform();
const safe = (p) => { try { p?.catch?.(() => {}); } catch { /* nada */ } };

export function initNative({ onBack }) {
  document.documentElement.classList.toggle('native', isNative);
  if (!isNative) return;
  App.addListener('backButton', () => onBack());
  safe(StatusBar.setOverlaysWebView({ overlay: false }));
  // Con el teclado abierto se esconde la barra inferior (deja más lugar a la grilla)
  safe(Keyboard.addListener('keyboardWillShow', () => document.documentElement.classList.add('kb-open')));
  safe(Keyboard.addListener('keyboardWillHide', () => document.documentElement.classList.remove('kb-open')));
}

export function setStatusBar(hexColor, dark) {
  if (!isNative) return;
  safe(StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }));
  safe(StatusBar.setBackgroundColor({ color: hexColor }));
}

export function minimizeApp() {
  if (!isNative) return;
  App.minimizeApp().catch(() => App.exitApp());
}

// Android y WebView (Chromium) del equipo: sirve para saber si una tablet vieja tiene la WebView actualizada.
export function deviceInfo() {
  const ua = navigator.userAgent;
  const android = (/Android ([\d.]+)/.exec(ua) || [])[1];
  const chrome = (/Chrome\/(\d+)/.exec(ua) || [])[1];
  if (!android) return '';
  return `Android ${android}${chrome ? ` · ${isNative ? 'WebView' : 'Chrome'} ${chrome}` : ''}`;
}

// Entregar un archivo exportado: en la web se descarga; en Android se guarda en el caché de la app y se abre
// "Guardar o enviar" (Drive, Archivos, WhatsApp, correo…), como en ANote... Devuelve 'downloaded', 'shared' o 'cancel'.
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
export async function deliverFile(filename, blob) {
  if (isNative) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title: filename, dialogTitle: 'Guardar o enviar', files: [res.uri] });
    } catch (e) {
      if (/cancel/i.test(e?.message || '')) return 'cancel';
      throw e;
    }
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return 'downloaded';
}

// Portapapeles del sistema (copiar y pegar celdas). En el APK se usa el plugin propio "Portapapeles"
// (android-extra/java/PortapapelesPlugin.java, copiado de ANote...): la WebView no deja leer el portapapeles
// desde JavaScript. ClipboardManager existe desde Android 3: anda en Android 5.
const Portapapeles = registerPlugin('Portapapeles');
export async function clipboardWrite(text) {
  if (isNative) {
    try { await Portapapeles.escribir({ texto: text }); return true; } catch { /* se prueba lo de la web */ }
  }
  try { await navigator.clipboard.writeText(text); return true; } catch { /* sin permiso */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
// Texto del portapapeles, o null si no se puede leer (en la web, el navegador puede pedir permiso o negarlo).
export async function clipboardRead() {
  if (isNative) {
    try { const r = await Portapapeles.leer(); return r?.texto ?? ''; } catch { /* se prueba lo de la web */ }
  }
  try { return await navigator.clipboard.readText(); } catch { return null; }
}
