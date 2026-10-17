// Entry point: tab switching and the Sketch view. Race view lives in race-ui.js.

import {
  DEFAULT_SIZE, cellFromPoint, clampSize, createCells, floodFill, gridLineAlpha, linePoints, parseDrawing, resample, toIndex,
} from './grid.js';
import { History } from './history.js';
import { CLICK_TOOLS, SCREEN_COLOR, TOOLS, applyTool } from './tools.js';
import { normalizeHex } from './color.js';
import { load, save } from './storage.js';
import { initRace } from './race-ui.js';

const STORE_KEY = 'eas.sketch.v1';
const PALETTE = ['#2b2d42', '#ef233c', '#ff8c42', '#ffd23f', '#3bb273', '#1e88e5', '#7b2cbf', '#ff70a6', '#8d6e63', '#ffffff'];
const KNOB_DEGREES_PER_CELL = 18;

const $ = (sel) => document.querySelector(sel);
const board = $('#board');
const stylusEl = $('#stylus');
const frame = $('#sketch-frame');
const slider = $('#slider');
const sizeLabel = $('#size-label');
const colorInput = $('#color-picker');
const undoBtn = $('#undo');
const redoBtn = $('#redo');
const linesBtn = $('#toggle-lines');
const hoverBtn = $('#toggle-hover');

const saved = load(STORE_KEY, {});
const drawing = parseDrawing(saved.drawing) ?? { size: DEFAULT_SIZE, cells: createCells(DEFAULT_SIZE) };
const prefs = {
  tool: TOOLS.includes(saved.tool) ? saved.tool : 'pen',
  color: safeHex(saved.color) ?? '#2b2d42',
  lines: saved.lines !== false,
  hover: saved.hover === true,
};
const edits = new History();
const stylus = { x: Math.floor(drawing.size / 2), y: Math.floor(drawing.size / 2) };
let cellEls = [];

function safeHex(value) {
  try { return normalizeHex(value); } catch { return null; }
}

// ---------- persistence ----------
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(STORE_KEY, { drawing, ...prefs }), 250);
}

// ---------- rendering ----------
function buildBoard() {
  const { size, cells } = drawing;
  board.style.setProperty('--n', size);
  board.style.setProperty('--line', `rgb(30 32 48 / ${gridLineAlpha(size)})`);
  stylusEl.parentElement.style.setProperty('--n', size);
  const frag = document.createDocumentFragment();
  cellEls = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    if (cells[i]) el.style.backgroundColor = cells[i];
    frag.appendChild(el);
    cellEls[i] = el;
  }
  board.replaceChildren(frag);
  slider.value = size;
  sizeLabel.textContent = `${size} × ${size}`;
  moveStylus(Math.min(stylus.x, size - 1), Math.min(stylus.y, size - 1));
}

function paintCell(i) {
  cellEls[i].style.backgroundColor = drawing.cells[i] ?? '';
}

function moveStylus(x, y) {
  stylus.x = x;
  stylus.y = y;
  stylusEl.style.setProperty('--sx', x);
  stylusEl.style.setProperty('--sy', y);
}

function syncHistoryButtons() {
  undoBtn.disabled = !edits.canUndo;
  redoBtn.disabled = !edits.canRedo;
}

// ---------- drawing ----------
// Paint tools apply once per cell entered, so Shade darkens one step per pass
// instead of going black the moment the pointer jiggles inside a cell.
function applyAt(x, y, tool = prefs.tool) {
  const i = toIndex(drawing.size, x, y);
  const before = drawing.cells[i];
  const after = applyTool(tool, before, { color: prefs.color });
  if (after !== before) {
    drawing.cells[i] = after;
    edits.record(i, before, after);
    paintCell(i);
  }
  moveStylus(x, y);
}

let stroke = null; // { last: {x, y}, tool }

function startStroke(pt, tool = prefs.tool) {
  if (edits.inStroke) endStroke();
  edits.begin();
  stroke = { last: pt, tool };
  applyAt(pt.x, pt.y, tool);
}

function extendStroke(pt) {
  const { last, tool } = stroke;
  if (pt.x === last.x && pt.y === last.y) return;
  for (const p of linePoints(last.x, last.y, pt.x, pt.y).slice(1)) applyAt(p.x, p.y, tool);
  stroke.last = pt;
}

function endStroke() {
  stroke = null;
  if (edits.commit()) persist();
  syncHistoryButtons();
}

function pointToCell(e, clamp = false) {
  const rect = board.getBoundingClientRect();
  return cellFromPoint(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, drawing.size, { clamp });
}

function fillAt(pt) {
  const i = toIndex(drawing.size, pt.x, pt.y);
  const color = normalizeHex(prefs.color);
  const { before, changed } = floodFill(drawing.cells, drawing.size, i, color);
  if (!changed.length) return;
  edits.begin();
  for (const c of changed) {
    edits.record(c, before, color);
    paintCell(c);
  }
  edits.commit();
  moveStylus(pt.x, pt.y);
  syncHistoryButtons();
  persist();
}

