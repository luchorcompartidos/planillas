// Planillas — Etapa 1a: grilla básica (prueba de concepto, sin cuenta).
// Celdas con letras y números, encabezados fijos, tocar para seleccionar y editar en la barra de fórmula,
// agregar filas y columnas al final. El borrador se guarda en este dispositivo (localStorage);
// la lista de archivos con IndexedDB llega en la Etapa 1b.
import './styles.css';
import { APP_VERSION, CHANGELOG_URL, getLatestRelease, isNewer, formatDate } from './version.js';
import { initNative, isNative, setStatusBar, minimizeApp, deviceInfo } from './native.js';

const STORE_KEY = 'planillas-borrador-v1';
const MIN_ROWS = 50;
const MIN_COLS = 12;

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const wrap = $('grid-wrap');
const formula = $('formula');
const nameBox = $('name-box');

// ---------- Modelo ----------
// sheet = { rows, cols, cells: { "A1": "texto" } }
let sheet = load();
let sel = { r: 0, c: 0 };
let editing = false;
let original = '';
let release = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.cells && s.rows && s.cols) return s;
  } catch { /* borrador dañado o inexistente */ }
  return { rows: MIN_ROWS, cols: MIN_COLS, cells: {} };
}
let saveTimer = 0;
function flush() {
  if (!saveTimer) return;
  clearTimeout(saveTimer); saveTimer = 0;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(sheet)); } catch { snack('No se pudo guardar el borrador'); }
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
// Al salir de la app o cerrar la pestaña se guarda enseguida (sin esperar los 300 ms)
window.addEventListener('pagehide', () => { commit(); flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { commit(); flush(); } });

export function colName(c) {
  let s = '';
  let n = c + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
export function parseRef(text) {
  const m = /^\s*([A-Za-z]{1,3})\s*(\d{1,6})\s*$/.exec(text || '');
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: parseInt(m[2], 10) - 1, c: c - 1 };
}
const ref = (r, c) => colName(c) + (r + 1);
const getCell = (r, c) => sheet.cells[ref(r, c)] || '';
function setCell(r, c, v) {
  const k = ref(r, c);
  if (v === '' || v == null) delete sheet.cells[k]; else sheet.cells[k] = v;
  save();
}
const isNum = (v) => v !== '' && /^[-+]?(\d+([.,]\d*)?|[.,]\d+)(e[-+]?\d+)?%?$/i.test(String(v).trim());
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// ---------- Dibujo ----------
function render() {
  let h = '<thead><tr><th class="corner"></th>';
  for (let c = 0; c < sheet.cols; c++) h += `<th data-c="${c}">${colName(c)}</th>`;
  h += '</tr></thead><tbody>';
  for (let r = 0; r < sheet.rows; r++) {
    h += `<tr><th data-r="${r}">${r + 1}</th>`;
    for (let c = 0; c < sheet.cols; c++) {
      const v = getCell(r, c);
      h += `<td data-r="${r}" data-c="${c}"${isNum(v) ? ' class="num"' : ''}>${esc(v)}</td>`;
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
  grid.tHead.rows[0].cells[sel.c + 1]?.classList.add('on');
  grid.tBodies[0].rows[sel.r]?.cells[0]?.classList.add('on');
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
  if (r >= sheet.rows) { sheet.rows = r + 1; save(); render(); }
  if (c >= sheet.cols) { sheet.cols = c + 1; save(); render(); }
  sel = { r, c };
  paintSelection();
  if (scroll) scrollToSel();
}

// ---------- Edición ----------
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
  else if (e.key.length === 1) { e.preventDefault(); startEdit(e.key); }
});

function clearCell() {
  if (editing) cancel();
  setCell(sel.r, sel.c, '');
  paintCell(sel.r, sel.c);
  paintSelection();
}

// ---------- Barra inferior ----------
// pointerdown + preventDefault: el botón no le saca el foco a la barra de fórmula (no se cierra el teclado)
function tool(id, fn) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('click', fn);
}
tool('btn-add-row', () => { commit(); sheet.rows++; save(); render(); select(sheet.rows - 1, sel.c); });
tool('btn-add-col', () => { commit(); sheet.cols++; save(); render(); select(sel.r, sheet.cols - 1); });
tool('btn-clear', clearCell);

// ---------- Diálogo, aviso y versión ----------
function snack(text) {
  const s = $('snackbar');
  s.textContent = text;
  s.classList.add('show');
  clearTimeout(snack.t);
  snack.t = setTimeout(() => s.classList.remove('show'), 2600);
}
function openDialog(title, html) {
  $('dialog-title').textContent = title;
  $('dialog-body').innerHTML = html;
  $('dialog').hidden = false; $('scrim').hidden = false;
}
function closeDialog() { $('dialog').hidden = true; $('scrim').hidden = true; }
$('dialog-close').addEventListener('click', closeDialog);
$('scrim').addEventListener('click', closeDialog);

function showVersion() {
  const r = release;
  const dev = deviceInfo();
  openDialog(`Planillas v${APP_VERSION}`, `
    <p>${isNative ? 'App Android' : 'Versión web'} · prueba de concepto (Etapa 1a)</p>
    <p>Fecha de la versión: ${r && r.tag === `v${APP_VERSION}` ? esc(formatDate(r.fileDate)) : 'sin datos'}</p>
    ${r && isNewer(r.tag) ? `<p><b>Hay una versión nueva: ${esc(r.tag)}</b></p>` : ''}
    ${dev ? `<p>Equipo: ${esc(dev)}</p>` : ''}
    <p><a href="${CHANGELOG_URL}" target="_blank" rel="noopener">Changelog (Releases en GitHub)</a></p>
    <p style="color:#5F6368">Los datos de esta versión quedan solo en este dispositivo.</p>`);
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
    if (!$('dialog').hidden) closeDialog();
    else if (editing) { cancel(); formula.blur(); }
    else minimizeApp();
  },
});
setStatusBar('#1E7B4F', true);
render();
select(0, 0, { scroll: false });
checkUpdate();
if (!isNative && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
