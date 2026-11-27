// Importar y exportar planillas: Excel (.xlsx, con ExcelJS) y CSV.
// No depende de Android: entregar el archivo (descargar o compartir/guardar) está en native.js.
// Archivo = { id, name, created, updated, rows, cols,
//   cells:  { "A1": "texto" },                 lo que se ve (números con punto o coma, fechas dd/mm/aaaa)
//   styles: { "A1": { b, i, u, s, fc, bg, fn, fs, ha, va, wr, bd: { t, r, b, l: { st, c } }, nf } },
//   colW:   { 0: ancho en caracteres de Excel },  rowH: { 0: alto en puntos } }
import { parseRef, ref, NUM_RE } from './refs.js';

export const MAX_ROWS = 10000;
export const MAX_COLS = 702; // hasta la columna ZZ (como el cuadro de nombre)

// ExcelJS pesa ~1 MB: se carga recién al importar o exportar un .xlsx
async function loadExcel() {
  const mod = await import('exceljs');
  return mod.default || mod;
}

/* ---------- Números y fechas ---------- */
const numStr = (n) => String(Number(n.toPrecision(15)));

// Texto → número (o null si debe quedar como texto). "3,5" y "3.5" son 3.5; "50%" es 0.5.
// Quedan como texto: ceros adelante ("00123"), con + adelante o más de 15 dígitos (teléfonos, CBU) y vacíos.
export function toNumber(text) {
  const t = String(text ?? '').trim();
  if (!NUM_RE.test(t)) return null;
  if (/^[-+]?0\d/.test(t) || t[0] === '+') return null;
  if ((t.split(/e/i)[0].match(/\d/g) || []).length > 15) return null;
  const pct = t.endsWith('%');
  let n = Number(t.replace('%', '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (pct) n = Number((n / 100).toPrecision(15));
  return { n, pct };
}

const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

// Texto "dd/mm/aaaa [hh:mm[:ss]]" o "hh:mm[:ss]" → fecha de Excel (en UTC, como la lee y escribe ExcelJS)
export function toDate(text) {
  const t = String(text ?? '').trim();
  let m = DATE_RE.exec(t);
  if (m) {
    const [d, mo, y, h = 0, mi = 0, s = 0] = m.slice(1).map((x) => (x == null ? 0 : +x));
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
    const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    if (date.getUTCDate() !== d) return null; // 31/02 y similares
    return { date, nf: m[4] != null ? (m[6] != null ? 'dd/mm/yyyy hh:mm:ss' : 'dd/mm/yyyy hh:mm') : 'dd/mm/yyyy' };
  }
  m = TIME_RE.exec(t);
  if (m) {
    const [h, mi, s = 0] = m.slice(1).map((x) => (x == null ? 0 : +x));
    if (h > 23 || mi > 59 || s > 59) return null;
    return { date: new Date(Date.UTC(1899, 11, 30, h, mi, s)), nf: m[3] != null ? 'hh:mm:ss' : 'hh:mm' };
  }
  return null;
}
function fmtDate(d) {
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${d.getUTCSeconds() ? `:${pad(d.getUTCSeconds())}` : ''}`;
  if (d.getUTCFullYear() < 1900) return time; // solo hora (Excel la guarda como 30/12/1899)
  const day = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds() ? `${day} ${time}` : day;
}
const isPctFormat = (nf) => !!nf && /%/.test(nf.replace(/"[^"]*"|\\./g, ''));

/* ---------- Colores de Excel (rgb, tema e índice viejo) ---------- */
const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
const INDEXED = ('000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF '
  + '800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF '
  + '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 '
  + '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333').split(' ');

function tint(hex, t) {
  if (!t) return hex;
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let h = 0; let s = 0; let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = t < 0 ? l * (1 + t) : l * (1 - t) + t;
  const f = (p, q, x) => { if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
    r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
  }
  return [r, g, b].map((x) => pad(Math.round(x * 255).toString(16)).toUpperCase()).join('');
}
function colorOf(c) {
  if (!c) return null;
  let hex = null;
  if (typeof c.argb === 'string' && /^[0-9a-f]{6,8}$/i.test(c.argb)) hex = c.argb.slice(-6).toUpperCase();
  else if (c.theme != null && THEME[c.theme]) hex = THEME[c.theme];
  else if (c.indexed != null && INDEXED[c.indexed]) hex = INDEXED[c.indexed];
  if (!hex) return null;
  return `#${tint(hex, c.tint || 0)}`;
}
const argb = (hex) => ({ argb: `FF${hex.replace('#', '').toUpperCase()}` });

/* ---------- Estilo de una celda ---------- */
const SIDES = { t: 'top', r: 'right', b: 'bottom', l: 'left' };

function readStyle(cell, def, lost) {
  const st = {};
  const f = cell.font || {};
  if (f.bold) st.b = 1;
  if (f.italic) st.i = 1;
  if (f.underline && f.underline !== 'none') st.u = f.underline === true || f.underline === 'single' ? 1 : f.underline;
  if (f.strike) st.s = 1;
  const fc = colorOf(f.color);
  if (fc && fc !== '#000000') st.fc = fc;
  if (f.name && f.name !== def.name) st.fn = f.name;
  if (f.size && f.size !== def.size) st.fs = f.size;
  const fill = cell.fill;
  if (fill && fill.type === 'pattern' && fill.pattern && fill.pattern !== 'none') {
    const bg = colorOf(fill.fgColor) || colorOf(fill.bgColor);
    if (bg) st.bg = bg;
    if (fill.pattern !== 'solid') lost.patterns++;
  } else if (fill && fill.type === 'gradient') {
    const bg = colorOf(fill.stops?.[0]?.color);
    if (bg) st.bg = bg;
    lost.gradients++;
  }
  const a = cell.alignment || {};
  if (a.horizontal && a.horizontal !== 'general') st.ha = a.horizontal;
  if (a.vertical && a.vertical !== 'bottom') st.va = a.vertical;
  if (a.wrapText) st.wr = 1;
  if (a.textRotation || a.indent) lost.rotation++;
  const bd = {};
  for (const [k, side] of Object.entries(SIDES)) {
    const b = cell.border?.[side];
    if (b && b.style) bd[k] = { st: b.style, c: colorOf(b.color) || '#000000' };
  }
  if (Object.keys(bd).length) st.bd = bd;
  if (cell.border?.diagonal?.style && (cell.border.diagonal.up || cell.border.diagonal.down)) lost.diagonal++;
  if (cell.numFmt && cell.numFmt !== 'General') st.nf = cell.numFmt;
  return Object.keys(st).length ? st : null;
}

function readValue(v, cell, lost) {
  if (v == null) return '';
  if (typeof v === 'number') return isPctFormat(cell.numFmt) ? `${numStr(v * 100)}%` : numStr(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : fmtDate(v);
  if (typeof v === 'object') {
    if (v.formula != null || v.sharedFormula != null) { lost.formulas++; return readValue(v.result, cell, lost); }
    if (v.richText) {
      if (v.richText.filter((r) => r.font).length > 1) lost.rich++;
      return v.richText.map((r) => r.text).join('');
    }
    if (v.hyperlink != null) { lost.links++; return typeof v.text === 'string' ? v.text : readValue(v.text, cell, lost); }
    if (v.error) return v.error;
  }
  return String(v);
}

/* ---------- Importar ---------- */
function emptyLost() {
  return {
    formulas: 0, merges: 0, images: 0, charts: 0, pivots: 0, macros: 0, tables: 0, condFormats: 0, validations: 0,
    notes: 0, notesAny: 0, links: 0, rich: 0, hiddenRows: 0, hiddenCols: 0, frozen: 0, patterns: 0, gradients: 0, rotation: 0,
    diagonal: 0, truncRows: 0, truncCols: 0, sheets: 0,
  };
}

// Lo que no se pudo traer tal cual, en frases cortas para el aviso
export function lostMessages(lost) {
  const out = [];
  const add = (n, one, many) => { if (n) out.push(n === 1 ? one : many.replace('#', n)); };
  add(lost.sheets, '', 'El libro tiene # hojas: cada una quedó como una planilla aparte.');
  add(lost.truncRows, 'Se importaron solo las primeras 10.000 filas.', 'Se importaron solo las primeras 10.000 filas.');
  add(lost.truncCols, 'Se importaron solo las columnas hasta la ZZ.', 'Se importaron solo las columnas hasta la ZZ.');
  add(lost.formulas, '1 fórmula: quedó su último resultado (las fórmulas todavía no están en la app).', '# fórmulas: quedó su último resultado (las fórmulas todavía no están en la app).');
  add(lost.merges, '1 grupo de celdas combinadas: se separó (el contenido queda en la primera).', '# grupos de celdas combinadas: se separaron (el contenido queda en la primera).');
  add(lost.charts, 'Gráficos: no se importan.', 'Gráficos: no se importan.');
  add(lost.pivots, 'Tablas dinámicas: queda solo lo que se veía (como texto y números).', 'Tablas dinámicas: queda solo lo que se veía (como texto y números).');
  add(lost.macros, 'Macros: no se importan.', 'Macros: no se importan.');
  add(lost.images, '1 imagen: no se importa.', '# imágenes: no se importan.');
  add(lost.tables, 'Formato de "tabla" de Excel (franjas y filtros): no se importa; los datos sí.', 'Formato de "tabla" de Excel (franjas y filtros): no se importa; los datos sí.');
  add(lost.condFormats, 'Formato condicional: no se importa.', 'Formato condicional (# reglas): no se importa.');
  add(lost.validations, 'Validación de datos (listas desplegables): no se importa.', 'Validación de datos (listas desplegables): no se importa.');
  add(lost.notes, '1 comentario: no se importa.', '# comentarios: no se importan.');
  add(lost.notesAny, 'Comentarios: no se importan.', '');
  add(lost.links, '1 hipervínculo: queda solo el texto.', '# hipervínculos: queda solo el texto.');
  add(lost.rich, '1 celda con varios formatos dentro del texto: queda un solo formato.', '# celdas con varios formatos dentro del texto: queda un solo formato.');
  add(lost.hiddenRows, '1 fila oculta: ahora se ve.', '# filas ocultas: ahora se ven.');
  add(lost.hiddenCols, '1 columna oculta: ahora se ve.', '# columnas ocultas: ahora se ven.');
  add(lost.frozen, 'Filas o columnas inmovilizadas: no se importan.', 'Filas o columnas inmovilizadas: no se importan.');
  add(lost.patterns + lost.gradients, '1 relleno con trama o degradé: quedó como color liso.', '# rellenos con trama o degradé: quedaron como color liso.');
  add(lost.rotation, '1 celda con texto girado o con sangría: quedó derecho.', '# celdas con texto girado o con sangría: quedaron derechas.');
  add(lost.diagonal, '1 borde diagonal: no se importa.', '# bordes diagonales: no se importan.');
  return out.filter(Boolean);
}

// Busca nombres de partes dentro del zip (los nombres van sin comprimir): gráficos, tablas dinámicas, macros…
function zipParts(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  const has = (s) => text.indexOf(s) >= 0;
  return {
    charts: has('xl/charts/chart'), pivots: has('xl/pivotTables/'), macros: has('vbaProject.bin'), tables: has('xl/tables/table'),
    comments: has('xl/comments'),
  };
}

// Copia del .xlsx que ExcelJS sí puede leer: sin dibujos (imágenes, gráficos, formas) ni comentarios, que la app
// no usa (ExcelJS solo los entiende en las rutas que escribe Excel),
// y con las rutas absolutas de los .rels ("/xl/comments/…", como las escribe openpyxl) pasadas a relativas.
function relPath(fromDir, target) {
  const from = fromDir.split('/').filter(Boolean);
  const to = target.split('/').filter(Boolean);
  while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
  return [...from.map(() => '..'), ...to].join('/');
}
async function withoutDrawings(buffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  for (const n of Object.keys(zip.files)) {
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(n)) {
      const xml = await zip.file(n).async('string');
      zip.file(n, xml.replace(/<(drawing|legacyDrawing|legacyDrawingHF)\b[^>]*\/>/g, ''));
    } else if (/^xl\/.*_rels\/[^/]+\.rels$/.test(n)) {
      const dir = n.replace(/_rels\/[^/]+$/, '');
      let xml = await zip.file(n).async('string');
      if (n.startsWith('xl/worksheets/')) xml = xml.replace(/<Relationship\b[^>]*\/(drawing|vmlDrawing|comments)"[^>]*\/>/g, '');
      zip.file(n, xml.replace(/Target="\/([^"]+)"/g, (m, t) => `Target="${relPath(dir, t)}"`));
    } else if (/^xl\/(drawings|charts|comments)/.test(n)) zip.remove(n);
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

const isZip = (b) => b[0] === 0x50 && b[1] === 0x4b;
const isOle = (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

export class ImportError extends Error {}

// Devuelve { files: [ { name, rows, cols, cells, styles, colW, rowH } ], lost: [...frases] }
export async function importXlsx(buffer, baseName) {
  const bytes = new Uint8Array(buffer);
  if (isOle(bytes)) throw new ImportError('Es un archivo .xls viejo o un .xlsx con contraseña. Abrilo en Excel o Google Sheets, guardalo como .xlsx (sin contraseña) y volvé a importarlo.');
  if (!isZip(bytes)) throw new ImportError('El archivo no es un .xlsx válido.');
  const ExcelJS = await loadExcel();
  let wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (e) {
    // ExcelJS no puede con algunos dibujos (gráficos de openpyxl, formas): se reintenta sin ellos
    try {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await withoutDrawings(buffer));
    } catch {
      throw new ImportError(`No se pudo leer el .xlsx (${e?.message || e}). Probá abrirlo y guardarlo de nuevo en Excel o Google Sheets.`);
    }
  }
  const lost = emptyLost();
  const parts = zipParts(bytes);
  lost.charts = +parts.charts; lost.pivots = +parts.pivots; lost.macros = +parts.macros; lost.tables = +parts.tables;
  const sheets = wb.worksheets.filter((ws) => ws.state !== 'veryHidden');
  if (sheets.length > 1) lost.sheets = sheets.length;
  const files = sheets.map((ws) => readSheet(ws, sheets.length > 1 ? `${baseName} - ${ws.name}` : baseName, lost));
  if (parts.comments && !lost.notes) lost.notesAny = 1; // se sacaron al reintentar
  if (!files.length) throw new ImportError('El libro no tiene hojas.');
  return { files, lost: lostMessages(lost) };
}

function readSheet(ws, name, lost) {
  const file = { name, rows: 0, cols: 0, cells: {}, styles: {}, colW: {}, rowH: {} };
  const lastRow = Math.min(ws.rowCount, MAX_ROWS);
  if (ws.rowCount > MAX_ROWS) lost.truncRows++;
  // Fuente más usada = la normal del libro (no se guarda en cada celda)
  const fonts = {};
  for (let rn = 1; rn <= Math.min(lastRow, 300); rn++) {
    ws.findRow(rn)?.eachCell((cell) => { const f = cell.font || {}; const k = `${f.name}|${f.size}`; fonts[k] = (fonts[k] || 0) + 1; });
  }
  const top = Object.entries(fonts).sort((a, b) => b[1] - a[1])[0]?.[0]?.split('|') || [];
  const def = { name: top[0] && top[0] !== 'undefined' ? top[0] : 'Calibri', size: top[1] && top[1] !== 'undefined' ? +top[1] : 11 };
  const defH = ws.properties?.defaultRowHeight || 15;
  let mr = -1; let mc = -1;
  for (let rn = 1; rn <= lastRow; rn++) {
    const row = ws.findRow(rn);
    if (!row) continue;
    const r = rn - 1;
    if (row.height && Math.abs(row.height - defH) > 0.5) { file.rowH[r] = Math.round(row.height * 100) / 100; mr = Math.max(mr, r); }
    if (row.hidden) lost.hiddenRows++;
    const n = row.cellCount;
    if (n > MAX_COLS) lost.truncCols++;
    for (let cn = 1; cn <= Math.min(n, MAX_COLS); cn++) {
      const cell = row.findCell(cn);
      if (!cell) continue;
      if (cell.isMerged && cell.master !== cell) continue; // la combinada queda en la celda de arriba a la izquierda
      const c = cn - 1;
      const k = ref(r, c);
      const text = readValue(cell.value, cell, lost);
      const st = readStyle(cell, def, lost);
      if (cell.note) lost.notes++;
      if (text !== '') file.cells[k] = text;
      if (st) file.styles[k] = st;
      if (text !== '' || st) { mr = Math.max(mr, r); mc = Math.max(mc, c); }
    }
  }
  const lastCol = Math.min(Math.max(ws.columns?.length || 0, ws.columnCount || 0, mc + 1), MAX_COLS);
  for (let cn = 1; cn <= lastCol; cn++) {
    const col = ws.getColumn(cn);
    if (col.width) { file.colW[cn - 1] = Math.round(col.width * 100) / 100; mc = Math.max(mc, cn - 1); }
    if (col.hidden) lost.hiddenCols++;
  }
  lost.merges += Object.keys(ws._merges || {}).length;
  try { lost.images += ws.getImages().length; } catch { /* sin imágenes */ }
  lost.condFormats += (ws.conditionalFormattings || []).length;
  if (Object.keys(ws.dataValidations?.model || {}).length) lost.validations++;
  if ((ws.views || []).some((v) => v.state === 'frozen')) lost.frozen++;
  file.rows = mr + 1;
  file.cols = mc + 1;
  return file;
}

/* ---------- Exportar a .xlsx ---------- */
export function sheetName(name) {
  return String(name || '').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja1';
}
export const safeName = (t) => (String(t || '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 80) || 'planilla');

// Valor de Excel para un texto de la app (número, porcentaje, fecha, VERDADERO/FALSO o texto)
export function excelValue(text, nf) {
  if (text == null || text === '') return { value: null };
  const num = toNumber(text);
  if (num) return { value: num.n, nf: nf || (num.pct ? (/[.,]\d/.test(text) ? '0.00%' : '0%') : undefined) };
  const d = toDate(text);
  if (d) return { value: d.date, nf: nf || d.nf };
  if (text === 'VERDADERO' || text === 'FALSO') return { value: text === 'VERDADERO' };
  return { value: String(text) };
}

export async function toXlsx(file) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Planillas';
  wb.created = new Date(file.created || Date.now());
  wb.modified = new Date(file.updated || Date.now());
  const ws = wb.addWorksheet(sheetName(file.name));
  for (const [c, w] of Object.entries(file.colW || {})) ws.getColumn(+c + 1).width = w;
  for (const [r, h] of Object.entries(file.rowH || {})) ws.getRow(+r + 1).height = h;
  const styles = file.styles || {};
  const keys = new Set([...Object.keys(file.cells || {}), ...Object.keys(styles)]);
  for (const k of keys) {
    const p = parseRef(k);
    if (!p) continue;
    const cell = ws.getCell(p.r + 1, p.c + 1);
    const st = styles[k] || {};
    const { value, nf } = excelValue(file.cells[k], st.nf);
    if (value != null) cell.value = value;
    if (nf) cell.numFmt = nf;
    const font = {};
    if (st.b) font.bold = true;
    if (st.i) font.italic = true;
    if (st.u) font.underline = st.u === 1 ? true : st.u;
    if (st.s) font.strike = true;
    if (st.fc) font.color = argb(st.fc);
    if (st.fn) font.name = st.fn;
    if (st.fs) font.size = st.fs;
    if (Object.keys(font).length) cell.font = { name: 'Calibri', size: 11, ...font };
    if (st.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(st.bg) };
    if (st.ha || st.va || st.wr) {
      cell.alignment = { ...(st.ha ? { horizontal: st.ha } : {}), ...(st.va ? { vertical: st.va } : {}), ...(st.wr ? { wrapText: true } : {}) };
    }
    if (st.bd) {
      const border = {};
      for (const [s, side] of Object.entries(SIDES)) if (st.bd[s]) border[side] = { style: st.bd[s].st, color: argb(st.bd[s].c || '#000000') };
      cell.border = border;
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------- CSV ---------- */
function extent(file) {
  let mr = -1; let mc = -1;
  for (const k of Object.keys(file.cells || {})) {
    const p = parseRef(k);
    if (p) { mr = Math.max(mr, p.r); mc = Math.max(mc, p.c); }
  }
  return { mr, mc };
}

// sep ";" (Excel en español: decimales con coma) o "," (Google Sheets y otros: decimales con punto)
export function toCsv(file, sep = ';') {
  const { mr, mc } = extent(file);
  const lines = [];
  for (let r = 0; r <= mr; r++) {
    const row = [];
    for (let c = 0; c <= mc; c++) {
      let v = file.cells[ref(r, c)] || '';
      if (toNumber(v)) v = sep === ';' ? v.trim().replace('.', ',') : v.trim().replace(',', '.');
      if (/["\r\n]/.test(v) || v.includes(sep) || /^\s|\s$/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
      row.push(v);
    }
    lines.push(row.join(sep));
  }
  // BOM: así Excel abre bien los acentos y la ñ
  return new Blob([`﻿${lines.join('\r\n')}${lines.length ? '\r\n' : ''}`], { type: 'text/csv;charset=utf-8' });
}

export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); } catch {
    return new TextDecoder('windows-1252').decode(bytes); // CSV viejo de Excel en Windows
  }
}

// Separador más probable: el que aparece la misma cantidad de veces (y más de cero) en las primeras líneas
export function detectSep(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 10);
  let best = ','; let bestScore = -1;
  for (const s of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => l.replace(/"[^"]*"/g, '').split(s).length - 1);
    if (!counts.length || !counts[0]) continue;
    const same = counts.filter((n) => n === counts[0]).length;
    const score = same * 1000 + counts[0];
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

export function parseCsv(text, sep = detectSep(text)) {
  const rows = [];
  let row = []; let field = ''; let q = false; let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { q = true; i++; continue; }
    if (ch === sep) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return { rows, sep };
}

export function importCsv(buffer, baseName, isTsv = false) {
  const text = decodeText(buffer);
  const { rows, sep } = parseCsv(text, isTsv ? '\t' : undefined);
  const lost = emptyLost();
  const file = { name: baseName, rows: 0, cols: 0, cells: {}, styles: {}, colW: {}, rowH: {} };
  let mr = -1; let mc = -1;
  if (rows.length > MAX_ROWS) lost.truncRows++;
  rows.slice(0, MAX_ROWS).forEach((cols, r) => {
    if (cols.length > MAX_COLS) lost.truncCols++;
    cols.slice(0, MAX_COLS).forEach((v, c) => {
      if (v === '') return;
      file.cells[ref(r, c)] = v;
      mr = Math.max(mr, r); mc = Math.max(mc, c);
    });
  });
  file.rows = mr + 1; file.cols = mc + 1;
  return { files: [file], lost: lostMessages(lost), sep };
}

// Importa un archivo elegido por el usuario (.xlsx, .xlsm, .csv, .tsv, .txt)
export async function importAny(name, buffer) {
  const base = String(name || 'Importada').replace(/\.[^.]+$/, '') || 'Importada';
  const ext = (/\.([^.]+)$/.exec(name || '') || [])[1]?.toLowerCase() || '';
  const bytes = new Uint8Array(buffer.slice(0, 8));
  if (ext === 'ods' || ext === 'numbers') throw new ImportError(`Los .${ext} todavía no se importan: guardalo como .xlsx o .csv y volvé a importarlo.`);
  if (isZip(bytes) || isOle(bytes) || ext === 'xlsx' || ext === 'xlsm' || ext === 'xls') return importXlsx(buffer, base);
  return importCsv(buffer, base, ext === 'tsv');
}