function pickAt(pt) {
  const color = drawing.cells[toIndex(drawing.size, pt.x, pt.y)] ?? SCREEN_COLOR;
  setColor(color);
  setTool('pen');
}

board.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const pt = pointToCell(e);
  if (!pt) return;
  if (prefs.tool === 'fill') return fillAt(pt);
  if (prefs.tool === 'picker') return pickAt(pt);
  // In hover mode a mouse is already drawing; a click just keeps going.
  if (prefs.hover && e.pointerType === 'mouse' && stroke) return;
  board.setPointerCapture(e.pointerId);
  startStroke(pt);
});

board.addEventListener('pointermove', (e) => {
  if (stroke) {
    // Coalesced events catch the cells a fast flick passes through between frames.
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length ? events : [e]) {
      const pt = pointToCell(ev, board.hasPointerCapture(e.pointerId));
      if (pt) extendStroke(pt);
    }
  } else if (prefs.hover && e.pointerType === 'mouse' && !CLICK_TOOLS.includes(prefs.tool)) {
    const pt = pointToCell(e);
    if (pt) startStroke(pt);
  }
});

for (const type of ['pointerup', 'pointercancel']) {
  board.addEventListener(type, (e) => {
    if (prefs.hover && e.pointerType === 'mouse') return; // hover strokes end when the pointer leaves
    if (stroke) endStroke();
  });
}

board.addEventListener('pointerleave', (e) => {
  if (stroke && !board.hasPointerCapture(e.pointerId)) endStroke();
});

// ---------- knobs: the real Etch A Sketch way ----------
function etch(dx, dy) {
  const x = Math.min(drawing.size - 1, Math.max(0, stylus.x + dx));
  const y = Math.min(drawing.size - 1, Math.max(0, stylus.y + dy));
  // Knob strokes draw with the pen when a click tool (fill/picker) is active.
  const tool = CLICK_TOOLS.includes(prefs.tool) ? 'pen' : prefs.tool;
  if (!stroke || !stroke.knob) {
    startStroke({ x: stylus.x, y: stylus.y }, tool);
    stroke.knob = true;
  }
  extendStroke({ x, y });
  clearTimeout(etch.timer);
  etch.timer = setTimeout(() => { if (stroke?.knob) endStroke(); }, 600);
}

function bindKnob(el, axis) {
  let rot = 0;
  let acc = 0;
  const turn = (deg) => {
    rot += deg;
    el.style.setProperty('--rot', `${rot}deg`);
    acc += deg;
    while (Math.abs(acc) >= KNOB_DEGREES_PER_CELL) {
      const step = Math.sign(acc);
      acc -= step * KNOB_DEGREES_PER_CELL;
      // Left knob: clockwise moves right. Right knob: clockwise moves up, like the toy.
      if (axis === 'x') etch(step, 0);
      else etch(0, -step);
    }
  };
  el.turn = turn;

  let lastAngle = null;
  const angleOf = (e) => {
    const r = el.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    lastAngle = angleOf(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (lastAngle === null) return;
    const a = angleOf(e);
    let delta = a - lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lastAngle = a;
    turn(delta);
  });
  const release = () => { lastAngle = null; };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    turn(Math.sign(e.deltaY || e.deltaX) * KNOB_DEGREES_PER_CELL);
  }, { passive: false });
  el.addEventListener('keydown', (e) => {
    const keys = axis === 'x' ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowUp: 1, ArrowDown: -1 };
    if (e.key in keys) {
      e.preventDefault();
      e.stopPropagation();
      turn(keys[e.key] * KNOB_DEGREES_PER_CELL);
    }
  });
}

const knobX = $('#knob-x');
const knobY = $('#knob-y');
bindKnob(knobX, 'x');
bindKnob(knobY, 'y');

// ---------- tools, colors, toggles ----------
function setTool(tool) {
  prefs.tool = tool;
  for (const btn of document.querySelectorAll('.tool')) btn.setAttribute('aria-pressed', String(btn.dataset.tool === tool));
  board.style.cursor = tool === 'fill' ? 'cell' : tool === 'picker' ? 'copy' : 'crosshair';
  persist();
}

function setColor(color) {
  prefs.color = normalizeHex(color);
  colorInput.value = prefs.color;
  let matched = false;
  for (const sw of document.querySelectorAll('.swatch')) {
    const on = sw.dataset.color === prefs.color;
    matched ||= on;
    sw.setAttribute('aria-pressed', String(on));
  }
  colorInput.parentElement.classList.toggle('active', !matched);
  persist();
}

const palette = $('#palette');
for (const color of PALETTE) {
  const sw = document.createElement('button');
  sw.className = 'swatch';
  sw.dataset.color = color;
  sw.style.background = color;
  sw.title = color;
  sw.setAttribute('aria-label', `Color ${color}`);
  sw.addEventListener('click', () => {
    setColor(color);
    if (prefs.tool !== 'pen' && prefs.tool !== 'fill') setTool('pen');
  });
  palette.insertBefore(sw, palette.lastElementChild);
}

colorInput.addEventListener('input', (e) => {
  setColor(e.target.value);
  if (prefs.tool !== 'fill') setTool('pen');
});

for (const btn of document.querySelectorAll('.tool')) {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
}

