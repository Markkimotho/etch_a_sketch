// Paint Race: two avatars race across the board painting cells in their color.
// The winner owns the LARGEST CONNECTED PATCH (4-way) of color: first to reach the
// goal size wins outright, otherwise the bigger patch when the timer runs out.
// Pure, deterministic given the injected rng. No DOM.

export const DIRS = Object.freeze({
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
});
const DIR_NAMES = Object.keys(DIRS);

export const EMPTY = -1;
export const POWERUP_KINDS = ['speed', 'splash'];
export const SPEED_TICKS = 24; // double moves for this many ticks (3s at 125ms)
export const SPLASH_RADIUS = 2; // paints a 5x5 square
export const SPAWN_EVERY = 40; // ticks between power-up spawn attempts
export const MAX_ITEMS = 2;

// Small seeded PRNG so games and tests are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame({
  size = 24,
  durationSec = 60,
  tickMs = 125,
  goalPct = 0.25,
  powerups = true,
  rng = Math.random,
} = {}) {
  if (!(size >= 4)) throw new RangeError('size must be at least 4');
  const owner = new Int8Array(size * size).fill(EMPTY);
  const players = [
    { id: 0, x: 1, y: 1, dir: 'right', boost: 0 },
    { id: 1, x: size - 2, y: size - 2, dir: 'left', boost: 0 },
  ];
  for (const p of players) owner[p.y * size + p.x] = p.id;
  return {
    size,
    tickMs,
    tick: 0,
    durationTicks: Math.max(1, Math.round((durationSec * 1000) / tickMs)),
    goalCells: Math.max(1, Math.ceil(size * size * goalPct)),
    owner,
    players,
    items: [],
    powerups,
    rng,
    status: 'playing',
    winner: null, // player id, or null for a draw
    reason: null, // 'goal' | 'time'
    scores: computeScores(owner, size, players.length),
  };
}

export function steer(state, playerId, dir) {
  if (!DIRS[dir]) return;
  const player = state.players[playerId];
  if (player) player.dir = dir;
}

// One flood-fill pass labels every patch: O(cells).
export function computeScores(owner, size, playerCount) {
  const largest = new Array(playerCount).fill(0);
  const totals = new Array(playerCount).fill(0);
  const seen = new Uint8Array(owner.length);
  const stack = [];
  for (let start = 0; start < owner.length; start++) {
    const who = owner[start];
    if (who === EMPTY) continue;
    totals[who]++;
    if (seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let count = 0;
    while (stack.length) {
      const i = stack.pop();
      count++;
      const x = i % size;
      const visit = (n) => {
        if (!seen[n] && owner[n] === who) { seen[n] = 1; stack.push(n); }
      };
      if (x > 0) visit(i - 1);
      if (x < size - 1) visit(i + 1);
      if (i >= size) visit(i - size);
      if (i < owner.length - size) visit(i + size);
    }
    if (count > largest[who]) largest[who] = count;
  }
  return { largest, totals };
}

// Indices of a player's largest patch. Used to spotlight the winning patch.
export function largestPatch(owner, size, who) {
  const seen = new Uint8Array(owner.length);
  let best = [];
  for (let start = 0; start < owner.length; start++) {
    if (owner[start] !== who || seen[start]) continue;
    const patch = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      patch.push(i);
      const x = i % size;
      for (const n of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size]) {
        if (n >= 0 && n < owner.length && !seen[n] && owner[n] === who) { seen[n] = 1; stack.push(n); }
      }
    }
    if (patch.length > best.length) best = patch;
  }
  return best;
}

// Bigger patch wins; equal patches fall back to total painted; still equal is a draw (null).
export function decideWinner({ largest, totals }) {
  let best = null;
  let tied = false;
  for (let id = 0; id < largest.length; id++) {
    if (best === null) { best = id; continue; }
    const diff = largest[id] - largest[best] || totals[id] - totals[best];
    if (diff > 0) { best = id; tied = false; } else if (diff === 0) tied = true;
  }
  return tied ? null : best;
}

