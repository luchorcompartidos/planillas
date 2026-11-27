// Planillas — Etapa 1c: importar y exportar .xlsx y .csv (sobre la grilla, la Ficha y los archivos de la 1b).
// Grilla: tocar para seleccionar y otra vez para editar en la barra de fórmula; insertar y borrar
// filas/columnas en el medio (menú de celda: mantener apretado, clic derecho o "Más…").
// Ficha: un registro por pantalla (fila 1 = nombres de campo). Archivos guardados en IndexedDB.
// Formato (de lo importado): negrita, colores, alineación, bordes, anchos y altos; todavía no se edita.
import './styles.css';
import { APP_VERSION, CHANGELOG_URL, getLatestRelease, isNewer, formatDate } from './version.js';
import { initNative, isNative, setStatusBar, minimizeApp, deviceInfo, deliverFile } from './native.js';
import { colName, parseRef, ref, isNum } from './refs.js';
import { importAny, ImportError, toXlsx, toCsv, safeName } from './transfer.js';
import {
  listFiles, getFile, putFile, deleteFile, newId, savePending, clearPending, recoverPending, storageKind,
} from './store.js';

const OLD_DRAFT_KEY = 'planillas-borrador-v1'; // borrador único de la v0.0.1/v0.0.2
const LAST_KEY = 'planillas-ultimo';
const VIEW_KEY = 'planillas-vista';
const MIN_ROWS = 50;
const MIN_COLS = 12;

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const wrap = $('grid-wrap');
const formula = $('formula');
const nameBox = $('name-box');
const ficha = $('ficha');
const fields = $('ficha-fields');

// ---------- Modelo ----------
// sheet = archivo abierto = { id, name, created, updated, rows, cols, cells: { "A1": "texto" },
//   styles: { "A1": { b, i, fc, bg, ha, bd, nf, … } }, colW: { 0: ancho Excel }, rowH: { 0: alto en puntos } }
// (detalle del formato en transfer.js)
let sheet = null;
let sel = { r: 0, c: 0 };
let editing = false;
let original = '';
let release = null;
let view = 'tabla';
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
  dirty = true;
  sheet.updated = Date.now();
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
  return JSON.stringify({ rows: sheet.rows, cols: sheet.cols, cells: sheet.cells, styles: sheet.styles, colW: sheet.colW, rowH: sheet.rowH });
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
  if (axis === 'r') sheet.rowH = byIndex(sheet.rowH); else sheet.colW = byIndex(sheet.colW);
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
  const b = $(id);
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

function setView(v) {
  if (v === view) return;
  if (v === 'ficha') {
    commit();
    rec = Math.max(1, sel.r);
    lastFieldCol = null;
    view = 'ficha';
  } else {
    const fc = focusedField() ?? lastFieldCol;
    if (document.activeElement) document.activeElement.blur?.();
    view = 'tabla';
    sel = { r: rec, c: fc != null ? fc : sel.c };
  }
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* nada */ }
  applyView();
}
function applyView() {
  const f = view === 'ficha';
  ficha.hidden = !f; $('ficha-bar').hidden = !f;
  wrap.hidden = f; $('formula-bar').hidden = f; $('grid-bar').hidden = f;
  $('btn-view').textContent = f ? 'Tabla' : 'Ficha';
  $('btn-view').setAttribute('aria-label', f ? 'Ver como tabla' : 'Ver como ficha (un registro por pantalla)');
  if (f) { ficha.scrollTop = 0; renderFicha(sel.c < fieldCount() ? sel.c : null, true); }
  else { render(); select(sel.r, sel.c); }
}
$('btn-view').addEventListener('click', () => setView(view === 'ficha' ? 'tabla' : 'ficha'));

// Redibuja la vista actual (después de deshacer o de abrir otro archivo)
function refresh() {
  $('file-title').textContent = sheet.name;
  document.title = `${sheet.name} · Planillas`;
  if (view === 'ficha') { rec = Math.max(1, Math.min(rec, lastUsed().mr)); renderFicha(); }
  else { render(); select(Math.min(sel.r, sheet.rows - 1), Math.min(sel.c, sheet.cols - 1), { scroll: false }); }
}

// ---------- Archivos ----------
function blankFile(name) {
  const now = Date.now();
  return { id: newId(), name, created: now, updated: now, rows: MIN_ROWS, cols: MIN_COLS, cells: {}, styles: {}, colW: {}, rowH: {} };
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
  sel = { r: 0, c: 0 }; rec = 1; undoSnap = null;
  try { localStorage.setItem(LAST_KEY, f.id); } catch { /* nada */ }
  refresh();
  if (view === 'tabla') { wrap.scrollTop = 0; wrap.scrollLeft = 0; }
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
          rows: Math.max(x.rows, MIN_ROWS), cols: Math.max(x.cols, MIN_COLS),
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
  showMenu(sheet.name, [
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
    <p>${isNative ? 'App Android' : 'Versión web'} · prueba de concepto (Etapa 1c)</p>
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
  try { last = localStorage.getItem(LAST_KEY); view = localStorage.getItem(VIEW_KEY) === 'ficha' ? 'ficha' : 'tabla'; } catch { /* nada */ }
  let f = files.find((x) => x.id === last) || files[0];
  if (!f) f = await firstFile();
  await openFile(f);
  applyView();
  if (view === 'tabla') select(0, 0, { scroll: false });
}
start();
checkUpdate();
if (!isNative && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
