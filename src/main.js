// Planillas — Etapa 1d-2: en el Reporte, agrupar (subtotales y grupos plegables) y "Configurar vista" completa
// (apariencia, columnas, etiquetas y sus colores, filtros, orden, grupos y total), guardada en sheet.vista.
// Pestañas: Reporte (por defecto), Ficha, Grilla.
// Sobre la 1d-1b: en el Reporte, etiquetas de color, buscador, filtros rápidos y ordenar por columna.
// Sobre la 1d-1a: vista Reporte (tabla presentable) y selector Grilla / Reporte / Ficha.
// Sobre lo de la 1c (importar y exportar .xlsx y .csv) y la 1b (grilla completa, Ficha, archivos).
// Grilla: tocar para seleccionar y otra vez para editar en la barra de fórmula; insertar y borrar
// filas/columnas en el medio (menú de celda: mantener apretado, clic derecho o "Más…").
// Ficha: un registro por pantalla (fila 1 = nombres de campo). Archivos guardados en IndexedDB.
// Formato (de lo importado): negrita, colores, alineación, bordes, anchos y altos; todavía no se edita.
// Reporte: solo hasta la última fila y columna con datos, franjas, encabezado (fila 1) destacado, primera
// columna fija, barra de total y tema oscuro (por defecto) / claro / sistema. Tocar una fila abre la Ficha.
// Cada planilla recuerda su vista (sheet.view); las importadas abren en Reporte.
import './styles.css';
import { APP_VERSION, CHANGELOG_URL, getLatestRelease, isNewer, formatDate } from './version.js';
import { initNative, isNative, setStatusBar, minimizeApp, deviceInfo, deliverFile } from './native.js';
import { colName, parseRef, ref, isNum } from './refs.js';
import { importAny, ImportError, toXlsx, toCsv, safeName, toNumber } from './transfer.js';
import {
  listFiles, getFile, putFile, deleteFile, newId, savePending, clearPending, recoverPending, storageKind,
} from './store.js';

const OLD_DRAFT_KEY = 'planillas-borrador-v1'; // borrador único de la v0.0.1/v0.0.2
const LAST_KEY = 'planillas-ultimo';
const VIEW_KEY = 'planillas-vista'; // vista única de la v0.0.3/v0.0.4 (solo se lee, para archivos sin vista propia)
const TEMA_KEY = 'planillas-tema-reporte';
const VIEWS = ['tabla', 'reporte', 'ficha'];
const MIN_ROWS = 50;
const MIN_COLS = 12;

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const wrap = $('grid-wrap');
const formula = $('formula');
const nameBox = $('name-box');
const ficha = $('ficha');
const fields = $('ficha-fields');
const reporte = $('reporte');
const repScroll = $('rep-scroll');

// ---------- Modelo ----------
// sheet = archivo abierto = { id, name, created, updated, rows, cols, cells: { "A1": "texto" },
//   styles: { "A1": { b, i, fc, bg, ha, bd, nf, … } }, colW: { 0: ancho Excel }, rowH: { 0: alto en puntos },
//   view: 'tabla' | 'reporte' | 'ficha', vista: { ajustes del Reporte, ver "Configurar vista" } }
// (detalle del formato en transfer.js)
let sheet = null;
let sel = { r: 0, c: 0 };
let editing = false;
let original = '';
let release = null;
let view = 'tabla';
let legacyView = 'tabla'; // vista para archivos de antes de la v0.0.5 (sin "view")
let repPos = null; // posición del reporte al irse a otra vista (para volver al mismo lugar)
let rec = 1; // fila (índice desde 0) del registro que muestra la Ficha; la fila 0 son los nombres de campo

const getCell = (r, c) => sheet.cells[ref(r, c)] || '';
function setCell(r, c, v) {
  const k = ref(r, c);
  if (v === '' || v == null) delete sheet.cells[k]; else sheet.cells[k] = v;
  save();
}
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// Última fila y columna con datos (-1 si la planilla está vacía)
function lastUsed() {
  let mr = -1; let mc = -1;
  for (const k of Object.keys(sheet.cells)) {
    const p = parseRef(k);
    if (!p) continue;
    if (p.r > mr) mr = p.r;
    if (p.c > mc) mc = p.c;
  }
  return { mr, mc };
}

// ---------- Guardado ----------
let saveTimer = 0;
let dirty = false;
let saving = Promise.resolve();
function save() {
  if (!sheet) return;
  sheet.updated = Date.now();
  saveQuiet();
}
// Guarda sin cambiar la fecha de modificación (por ejemplo, al cambiar de vista)
function saveQuiet() {
  if (!sheet) return;
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushNow, 300);
}
function flushNow() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!dirty || !sheet) return saving;
  dirty = false;
  const copy = JSON.parse(JSON.stringify(sheet));
  saving = saving.then(() => putFile(copy)).then(clearPending).catch(() => { dirty = true; snack('No se pudo guardar'); });
  return saving;
}
// Al salir de la app o cerrar la pestaña: copia sincrónica (por si IndexedDB no llega) y guardado
function onLeave() {
  commit();
  if (dirty && sheet) savePending(sheet);
  flushNow();
}
window.addEventListener('pagehide', onLeave);
document.addEventListener('visibilitychange', () => { if (document.hidden) onLeave(); });

// Deshacer la última operación grande (insertar/borrar filas o columnas, borrar registro)
let undoSnap = null;
function snapshot() {
  return JSON.stringify({ rows: sheet.rows, cols: sheet.cols, cells: sheet.cells, styles: sheet.styles, colW: sheet.colW, rowH: sheet.rowH, vista: sheet.vista });
}
function withUndo(text, fn) {
  commit();
  const snap = snapshot();
  const id = sheet.id;
  fn();
  save();
  refresh();
  undoSnap = { id, snap };
  snack(text, 'Deshacer', () => {
    if (!undoSnap || undoSnap.id !== sheet.id) return;
    delete sheet.vista;
    Object.assign(sheet, JSON.parse(undoSnap.snap));
    undoSnap = null;
    save(); refresh();
  });
}

// ---------- Filas y columnas en el medio ----------
// Inserta (delta +1) o borra (delta -1) en la posición "at" del eje 'r' (filas) o 'c' (columnas).
// Al borrar, el tamaño de la grilla no cambia (como en Excel); al insertar crece en uno.
// El contenido, el formato y los anchos/altos se mueven juntos.
function shift(axis, at, delta) {
  const move = (x) => (delta < 0 && x === at ? null : (delta > 0 ? x >= at : x > at) ? x + delta : x);
  const byCell = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const p = parseRef(k);
      if (!p) continue;
      const x = move(axis === 'r' ? p.r : p.c);
      if (x == null) continue;
      out[axis === 'r' ? ref(x, p.c) : ref(p.r, x)] = v;
    }
    return out;
  };
  const byIndex = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) { const x = move(+k); if (x != null) out[x] = v; }
    return out;
  };
  sheet.cells = byCell(sheet.cells);
  sheet.styles = byCell(sheet.styles);
  if (axis === 'r') sheet.rowH = byIndex(sheet.rowH); else { sheet.colW = byIndex(sheet.colW); shiftVista(move); }
  if (delta > 0) { if (axis === 'r') sheet.rows++; else sheet.cols++; }
}
const insertRow = (at) => withUndo(`Fila insertada (${at + 1})`, () => { shift('r', at, 1); });
const insertCol = (at) => withUndo(`Columna insertada (${colName(at)})`, () => { shift('c', at, 1); });
const deleteRow = (at) => withUndo(`Fila ${at + 1} borrada`, () => { shift('r', at, -1); });
const deleteCol = (at) => withUndo(`Columna ${colName(at)} borrada`, () => { shift('c', at, -1); });

// ---------- Dibujo de la grilla ----------
// Formato de una celda → CSS en línea (anchos de Excel en caracteres → px; altos en puntos → px)
const BORDER = {
  thin: '1px solid', hair: '1px dotted', dotted: '1px dotted', dashed: '1px dashed', dashDot: '1px dashed', dashDotDot: '1px dotted',
  medium: '2px solid', mediumDashed: '2px dashed', mediumDashDot: '2px dashed', mediumDashDotDot: '2px dotted', slantDashDot: '2px dashed',
  thick: '3px solid', double: '3px double',
};
const H_ALIGN = { left: 'left', center: 'center', right: 'right', justify: 'justify', fill: 'left', centerContinuous: 'center', distributed: 'justify' };
const V_ALIGN = { top: 'top', middle: 'middle', center: 'middle', bottom: 'bottom', justify: 'middle', distributed: 'middle' };
const SIDE = { t: 'top', r: 'right', b: 'bottom', l: 'left' };
const HEX = /^#[0-9A-F]{6}$/i;
const colPx = (w) => Math.max(16, Math.round(w * 7 + 5));
const rowPx = (h) => Math.max(14, Math.round((h * 4) / 3));
function cellCss(st, tall) {
  let s = '';
  if (st) {
    if (st.b) s += 'font-weight:700;';
    if (st.i) s += 'font-style:italic;';
    if (st.u || st.s) s += `text-decoration:${st.u ? 'underline' : ''}${st.s ? ' line-through' : ''};${/double/.test(st.u) ? 'text-decoration-style:double;' : ''}`;
    if (HEX.test(st.fc)) s += `color:${st.fc};`;
    if (HEX.test(st.bg)) s += `background:${st.bg};`;
    if (st.fn) s += `font-family:'${String(st.fn).replace(/['"\\<>;&]/g, '')}',system-ui,sans-serif;`;
    if (st.fs) s += `font-size:${+st.fs}pt;`;
    if (st.ha && H_ALIGN[st.ha]) s += `text-align:${H_ALIGN[st.ha]};`;
    if (st.va && V_ALIGN[st.va]) s += `vertical-align:${V_ALIGN[st.va]};`;
    if (st.wr) s += 'white-space:pre-wrap;word-break:break-word;';
    if (st.bd) {
      for (const [k, side] of Object.entries(SIDE)) {
        const b = st.bd[k];
        if (b && BORDER[b.st]) s += `border-${side}:${BORDER[b.st]} ${HEX.test(b.c) ? b.c : '#000'};`;
      }
    }
  }
  if (tall && !(st && st.va)) s += 'vertical-align:bottom;'; // fila con alto propio: abajo, como en Excel
  return s;
}

