// Eval: are the CPU difficulty levels really ordered?
// Plays seeded CPU-vs-CPU races (sides swapped every game to cancel start-corner bias)
// and checks win rates against thresholds. Deterministic, but slower than the gate
// tests, so it runs before shipping rather than on every commit.
//
//   npm run eval

import { createGame, cpuChooseDir, mulberry32, steer, tick } from '../../src/game.js';

const GAMES = 60;
// EVAL_SEED shifts the seed range, to check tuning generalizes beyond the default seeds.
const SEED_BASE = Number(process.env.EVAL_SEED ?? 1000);

function randomWalker(state, id, rng) {
  const dirs = ['up', 'down', 'left', 'right'];
  return rng() < 0.3 ? dirs[Math.floor(rng() * 4)] : state.players[id].dir;
}

function play(a, b, seed) {
  const rng = mulberry32(seed);
  const g = createGame({ size: 24, durationSec: 60, rng });
  const pick = (who, id) => (who === 'random' ? randomWalker(g, id, rng) : cpuChooseDir(g, id, who));
  while (g.status === 'playing') {
    steer(g, 0, pick(a, 0));
    steer(g, 1, pick(b, 1));
    tick(g);
  }
  return g.winner;
}

function matchup(strong, weak) {
  let wins = 0, losses = 0, draws = 0;
  for (let i = 0; i < GAMES; i++) {
    const strongFirst = i % 2 === 0;
    const winner = strongFirst ? play(strong, weak, SEED_BASE + i) : play(weak, strong, SEED_BASE + i);
    const strongId = strongFirst ? 0 : 1;
    if (winner === null) draws++;
    else if (winner === strongId) wins++;
    else losses++;
  }
  return { wins, losses, draws, rate: wins / GAMES };
}

const CASES = [
  { strong: 'easy', weak: 'random', min: 0.8 },
  { strong: 'normal', weak: 'easy', min: 0.6 },
  { strong: 'hard', weak: 'easy', min: 0.7 },
  { strong: 'hard', weak: 'normal', min: 0.6 },
];

let failed = 0;
const started = performance.now();
for (const c of CASES) {
  const r = matchup(c.strong, c.weak);
  const ok = r.rate >= c.min;
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${c.strong.padEnd(6)} vs ${c.weak.padEnd(6)}  ` +
    `win ${(r.rate * 100).toFixed(0).padStart(3)}%  (W${r.wins} L${r.losses} D${r.draws})  need >= ${c.min * 100}%`,
  );
}
console.log(`${CASES.length - failed}/${CASES.length} passed in ${((performance.now() - started) / 1000).toFixed(1)}s`);
process.exitCode = failed ? 1 : 0;
