// Paint Race view: wires the pure game engine (game.js) to the DOM.

import { EMPTY, cpuChooseDir, createGame, largestPatch, steer, tick } from './game.js';
import { emptyStats, parseStats, recordResult } from './stats.js';
import { load, save } from './storage.js';
import { SOUNDS, blip, confetti, isMuted, setMuted } from './fx.js';

const STATS_KEY = 'eas.race.v1';
const PREFS_KEY = 'eas.race.prefs.v1';
const COLORS = ['#f2643d', '#1fa98a']; // keep in sync with --p1 / --p2 in styles.css
const ITEM_ICONS = { speed: '⚡', splash: '💥' };
const PLAYERS = {
  p1: { key: 'p1', name: 'Fox', avatar: '🦊' },
  p2: { key: 'p2', name: 'Frog', avatar: '🐸' },
  cpu: { key: 'cpu', name: 'Robo', avatar: '🤖' },
};
const P1_KEYS = { w: 'up', a: 'left', s: 'down', d: 'right' };
const ARROW_KEYS = { ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right' };
const SPOTLIGHT_MS = 1400;

export function initRace() {
  const $ = (sel) => document.querySelector(sel);
  const view = $('#race-view');
  const screen = $('#race-screen');
  const boardEl = $('#race-board');
  const itemsLayer = $('#race-items');
  const avatarsLayer = $('#race-avatars');
  const overlay = $('#race-overlay');
  const form = $('#race-setup');
  const countdownEl = $('#race-countdown');
  const pausedEl = $('#race-paused');
  const resultEl = $('#race-result');
  const timerEl = $('#race-timer');
  const clockEl = timerEl.parentElement;
  const goalEl = $('#race-goal');
  const cards = [...document.querySelectorAll('.player-card')];
  const p2Pad = $('.dpad[data-player="1"]');
  const muteBtn = $('#mute');

  let stats = parseStats(load(STATS_KEY));
  const prefs = load(PREFS_KEY, {}) ?? {};
  let game = null;
  let cfg = null;
  let roster = [PLAYERS.p1, PLAYERS.cpu];
  let phase = 'setup'; // setup | countdown | playing | paused | over
  let cellEls = [];
  let avatarEls = [];
  let rafId = 0;
  let timers = [];

  // ---------- setup form ----------
  for (const [name, value] of Object.entries(prefs.form ?? {})) {
    const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }
  setMuted(prefs.muted === true);
  syncMute();

  function readForm() {
    const data = new FormData(form);
    return {
      mode: data.get('mode') === '2p' ? '2p' : 'cpu',
      level: data.get('level') ?? 'normal',
      size: Number(data.get('size')) || 24,
      durationSec: Number(data.get('time')) || 60,
    };
  }

  function syncMode() {
    const { mode } = readForm();
    roster = [PLAYERS.p1, mode === 'cpu' ? PLAYERS.cpu : PLAYERS.p2];
    for (const el of form.querySelectorAll('.cpu-only')) el.hidden = mode !== 'cpu';
    for (const el of form.querySelectorAll('.two-p-only')) el.hidden = mode === 'cpu';
    p2Pad.hidden = mode === 'cpu';
    renderCards();
  }

  form.addEventListener('change', () => {
    syncMode();
    const { size, durationSec } = readForm();
    if (phase === 'setup') preview(size, durationSec);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    cfg = readForm();
    savePrefs();
    start();
  });

  function savePrefs() {
    const f = cfg ?? readForm();
    save(PREFS_KEY, { form: { mode: f.mode, level: f.level, size: f.size, time: f.durationSec }, muted: isMuted() });
  }

  // ---------- rendering ----------
  function buildBoard(state) {
    const n = state.size;
    screen.style.setProperty('--n', n);
    screen.style.setProperty('--tick', `${state.tickMs}ms`);
    boardEl.style.setProperty('--n', n);
    boardEl.classList.remove('spotlight');
    const frag = document.createDocumentFragment();
    cellEls = new Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const el = document.createElement('div');
      el.className = 'cell';
      frag.appendChild(el);
      cellEls[i] = el;
    }
    boardEl.replaceChildren(frag);
    for (let i = 0; i < n * n; i++) paintCell(state, i);

    avatarEls = state.players.map((p, id) => {
      const el = document.createElement('div');
      el.className = `sprite avatar p${id + 1}`;
      el.textContent = roster[id].avatar;
      return el;
    });
    avatarsLayer.replaceChildren(...avatarEls);
    renderSprites(state);
    renderHud(state);
  }

  function paintCell(state, i) {
    const who = state.owner[i];
    cellEls[i].style.backgroundColor = who === EMPTY ? '' : COLORS[who];
  }

  function place(el, x, y) {
    el.style.setProperty('--x', x);
    el.style.setProperty('--y', y);
  }

  function renderSprites(state) {
    state.players.forEach((p, id) => {
      place(avatarEls[id], p.x, p.y);
      avatarEls[id].classList.toggle('boosted', p.boost > 0);
    });
    itemsLayer.replaceChildren(...state.items.map((it) => {
      const el = document.createElement('div');
      el.className = 'sprite item';
      el.textContent = ITEM_ICONS[it.kind];
      place(el, it.x, it.y);
      return el;
    }));
  }

  function renderCards() {
    cards.forEach((card, id) => {
      card.querySelector('.avatar').textContent = roster[id].avatar;
      card.querySelector('.pc-name').textContent = roster[id].name;
      card.querySelector('.meter').setAttribute('aria-label', `${roster[id].name} progress to goal`);
    });
  }

  function renderHud(state) {
    const { largest, totals } = state.scores;
    const left = Math.max(0, ((state.durationTicks - state.tick) * state.tickMs) / 1000);
    timerEl.textContent = left.toFixed(1);
    clockEl.classList.toggle('hurry', phase === 'playing' && left <= 10);
    goalEl.textContent = `goal: ${state.goalCells}-cell patch`;
    cards.forEach((card, id) => {
      const pct = Math.min(100, Math.round((largest[id] / state.goalCells) * 100));
      card.querySelector('.meter i').style.width = `${pct}%`;
      card.querySelector('.meter').setAttribute('aria-valuenow', pct);
      card.querySelector('.pc-largest').textContent = largest[id];
      card.querySelector('.pc-total').textContent = totals[id];
      card.classList.toggle('leading', largest[id] > largest[1 - id]);
    });
  }

  function pop(state, x, y, text) {
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = text;
    el.style.left = `${((x + 0.5) / state.size) * 100}%`;
    el.style.top = `${((y + 0.5) / state.size) * 100}%`;
    avatarsLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function renderStats(bumpKey) {
    for (const el of document.querySelectorAll('[data-stat]')) {
      const key = el.dataset.stat;
      el.textContent = key === 'draws' ? stats.draws : stats.wins[key];
      el.classList.toggle('bump', key === bumpKey);
    }
    const bits = [`${stats.rounds} race${stats.rounds === 1 ? '' : 's'}`];
    if (stats.streak.count > 1) bits.push(`🔥 ${PLAYERS[stats.streak.who].name} on a ${stats.streak.count}-win streak`);
    if (stats.bestStreak.count > 1) bits.push(`best streak ${stats.bestStreak.count} (${PLAYERS[stats.bestStreak.who].name})`);
    if (stats.fastestGoal) bits.push(`⏱ fastest goal ${stats.fastestGoal.seconds}s (${PLAYERS[stats.fastestGoal.who].name})`);
    $('#sb-extra').textContent = bits.join(' · ');
  }

  // ---------- overlay panels ----------
  function showPanel(name) {
    form.hidden = name !== 'setup';
    countdownEl.hidden = name !== 'countdown';
    pausedEl.hidden = name !== 'paused';
    resultEl.hidden = name !== 'result';
    overlay.hidden = name === null;
    overlay.classList.toggle('clear', name === 'countdown');
    overlay.classList.toggle('soft', name === 'result');
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    cancelAnimationFrame(rafId);
  }

  // ---------- game flow ----------
  function preview(size, durationSec) {
    const state = createGame({ size, durationSec, powerups: false });
    buildBoard(state);
  }

  function start() {
    clearTimers();
    game = createGame({ size: cfg.size, durationSec: cfg.durationSec });
    syncMode();
    buildBoard(game);
    countdown(3);
  }

  function countdown(n) {
    phase = 'countdown';
    showPanel('countdown');
    const step = (k) => {
      countdownEl.textContent = k > 0 ? k : 'GO!';
      // re-trigger the zoom animation on each number
      countdownEl.style.animation = 'none';
      void countdownEl.offsetWidth;
      countdownEl.style.animation = '';
      blip(k > 0 ? SOUNDS.tick : SOUNDS.go);
      if (k > 0) timers.push(setTimeout(() => step(k - 1), 650));
      else timers.push(setTimeout(run, 400));
    };
    step(n);
  }

  function run() {
    phase = 'playing';
    showPanel(null);
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      if (phase !== 'playing') return;
      // Cap the backlog so a stalled tab does not fast-forward the whole race.
      acc = Math.min(acc + (now - last), game.tickMs * 4);
      last = now;
      while (acc >= game.tickMs && game.status === 'playing') {
        acc -= game.tickMs;
        step();
      }
      if (game.status === 'over') finish();
      else rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  function step() {
    if (cfg.mode === 'cpu') steer(game, 1, cpuChooseDir(game, 1, cfg.level));
    const { changed, events } = tick(game);
    for (const i of changed) paintCell(game, i);
    for (const ev of events) {
      if (ev.type === 'pickup') {
        pop(game, ev.x, ev.y, ev.kind === 'speed' ? '⚡ SPEED!' : '💥 SPLASH!');
        blip(SOUNDS.pickup);
      }
    }
    renderSprites(game);
    renderHud(game);
  }

  function finish() {
    phase = 'over';
    clockEl.classList.remove('hurry');
    const winnerKey = game.winner === null ? null : roster[game.winner].key;
    const seconds = (game.tick * game.tickMs) / 1000;
    stats = recordResult(stats, { winner: winnerKey, reason: game.reason, seconds });
    save(STATS_KEY, stats);
    renderStats(winnerKey ?? 'draws');

    if (game.winner !== null) {
      for (const i of largestPatch(game.owner, game.size, game.winner)) cellEls[i].classList.add('win');
      boardEl.classList.add('spotlight');
    }

    const [a, b] = game.scores.largest;
    const avatar = $('#result-avatar');
    if (winnerKey === null) {
      avatar.textContent = `${roster[0].avatar}🤝${roster[1].avatar}`;
      $('#result-title').textContent = "It's a draw!";
      $('#result-detail').textContent = `Both patches ended at ${a} cells.`;
      blip(SOUNDS.lose);
    } else {
      const w = roster[game.winner];
      const loserPatch = game.scores.largest[1 - game.winner];
      avatar.textContent = w.avatar;
      $('#result-title').textContent = `${w.name} wins!`;
      $('#result-detail').textContent = game.reason === 'goal'
        ? `Grew a ${game.scores.largest[game.winner]}-cell patch in ${seconds.toFixed(1)}s.`
        : `Biggest patch ${game.scores.largest[game.winner]} vs ${loserPatch} when time ran out.`;
      const humanWon = winnerKey !== 'cpu';
      blip(humanWon ? SOUNDS.win : SOUNDS.lose);
      if (humanWon) confetti($('#confetti'), [COLORS[game.winner], '#f5c84c', '#ffffff', '#d2232a']);
    }
    timers.push(setTimeout(() => {
      showPanel('result');
      $('#race-again').focus({ preventScroll: true });
    }, SPOTLIGHT_MS));
  }

  function pause() {
    if (phase === 'playing') {
      phase = 'paused';
      cancelAnimationFrame(rafId);
      showPanel('paused');
    } else if (phase === 'countdown') {
      clearTimers();
      phase = 'paused';
      showPanel('paused');
    }
  }

  function resume() {
    if (phase !== 'paused') return;
    countdown(1);
  }

  $('#race-resume').addEventListener('click', resume);
  $('#race-again').addEventListener('click', start);
  $('#race-settings').addEventListener('click', () => {
    clearTimers();
    phase = 'setup';
    showPanel('setup');
    const { size, durationSec } = readForm();
    preview(size, durationSec);
  });

  $('#reset-stats').addEventListener('click', () => {
    if (!confirm('Reset the scoreboard?')) return;
    stats = emptyStats();
    save(STATS_KEY, stats);
    renderStats();
  });

  function syncMute() {
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', String(isMuted()));
  }

  muteBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    syncMute();
    savePrefs();
  });

  // ---------- input ----------
  document.addEventListener('keydown', (e) => {
    if (view.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (phase === 'setup' || phase === 'over') return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === ' ' || key === 'p' || key === 'Escape') {
      e.preventDefault();
      if (phase === 'paused') resume();
      else pause();
      return;
    }
    if (!game || phase !== 'playing') return;
    if (P1_KEYS[key]) {
      e.preventDefault();
      steer(game, 0, P1_KEYS[key]);
    } else if (ARROW_KEYS[key]) {
      e.preventDefault();
      steer(game, cfg.mode === 'cpu' ? 0 : 1, ARROW_KEYS[key]);
    }
  });

  for (const pad of document.querySelectorAll('.dpad')) {
    const id = Number(pad.dataset.player);
    pad.addEventListener('pointerdown', (e) => {
      const dir = e.target.closest('[data-dir]')?.dataset.dir;
      if (!dir || !game || phase !== 'playing') return;
      e.preventDefault();
      steer(game, id, dir);
    });
  }

  // Swipe anywhere on the board to steer Fox.
  let swipe = null;
  screen.addEventListener('pointerdown', (e) => {
    if (phase === 'playing') swipe = { x: e.clientX, y: e.clientY };
  });
  screen.addEventListener('pointermove', (e) => {
    if (!swipe || phase !== 'playing') return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    steer(game, 0, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    swipe = { x: e.clientX, y: e.clientY };
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) screen.addEventListener(type, () => { swipe = null; });
  screen.style.touchAction = 'none';

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  // ---------- boot ----------
  syncMode();
  const initial = readForm();
  preview(initial.size, initial.durationSec);
  renderStats();
  showPanel('setup');

  return { pause };
}