function render() {
  if (!sheet) return;
  const styles = sheet.styles || {};
  const colW = sheet.colW || {};
  const rowH = sheet.rowH || {};
  const wCss = [];
  let h = '<thead><tr><th class="corner"></th>';
  for (let c = 0; c < sheet.cols; c++) {
    const w = colW[c] != null ? colPx(colW[c]) : 0;
    wCss[c] = w ? `width:${w}px;min-width:${w}px;max-width:${w}px;` : '';
    h += `<th data-c="${c}"${w ? ` style="${wCss[c]}"` : ''}>${colName(c)}</th>`;
  }
  h += '</tr></thead><tbody>';
  for (let r = 0; r < sheet.rows; r++) {
    const hp = rowH[r] != null ? rowPx(rowH[r]) : 0;
    const hCss = hp ? `height:${hp}px;max-height:${hp}px;` : '';
    h += `<tr><th data-r="${r}"${hp ? ` style="${hCss}"` : ''}>${r + 1}</th>`;
    for (let c = 0; c < sheet.cols; c++) {
      const v = getCell(r, c);
      const css = wCss[c] + hCss + cellCss(styles[ref(r, c)], !!hp);
      h += `<td data-r="${r}" data-c="${c}"${isNum(v) ? ' class="num"' : ''}${css ? ` style="${css}"` : ''}>${esc(v)}</td>`;
    }
    h += '</tr>';
  }
  grid.innerHTML = h + '</tbody>';
  paintSelection();
}
const cellEl = (r, c) => grid.tBodies[0]?.rows[r]?.cells[c + 1] || null;

function paintCell(r, c) {
  const td = cellEl(r, c);
  if (!td) return;
  const v = getCell(r, c);
  td.textContent = v;
  td.classList.toggle('num', isNum(v));
}

function paintSelection() {
  grid.querySelectorAll('.sel, .on, .editing').forEach((el) => el.classList.remove('sel', 'on', 'editing'));
  const td = cellEl(sel.r, sel.c);
  if (td) { td.classList.add('sel'); td.classList.toggle('editing', editing); }
  grid.tHead?.rows[0].cells[sel.c + 1]?.classList.add('on');
  grid.tBodies[0]?.rows[sel.r]?.cells[0]?.classList.add('on');
  nameBox.value = ref(sel.r, sel.c);
  if (!editing) formula.value = getCell(sel.r, sel.c);
}

// Lleva la celda elegida a la vista, sin que la tapen los encabezados fijos
function scrollToSel() {
  const td = cellEl(sel.r, sel.c);
  if (!td) return;
  const headH = grid.tHead.offsetHeight;
  const numW = grid.tBodies[0].rows[0].cells[0].offsetWidth;
  const top = td.offsetTop; const left = td.offsetLeft;
  if (top - headH < wrap.scrollTop) wrap.scrollTop = top - headH;
  else if (top + td.offsetHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = top + td.offsetHeight - wrap.clientHeight;
  if (left - numW < wrap.scrollLeft) wrap.scrollLeft = left - numW;
  else if (left + td.offsetWidth > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = left + td.offsetWidth - wrap.clientWidth;
}

function select(r, c, { scroll = true } = {}) {
  if (editing) commit();
  r = Math.max(0, r); c = Math.max(0, c);
  // Ir más allá del final agrega filas/columnas (como en una planilla)
  let grow = false;
  if (r >= sheet.rows) { sheet.rows = r + 1; grow = true; }
  if (c >= sheet.cols) { sheet.cols = c + 1; grow = true; }
  if (grow) { save(); render(); }
  sel = { r, c };
  paintSelection();
  if (scroll) scrollToSel();
}

// ---------- Edición en la grilla ----------
function startEdit(initial) {
  if (!editing) { editing = true; original = getCell(sel.r, sel.c); }
  if (typeof initial === 'string') { formula.value = initial; liveUpdate(); }
  paintSelection();
  formula.focus();
  const n = formula.value.length;
  try { formula.setSelectionRange(n, n); } catch { /* tipo de campo sin selección */ }
}
function liveUpdate() {
  const td = cellEl(sel.r, sel.c);
  if (td) { td.textContent = formula.value; td.classList.toggle('num', isNum(formula.value)); }
}
function commit() {
  if (!editing) return;
  editing = false;
  setCell(sel.r, sel.c, formula.value);
  paintCell(sel.r, sel.c);
  paintSelection();
}
function cancel() {
  if (!editing) return;
  editing = false;
  formula.value = original;
  paintCell(sel.r, sel.c);
  paintSelection();
}

grid.addEventListener('click', (e) => {
  const td = e.target.closest('td');
  if (td) {
    const r = +td.dataset.r; const c = +td.dataset.c;
    const same = r === sel.r && c === sel.c && !editing;
    select(r, c, { scroll: false });
    if (same) startEdit(); // segundo toque en la misma celda: editar
    else if (!isTouch) wrap.focus({ preventScroll: true });
    return;
  }
  const th = e.target.closest('th');
  if (th && th.dataset.c != null) select(sel.r, +th.dataset.c);
  else if (th && th.dataset.r != null) select(+th.dataset.r, sel.c);
});
grid.addEventListener('dblclick', (e) => { if (e.target.closest('td')) startEdit(); });
// Menú de celda: mantener apretado (celular) o clic derecho (PC), sobre una celda o un encabezado
grid.addEventListener('contextmenu', (e) => {
  const cell = e.target.closest('td, th');
  if (!cell) return;
  e.preventDefault();
  const r = cell.dataset.r != null ? +cell.dataset.r : sel.r;
  const c = cell.dataset.c != null ? +cell.dataset.c : sel.c;
  if (cell.classList.contains('corner')) return;
  select(r, c, { scroll: false });
  openCellMenu(cell.tagName === 'TH' ? (cell.dataset.r != null ? 'fila' : 'columna') : 'celda');
});
let isTouch = false;
window.addEventListener('touchstart', () => { isTouch = true; }, { passive: true, once: true });

formula.addEventListener('focus', () => { if (!editing) { editing = true; original = getCell(sel.r, sel.c); paintSelection(); } });
formula.addEventListener('input', liveUpdate);
formula.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commit(); select(sel.r + 1, sel.c); if (isTouch) startEdit(); else wrap.focus({ preventScroll: true }); }
  else if (e.key === 'Tab') { e.preventDefault(); commit(); select(sel.r, sel.c + (e.shiftKey ? -1 : 1)); wrap.focus({ preventScroll: true }); }
  else if (e.key === 'Escape') { e.preventDefault(); cancel(); wrap.focus({ preventScroll: true }); }
});
formula.addEventListener('blur', () => commit());

nameBox.addEventListener('focus', () => nameBox.select());
nameBox.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const p = parseRef(nameBox.value);
  if (!p) { snack('Referencia no válida (ej.: B12)'); return; }
  if (p.r > 9999 || p.c > 701) { snack('Fuera del tamaño permitido'); return; }
  select(p.r, p.c);
  nameBox.blur();
});
nameBox.addEventListener('blur', () => { nameBox.value = ref(sel.r, sel.c); });

// Teclado físico (PC o tablet con teclado): flechas, Enter/F2 para editar, Supr para borrar, escribir reemplaza
wrap.addEventListener('keydown', (e) => {
  if (editing || e.ctrlKey || e.metaKey || e.altKey) return;
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (moves[e.key]) { e.preventDefault(); select(sel.r + moves[e.key][0], sel.c + moves[e.key][1]); }
  else if (e.key === 'Tab') { e.preventDefault(); select(sel.r, sel.c + (e.shiftKey ? -1 : 1)); }
  else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearCell(); }
  else if (e.key === 'ContextMenu') { e.preventDefault(); openCellMenu('celda'); }
  else if (e.key.length === 1) { e.preventDefault(); startEdit(e.key); }
});

function clearCell() {
  if (editing) cancel();
  setCell(sel.r, sel.c, '');
  paintCell(sel.r, sel.c);
  paintSelection();
}

// ---------- Botones ----------
// pointerdown + preventDefault: el botón no le saca el foco al campo de texto (no se cierra el teclado)
function tool(id, fn) {
  const b = typeof id === 'string' ? $(id) : id;
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('click', fn);
}
tool('btn-add-row', () => { commit(); sheet.rows++; save(); render(); select(sheet.rows - 1, sel.c); });
tool('btn-add-col', () => { commit(); sheet.cols++; save(); render(); select(sel.r, sheet.cols - 1); });
tool('btn-clear', clearCell);
tool('btn-more', () => openCellMenu('celda'));

