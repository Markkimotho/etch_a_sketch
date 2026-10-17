// Grid geometry and drawing algorithms. Pure functions, no DOM.
// A drawing is { size, cells } where cells is a flat array of hex colors or null (empty).

import { isHex, normalizeHex } from './color.js';

export const MIN_SIZE = 1;
export const MAX_SIZE = 100;
export const DEFAULT_SIZE = 16;

export function clampSize(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

export function createCells(size) {
  return new Array(size * size).fill(null);
}

export function toIndex(size, x, y) {
  return y * size + x;
}

export function inBounds(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

// Map a pixel offset inside a width x height board to a cell.
// With clamp, points outside the board snap to the nearest edge cell (used while
// a stroke is captured and the pointer wanders off the board).
export function cellFromPoint(px, py, width, height, size, { clamp = false } = {}) {
  if (!(width > 0 && height > 0)) return null;
  let x = Math.floor((px / width) * size);
  let y = Math.floor((py / height) * size);
  if (clamp) {
    x = Math.min(size - 1, Math.max(0, x));
    y = Math.min(size - 1, Math.max(0, y));
  } else if (!inBounds(size, x, y)) {
    return null;
  }
  return { x, y };
}

// Bresenham line, both endpoints included. Fast pointer moves skip cells between
// events; this fills the gap so strokes stay continuous.
export function linePoints(x0, y0, x1, y1) {
  const points = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    points.push({ x, y });
    if (x === x1 && y === y1) return points;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

// 4-way flood fill. Mutates cells. Returns the color that was replaced and the
// indices that changed, so the caller can record history and repaint only those.
export function floodFill(cells, size, start, color) {
  const before = cells[start];
  if (before === color) return { before, changed: [] };
  const changed = [start];
  const stack = [start];
  cells[start] = color;
  while (stack.length) {
    const i = stack.pop();
    const x = i % size;
    const neighbors = [];
    if (x > 0) neighbors.push(i - 1);
    if (x < size - 1) neighbors.push(i + 1);
    if (i >= size) neighbors.push(i - size);
    if (i < size * (size - 1)) neighbors.push(i + size);
    for (const n of neighbors) {
      if (cells[n] === before) {
        cells[n] = color;
        changed.push(n);
        stack.push(n);
      }
    }
  }
  return { before, changed };
}

// Nearest-neighbor rescale so changing the grid size keeps the drawing.
export function resample(cells, from, to) {
  if (from === to) return cells.slice();
  const out = createCells(to);
  for (let y = 0; y < to; y++) {
    const sy = Math.floor(((y + 0.5) * from) / to);
    for (let x = 0; x < to; x++) {
      const sx = Math.floor(((x + 0.5) * from) / to);
      out[y * to + x] = cells[sy * from + sx];
    }
  }
  return out;
}

// Grid line opacity for a given grid size. Dense grids get fainter lines so the
// lines never overpower the drawing (the old 1px near-black border did, since at
// 100x100 each 3.6px cell was mostly border).
export const LINE_ALPHA_MAX = 0.22;
export const LINE_ALPHA_MIN = 0.05;
const LINE_FADE_START = 8;

export function gridLineAlpha(size) {
  if (size <= LINE_FADE_START) return LINE_ALPHA_MAX;
  if (size >= MAX_SIZE) return LINE_ALPHA_MIN;
  const t = (size - LINE_FADE_START) / (MAX_SIZE - LINE_FADE_START);
  return Math.round((LINE_ALPHA_MAX - t * (LINE_ALPHA_MAX - LINE_ALPHA_MIN)) * 1000) / 1000;
}

// Validate a drawing loaded from storage. Anything malformed returns null so the
// caller starts fresh instead of crashing on bad data.
export function parseDrawing(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const size = clampSize(raw.size);
  if (size !== raw.size) return null;
  if (!Array.isArray(raw.cells) || raw.cells.length !== size * size) return null;
  const cells = [];
  for (const c of raw.cells) {
    if (c === null) cells.push(null);
    else if (isHex(c)) cells.push(normalizeHex(c));
    else return null;
  }
  return { size, cells };
}
