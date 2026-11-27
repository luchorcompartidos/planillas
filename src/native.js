// Integración con Android (copiado y achicado de ANote...). En la web estas funciones no hacen nada.
import { Capacitor } from '@capacitor/core';
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