function openCellMenu(focus) {
  commit();
  const { r, c } = sel;
  const fila = [
    { label: 'Insertar fila arriba', fn: () => insertRow(r) },
    { label: 'Insertar fila abajo', fn: () => insertRow(r + 1) },
    { label: `Borrar fila ${r + 1}`, fn: () => deleteRow(r), danger: true },
  ];
  const col = [
    { label: 'Insertar columna a la izquierda', fn: () => insertCol(c) },
    { label: 'Insertar columna a la derecha', fn: () => insertCol(c + 1) },
    { label: `Borrar columna ${colName(c)}`, fn: () => deleteCol(c), danger: true },
  ];
  const celda = [
    { label: `Borrar contenido de ${ref(r, c)}`, fn: clearCell, disabled: !getCell(r, c) },
    { label: r >= 1 ? `Ver fila ${r + 1} como ficha` : 'Ver como ficha', fn: () => setView('ficha') },
  ];
  const items = focus === 'columna' ? [...col, '-', ...fila, '-', ...celda]
    : focus === 'fila' ? [...fila, '-', ...col, '-', ...celda]
      : [...celda, '-', ...fila, '-', ...col];
  showMenu(focus === 'columna' ? `Columna ${colName(c)}` : focus === 'fila' ? `Fila ${r + 1}` : `Celda ${ref(r, c)}`, items);
}

// ---------- Vista Ficha ----------
function fieldCount() {
  const { mc } = lastUsed();
  return mc + 1; // 0 si la planilla está vacía
}
function renderFicha(focusCol, scrollOnly = false) {
  const { mr } = lastUsed();
  const n = fieldCount();
  const noNames = n > 0 && !Array.from({ length: n }, (_, c) => getCell(0, c)).some(Boolean);
  let h = '';
  for (let c = 0; c < n; c++) {
    const name = getCell(0, c);
    const v = getCell(rec, c);
    h += `<label class="field"><span class="field-name${name ? '' : ' sin-nombre'}">${esc(name || `Columna ${colName(c)}`)}<small>${colName(c)}${rec + 1}</small></span>`
      + `<input type="text" data-c="${c}" value="${esc(v)}" autocomplete="off" enterkeyhint="${c < n - 1 ? 'next' : 'done'}"${isNum(v) ? ' class="num"' : ''}></label>`;
  }
  fields.innerHTML = h;
  let head = '';
  if (n === 0) head = '<p class="ficha-hint">La planilla está vacía. Agregá el primer campo con <b>+ Campo</b> (su nombre va a la fila 1).</p>';
  else if (noNames) head = '<p class="ficha-hint">Los nombres de los campos son los de la <b>fila 1</b> de la tabla. Ponelos ahí (o con <b>+ Campo</b>).</p>';
  $('ficha-head').innerHTML = head;
  updateFichaNav(mr);
  if (focusCol != null) {
    const inp = fields.querySelector(`input[data-c="${focusCol}"]`);
    if (inp) {
      if (scrollOnly) inp.scrollIntoView({ block: 'center' });
      else { inp.focus({ preventScroll: true }); inp.scrollIntoView({ block: 'center' }); }
    }
  }
}
function updateFichaNav(mr = lastUsed().mr) {
  const total = Math.max(0, mr); // registros = filas 2..última con datos
  $('f-pos').textContent = rec <= total ? `Registro ${rec} de ${total}` : `Nuevo (fila ${rec + 1})`;
  $('f-prev').disabled = rec <= 1;
  $('f-next').disabled = rec >= total;
  $('f-del').disabled = rec > total;
}
fields.addEventListener('input', (e) => {
  const inp = e.target.closest('input[data-c]');
  if (!inp) return;
  const c = +inp.dataset.c;
  if (rec >= sheet.rows) sheet.rows = rec + 1;
  setCell(rec, c, inp.value);
  inp.classList.toggle('num', isNum(inp.value));
  updateFichaNav();
});
fields.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const inp = e.target.closest('input[data-c]');
  if (!inp) return;
  e.preventDefault();
  const next = fields.querySelector(`input[data-c="${+inp.dataset.c + 1}"]`);
  if (next) { next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'center' }); } else inp.blur();
});
let lastFieldCol = null; // último campo usado en la Ficha (para volver a la tabla en esa columna)
fields.addEventListener('focusin', (e) => { const c = e.target.dataset?.c; if (c != null) lastFieldCol = +c; });
const focusedField = () => {
  const a = document.activeElement;
  return a && a.closest && a.closest('#ficha-fields') && a.dataset.c != null ? +a.dataset.c : null;
};
function goRecord(r) {
  const fc = focusedField();
  rec = Math.max(1, r);
  if (rec >= sheet.rows) { sheet.rows = rec + 1; save(); }
  renderFicha(fc);
  if (fc == null) ficha.scrollTop = 0;
}
tool('f-prev', () => goRecord(rec - 1));
tool('f-next', () => goRecord(rec + 1));
tool('f-new', () => {
  const { mr } = lastUsed();
  if (fieldCount() === 0) { snack('Primero agregá un campo (+ Campo)'); return; }
  rec = Math.max(1, mr + 1);
  if (rec >= sheet.rows) { sheet.rows = rec + 1; save(); }
  renderFicha(0);
});
tool('f-del', async () => {
  const r = rec;
  const ok = await ask({ title: `¿Borrar el registro ${r}?`, text: `Se borra la fila ${r + 1} de la tabla y las de abajo suben.`, ok: 'Borrar', danger: true });
  if (!ok) return;
  withUndo(`Registro ${r} borrado`, () => { shift('r', r, -1); });
});
tool('btn-add-field', async () => {
  const name = await ask({ title: 'Campo nuevo', text: 'Nombre del campo (va a la fila 1, en la primera columna libre):', input: '', ok: 'Agregar' });
  if (name == null) return;
  const c = fieldCount();
  if (c >= sheet.cols) sheet.cols = c + 1;
  setCell(0, c, name.trim() || `Campo ${c + 1}`);
  renderFicha(c);
});

