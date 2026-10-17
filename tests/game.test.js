import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY, SPEED_TICKS, computeScores, cpuChooseDir, createGame, decideWinner, largestPatch,
  mulberry32, steer, tick,
} from '../src/game.js';

const quiet = (opts = {}) => createGame({ powerups: false, rng: mulberry32(1), ...opts });

test('game starts with each avatar on its own painted cell', () => {
  const g = quiet({ size: 10 });
  assert.equal(g.owner[1 * 10 + 1], 0);
  assert.equal(g.owner[8 * 10 + 8], 1);
  assert.deepEqual(g.scores, { largest: [1, 1], totals: [1, 1] });
  assert.equal(g.goalCells, 25);
  assert.equal(g.durationTicks, 480);
  assert.throws(() => createGame({ size: 3 }));
});

test('avatars paint the cells they move onto', () => {
  const g = quiet({ size: 10 });
  const { changed } = tick(g);
  assert.equal(g.players[0].x, 2);
  assert.equal(g.players[1].x, 7);
  assert.deepEqual(changed.sort((a, b) => a - b), [12, 87]);
  assert.deepEqual(g.scores.largest, [2, 2]);
});

test('walls stop avatars without wrapping', () => {
  const g = quiet({ size: 6 });
  steer(g, 0, 'up');
  tick(g);
  tick(g);
  tick(g);
  assert.deepEqual([g.players[0].x, g.players[0].y], [1, 0]);
});

test('steer ignores bad input', () => {
  const g = quiet();
  steer(g, 0, 'sideways');
  steer(g, 9, 'up');
  assert.equal(g.players[0].dir, 'right');
});

test('painting over the opponent steals their cells', () => {
  const g = quiet({ size: 6 });
  g.owner[1 * 6 + 2] = 1;
  tick(g);
  assert.equal(g.owner[1 * 6 + 2], 0);
});

test('two avatars never share a cell: same target blocks both', () => {
  const g = quiet({ size: 6 });
  Object.assign(g.players[0], { x: 1, y: 2, dir: 'right' });
  Object.assign(g.players[1], { x: 3, y: 2, dir: 'left' });
  tick(g);
  assert.deepEqual([g.players[0].x, g.players[1].x], [1, 3]);
});

test('head-on swap is blocked', () => {
  const g = quiet({ size: 6 });
  Object.assign(g.players[0], { x: 2, y: 2, dir: 'right' });
  Object.assign(g.players[1], { x: 3, y: 2, dir: 'left' });
  tick(g);
  assert.deepEqual([g.players[0].x, g.players[1].x], [2, 3]);
});

test('following directly behind a moving avatar is allowed', () => {
  const g = quiet({ size: 8 });
  Object.assign(g.players[0], { x: 2, y: 2, dir: 'right' });
  Object.assign(g.players[1], { x: 3, y: 2, dir: 'right' });
  tick(g);
  assert.deepEqual([g.players[0].x, g.players[1].x], [3, 4]);
});

test('moving into a stationary (wall-blocked) avatar is blocked', () => {
  const g = quiet({ size: 6 });
  Object.assign(g.players[0], { x: 4, y: 2, dir: 'right' });
  Object.assign(g.players[1], { x: 5, y: 2, dir: 'right' });
  tick(g);
  assert.deepEqual([g.players[0].x, g.players[1].x], [4, 5]);
});

test('computeScores finds the largest connected patch, not the total', () => {
  // player 0: a 3-cell patch and a separate 2-cell patch. player 1: 4 connected.
  const size = 5;
  const owner = new Int8Array(size * size).fill(EMPTY);
  for (const i of [0, 1, 2, 10, 11]) owner[i] = 0;
  for (const i of [20, 21, 22, 23]) owner[i] = 1;
  assert.deepEqual(computeScores(owner, size, 2), { largest: [3, 4], totals: [5, 4] });
});

test('computeScores does not join patches across row wrap', () => {
  const size = 3;
  const owner = new Int8Array(9).fill(EMPTY);
  owner[2] = 0; // end of row 0
  owner[3] = 0; // start of row 1
  assert.deepEqual(computeScores(owner, size, 2).largest, [1, 0]);
});

test('largestPatch returns the cells of the biggest patch', () => {
  const owner = new Int8Array(16).fill(EMPTY);
  for (const i of [0, 1, 4]) owner[i] = 0;
  for (const i of [15]) owner[i] = 0;
  assert.deepEqual(largestPatch(owner, 4, 0).sort((a, b) => a - b), [0, 1, 4]);
  assert.deepEqual(largestPatch(owner, 4, 1), []);
});

test('decideWinner: bigger patch, then more total cells, else draw', () => {
  assert.equal(decideWinner({ largest: [10, 4], totals: [10, 40] }), 0);
  assert.equal(decideWinner({ largest: [5, 5], totals: [7, 9] }), 1);
  assert.equal(decideWinner({ largest: [5, 5], totals: [9, 9] }), null);
});

