import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCREEN_COLOR, applyTool } from '../src/tools.js';
import { History } from '../src/history.js';
import { isHex } from '../src/color.js';
import { mulberry32 } from '../src/game.js';

test('pen paints the chosen color, eraser clears', () => {
  assert.equal(applyTool('pen', null, { color: '#F00' }), '#ff0000');
  assert.equal(applyTool('eraser', '#123456'), null);
});

test('rainbow gives a valid random color', () => {
  assert.ok(isHex(applyTool('rainbow', null, { rng: mulberry32(1) })));
});

test('shade darkens progressively from the screen color to black in 10 passes', () => {
  let c = null;
  const seen = [];
  for (let i = 0; i < 10; i++) {
    c = applyTool('shade', c);
    seen.push(c);
  }
  assert.notEqual(seen[0], SCREEN_COLOR);
  assert.equal(new Set(seen.slice(0, 9)).size, 9, 'each pass should darken');
  assert.equal(c, '#000000');
});

test('lighten leaves empty cells empty', () => {
  assert.equal(applyTool('lighten', null), null);
  assert.equal(applyTool('lighten', '#000000'), '#1a1a1a');
});

test('unknown tools throw', () => {
  assert.throws(() => applyTool('fill', null));
});

test('history undoes and redoes a stroke as one step', () => {
  const drawing = { size: 2, cells: [null, null, null, null] };
  const h = new History();
  h.begin();
  for (const i of [0, 1, 0]) {
    const before = drawing.cells[i];
    drawing.cells[i] = '#ff0000';
    h.record(i, before, '#ff0000');
  }
  assert.ok(h.commit());
  assert.deepEqual(h.undo(drawing), { rebuild: false, changed: [0, 1] });
  assert.deepEqual(drawing.cells, [null, null, null, null]);
  h.redo(drawing);
  assert.deepEqual(drawing.cells, ['#ff0000', '#ff0000', null, null]);
});

test('a stroke that changes nothing is not stored', () => {
  const h = new History();
  h.begin();
  h.record(0, '#000000', '#000000');
  assert.equal(h.commit(), false);
  assert.equal(h.canUndo, false);
});

test('first before and last after win when a stroke revisits a cell', () => {
  const drawing = { size: 1, cells: ['#000000'] };
  const h = new History();
  h.begin();
  h.record(0, '#000000', '#111111');
  h.record(0, '#111111', '#222222');
  h.commit();
  drawing.cells[0] = '#222222';
  h.undo(drawing);
  assert.equal(drawing.cells[0], '#000000');
});

test('snapshots restore size and cells; new work clears redo', () => {
  const drawing = { size: 1, cells: ['#abcdef'] };
  const h = new History();
  const after = { size: 2, cells: ['#abcdef', '#abcdef', '#abcdef', '#abcdef'] };
  h.pushSnapshot(drawing, after);
  Object.assign(drawing, after);
  assert.deepEqual(h.undo(drawing), { rebuild: true });
  assert.equal(drawing.size, 1);
  assert.deepEqual(drawing.cells, ['#abcdef']);
  assert.ok(h.canRedo);
  h.begin();
  h.record(0, '#abcdef', null);
  h.commit();
  assert.equal(h.canRedo, false);
});

test('history respects its limit', () => {
  const h = new History(3);
  for (let i = 0; i < 5; i++) {
    h.begin();
    h.record(0, i, i + 1);
    h.commit();
  }
  assert.equal(h.undoStack.length, 3);
});

test('record outside a stroke throws, undo on empty returns null', () => {
  const h = new History();
  assert.throws(() => h.record(0, null, '#000000'));
  assert.equal(h.undo({ size: 1, cells: [null] }), null);
  assert.equal(h.redo({ size: 1, cells: [null] }), null);
});
