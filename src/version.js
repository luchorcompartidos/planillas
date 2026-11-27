// Estándar de versión: número en el encabezado; al tocarlo, fecha del archivo más reciente
// de la Release y link al Changelog. Aviso cuando hay una versión nueva. Copia offline en localStorage.
/* global __APP_VERSION__ */
export const REPO = 'luchorcompartidos/planillas';
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';
export const CHANGELOG_URL = `https://github.com/${REPO}/releases`;
const CACHE_KEY = 'planillas-release-cache';

export async function getLatestRelease() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const assets = j.assets || [];
    const apk = assets.find((a) => a.name.endsWith('.apk'));
    const newest = assets.reduce((m, a) => (!m || a.updated_at > m ? a.updated_at : m), null);
    const info = {
      tag: j.tag_name,
      url: j.html_url,
      fileDate: newest || j.published_at,
      apk: apk ? apk.browser_download_url : null,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(info));
    return info;
  } catch {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
  }
}

const parse = (v) => String(v || '').replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);

export function isNewer(tag, current = APP_VERSION) {
  if (!tag) return false;
  const a = parse(tag); const b = parse(current);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}

export function formatDate(iso) {
  if (!iso) return 'sin datos';
  try {
    return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}