// ---------- Cambio de vista (Grilla / Reporte / Ficha) ----------
function setView(v) {
  if (v !== 'reporte') closeConfig();
  if (v === view || !VIEWS.includes(v)) return;
  if (view === 'tabla') commit();
  if (view === 'reporte') repPos = { top: repScroll.scrollTop, left: repScroll.scrollLeft };
  if (view === 'ficha') {
    const fc = focusedField() ?? lastFieldCol;
    if (document.activeElement) document.activeElement.blur?.();
    sel = { r: rec, c: fc != null ? fc : sel.c };
  }
  if (v === 'ficha') { rec = Math.max(1, sel.r); lastFieldCol = null; }
  view = v;
  if (sheet && sheet.view !== v) { sheet.view = v; saveQuiet(); }
  applyView();
}
function applyView() {
  const f = view === 'ficha'; const t = view === 'tabla'; const p = view === 'reporte';
  ficha.hidden = !f; $('ficha-bar').hidden = !f;
  wrap.hidden = !t; $('formula-bar').hidden = !t; $('grid-bar').hidden = !t;
  reporte.hidden = !p;
  document.querySelectorAll('#viewbar .vb').forEach((b) => {
    const on = b.dataset.v === view;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (f) { ficha.scrollTop = 0; renderFicha(sel.c < fieldCount() ? sel.c : null, true); }
  else if (t) { render(); select(sel.r, sel.c); }
  else {
    renderReport();
    if (repPos) { repScroll.scrollTop = repPos.top; repScroll.scrollLeft = repPos.left; } else { repScroll.scrollTop = 0; repScroll.scrollLeft = 0; }
  }
}
document.querySelectorAll('#viewbar .vb').forEach((b) => tool(b, () => setView(b.dataset.v)));

// ---------- Vista Reporte ----------
// Filas y columnas con datos (sin las vacías del medio). Fila 0 = encabezado (nombres, como en la Ficha).
function reportData() {
  const usedR = new Set(); const usedC = new Set();
  for (const k of Object.keys(sheet.cells)) {
    const p = parseRef(k);
    if (p && sheet.cells[k] !== '') { usedR.add(p.r); usedC.add(p.c); }
  }
  const cols = [...usedC].sort((a, b) => a - b);
  const rows = [...usedR].filter((r) => r > 0).sort((a, b) => a - b);
  return { cols, rows };
}
// Columna numérica: todos sus valores (sin el encabezado) son números (no porcentajes); al menos uno.
function numericCols(cols, rows) {
  const out = new Set();
  for (const c of cols) {
    let any = false; let ok = true;
    for (const r of rows) {
      const v = getCell(r, c);
      if (v === '') continue;
      const n = toNumber(v);
      if (!n || n.pct) { ok = false; break; }
      any = true;
    }
    if (ok && any) out.add(c);
  }
  return out;
}
const decimals = (v) => { const m = /[.,](\d+)/.exec(String(v).split(/e/i)[0]); return m ? m[1].length : 0; };
const fmtN = (n, min, max) => Number(n.toPrecision(15)).toLocaleString('es-AR', { minimumFractionDigits: min, maximumFractionDigits: max });
// Cálculo del total (y de los subtotales): suma, promedio, cantidad (celdas con dato), mínimo o máximo
const CALCULOS = { suma: 'Suma', promedio: 'Promedio', cantidad: 'Cantidad', min: 'Mínimo', max: 'Máximo' };
const CALC_TIT = { suma: 'Total', promedio: 'Promedio', cantidad: 'Cantidad', min: 'Mínimo', max: 'Máximo' };
function calcTotal(c, rows, kind) {
  let n = 0; let sum = 0; let d = 0; let mn = Infinity; let mx = -Infinity;
  for (const r of rows) {
    const v = getCell(r, c);
    if (v.trim() === '') continue;
    if (kind === 'cantidad') { n++; continue; }
    const x = toNumber(v);
    if (!x) continue;
    n++; sum += x.n; d = Math.max(d, decimals(v));
    if (x.n < mn) mn = x.n;
    if (x.n > mx) mx = x.n;
  }
  d = Math.min(d, 6);
  if (kind === 'cantidad') return n.toLocaleString('es-AR');
  if (!n) return '—';
  if (kind === 'promedio') return fmtN(sum / n, d, Math.max(d, 2));
  return fmtN(kind === 'min' ? mn : kind === 'max' ? mx : sum, d, d);
}

// ---------- Reporte: etiquetas, buscador, filtros, orden, grupos y Configurar vista (1d-1b y 1d-2) ----------
// Ajustes en el archivo: sheet.vista (todo opcional; lo que falta = automático). Ver DESARROLLO.md, sección 4.
//   { densidad, franjas, encabezado, acento, columnas: [{ c, visible }], fijarPrimera, etiquetas: [c], colores: { valor: 0..11 },
//     buscador, filtroCol (c | -1 = ninguno), orden: { c, dir }, agruparCol, subtotales, plegables, totalCol (c | -1), calculo,
//     barraTotal, resumen }
// En memoria (por planilla abierta): búsqueda, filtro rápido elegido y grupos plegados.
const TAGS = 12; // colores de etiqueta (paleta fija por tema en styles.css: .tag.t0 … .tag.t11)
const COLORES = ['Verde', 'Azul', 'Amarillo', 'Rosa', 'Violeta', 'Turquesa', 'Naranja', 'Rojo', 'Lima', 'Índigo', 'Marrón', 'Gris'];
const ACENTOS = { verde: 'Verde', azul: 'Azul', violeta: 'Violeta', naranja: 'Naranja', rojo: 'Rojo', gris: 'Gris' };
const VISTA_DEF = {
  densidad: 'comoda', franjas: true, encabezado: true, acento: 'verde', fijarPrimera: true, buscador: true,
  subtotales: true, plegables: true, calculo: 'suma', barraTotal: true, resumen: false,
};
const MAX_CHIPS = 60;
const cmpText = new Intl.Collator('es', { numeric: true, sensitivity: 'base' }).compare;
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const vopt = (k) => { const v = sheet.vista && sheet.vista[k]; return v === undefined ? VISTA_DEF[k] : v; };
const vget = (k) => (sheet.vista ? sheet.vista[k] : undefined);
// Guarda un ajuste (undefined = volver a lo automático). No cambia la fecha de modificación (como la vista).
function setVista(k, v) {
  if (!sheet.vista) sheet.vista = {};
  if (v === undefined || (k in VISTA_DEF && v === VISTA_DEF[k])) delete sheet.vista[k]; else sheet.vista[k] = v;
  if (!Object.keys(sheet.vista).length) delete sheet.vista;
  saveQuiet();
}
// Insertar/borrar columnas: los índices de la vista se mueven igual que las celdas (borrada = vuelve a automático)
function shiftVista(move) {
  const v = sheet.vista;
  if (!v) return;
  if (v.columnas) v.columnas = v.columnas.map((x) => ({ c: move(x.c), visible: x.visible })).filter((x) => x.c != null);
  if (v.etiquetas) v.etiquetas = v.etiquetas.map(move).filter((x) => x != null);
  for (const k of ['filtroCol', 'agruparCol', 'totalCol']) {
    if (v[k] == null || v[k] < 0) continue;
    const x = move(v[k]);
    if (x == null) delete v[k]; else v[k] = x;
  }
  if (v.orden) { const x = move(v.orden.c); if (x == null) delete v.orden; else v.orden = { c: x, dir: v.orden.dir }; }
}
let rq = { id: null, q: '', chip: null, plegados: new Set() };
function repState() {
  if (rq.id !== sheet.id) { rq = { id: sheet.id, q: '', chip: null, plegados: new Set() }; $('rep-q').value = ''; }
  return rq;
}
// Orden de las columnas: el elegido en Configurar vista; las que no están en la lista, en su lugar natural.
function orderedCols(cols) {
  const list = (vget('columnas') || []).filter((x) => cols.includes(x.c));
  const out = list.map((x) => x.c);
  for (const c of cols) {
    if (out.includes(c)) continue;
    let at = 0;
    out.forEach((x, i) => { if (x < c) at = i + 1; });
    out.splice(at, 0, c);
  }
  const hidden = new Set(list.filter((x) => x.visible === false).map((x) => x.c));
  return { all: out, shown: out.filter((c) => !hidden.has(c)) };
}
// Valores distintos (sin espacios de más) de una columna, en orden natural
function distinct(c, rows, max = Infinity) {
  const vals = new Set();
  for (const r of rows) {
    const v = getCell(r, c).trim();
    if (v) vals.add(v);
    if (vals.size > max) break;
  }
  return [...vals].sort(cmpText);
}
// Columna de etiquetas automática: la primera de texto con 2 a 12 valores distintos y al menos uno repetido.
function autoTagCol(cols, rows, nums) {
  for (const c of cols) {
    if (nums.has(c)) continue;
    const vals = new Set(); let n = 0;
    for (const r of rows) {
      const v = getCell(r, c).trim();
      if (!v) continue;
      n++; vals.add(v);
      if (vals.size > TAGS) break;
    }
    if (vals.size >= 2 && vals.size <= TAGS && vals.size < n) return c;
  }
  return null;
}
// Columnas como etiquetas (elegidas o la automática) → Map(c → { list, color: Map(valor → 0..11) }).
// Color: el elegido en vista.colores (por valor) o, si no hay, el del orden alfabético.
function tagInfo(cols, rows, nums) {
  const pick = vget('etiquetas');
  let tc;
  if (Array.isArray(pick)) tc = pick.filter((c) => cols.includes(c));
  else { const a = autoTagCol(cols, rows, nums); tc = a == null ? [] : [a]; }
  const fixed = vget('colores') || {};
  const out = new Map();
  for (const c of tc) {
    const list = distinct(c, rows);
    out.set(c, { list, color: new Map(list.map((v, i) => [v, fixed[v] != null ? fixed[v] % TAGS : i % TAGS])) });
  }
  return out;
}
function filterCol(cols, tags) {
  const f = vget('filtroCol');
  if (f === -1) return null;
  if (f != null) return cols.includes(f) ? f : null;
  return tags.size ? tags.keys().next().value : null;
}
function totalColOf(cols, nums) {
  const t = vget('totalCol');
  if (t === -1) return null;
  if (t != null) return cols.includes(t) ? t : null;
  const n = cols.filter((c) => nums.has(c));
  return n.length ? n[n.length - 1] : null;
}
function sortRows(rows, o, nums) {
  const isN = nums.has(o.c);
  const key = (r) => { const v = getCell(r, o.c).trim(); return v === '' ? null : isN ? toNumber(v).n : v; };
  return rows.map((r, i) => ({ r, k: key(r), i })).sort((a, b) => {
    if (a.k == null || b.k == null) return a.k == null && b.k == null ? a.i - b.i : a.k == null ? 1 : -1; // vacías al final
    const d = isN ? a.k - b.k : cmpText(a.k, b.k);
    return d ? d * o.dir : a.i - b.i;
  }).map((x) => x.r);
}
// Grupos por el valor de una columna. Orden de los grupos: el de las filas si se ordena por esa columna;
// si no, alfabético/numérico. "(Sin valor)" al final.
function groupRows(rows, g, nums, orden) {
  const map = new Map();
  for (const r of rows) {
    const v = getCell(r, g).trim();
    if (!map.has(v)) map.set(v, []);
    map.get(v).push(r);
  }
  let keys = [...map.keys()];
  if (!(orden && orden.c === g)) {
    const isN = nums.has(g);
    keys.sort((a, b) => (a === '' || b === '' ? (a === '' ? 1 : 0) - (b === '' ? 1 : 0) : isN ? toNumber(a).n - toNumber(b).n : cmpText(a, b)));
  } else keys = [...keys.filter((k) => k !== ''), ...keys.filter((k) => k === '')];
  return keys.map((k) => ({ v: k, rows: map.get(k) }));
}
function renderChips(fc, list, tags, counts) {
  const box = $('rep-chips');
  box.hidden = fc == null;
  if (fc == null) { box.innerHTML = ''; return; }
  const left = box.scrollLeft;
  const tag = tags.get(fc);
  let all = 0; counts.forEach((n) => { all += n; });
  let h = `<button type="button" class="chip${rq.chip == null ? ' on' : ''}" data-v="" aria-pressed="${rq.chip == null}">Todos <small>${all}</small></button>`;
  for (const v of list.slice(0, MAX_CHIPS)) {
    const on = rq.chip === v;
    h += `<button type="button" class="chip${tag ? ` tag t${tag.color.get(v)}` : ''}${on ? ' on' : ''}" data-v="${esc(v)}" aria-pressed="${on}">${esc(v)} <small>${counts.get(v) || 0}</small></button>`;
  }
  box.innerHTML = h;
  box.scrollLeft = left;
}
const colTitle = (c) => getCell(0, c) || `Columna ${colName(c)}`;
// Clases del contenedor del reporte según la vista (densidad, franjas, encabezado, acento)
function applyVistaClasses() {
  reporte.classList.toggle('compacta', vopt('densidad') === 'compacta');
  reporte.classList.toggle('sin-encab', !vopt('encabezado'));
  Object.keys(ACENTOS).forEach((a) => reporte.classList.toggle(`ac-${a}`, a !== 'verde' && vopt('acento') === a));
}
function renderReport() {
  const { cols: used, rows: all } = reportData();
  const table = $('rep-table'); const empty = $('rep-empty');
  const st = repState();
  applyVistaClasses();
  const herr = $('rep-herr');
  if (!used.length) {
    table.innerHTML = '';
    empty.innerHTML = 'La planilla está vacía. Cargá datos en <button type="button" class="rep-ir" data-go="ficha">Ficha</button> o en <button type="button" class="rep-ir" data-go="tabla">Grilla</button> (la fila 1 son los títulos de las columnas).';
    empty.hidden = false; herr.hidden = true;
    $('rep-total').textContent = 'Sin registros';
    return;
  }
  const { shown: cols } = orderedCols(used);
  const nums = numericCols(used, all);
  const tags = tagInfo(used, all, nums);
  const fc = filterCol(used, tags);
  const g = vget('agruparCol') != null && used.includes(vget('agruparCol')) ? vget('agruparCol') : null;
  const orden = vget('orden') && used.includes(vget('orden').c) ? vget('orden') : null;
  const fcList = fc == null ? [] : distinct(fc, all);
  if (fc == null || (st.chip != null && !fcList.includes(st.chip))) st.chip = null;
  const buscador = vopt('buscador');
  if (!buscador && st.q) { st.q = ''; $('rep-q').value = ''; }
  $('rep-q').hidden = !buscador;
  // Buscador (en las columnas visibles, sin distinguir mayúsculas ni acentos) y después el filtro rápido
  const q = fold(st.q.trim());
  let rows = q ? all.filter((r) => cols.some((c) => fold(getCell(r, c)).includes(q))) : all;
  const counts = new Map();
  if (fc != null) rows.forEach((r) => { const v = getCell(r, fc).trim(); if (v) counts.set(v, (counts.get(v) || 0) + 1); });
  renderChips(fc, fcList, tags, counts);
  if (st.chip != null) rows = rows.filter((r) => getCell(r, fc).trim() === st.chip);
  if (orden) rows = sortRows(rows, orden, nums);
  const tc = totalColOf(used, nums);
  const calc = vopt('calculo');
  const fija = vopt('fijarPrimera');
  const franjas = vopt('franjas');
  const cellHtml = (r, c) => {
    const v = getCell(r, c);
    const t = tags.get(c);
    if (!t || !v.trim()) return esc(v);
    return `<span class="tag ${c === g ? 'tn' : `t${t.color.get(v.trim())}`}">${esc(v)}</span>`;
  };
  const rowHtml = (r, k) => {
    let h = `<tr data-r="${r}"${franjas && k % 2 ? ' class="f"' : ''}>`;
    cols.forEach((c, i) => {
      const cls = `${i === 0 && fija ? 'fija' : ''}${nums.has(c) ? ' num' : ''}`.trim();
      h += `<td${cls ? ` class="${cls}"` : ''}><div>${cellHtml(r, c)}</div></td>`;
    });
    return `${h}</tr>`;
  };
  let h = '<thead><tr>';
  cols.forEach((c, i) => {
    const o = orden && orden.c === c ? orden.dir : 0;
    const cls = `${i === 0 && fija ? 'fija' : ''}${nums.has(c) ? ' num' : ''}${o ? ' ord' : ''}`.trim();
    h += `<th data-c="${c}"${cls ? ` class="${cls}"` : ''} aria-sort="${o > 0 ? 'ascending' : o < 0 ? 'descending' : 'none'}"><div>${esc(colTitle(c))}<i aria-hidden="true">${o > 0 ? '▲' : o < 0 ? '▼' : ''}</i></div></th>`;
  });
  h += '</tr></thead><tbody>';
  let groups = null;
  if (g != null && rows.length) {
    groups = groupRows(rows, g, nums, orden);
    const plegables = vopt('plegables');
    const sub = vopt('subtotales') && tc != null;
    groups.forEach((gr, gi) => {
      const closed = plegables && st.plegados.has(gr.v);
      const t = tags.get(g);
      const name = gr.v === '' ? '<i>(Sin valor)</i>' : t ? `<span class="tag t${t.color.get(gr.v)}">${esc(gr.v)}</span>` : `<b>${esc(gr.v)}</b>`;
      h += `<tr class="grupo${plegables ? ' plegable' : ''}" data-g="${gi}"><td colspan="${cols.length}"><div class="g-in">`
        + `${plegables ? `<span class="g-tog" aria-hidden="true">${closed ? '▸' : '▾'}</span>` : ''}${name}<small>${gr.rows.length}</small>`
        + `${sub ? `<span class="g-sub">${esc(CALC_TIT[calc])}: <b>${esc(calcTotal(tc, gr.rows, calc))}</b></span>` : ''}</div></td></tr>`;
      if (!closed) gr.rows.forEach((r, k) => { h += rowHtml(r, k); });
    });
  } else rows.forEach((r, k) => { h += rowHtml(r, k); });
  table.innerHTML = `${h}</tbody>`;
  renderReport.groups = groups;
  empty.hidden = rows.length > 0;
  if (!all.length) empty.innerHTML = 'Solo hay títulos (fila 1). Los registros van de la fila 2 para abajo.';
  else if (!rows.length) empty.innerHTML = 'Ningún registro coincide con la búsqueda o el filtro. <button type="button" class="rep-limpiar" id="rep-limpiar">Ver todos</button>';
  // Total de lo que se ve (columna y cálculo elegibles; automático = suma de la última columna numérica)
  const n = rows.length;
  const filtrado = n !== all.length;
  const regs = `${filtrado ? `${n} de ${all.length}` : n} ${(filtrado ? all.length : n) === 1 ? 'registro' : 'registros'}${groups ? ` · ${groups.length} ${groups.length === 1 ? 'grupo' : 'grupos'}` : ''}`;
  const totalTxt = tc != null ? calcTotal(tc, rows, calc) : null;
  $('rep-total').innerHTML = `<small>${regs}</small>`
    + (vopt('barraTotal') && tc != null ? `<span>${esc(CALC_TIT[calc])} ${esc(colTitle(tc))}: <b>${esc(totalTxt)}</b></span>` : '');
  const res = $('rep-resumen');
  res.hidden = !vopt('resumen') || !all.length;
  if (!res.hidden) {
    res.innerHTML = `<div class="rc"><small>Registros</small><b>${n.toLocaleString('es-AR')}</b></div>`
      + (tc != null ? `<div class="rc"><small>${esc(CALC_TIT[calc])} ${esc(colTitle(tc))}</small><b>${esc(totalTxt)}</b></div>` : '')
      + (groups ? `<div class="rc"><small>Grupos</small><b>${groups.length}</b></div>`
        : fc != null ? `<div class="rc"><small>${esc(colTitle(fc))}</small><b>${counts.size}</b></div>` : '');
  }
  herr.hidden = !all.length || (!buscador && fc == null && res.hidden);
}
function rerenderFiltered() { renderReport(); repScroll.scrollTop = 0; }
let qTimer = 0;
$('rep-q').addEventListener('input', () => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { repState().q = $('rep-q').value; rerenderFiltered(); }, 200);
});
$('rep-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('rep-q').blur(); } });
$('rep-chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const st = repState();
  const v = b.dataset.v || null;
  st.chip = v === st.chip ? null : v; // tocar el activo lo apaga
  rerenderFiltered();
});
$('rep-empty').addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { setView(go.dataset.go); return; }
  if (!e.target.closest('#rep-limpiar')) return;
  const st = repState();
  st.q = ''; st.chip = null; $('rep-q').value = '';
  rerenderFiltered();
});
// Tocar una fila: abrirla en la Ficha. Tocar un grupo: plegarlo/desplegarlo.
// Tocar un título: orden ascendente → descendente → sin orden (se guarda en la vista de la planilla).
$('rep-table').addEventListener('click', (e) => {
  const gr = e.target.closest('tr.grupo');
  if (gr) {
    if (!vopt('plegables')) return;
    const x = (renderReport.groups || [])[+gr.dataset.g];
    if (!x) return;
    const st = repState();
    if (st.plegados.has(x.v)) st.plegados.delete(x.v); else st.plegados.add(x.v);
    const top = repScroll.scrollTop; const left = repScroll.scrollLeft;
    renderReport(); repScroll.scrollTop = top; repScroll.scrollLeft = left;
    return;
  }
  const tr = e.target.closest('tbody tr');
  if (tr) { sel = { r: +tr.dataset.r, c: sel.c }; setView('ficha'); return; }
  const th = e.target.closest('thead th');
  if (!th) return;
  const c = +th.dataset.c;
  const o = vget('orden');
  const dir = o && o.c === c ? o.dir : 0;
  setVista('orden', dir === 0 ? { c, dir: 1 } : dir === 1 ? { c, dir: -1 } : undefined);
  const left = repScroll.scrollLeft;
  renderReport(); repScroll.scrollLeft = left;
  const n = vget('orden');
  snack(n ? `Ordenado por ${colTitle(c)} ${n.dir > 0 ? '(A → Z, 0 → 9)' : '(Z → A, 9 → 0)'}` : 'Sin orden (como en la planilla)');
});
function foldAll(close) {
  const st = repState();
  st.plegados = new Set(close ? (renderReport.groups || []).map((x) => x.v) : []);
  rerenderFiltered();
}

