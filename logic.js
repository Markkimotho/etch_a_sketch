// Pure logic shared by the page (script.js) and the tests. No DOM here.

// Grid lines get fainter as the grid gets denser, so big grids don't look dark.
function gridLineAlpha(size) {
  var max = 0.2, min = 0.04;
  if (size <= 8) return max;
  if (size >= 100) return min;
  return +(max - ((size - 8) / 92) * (max - min)).toFixed(3);
}

// Every cell on a straight line between two cells, so fast strokes leave no gaps.
function linePoints(x0, y0, x1, y1) {
  var points = [];
  var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  var err = dx + dy;
  while (true) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) return points;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function randomColor() {
  return 'hsl(' + Math.floor(Math.random() * 360) + ', 75%, 55%)';
}

// Darken an "rgb(r, g, b)" color by 10% of full brightness. Ten passes reach black.
function darken(rgb) {
  var parts = (rgb.match(/\d+/g) || [255, 255, 255]).slice(0, 3).map(Number);
  return 'rgb(' + parts.map(function (c) { return Math.max(0, c - 26); }).join(', ') + ')';
}

// ---------------- Paint Race ----------------
// Two players move around the board painting cells. Whoever owns the biggest
// connected patch of color wins: first to the goal size, or biggest when time is up.

var EMPTY = -1;
var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function createGame(size, seconds, tickMs) {
  var owner = new Array(size * size).fill(EMPTY);
  var players = [
    { x: 1, y: 1, dir: 'right' },
    { x: size - 2, y: size - 2, dir: 'left' },
  ];
  owner[1 * size + 1] = 0;
  owner[(size - 2) * size + (size - 2)] = 1;
  return {
    size: size,
    owner: owner,
    players: players,
    ticksLeft: Math.round((seconds * 1000) / tickMs),
    goal: Math.ceil(size * size * 0.25),
    scores: [1, 1],
    over: false,
    winner: null, // 0, 1, or null for a draw
  };
}

function steer(game, id, dir) {
  if (DIRS[dir]) game.players[id].dir = dir;
}

function inside(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

// Size of each player's largest connected patch (4-way neighbours).
function biggestPatches(owner, size) {
  var best = [0, 0];
  var seen = new Array(owner.length).fill(false);
  for (var start = 0; start < owner.length; start++) {
    var who = owner[start];
    if (who === EMPTY || seen[start]) continue;
    var stack = [start], count = 0;
    seen[start] = true;
    while (stack.length) {
      var i = stack.pop(), x = i % size;
      count++;
      var next = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size];
      for (var k = 0; k < 4; k++) {
        var n = next[k];
        if (n >= 0 && n < owner.length && !seen[n] && owner[n] === who) { seen[n] = true; stack.push(n); }
      }
    }
    if (count > best[who]) best[who] = count;
  }
  return best;
}

// Move both players one step and paint. Returns the indices of repainted cells.
function tick(game) {
  if (game.over) return [];
  var size = game.size, p = game.players;
  var targets = p.map(function (pl) {
    var d = DIRS[pl.dir], x = pl.x + d[0], y = pl.y + d[1];
    return inside(size, x, y) ? { x: x, y: y } : null;
  });
  // Players never share a cell: same target, head-on swap, or bumping a player who stays put all block.
  var same = targets[0] && targets[1] && targets[0].x === targets[1].x && targets[0].y === targets[1].y;
  var swap = targets[0] && targets[1] &&
    targets[0].x === p[1].x && targets[0].y === p[1].y && targets[1].x === p[0].x && targets[1].y === p[0].y;
  if (same || swap) targets = [null, null];
  for (var pass = 0; pass < 2; pass++) {
    for (var id = 0; id < 2; id++) {
      var t = targets[id], other = 1 - id;
      if (t && !targets[other] && t.x === p[other].x && t.y === p[other].y) targets[id] = null;
    }
  }

  var changed = [];
  for (var j = 0; j < 2; j++) {
    if (!targets[j]) continue;
    p[j].x = targets[j].x;
    p[j].y = targets[j].y;
    var idx = p[j].y * size + p[j].x;
    if (game.owner[idx] !== j) { game.owner[idx] = j; changed.push(idx); }
  }

  game.ticksLeft--;
  game.scores = biggestPatches(game.owner, size);
  var a = game.scores[0], b = game.scores[1];
  if (a >= game.goal || b >= game.goal || game.ticksLeft <= 0) {
    game.over = true;
    game.winner = a > b ? 0 : b > a ? 1 : null;
  }
  return changed;
}

// Computer player: look a few cells ahead in each direction. Stealing beats
// claiming empty cells, which beats walking over its own color.
function computerDir(game, id) {
  var size = game.size, me = game.players[id], other = game.players[1 - id];
  var best = me.dir, bestScore = -Infinity;
  for (var dir in DIRS) {
    var d = DIRS[dir], nx = me.x + d[0], ny = me.y + d[1];
    if (!inside(size, nx, ny) || (nx === other.x && ny === other.y)) continue;
    var score = 0;
    for (var k = 1; k <= 5; k++) {
      var x = me.x + d[0] * k, y = me.y + d[1] * k;
      if (!inside(size, x, y)) break;
      var o = game.owner[y * size + x];
      score += (o === id ? 0.05 : o === EMPTY ? 1 : 1.5) / k;
    }
    score += 1.5 / (1 + distanceToUnowned(game, id, nx, ny));
    if (dir === me.dir) score += 0.2;
    score += Math.random() * 0.4;
    if (score > bestScore) { bestScore = score; best = dir; }
  }
  return best;
}

// Steps from (x, y) to the nearest cell this player doesn't own, so the
// computer never gets stuck wandering inside its own color.
function distanceToUnowned(game, id, x, y) {
  var size = game.size, owner = game.owner, start = y * size + x;
  if (owner[start] !== id) return 0;
  var dist = new Array(owner.length).fill(-1);
  dist[start] = 0;
  var queue = [start];
  for (var head = 0; head < queue.length; head++) {
    var i = queue[head], cx = i % size;
    var next = [cx > 0 ? i - 1 : -1, cx < size - 1 ? i + 1 : -1, i - size, i + size];
    for (var k = 0; k < 4; k++) {
      var n = next[k];
      if (n < 0 || n >= owner.length || dist[n] !== -1) continue;
      dist[n] = dist[i] + 1;
      if (owner[n] !== id) return dist[n];
      queue.push(n);
    }
  }
  return size * 2;
}

// Lets the tests load this file in Node. Browsers skip it.
if (typeof module !== 'undefined') {
  module.exports = {
    gridLineAlpha, linePoints, randomColor, darken,
    EMPTY, createGame, steer, tick, biggestPatches, computerDir,
  };
}
