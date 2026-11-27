import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';

// La versión la calcula el workflow desde los tags (vX.Y.Z) y la pasa como VITE_APP_VERSION.
const version = process.env.VITE_APP_VERSION || '0.0.0-dev';

// Service worker para que la web abra sin conexión: guarda todos los archivos de la versión.
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = new Set(['./', './index.html']);
      // Las librerías grandes (exportar/importar) se guardan recién cuando se usan
      Object.entries(bundle).forEach(([f, item]) => {
        const size = item.code ? item.code.length : (item.source?.length || 0);
        if (size < 400000) files.add(`./${f}`);
      });
      try { readdirSync('public').forEach((f) => files.add(`./${f}`)); } catch { /* sin carpeta public */ }
      files.delete('./sw.js');
      const source = `/* Planillas ${version}: archivos de la app para usarla sin conexión */
const CACHE = 'planillas-${version}';
const FILES = ${JSON.stringify([...files])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('planillas-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Página: primero la red (para tener la última versión); sin conexión, la guardada
    e.respondWith(fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put('./index.html', res.clone())); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './', // rutas relativas: sirve igual en GitHub Pages (/planillas/) y dentro del APK
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    {
      name: 'app-version',
      transformIndexHtml: (html) => html.replaceAll('__APP_VERSION__', version),
    },
    serviceWorker(),
  ],
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 4000 },
});