// ---------- Configurar vista (panel inferior; el reporte se ve arriba y cambia en el momento) ----------
const cfg = $('config');
const cfgBody = $('cfg-body');
const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
const chk = (k, label, on, extra = '') => `<label class="cfg-row cfg-chk"><span>${label}${extra}</span><input type="checkbox" data-k="${k}"${on ? ' checked' : ''}></label>`;
const selRow = (k, label, options) => `<label class="cfg-row"><span>${label}</span><select data-k="${k}">${options}</select></label>`;
function renderConfig() {
  const top = cfgBody.scrollTop;
  const { cols: used, rows: all } = reportData();
  const { all: ordered, shown } = orderedCols(used);
  const nums = numericCols(used, all);
  const tags = tagInfo(used, all, nums);
  const auto = autoTagCol(used, all, nums);
  const fc = filterCol(used, tags);
  const tc = totalColOf(used, nums);
  const g = vget('agruparCol');
  const orden = vget('orden');
  const calc = vopt('calculo');
  const pickTags = Array.isArray(vget('etiquetas'));
  const colOpts = (cur, skipNum) => ordered.filter((c) => !(skipNum && nums.has(c))).map((c) => opt(c, colTitle(c), cur)).join('');
  let h = '<h3>Apariencia</h3>';
  h += selRow('tema', 'Tema <small>(todas las planillas)</small>', Object.entries(TEMAS).map(([k, l]) => opt(k, l, tema)).join(''));
  h += selRow('densidad', 'Densidad', opt('comoda', 'Cómoda', vopt('densidad')) + opt('compacta', 'Compacta', vopt('densidad')));
  h += chk('franjas', 'Franjas (filas alternadas)', vopt('franjas'));
  h += chk('encabezado', 'Encabezado destacado', vopt('encabezado'));
  h += `<div class="cfg-row"><span>Acento</span><span class="cfg-acentos">${Object.entries(ACENTOS).map(([k, l]) => `<button type="button" class="ac sw-${k}${vopt('acento') === k ? ' on' : ''}" data-acento="${k}" aria-label="${l}" aria-pressed="${vopt('acento') === k}"></button>`).join('')}</span></div>`;
  h += chk('fijarPrimera', 'Primera columna fija', vopt('fijarPrimera'));
  h += '<h3>Columnas</h3>';
  if (!ordered.length) h += '<p class="cfg-nota">Todavía no hay columnas con datos.</p>';
  ordered.forEach((c, i) => {
    const vis = shown.includes(c);
    h += `<div class="cfg-row cfg-col"><label><input type="checkbox" data-colvis="${c}"${vis ? ' checked' : ''}> ${esc(colTitle(c))} <small>${colName(c)}</small></label>`
      + `<span><button type="button" class="cfg-mv" data-mv="${c}" data-d="-1"${i === 0 ? ' disabled' : ''} aria-label="Subir">▲</button>`
      + `<button type="button" class="cfg-mv" data-mv="${c}" data-d="1"${i === ordered.length - 1 ? ' disabled' : ''} aria-label="Bajar">▼</button></span></div>`;
  });
  h += '<h3>Etiquetas de color</h3>';
  h += selRow('tagmode', 'Columnas como etiquetas', opt('auto', `Automática${auto != null ? ` (${colTitle(auto)})` : ' (ninguna)'}`, pickTags ? 'elegir' : 'auto') + opt('elegir', 'Elegir…', pickTags ? 'elegir' : 'auto'));
  if (pickTags) {
    ordered.forEach((c) => { h += chk(`tagcol-${c}`, esc(colTitle(c)), tags.has(c), nums.has(c) ? ' <small>(números)</small>' : ''); });
  }
  tags.forEach((t, c) => {
    h += `<p class="cfg-sub">Colores de <b>${esc(colTitle(c))}</b>${c === g ? ' <small>(agrupada: se ven neutras en la tabla)</small>' : ''}</p>`;
    t.list.slice(0, 40).forEach((v) => {
      const ci = t.color.get(v);
      const fixed = (vget('colores') || {})[v] != null;
      h += `<label class="cfg-row cfg-tag"><span class="tag t${ci}">${esc(v)}</span><select data-color="${esc(v)}">${opt('', `Automático${fixed ? '' : ` (${COLORES[ci]})`}`, fixed ? ci : '')}${COLORES.map((n, i) => opt(i, n, fixed ? ci : '')).join('')}</select></label>`;
    });
    if (t.list.length > 40) h += `<p class="cfg-nota">Y ${t.list.length - 40} valores más (con colores automáticos).</p>`;
  });
  h += '<h3>Buscar y filtrar</h3>';
  h += chk('buscador', 'Buscador', vopt('buscador'));
  const fAuto = vget('filtroCol') == null;
  h += selRow('filtroCol', 'Filtros rápidos (chips)', opt('', `Automático${fAuto && fc != null ? ` (${colTitle(fc)})` : ''}`, fAuto ? '' : vget('filtroCol'))
    + opt(-1, 'Ninguno', vget('filtroCol')) + colOpts(vget('filtroCol'), true));
  h += '<h3>Orden</h3>';
  h += selRow('ordenCol', 'Ordenar por', opt('', 'Sin orden (como en la planilla)', orden ? orden.c : '') + colOpts(orden ? orden.c : ''));
  if (orden) h += selRow('ordenDir', 'Sentido', opt(1, 'Ascendente (A → Z, 0 → 9)', orden.dir) + opt(-1, 'Descendente (Z → A, 9 → 0)', orden.dir));
  h += '<h3>Agrupar</h3>';
  h += selRow('agruparCol', 'Agrupar por', opt('', 'No agrupar', g == null ? '' : g) + colOpts(g == null ? '' : g));
  if (g != null) {
    h += chk('subtotales', 'Subtotales por grupo', vopt('subtotales'), tc == null ? ' <small>(elegí la columna del total)</small>' : '');
    h += chk('plegables', 'Grupos plegables (tocar el grupo)', vopt('plegables'));
  }
  h += '<h3>Total</h3>';
  const tAuto = vget('totalCol') == null;
  h += selRow('totalCol', 'Columna del total', opt('', `Automática${tAuto && tc != null ? ` (${colTitle(tc)})` : tAuto ? ' (ninguna)' : ''}`, tAuto ? '' : vget('totalCol'))
    + opt(-1, 'Ninguna', vget('totalCol')) + colOpts(tAuto ? '' : vget('totalCol'), calc !== 'cantidad'));
  h += selRow('calculo', 'Cálculo', Object.entries(CALCULOS).map(([k, l]) => opt(k, l, calc)).join(''));
  h += chk('barraTotal', 'Mostrar el total en la barra de abajo', vopt('barraTotal'));
  h += chk('resumen', 'Resumen arriba (tarjetas)', vopt('resumen'));
  h += '<p class="cfg-nota">Estos ajustes se guardan en la planilla. <b>Restablecer</b> vuelve a lo automático.</p>';
  cfgBody.innerHTML = h;
  cfgBody.scrollTop = top;
}
function openConfig() {
  if (view !== 'reporte') setView('reporte');
  renderConfig();
  cfg.hidden = false;
  cfgBody.scrollTop = 0;
}
function closeConfig() { cfg.hidden = true; }
function cfgChanged() { renderReport(); renderConfig(); }
cfgBody.addEventListener('change', (e) => {
  const el = e.target;
  const k = el.dataset.k;
  const val = el.value;
  if (el.dataset.colvis != null) {
    const { all: ordered, shown } = orderedCols(reportData().cols);
    const c = +el.dataset.colvis;
    if (!el.checked && shown.length <= 1) { el.checked = true; snack('Tiene que quedar al menos una columna'); return; }
    setVista('columnas', ordered.map((x) => ({ c: x, visible: x === c ? el.checked : shown.includes(x) })));
  } else if (el.dataset.color != null) {
    const col = { ...(vget('colores') || {}) };
    if (val === '') delete col[el.dataset.color]; else col[el.dataset.color] = +val;
    setVista('colores', Object.keys(col).length ? col : undefined);
  } else if (k === 'tema') { setTema(val); } else if (k === 'tagmode') {
    if (val === 'auto') setVista('etiquetas', undefined);
    else { const { cols, rows } = reportData(); setVista('etiquetas', [...tagInfo(cols, rows, numericCols(cols, rows)).keys()]); }
  } else if (k && k.startsWith('tagcol-')) {
    const c = +k.slice(7);
    const cur = (vget('etiquetas') || []).filter((x) => x !== c);
    setVista('etiquetas', el.checked ? [...cur, c] : cur);
  } else if (k === 'ordenCol') setVista('orden', val === '' ? undefined : { c: +val, dir: (vget('orden') || {}).dir || 1 });
  else if (k === 'ordenDir') setVista('orden', { c: vget('orden').c, dir: +val });
  else if (k === 'filtroCol' || k === 'totalCol' || k === 'agruparCol') {
    setVista(k, val === '' ? undefined : +val);
    if (k === 'filtroCol') repState().chip = null;
    if (k === 'agruparCol') repState().plegados = new Set();
  } else if (k === 'densidad' || k === 'calculo') {
    setVista(k, val);
    const tcv = vget('totalCol');
    if (k === 'calculo' && val !== 'cantidad' && tcv != null && tcv >= 0) {
      const { cols, rows } = reportData();
      if (!numericCols(cols, rows).has(tcv)) setVista('totalCol', undefined); // columna de texto: solo sirve para Cantidad
    }
  } else if (k) setVista(k, el.checked);
  cfgChanged();
});
cfgBody.addEventListener('click', (e) => {
  const ac = e.target.closest('[data-acento]');
  if (ac) { setVista('acento', ac.dataset.acento); cfgChanged(); return; }
  const mv = e.target.closest('[data-mv]');
  if (!mv) return;
  const { all: ordered, shown } = orderedCols(reportData().cols);
  const c = +mv.dataset.mv; const i = ordered.indexOf(c); const j = i + +mv.dataset.d;
  if (i < 0 || j < 0 || j >= ordered.length) return;
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  setVista('columnas', ordered.map((x) => ({ c: x, visible: shown.includes(x) })));
  cfgChanged();
});
tool('cfg-ok', closeConfig);
tool('cfg-reset', () => {
  if (!sheet.vista) { snack('La vista ya está en automático'); return; }
  const prev = JSON.stringify(sheet.vista); const id = sheet.id;
  delete sheet.vista; saveQuiet();
  repState().plegados = new Set(); repState().chip = null;
  cfgChanged();
  snack('Vista restablecida (automática)', 'Deshacer', () => {
    if (sheet.id !== id) return;
    sheet.vista = JSON.parse(prev); saveQuiet();
    if (view === 'reporte') renderReport();
    if (!cfg.hidden) renderConfig();
  });
});
$('rep-cfg').addEventListener('click', openConfig);
// Tema del reporte (para toda la app): oscuro por defecto, claro o el del sistema
const TEMAS = { oscuro: 'Oscuro', claro: 'Claro', sistema: 'Sistema' };
let tema = 'oscuro';
try { const t = localStorage.getItem(TEMA_KEY); if (TEMAS[t]) tema = t; } catch { /* nada */ }
const darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applyTema() {
  const claro = tema === 'claro' || (tema === 'sistema' && !(darkMq && darkMq.matches));
  reporte.classList.toggle('claro', claro);
  $('rep-tema').textContent = `◐ ${TEMAS[tema]}`;
}
if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', applyTema);
function setTema(t) {
  tema = TEMAS[t] ? t : 'oscuro';
  try { localStorage.setItem(TEMA_KEY, tema); } catch { /* nada */ }
  applyTema();
}
$('rep-tema').addEventListener('click', () => {
  setTema(tema === 'oscuro' ? 'claro' : tema === 'claro' ? 'sistema' : 'oscuro');
  snack(`Tema del reporte: ${TEMAS[tema]}${tema === 'sistema' ? ` (ahora ${reporte.classList.contains('claro') ? 'claro' : 'oscuro'})` : ''}`);
});
applyTema();