function setLines(on) {
  prefs.lines = on;
  board.classList.toggle('show-lines', on);
  linesBtn.setAttribute('aria-pressed', String(on));
  persist();
}

function setHover(on) {
  prefs.hover = on;
  hoverBtn.setAttribute('aria-pressed', String(on));
  if (stroke) endStroke();
  persist();
}

linesBtn.addEventListener('click', () => setLines(!prefs.lines));
hoverBtn.addEventListener('click', () => setHover(!prefs.hover));

// ---------- size ----------
// Live preview while dragging the slider; one undo step when it is released.
let resizeOrigin = null;
slider.addEventListener('input', () => {
  const size = clampSize(slider.value);
  // Close any open stroke first (e.g. a knob stroke waiting on its idle timer),
  // or it would commit after the resize with indices from the old grid size.
  if (stroke) endStroke();
  resizeOrigin ??= { size: drawing.size, cells: drawing.cells.slice() };
  drawing.cells = resample(resizeOrigin.cells, resizeOrigin.size, size);
  drawing.size = size;
  buildBoard();
});
slider.addEventListener('change', () => {
  if (resizeOrigin && resizeOrigin.size !== drawing.size) edits.pushSnapshot(resizeOrigin, drawing);
  resizeOrigin = null;
  syncHistoryButtons();
  persist();
});

// ---------- undo / redo / shake / export ----------
function undo() {
  if (stroke) endStroke();
  applyHistory(edits.undo(drawing));
}

function redo() {
  if (stroke) endStroke();
  applyHistory(edits.redo(drawing));
}

function applyHistory(result) {
  if (!result) return;
  if (result.rebuild) buildBoard();
  else result.changed.forEach(paintCell);
  syncHistoryButtons();
  persist();
}

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

let shaking = false;
function shake() {
  if (shaking) return;
  if (stroke) endStroke();
  shaking = true;
  frame.classList.remove('shaking');
  void frame.offsetWidth; // restart the animation
  frame.classList.add('shaking');
  board.classList.add('fading');
  setTimeout(() => {
    edits.begin();
    drawing.cells.forEach((c, i) => {
      if (c !== null) {
        edits.record(i, c, null);
        drawing.cells[i] = null;
        paintCell(i);
      }
    });
    edits.commit();
    board.classList.remove('fading');
    frame.classList.remove('shaking');
    shaking = false;
    syncHistoryButtons();
    persist();
  }, 600);
}

$('#shake').addEventListener('click', shake);

function savePng() {
  const { size, cells } = drawing;
  const scale = Math.max(1, Math.ceil(1024 / size));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = SCREEN_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  cells.forEach((c, i) => {
    if (!c) return;
    ctx.fillStyle = c;
    ctx.fillRect((i % size) * scale, Math.floor(i / size) * scale, scale, scale);
  });
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `etch-a-sketch-${size}x${size}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

$('#save-png').addEventListener('click', savePng);

// ---------- keyboard ----------
const TOOL_KEYS = { b: 'pen', r: 'rainbow', s: 'shade', l: 'lighten', e: 'eraser', f: 'fill', i: 'picker' };
const ARROWS = { ArrowLeft: [knobX, -1], ArrowRight: [knobX, 1], ArrowUp: [knobY, 1], ArrowDown: [knobY, -1] };

document.addEventListener('keydown', (e) => {
  if (sketchView.hidden) return;
  if (e.target.closest?.('input, textarea, select, [role="slider"]')) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && key === 'y') { e.preventDefault(); return redo(); }
  if (mod || e.altKey) return;
  if (e.key in ARROWS) {
    e.preventDefault();
    const [knob, dir] = ARROWS[e.key];
    knob.turn(dir * KNOB_DEGREES_PER_CELL);
    return;
  }
  if (TOOL_KEYS[key]) return setTool(TOOL_KEYS[key]);
  if (key === 'g') return setLines(!prefs.lines);
  if (key === 'h') return setHover(!prefs.hover);
  if (key === 'x') return shake();
});

// ---------- tabs ----------
const sketchView = $('#sketch-view');
const raceView = $('#race-view');
const tabs = { sketch: $('#tab-sketch'), race: $('#tab-race') };
const race = initRace();

function showTab(name) {
  const isRace = name === 'race';
  sketchView.hidden = isRace;
  raceView.hidden = !isRace;
  tabs.sketch.setAttribute('aria-selected', String(!isRace));
  tabs.race.setAttribute('aria-selected', String(isRace));
  if (!isRace) race.pause();
  if (location.hash !== `#${name}`) window.history.replaceState(null, '', `#${name}`);
}

tabs.sketch.addEventListener('click', () => showTab('sketch'));
tabs.race.addEventListener('click', () => showTab('race'));
window.addEventListener('hashchange', () => showTab(location.hash === '#race' ? 'race' : 'sketch'));

// ---------- boot ----------
buildBoard();
setTool(prefs.tool);
setColor(prefs.color);
setLines(prefs.lines);
setHover(prefs.hover);
syncHistoryButtons();
showTab(location.hash === '#race' ? 'race' : 'sketch');