// Advance one tick. Mutates state. Returns the cell indices that changed color
// and any events (pickups, spawns) so the UI repaints only what it must.
export function tick(state) {
  if (state.status !== 'playing') return { changed: [], events: [] };
  const changed = new Set();
  const events = [];

  // Sub-step 0: everyone moves. Sub-step 1: only boosted players move again.
  for (let sub = 0; sub < 2; sub++) {
    const movers = state.players.filter((p) => sub === 0 || p.boost > 0);
    if (movers.length === 0) break;
    for (const p of resolveMoves(state, movers)) {
      paint(state, p.id, p.x, p.y, changed);
      collect(state, p, changed, events);
    }
  }
  for (const p of state.players) if (p.boost > 0) p.boost--;

  state.tick++;
  maybeSpawn(state, events);
  state.scores = computeScores(state.owner, state.size, state.players.length);
  checkEnd(state);
  return { changed: [...changed], events };
}

// Simultaneous movement. Walls block. Two avatars can never share a cell:
// same target blocks both, a head-on swap blocks both, and moving into a cell
// whose occupant is not leaving blocks the mover.
function resolveMoves(state, movers) {
  const { size, players } = state;
  const plan = new Map();
  for (const p of movers) {
    const [dx, dy] = DIRS[p.dir];
    const x = p.x + dx;
    const y = p.y + dy;
    plan.set(p, x >= 0 && y >= 0 && x < size && y < size ? { x, y } : null);
  }
  let again = true;
  while (again) {
    again = false;
    for (const [p, target] of plan) {
      if (!target) continue;
      for (const q of players) {
        if (q === p) continue;
        const qTarget = plan.get(q) ?? null;
        const qEnd = qTarget ?? { x: q.x, y: q.y };
        const sameTarget = target.x === qEnd.x && target.y === qEnd.y;
        const swap = qTarget && qTarget.x === p.x && qTarget.y === p.y && target.x === q.x && target.y === q.y;
        if (sameTarget || swap) {
          plan.set(p, null);
          if (qTarget && (swap || (qTarget.x === target.x && qTarget.y === target.y))) plan.set(q, null);
          again = true;
          break;
        }
      }
    }
  }
  const moved = [];
  for (const [p, target] of plan) {
    if (!target) continue;
    p.x = target.x;
    p.y = target.y;
    moved.push(p);
  }
  return moved;
}

function paint(state, who, x, y, changed) {
  const i = y * state.size + x;
  if (state.owner[i] !== who) {
    state.owner[i] = who;
    changed.add(i);
  }
}

function collect(state, player, changed, events) {
  const at = state.items.findIndex((it) => it.x === player.x && it.y === player.y);
  if (at === -1) return;
  const [item] = state.items.splice(at, 1);
  if (item.kind === 'speed') {
    player.boost = SPEED_TICKS;
  } else if (item.kind === 'splash') {
    for (let dy = -SPLASH_RADIUS; dy <= SPLASH_RADIUS; dy++) {
      for (let dx = -SPLASH_RADIUS; dx <= SPLASH_RADIUS; dx++) {
        const x = player.x + dx;
        const y = player.y + dy;
        if (x >= 0 && y >= 0 && x < state.size && y < state.size) paint(state, player.id, x, y, changed);
      }
    }
  }
  events.push({ type: 'pickup', player: player.id, kind: item.kind, x: item.x, y: item.y });
}

function maybeSpawn(state, events) {
  if (!state.powerups || state.tick % SPAWN_EVERY !== 0 || state.items.length >= MAX_ITEMS) return;
  for (let tries = 0; tries < 50; tries++) {
    const x = Math.floor(state.rng() * state.size);
    const y = Math.floor(state.rng() * state.size);
    const taken = state.players.some((p) => p.x === x && p.y === y) || state.items.some((it) => it.x === x && it.y === y);
    if (taken) continue;
    const kind = POWERUP_KINDS[Math.floor(state.rng() * POWERUP_KINDS.length)];
    const item = { x, y, kind };
    state.items.push(item);
    events.push({ type: 'spawn', ...item });
    return;
  }
}