// Redibuja la vista actual (después de deshacer o de renombrar)
function setTitle() {
  $('file-title').textContent = sheet.name;
  document.title = `${sheet.name} · Planillas`;
}
function refresh() {
  setTitle();
  if (view === 'ficha') { rec = Math.max(1, Math.min(rec, lastUsed().mr)); renderFicha(); }
  else if (view === 'reporte') renderReport();
  else { render(); select(Math.min(sel.r, sheet.rows - 1), Math.min(sel.c, sheet.cols - 1), { scroll: false }); }
}

// ---------- Archivos ----------
function blankFile(name) {
  const now = Date.now();
  return { id: newId(), name, created: now, updated: now, rows: MIN_ROWS, cols: MIN_COLS, cells: {}, styles: {}, colW: {}, rowH: {}, view: 'reporte' };
}
function nextName(files) {
  const used = new Set(files.map((f) => f.name));
  let i = 1;
  while (used.has(`Planilla ${i}`)) i++;
  return `Planilla ${i}`;
}
async function openFile(f) {
  commit();
  if (sheet && f.id !== sheet.id) await flushNow();
  sheet = f;
  sheet.cells = sheet.cells || {};
  sheet.styles = sheet.styles || {};
  sheet.colW = sheet.colW || {};
  sheet.rowH = sheet.rowH || {};
  sheet.rows = Math.max(sheet.rows || 0, MIN_ROWS);
  sheet.cols = Math.max(sheet.cols || 0, MIN_COLS);
  sel = { r: 0, c: 0 }; rec = 1; undoSnap = null; repPos = null;
  closeConfig();
  if (view === 'tabla') commit();
  if (document.activeElement && focusedField() != null) document.activeElement.blur();
  view = VIEWS.includes(sheet.view) ? sheet.view : legacyView;
  try { localStorage.setItem(LAST_KEY, f.id); } catch { /* nada */ }
  setTitle();
  wrap.scrollTop = 0; wrap.scrollLeft = 0;
  applyView();
}

