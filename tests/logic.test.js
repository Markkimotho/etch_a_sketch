// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

test('grid lines get lighter as the grid gets bigger', () => {
  assert.equal(L.gridLineAlpha(4), 0.2);
  assert.equal(L.gridLineAlpha(100), 0.04);
  for (let n = 2; n <= 100; n++) assert.ok(L.gridLineAlpha(n) <= L.gridLineAlpha(n - 1));
});

test('linePoints has no gaps between start and end', () => {
  const pts = L.linePoints(0, 0, 7, 3);
  assert.deepEqual(pts[0], { x: 0, y: 0 });
  assert.deepEqual(pts.at(-1), { x: 7, y: 3 });
  for (let i = 1; i < pts.length; i++) {
    assert.ok(Math.abs(pts[i].x - pts[i - 1].x) <= 1 && Math.abs(pts[i].y - pts[i - 1].y) <= 1);
  }
});

test('darken reaches black in 10 passes', () => {
  let c = 'rgb(255, 255, 255)';
  for (let i = 0; i < 10; i++) c = L.darken(c);
  assert.equal(c, 'rgb(0, 0, 0)');
});

test('players paint the cells they move onto and stop at walls', () => {
  const g = L.createGame(8, 60, 125);
  L.steer(g, 0, 'up');
  L.tick(g); // already at y=1, moves to y=0
  L.tick(g); // wall, stays
  assert.deepEqual([g.players[0].x, g.players[0].y], [1, 0]);
  assert.equal(g.owner[0 * 8 + 1], 0);
});

test('players never share a cell', () => {
  const g = L.createGame(8, 60, 125);
  Object.assign(g.players[0], { x: 3, y: 4, dir: 'right' });
  Object.assign(g.players[1], { x: 5, y: 4, dir: 'left' });
  L.tick(g); // both want (4,4)
  assert.deepEqual([g.players[0].x, g.players[1].x], [3, 5]);
});

test('score is the biggest connected patch, not the total', () => {
  const E = L.EMPTY;
  const owner = [0, 0, E, 0, E, E, E, 0, 1, 1, 1, E, 1, E, E, E];
  assert.deepEqual(L.biggestPatches(owner, 4), [2, 4]); // player 0 has two patches of 2 cells
});

test('reaching the goal ends the race with a winner', () => {
  const g = L.createGame(8, 60, 125);
  for (let i = 0; i < 16; i++) g.owner[i] = 0; // goal on 8x8 is 16
  L.tick(g);
  assert.equal(g.over, true);
  assert.equal(g.winner, 0);
});

test('time running out ends the race', () => {
  const g = L.createGame(8, 1, 500); // 2 ticks
  L.tick(g);
  L.tick(g);
  assert.equal(g.over, true);
});

test('computer never walks into a wall and finishes a race', () => {
  const g = L.createGame(24, 60, 125);
  while (!g.over) {
    const dir = L.computerDir(g, 1);
    const me = g.players[1];
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    const nx = me.x + d[0], ny = me.y + d[1];
    assert.ok(nx >= 0 && ny >= 0 && nx < 24 && ny < 24, 'walked into a wall');
    L.steer(g, 1, dir);
    L.tick(g);
  }
  assert.ok(g.scores[1] > 50, 'computer painted only ' + g.scores[1]);
});
