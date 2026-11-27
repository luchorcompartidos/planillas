// Referencias de celda (A1, B12, …) compartidas por la grilla y por importar/exportar.
export function colName(c) {
  let s = '';
  let n = c + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
export function parseRef(text) {
  const m = /^\s*([A-Za-z]{1,3})\s*(\d{1,7})\s*$/.exec(text || '');
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: parseInt(m[2], 10) - 1, c: c - 1 };
}
export const ref = (r, c) => colName(c) + (r + 1);
export const NUM_RE = /^[-+]?(\d+([.,]\d*)?|[.,]\d+)(e[-+]?\d+)?%?$/i;
export const isNum = (v) => v !== '' && v != null && NUM_RE.test(String(v).trim());
