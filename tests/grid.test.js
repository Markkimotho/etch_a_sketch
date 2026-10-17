import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LINE_ALPHA_MAX, LINE_ALPHA_MIN, MAX_SIZE,
  cellFromPoint, clampSize, createCells, floodFill, gridLineAlpha, linePoints, parseDrawing, resample,
} from '../src/grid.js';

test('clampSize keeps sizes in 1..100 and rounds', () => {
  assert.equal(clampSize(0), 1);
  assert.equal(clampSize(250), 100);
  assert.equal(clampSize('42'), 42);
  assert.equal(clampSize(16.6), 17);
  assert.equal(clampSize('nope'), 16);
});

test('cellFromPoint maps pixels to cells', () => {
  assert.deepEqual(cellFromPoint(0, 0, 480, 480, 16), { x: 0, y: 0 });
  assert.deepEqual(cellFromPoint(479.9, 479.9, 480, 480, 16), { x: 15, y: 15 });
  assert.deepEqual(cellFromPoint(31, 29, 480, 480, 16), { x: 1, y: 0 });
});

test('cellFromPoint returns null outside the board unless clamped', () => {
  assert.equal(cellFromPoint(-1, 10, 480, 480, 16), null);
  assert.equal(cellFromPoint(480, 10, 480, 480, 16), null);
  assert.deepEqual(cellFromPoint(-50, 999, 480, 480, 16, { clamp: true }), { x: 0, y: 15 });
  assert.equal(cellFromPoint(5, 5, 0, 0, 16), null);
});

test('linePoints is continuous with both endpoints', () => {
  for (const [x0, y0, x1, y1] of [[0, 0, 7, 3], [5, 5, 0, 0], [2, 9, 2, 1], [0, 0, 0, 0], [3, 1, 9, 8]]) {
    const pts = linePoints(x0, y0, x1, y1);
    assert.deepEqual(pts[0], { x: x0, y: y0 });
    assert.deepEqual(pts.at(-1), { x: x1, y: y1 });
    assert.equal(pts.length, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1);
    for (let i = 1; i < pts.length; i++) {
      assert.ok(Math.abs(pts[i].x - pts[i - 1].x) <= 1 && Math.abs(pts[i].y - pts[i - 1].y) <= 1, 'gap in line');
    }
  }
});

test('floodFill fills a 4-connected region and stops at borders', () => {
  // 4x4 with a vertical wall in column 2
  const W = '#000000';
  const cells = [
    null, null, W, null,
    null, null, W, null,
    null, null, W, null,
    null, null, W, null,
  ];
  const { before, changed } = floodFill(cells, 4, 0, '#ff0000');
  assert.equal(before, null);
  assert.equal(changed.length, 8);
  assert.equal(cells[3], null, 'fill leaked past the wall');
  assert.equal(cells[1], '#ff0000');
});

test('floodFill does not wrap across row edges', () => {
  const R = '#ff0000';
  // row 0 ends with null at x=2, row 1 starts with null at x=0: index-adjacent but not grid-adjacent
  const cells = [R, R, null, null, R, R, R, R, R];
  const { changed } = floodFill(cells, 3, 2, '#00ff00');
  assert.deepEqual(changed, [2]);
});

test('floodFill with the same color is a no-op', () => {
  const cells = createCells(3).fill('#111111');
  assert.equal(floodFill(cells, 3, 4, '#111111').changed.length, 0);
});

test('resample keeps the drawing when the grid grows or shrinks', () => {
  const cells = ['#aa0000', null, null, '#00aa00'];
  const up = resample(cells, 2, 4);
  assert.equal(up.length, 16);
  assert.equal(up[0], '#aa0000');
  assert.equal(up[15], '#00aa00');
  assert.deepEqual(resample(up, 4, 2), cells);
  assert.deepEqual(resample(cells, 2, 2), cells);
  assert.notEqual(resample(cells, 2, 2), cells, 'should copy');
});

// Regression: grid lines were a solid near-black 1px border at every size, which
// swamped the drawing at high cell counts. Lines must fade as density rises.
test('gridLineAlpha fades as the grid gets denser', () => {
  assert.equal(gridLineAlpha(1), LINE_ALPHA_MAX);
  assert.equal(gridLineAlpha(MAX_SIZE), LINE_ALPHA_MIN);
  let prev = Infinity;
  for (let n = 1; n <= MAX_SIZE; n++) {
    const a = gridLineAlpha(n);
    assert.ok(a <= prev, `alpha went up at ${n}`);
    assert.ok(a >= LINE_ALPHA_MIN && a <= LINE_ALPHA_MAX);
    prev = a;
  }
  assert.ok(gridLineAlpha(100) <= 0.06, 'lines at 100x100 must be very faint');
});

test('parseDrawing accepts valid data and rejects garbage', () => {
  assert.deepEqual(parseDrawing({ size: 2, cells: ['#ABC', null, null, '#000000'] }), {
    size: 2, cells: ['#aabbcc', null, null, '#000000'],
  });
  assert.equal(parseDrawing(null), null);
  assert.equal(parseDrawing({ size: 2, cells: [null] }), null);
  assert.equal(parseDrawing({ size: 2, cells: ['red', null, null, null] }), null);
  assert.equal(parseDrawing({ size: 500, cells: [] }), null);
});