async function showFiles() {
  commit();
  await flushNow();
  const files = await listFiles();
  const list = $('file-list');
  list.innerHTML = files.map((f) => {
    const n = Object.keys(f.cells || {}).length;
    return `<li class="file-item${sheet && f.id === sheet.id ? ' current' : ''}" data-id="${esc(f.id)}">
      <button class="file-open" type="button"><b>${esc(f.name)}</b><small>${esc(formatDate(f.updated))} · ${n} ${n === 1 ? 'celda' : 'celdas'} con datos${sheet && f.id === sheet.id ? ' · abierta' : ''}</small></button>
      <button class="icon-btn file-more" type="button" aria-label="Opciones de ${esc(f.name)}">⋮</button></li>`;
  }).join('');
  $('files-note').textContent = `Guardadas en este dispositivo (${await storageKind()}). Con "Importar" se traen archivos .xlsx o .csv (cada uno queda como planilla nueva). La nube y el inicio de sesión llegan en la Etapa 2.`;
  $('files').hidden = false;
  showFiles.list = files;
}
function hideFiles() { $('files').hidden = true; }
$('btn-files').addEventListener('click', showFiles);
$('file-title').addEventListener('click', showFiles);
$('files-close').addEventListener('click', hideFiles);
$('files-new').addEventListener('click', async () => {
  const files = await listFiles();
  const name = await ask({ title: 'Planilla nueva', text: 'Nombre:', input: nextName(files), ok: 'Crear' });
  if (name == null) return;
  const f = blankFile(name.trim() || nextName(files));
  await putFile(f);
  hideFiles();
  await openFile(f);
});
$('file-list').addEventListener('click', async (e) => {
  const li = e.target.closest('.file-item');
  if (!li) return;
  const f = (showFiles.list || []).find((x) => x.id === li.dataset.id);
  if (!f) return;
  if (e.target.closest('.file-more')) { fileMenu(f); return; }
  hideFiles();
  if (!sheet || f.id !== sheet.id) await openFile(await getFile(f.id) || f);
});

function fileMenu(f) {
  showMenu(f.name, [
    { label: 'Abrir', fn: async () => { hideFiles(); if (f.id !== sheet.id) await openFile(await getFile(f.id) || f); } },
    { label: 'Renombrar', fn: () => renameFile(f) },
    { label: 'Duplicar', fn: () => duplicateFile(f) },
    '-',
    ...EXPORTS.map((x) => ({ label: x.label, fn: () => exportFile(f, x.kind) })),
    '-',
    { label: 'Borrar', fn: () => removeFile(f), danger: true },
  ]);
}
async function renameFile(f) {
  const name = await ask({ title: 'Renombrar', text: 'Nombre nuevo:', input: f.name, ok: 'Guardar' });
  if (name == null || !name.trim()) return;
  if (sheet && f.id === sheet.id) { sheet.name = name.trim(); save(); await flushNow(); refresh(); } else {
    const full = await getFile(f.id);
    if (full) { full.name = name.trim(); full.updated = Date.now(); await putFile(full); }
  }
  await showFiles();
}
async function duplicateFile(f) {
  if (sheet && f.id === sheet.id) await flushNow();
  const full = await getFile(f.id);
  if (!full) return;
  const files = await listFiles();
  let name = `${full.name} (copia)`;
  let i = 2;
  while (files.some((x) => x.name === name)) name = `${full.name} (copia ${i++})`;
  const now = Date.now();
  await putFile({ ...JSON.parse(JSON.stringify(full)), id: newId(), name, created: now, updated: now });
  await showFiles();
  snack(`Copia creada: ${name}`);
}
async function removeFile(f) {
  const ok = await ask({ title: `¿Borrar "${f.name}"?`, text: 'Se borra de este dispositivo. No se puede deshacer.', ok: 'Borrar', danger: true });
  if (!ok) return;
  if (sheet && f.id === sheet.id) { clearTimeout(saveTimer); dirty = false; await saving; }
  await deleteFile(f.id);
  if (sheet && f.id === sheet.id) {
    const rest = await listFiles();
    const next = rest[0] || blankFile(nextName(rest));
    if (!rest.length) await putFile(next);
    sheet = null;
    await openFile(next);
  }
  await showFiles();
  snack(`"${f.name}" borrada`);
}

// ---------- Importar y exportar (.xlsx y .csv) ----------
const EXPORTS = [
  { label: 'Exportar a Excel (.xlsx)', kind: 'xlsx' },
  { label: 'Exportar a CSV con ; (Excel en español)', kind: 'csv;' },
  { label: 'Exportar a CSV con , (Google Sheets y otros)', kind: 'csv,' },
];
async function exportFile(f, kind) {
  let file;
  if (sheet && f.id === sheet.id) { commit(); await flushNow(); file = sheet; } else file = (await getFile(f.id)) || f;
  const busy = setTimeout(() => snack('Preparando el archivo…'), 300);
  try {
    const blob = kind === 'xlsx' ? await toXlsx(file) : toCsv(file, kind[3]);
    const name = `${safeName(file.name)}.${kind === 'xlsx' ? 'xlsx' : 'csv'}`;
    clearTimeout(busy);
    hideSnack();
    const how = await deliverFile(name, blob);
    if (how === 'downloaded') snack(`Descargado: ${name}`);
  } catch (e) {
    clearTimeout(busy);
    snack(`No se pudo exportar (${e?.message || e})`);
  }
}

const ACCEPT = '.xlsx,.xlsm,.xls,.csv,.tsv,.txt,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,'
  + 'application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel,text/csv,text/comma-separated-values,application/csv,'
  + 'text/tab-separated-values,text/plain';
function pickImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = ACCEPT;
  input.addEventListener('change', () => importFiles([...(input.files || [])]));
  input.click();
}
function uniqueName(base, used) {
  let name = base; let i = 2;
  while (used.includes(name)) name = `${base} (${i++})`;
  return name;
}
async function importFiles(list) {
  if (!list.length) return;
  commit();
  await flushNow();
  const busy = setTimeout(() => snack('Importando…'), 300);
  const created = []; const notes = []; const errors = []; let big = 0;
  const used = (await listFiles()).map((x) => x.name);
  for (const fl of list) {
    try {
      const res = await importAny(fl.name, await fl.arrayBuffer());
      for (const x of res.files) {
        const f = blankFile(uniqueName(x.name, used));
        used.push(f.name);
        Object.assign(f, {
          cells: x.cells, styles: x.styles, colW: x.colW, rowH: x.rowH,
          rows: Math.max(x.rows, MIN_ROWS), cols: Math.max(x.cols, MIN_COLS), view: 'reporte',
        });
        await putFile(f);
        created.push(f);
        big = Math.max(big, f.rows * f.cols);
      }
      if (res.lost.length) notes.push({ name: fl.name, lost: res.lost });
    } catch (e) {
      errors.push(`${fl.name}: ${e instanceof ImportError ? e.message : `no se pudo importar (${e?.message || e}).`}`);
    }
  }
  clearTimeout(busy);
  hideSnack();
  if (created.length) { hideFiles(); await openFile(created[0]); }
  if (!notes.length && !errors.length && created.length === 1 && big <= 60000) { snack(`Importada: ${created[0].name}`); return; }
  let html = '';
  if (created.length === 1) html += `<p>Se importó <b>${esc(created[0].name)}</b>.</p>`;
  else if (created.length) html += `<p>Se importaron ${created.length} planillas:</p><ul>${created.map((f) => `<li>${esc(f.name)}</li>`).join('')}</ul>`;
  for (const n of notes) {
    html += `<p>${notes.length > 1 || list.length > 1 ? `De <b>${esc(n.name)}</b>, lo` : 'Lo'} que no se pudo traer tal cual:</p>`
      + `<ul>${n.lost.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  }
  if (big > 60000) html += `<p>Es una planilla grande (${big.toLocaleString('es-AR')} celdas): en equipos viejos puede andar lento.</p>`;
  if (errors.length) html += errors.map((t) => `<p class="dialog-error">${esc(t)}</p>`).join('');
  openDialog(created.length ? 'Importación lista' : 'No se pudo importar', html);
}

$('btn-file-menu').addEventListener('click', () => {
  commit();
  const grupos = view === 'reporte' && vopt('plegables') && (renderReport.groups || []).length > 1;
  showMenu(sheet.name, [
    { label: 'Configurar vista del Reporte…', fn: openConfig },
    ...(grupos ? [{ label: 'Plegar todos los grupos', fn: () => foldAll(true) }, { label: 'Desplegar todos los grupos', fn: () => foldAll(false) }] : []),
    '-',
    ...EXPORTS.map((x) => ({ label: x.label, fn: () => exportFile(sheet, x.kind) })),
    '-',
    { label: 'Importar .xlsx o .csv…', fn: pickImport },
    { label: 'Mis planillas', fn: showFiles },
  ]);
});
$('files-import').addEventListener('click', pickImport);

// Primer arranque de la v0.0.3: el borrador único de la v0.0.1/v0.0.2 pasa a ser el primer archivo
async function firstFile() {
  let old = null;
  try { old = JSON.parse(localStorage.getItem(OLD_DRAFT_KEY)); } catch { old = null; }
  const f = blankFile('Planilla 1');
  if (old && old.cells) {
    f.cells = old.cells;
    f.rows = Math.max(old.rows || 0, MIN_ROWS);
    f.cols = Math.max(old.cols || 0, MIN_COLS);
  }
  await putFile(f);
  if (old) { try { localStorage.removeItem(OLD_DRAFT_KEY); } catch { /* nada */ } }
  return f;
}

// ---------- Menú inferior, diálogos y aviso ----------
const scrim = $('scrim');
function showMenu(title, items) {
  $('menu-title').textContent = title;
  const box = $('menu-items');
  box.innerHTML = '';
  items.forEach((it) => {
    if (it === '-') { box.insertAdjacentHTML('beforeend', '<hr>'); return; }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `menu-item${it.danger ? ' danger' : ''}`;
    b.textContent = it.label;
    b.disabled = !!it.disabled;
    b.addEventListener('click', () => { closeMenu(); it.fn(); });
    box.appendChild(b);
  });
  $('menu').hidden = false; scrim.hidden = false;
}
function closeMenu() { $('menu').hidden = true; if ($('dialog').hidden) scrim.hidden = true; }

let dialogDone = null;
function openDialog(title, html, buttons) {
  $('dialog-title').textContent = title;
  $('dialog-body').innerHTML = html;
  const box = $('dialog-actions');
  box.innerHTML = '';
  (buttons || [{ label: 'Cerrar', value: null }]).forEach((b) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `text-btn${b.danger ? ' danger' : ''}`;
    el.textContent = b.label;
    el.addEventListener('click', () => closeDialog(b.value));
    box.appendChild(el);
  });
  $('dialog').hidden = false; scrim.hidden = false;
}
function closeDialog(value = null) {
  if ($('dialog').hidden) return;
  $('dialog').hidden = true;
  if ($('menu').hidden) scrim.hidden = true;
  const done = dialogDone; dialogDone = null;
  if (done) {
    const inp = $('dialog-input');
    done(value === 'ok' ? (inp ? inp.value : true) : null);
  }
}
// Pregunta con botones propios (sin confirm/prompt del navegador). Devuelve el texto, true o null.
function ask({ title, text = '', input, ok = 'Aceptar', danger = false }) {
  if (dialogDone) closeDialog();
  return new Promise((resolve) => {
    openDialog(title, `${text ? `<p>${esc(text)}</p>` : ''}${input != null ? `<input id="dialog-input" class="dialog-input" type="text" value="${esc(input)}" autocomplete="off" enterkeyhint="done">` : ''}`,
      [{ label: 'Cancelar', value: null }, { label: ok, value: 'ok', danger }]);
    dialogDone = resolve;
    const inp = $('dialog-input');
    if (inp) {
      inp.focus();
      inp.select();
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeDialog('ok'); } });
    }
  });
}
scrim.addEventListener('click', () => { closeMenu(); closeDialog(); });

function snack(text, actionLabel, onAction) {
  const s = $('snackbar');
  const btn = $('snack-btn');
  $('snack-text').textContent = text;
  btn.hidden = !actionLabel;
  s.classList.toggle('has-action', !!actionLabel);
  if (actionLabel) {
    btn.textContent = actionLabel;
    btn.onclick = () => { s.classList.remove('show'); onAction(); };
  }
  s.classList.add('show');
  clearTimeout(snack.t);
  snack.t = setTimeout(() => s.classList.remove('show'), actionLabel ? 6000 : 2600);
}
function hideSnack() { $('snackbar').classList.remove('show'); }
$('snack-btn').addEventListener('pointerdown', (e) => e.preventDefault());

function showVersion() {
  const r = release;
  const dev = deviceInfo();
  openDialog(`Planillas v${APP_VERSION}`, `
    <p>${isNative ? 'App Android' : 'Versión web'} · prueba de concepto (Etapa 1d-2)</p>
    <p>Fecha de la versión: ${r && r.tag === `v${APP_VERSION}` ? esc(formatDate(r.fileDate)) : 'sin datos'}</p>
    ${r && isNewer(r.tag) ? `<p><b>Hay una versión nueva: ${esc(r.tag)}</b></p>` : ''}
    ${dev ? `<p>Equipo: ${esc(dev)}</p>` : ''}
    <p><a href="${CHANGELOG_URL}" target="_blank" rel="noopener">Changelog (Releases en GitHub)</a></p>
    <p style="color:#5F6368">Las planillas de esta versión quedan solo en este dispositivo.</p>`);
}
$('btn-version').addEventListener('click', showVersion);

async function checkUpdate() {
  release = await getLatestRelease();
  if (!release || !isNewer(release.tag)) return;
  $('update-text').textContent = `Hay una versión nueva (${release.tag}).`;
  const btn = $('update-action');
  btn.textContent = isNative ? 'Descargar' : 'Recargar';
  btn.onclick = () => {
    if (isNative && release.apk) window.open(release.apk, '_blank');
    else location.reload();
  };
  $('update-banner').hidden = false;
}

// ---------- Inicio ----------
initNative({
  onBack: () => {
    if (!$('menu').hidden) closeMenu();
    else if (!$('dialog').hidden) closeDialog();
    else if (!$('files').hidden) hideFiles();
    else if (!cfg.hidden) closeConfig();
    else if (editing) { cancel(); formula.blur(); }
    else if (focusedField() != null) document.activeElement.blur();
    else minimizeApp();
  },
});
setStatusBar('#1E7B4F', true);

async function start() {
  try { await recoverPending(); } catch { /* sin copia pendiente */ }
  let files = [];
  try { files = await listFiles(); } catch { files = []; }
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); legacyView = localStorage.getItem(VIEW_KEY) === 'ficha' ? 'ficha' : 'tabla'; } catch { /* nada */ }
  let f = files.find((x) => x.id === last) || files[0];
  if (!f) f = await firstFile();
  await openFile(f);
}
start();
checkUpdate();
if (!isNative && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
