import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStats, parseStats, recordResult } from '../src/stats.js';

test('recordResult tallies wins, draws, rounds', () => {
  let s = emptyStats();
  s = recordResult(s, { winner: 'p1', reason: 'time', seconds: 60 });
  s = recordResult(s, { winner: null, reason: 'time', seconds: 60 });
  s = recordResult(s, { winner: 'cpu', reason: 'time', seconds: 60 });
  assert.equal(s.rounds, 3);
  assert.equal(s.draws, 1);
  assert.deepEqual(s.wins, { p1: 1, p2: 0, cpu: 1 });
});

test('streaks grow, reset on a different winner or a draw, best is kept', () => {
  let s = emptyStats();
  for (let i = 0; i < 3; i++) s = recordResult(s, { winner: 'p1', reason: 'time', seconds: 60 });
  assert.deepEqual(s.streak, { who: 'p1', count: 3 });
  s = recordResult(s, { winner: 'p2', reason: 'time', seconds: 60 });
  assert.deepEqual(s.streak, { who: 'p2', count: 1 });
  s = recordResult(s, { winner: null, reason: 'time', seconds: 60 });
  assert.deepEqual(s.streak, { who: null, count: 0 });
  assert.deepEqual(s.bestStreak, { who: 'p1', count: 3 });
});

test('fastest goal only counts goal wins and keeps the minimum', () => {
  let s = emptyStats();
  s = recordResult(s, { winner: 'p1', reason: 'time', seconds: 5 });
  assert.equal(s.fastestGoal, null);
  s = recordResult(s, { winner: 'p1', reason: 'goal', seconds: 31.26 });
  s = recordResult(s, { winner: 'cpu', reason: 'goal', seconds: 40 });
  assert.deepEqual(s.fastestGoal, { who: 'p1', seconds: 31.3 });
  s = recordResult(s, { winner: 'cpu', reason: 'goal', seconds: 20 });
  assert.deepEqual(s.fastestGoal, { who: 'cpu', seconds: 20 });
});

test('recordResult does not mutate its input', () => {
  const s = emptyStats();
  recordResult(s, { winner: 'p1', reason: 'goal', seconds: 3 });
  assert.deepEqual(s, emptyStats());
});

test('parseStats survives garbage from storage', () => {
  assert.deepEqual(parseStats(null), emptyStats());
  assert.deepEqual(parseStats('x'), emptyStats());
  const s = parseStats({ rounds: -3, wins: { p1: 2, cpu: 'lots' }, streak: { who: 'hacker', count: 9 }, fastestGoal: { who: 'p1', seconds: -1 } });
  assert.equal(s.rounds, 0);
  assert.deepEqual(s.wins, { p1: 2, p2: 0, cpu: 0 });
  assert.deepEqual(s.streak, { who: null, count: 9 });
  assert.equal(s.fastestGoal, null);
});