test('reaching the goal patch size ends the race immediately', () => {
  const g = quiet({ size: 10, goalPct: 0.05 }); // goal = 5 cells
  for (let i = 0; i < 3; i++) tick(g);
  assert.equal(g.status, 'playing');
  tick(g);
  assert.equal(g.status, 'over');
  assert.equal(g.reason, 'goal');
  // both started symmetric and both reach 5 at once; equal on every measure = draw
  assert.equal(g.winner, null);
  const ticksAtEnd = g.tick;
  tick(g);
  assert.equal(g.tick, ticksAtEnd, 'ticks after game over must be no-ops');
});

test('timer ends the race and the bigger patch wins', () => {
  const g = quiet({ size: 10, durationSec: 0.5, tickMs: 125 }); // 4 ticks
  steer(g, 1, 'up');
  g.owner[0] = 1; // extra disconnected cell for player 1: total grows, largest does not
  for (let i = 0; i < 3; i++) tick(g);
  g.players[1].x = 0; g.players[1].y = 9; // park player 1 in a corner where it is wall-blocked
  steer(g, 1, 'left');
  tick(g);
  assert.equal(g.status, 'over');
  assert.equal(g.reason, 'time');
  assert.equal(g.winner, 0);
});

test('speed power-up doubles moves for SPEED_TICKS ticks', () => {
  const g = quiet({ size: 80 });
  g.items.push({ x: 2, y: 1, kind: 'speed' });
  const { events } = tick(g);
  assert.deepEqual(events[0], { type: 'pickup', player: 0, kind: 'speed', x: 2, y: 1 });
  // picked up on sub-step 0, so already moved again on sub-step 1 of the same tick
  assert.equal(g.players[0].x, 3);
  assert.equal(g.players[0].boost, SPEED_TICKS - 1);
  tick(g);
  assert.equal(g.players[0].x, 5);
  for (let i = 0; i < SPEED_TICKS; i++) tick(g);
  const x = g.players[0].x;
  tick(g);
  assert.equal(g.players[0].x, x + 1, 'boost should have worn off');
});

test('splash power-up paints a 5x5 square, clipped at walls', () => {
  const g = quiet({ size: 12 });
  g.items.push({ x: 2, y: 1, kind: 'splash' });
  tick(g);
  // centre (2,1): rows -1..3 clip to 0..3, cols 0..4 -> 4 rows x 5 cols = 20, plus start cell (1,1) inside it
  assert.equal(g.scores.totals[0], 20);
  assert.equal(g.items.length, 0);
});

test('power-ups spawn on schedule, capped, never on an avatar', () => {
  const g = createGame({ size: 8, rng: mulberry32(3) });
  for (let i = 0; i < 40 * 5; i++) {
    tick(g);
    for (const it of g.items) {
      // moving onto an item collects it and spawns avoid avatars, so none sits under one
      assert.ok(!g.players.some((p) => p.x === it.x && p.y === it.y), 'item under an avatar');
    }
    assert.ok(g.items.length <= 2);
    if (g.status !== 'playing') break;
  }
  const g2 = createGame({ size: 8, rng: mulberry32(3) });
  for (let i = 0; i < 39; i++) tick(g2);
  assert.equal(g2.items.length, 0);
  const { events } = tick(g2);
  assert.equal(g2.items.length, 1);
  assert.equal(events.at(-1).type, 'spawn');
  const it = g2.items[0];
  assert.ok(!g2.players.some((p) => p.x === it.x && p.y === it.y));
});

test('games are reproducible with the same seed', () => {
  const run = (seed) => {
    const g = createGame({ size: 16, rng: mulberry32(seed) });
    while (g.status === 'playing') {
      steer(g, 0, cpuChooseDir(g, 0, 'normal'));
      steer(g, 1, cpuChooseDir(g, 1, 'normal'));
      tick(g);
    }
    return [g.tick, g.winner, ...g.scores.largest];
  };
  assert.deepEqual(run(42), run(42));
});

test('CPU never steers into a wall or the other avatar', () => {
  const g = quiet({ size: 6 });
  Object.assign(g.players[1], { x: 5, y: 0, dir: 'right' });
  Object.assign(g.players[0], { x: 4, y: 0 });
  for (let i = 0; i < 50; i++) {
    const dir = cpuChooseDir(g, 1, 'hard', mulberry32(i));
    assert.equal(dir, 'down');
  }
});

test('CPU heads for unpainted cells instead of idling in its own color', () => {
  const g = quiet({ size: 10 });
  g.owner.fill(1);
  g.owner[0] = EMPTY; // the only claimable cell, top-left
  Object.assign(g.players[1], { x: 5, y: 0, dir: 'down' });
  Object.assign(g.players[0], { x: 9, y: 9 });
  assert.equal(cpuChooseDir(g, 1, 'hard', mulberry32(1)), 'left');
});

test('CPU vs CPU always finishes within the duration', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const g = createGame({ size: 20, durationSec: 30, rng: mulberry32(seed) });
    let guard = 0;
    while (g.status === 'playing' && guard++ < 10_000) {
      steer(g, 0, cpuChooseDir(g, 0, 'easy'));
      steer(g, 1, cpuChooseDir(g, 1, 'hard'));
      tick(g);
    }
    assert.equal(g.status, 'over');
    assert.ok(g.tick <= g.durationTicks);
  }
});