function checkEnd(state) {
  const { largest } = state.scores;
  const reached = state.players.filter((p) => largest[p.id] >= state.goalCells);
  if (reached.length > 0) {
    state.status = 'over';
    state.reason = 'goal';
    state.winner = reached.length === 1 ? reached[0].id : decideWinner(state.scores);
  } else if (state.tick >= state.durationTicks) {
    state.status = 'over';
    state.reason = 'time';
    state.winner = decideWinner(state.scores);
  }
}

// ---------- CPU opponent ----------

// focus: chance the CPU re-plans on a tick (easy one sometimes keeps drifting).
// noise: random jitter added to each option's score.
// patchSense: how much it plays the real win condition, growing its own patch
// and cutting through the opponent's biggest one.
export const CPU_LEVELS = Object.freeze({
  easy: { lookahead: 3, noise: 1.2, focus: 0.55, patchSense: 0 },
  normal: { lookahead: 5, noise: 0.45, focus: 0.85, patchSense: 0 },
  hard: { lookahead: 7, noise: 0.05, focus: 1, patchSense: 1 },
});

export function cpuChooseDir(state, id, level = 'normal', rng = state.rng) {
  const cfg = CPU_LEVELS[level] ?? CPU_LEVELS.normal;
  const me = state.players[id];
  if (rng() > cfg.focus) return me.dir;
  const { size, owner, items } = state;
  const others = state.players.filter((p) => p !== me);
  const rivalPatch = new Set();
  if (cfg.patchSense) for (const o of others) for (const i of largestPatch(owner, size, o.id)) rivalPatch.add(i);
  let best = null;
  let bestScore = -Infinity;

  for (const dir of DIR_NAMES) {
    const [dx, dy] = DIRS[dir];
    const nx = me.x + dx;
    const ny = me.y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    if (others.some((o) => o.x === nx && o.y === ny)) continue;

    // Value of the straight run ahead: stealing > claiming empty > re-treading own.
    let score = 0;
    for (let k = 1, x = me.x, y = me.y; k <= cfg.lookahead; k++) {
      x += dx;
      y += dy;
      if (x < 0 || y < 0 || x >= size || y >= size) break;
      const i = y * size + x;
      const o = owner[i];
      score += (o === id ? 0.05 : o === EMPTY ? 1 : 1.5) / k;
      if (cfg.patchSense && o !== id) {
        if (rivalPatch.has(i)) score += (cfg.patchSense * 2.5) / k;
        if (touchesOwn(state, id, x, y, null)) score += (cfg.patchSense * 0.25) / k;
      }
      if (items.some((it) => it.x === x && it.y === y)) score += 3 / k;
    }
    // Pull toward the nearest cell worth painting, so the CPU never idles inside its own color.
    score += 1.5 / (1 + distanceToUnowned(state, id, nx, ny));
    // Staying adjacent to its own color keeps the patch connected.
    if (touchesOwn(state, id, nx, ny, me)) score += 0.25;
    if (dir === me.dir) score += 0.2;
    score += cfg.noise * rng();

    if (score > bestScore) { bestScore = score; best = dir; }
  }
  return best ?? me.dir;
}

function distanceToUnowned(state, id, sx, sy) {
  const { size, owner } = state;
  const start = sy * size + sx;
  if (owner[start] !== id) return 0;
  const dist = new Int16Array(owner.length).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % size;
    for (const n of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size]) {
      if (n < 0 || n >= owner.length || dist[n] !== -1) continue;
      dist[n] = dist[i] + 1;
      if (owner[n] !== id) return dist[n];
      queue.push(n);
    }
  }
  return size * 2;
}

function touchesOwn(state, id, x, y, from) {
  const { size, owner } = state;
  for (const [dx, dy] of Object.values(DIRS)) {
    const nx = x + dx;
    const ny = y + dy;
    if (from && nx === from.x && ny === from.y) continue;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size && owner[ny * size + nx] === id) return true;
  }
  return false;
}
