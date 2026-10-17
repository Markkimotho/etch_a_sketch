// End-to-end smoke test in real headless Chrome, zero dependencies: drives Chrome
// over the DevTools protocol with Node's built-in WebSocket (Node 22+).
//
//   npm run smoke                 # ~10s: sketch + race start/pause + mobile layout
//   npm run smoke -- --full       # also plays a full 30s race to the result screen
//   SHOTS=/some/dir npm run smoke # where screenshots go (default: OS temp dir)
//   CHROME_PATH=/path/to/chrome   # if Chrome is not in the default macOS/Linux spot

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { serve } from '../../scripts/serve.mjs';

const FULL = process.argv.includes('--full');
const SHOTS = process.env.SHOTS ?? join(tmpdir(), 'etch-a-sketch-smoke');
const CHROME = process.env.CHROME_PATH ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(existsSync);

if (!CHROME) {
  console.error('Chrome not found. Set CHROME_PATH.');
  process.exit(2);
}
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

// ---------- Chrome + CDP ----------
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const profile = mkdtempSync(join(tmpdir(), 'eas-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });

let cdpPort;
for (let i = 0; i < 100 && !cdpPort; i++) {
  try { cdpPort = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(100); }
}
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));

let nextId = 1;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, fail } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) fail(new Error(`${msg.error.message}`));
    else ok(msg.result);
  } else if (msg.method) {
    for (const fn of listeners) fn(msg);
  }
});
const send = (method, params = {}) => new Promise((ok, fail) => {
  const id = nextId++;
  pending.set(id, { ok, fail });
  ws.send(JSON.stringify({ id, method, params }));
});
const once = (method) => new Promise((ok) => {
  const fn = (msg) => { if (msg.method === method) { listeners.splice(listeners.indexOf(fn), 1); ok(msg.params); } };
  listeners.push(fn);
});
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const file = join(SHOTS, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
async function key(k, code = k) {
  const text = k.length === 1 ? k : undefined;
  const keyCode = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ' ': 32 }[k] ?? k.toUpperCase().charCodeAt(0);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text, windowsVirtualKeyCode: keyCode });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode });
}
const viewport = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });

const errors = [];
listeners.push((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/fonts\.(googleapis|gstatic)/.test(msg.params.entry.url ?? '')) errors.push(msg.params.entry.text);
});

try {
  await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Log.enable')]);
  await viewport(1000, 1250);
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: base });
  await loaded;
  await sleep(400);

  // ---------- Sketch ----------
  const painted = 'document.querySelectorAll("#board .cell[style*=background]").length';
  check('16x16 grid renders', (await evaluate('document.querySelectorAll("#board .cell").length')) === 256);

  const rect = await evaluate('(() => { const r = document.querySelector("#board").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; })()');
  const cell = (cx, cy) => [rect.x + (cx + 0.5) * (rect.w / 16), rect.y + (cy + 0.5) * (rect.w / 16)];
  await mouse('mousePressed', ...cell(2, 2));
  await mouse('mouseMoved', ...cell(12, 2)); // one jump of 10 cells: line interpolation must fill the gap
  await mouse('mouseReleased', ...cell(12, 2));
  check('drag stroke fills every cell between pointer events', (await evaluate(painted)) === 11, `${await evaluate(painted)} cells`);

  await evaluate('document.querySelector("#undo").click()');
  check('undo removes the stroke', (await evaluate(painted)) === 0);
  await evaluate('document.querySelector("#redo").click()');
  check('redo restores it', (await evaluate(painted)) === 11);

  for (let i = 0; i < 4; i++) await key('ArrowDown');
  await sleep(50);
  check('arrow keys etch from the stylus', (await evaluate(painted)) === 15, `${await evaluate(painted)} cells`);

  const lineAlpha = 'Number(getComputedStyle(document.querySelector("#board")).getPropertyValue("--line").match(/\\/\\s*([\\d.]+)/)[1])';
  const alpha16 = await evaluate(lineAlpha);
  await shot('1-sketch-16');
  await evaluate('(() => { const s = document.querySelector("#slider"); s.value = 100; s.dispatchEvent(new Event("input")); s.dispatchEvent(new Event("change")); })()');
  const alpha100 = await evaluate(lineAlpha);
  check('100x100 grid renders', (await evaluate('document.querySelectorAll("#board .cell").length')) === 10000);
  check('grid lines fade at high density', alpha100 < alpha16 && alpha100 <= 0.06, `alpha 16=${alpha16} 100=${alpha100}`);
  check('resizing keeps the drawing', (await evaluate(painted)) > 100, `${await evaluate(painted)} cells`);
  check('cells have no borders taking space', (await evaluate('getComputedStyle(document.querySelector("#board .cell")).borderTopWidth')) === '0px');
  await key('r');
  const r100 = await evaluate('(() => { const r = document.querySelector("#board").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; })()');
  for (let k = 0; k < 3; k++) {
    await mouse('mousePressed', r100.x + 20, r100.y + 300 + k * 40);
    for (let i = 1; i <= 20; i++) await mouse('mouseMoved', r100.x + 20 + i * 20, r100.y + 300 + k * 40 + Math.sin(i / 2) * 20);
    await mouse('mouseReleased', r100.x + 420, r100.y + 300 + k * 40);
  }
  await shot('2-sketch-100-rainbow');
  await evaluate('document.querySelector("#undo").click(); document.querySelector("#undo").click(); document.querySelector("#undo").click(); document.querySelector("#undo").click()');
  check('undo also reverts a resize', (await evaluate('document.querySelectorAll("#board .cell").length')) === 256);

  await evaluate('document.querySelector("#shake").click()');
  await sleep(800);
  check('shake clears the board', (await evaluate(painted)) === 0);
  await evaluate('document.querySelector("#undo").click()');
  check('shake is undoable', (await evaluate(painted)) === 15);

  await key('h');
  await key('b');
  const beforeHover = await evaluate(painted);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell(0, 10)[0], y: cell(0, 10)[1], buttons: 0, pointerType: 'mouse' });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell(9, 10)[0], y: cell(9, 10)[1], buttons: 0, pointerType: 'mouse' });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x - 30, y: rect.y - 30, buttons: 0, pointerType: 'mouse' });
  check('hover mode draws without clicking', (await evaluate(painted)) - beforeHover === 10, `+${(await evaluate(painted)) - beforeHover}`);
  await evaluate('document.querySelector("#undo").click()');
  check('a hover pass is one undo step', (await evaluate(painted)) === beforeHover);
  await key('h');

  // ---------- Race ----------
  await evaluate('document.querySelector("#tab-race").click()');
  await sleep(100);
  check('race tab shows the setup', await evaluate('!document.querySelector("#race-setup").hidden && !document.querySelector("#race-view").hidden'));
  await shot('3-race-setup');
  await evaluate('document.querySelector("input[name=time][value=\'30\']").click(); document.querySelector("#race-setup .go").click()');
  await sleep(2700); // countdown
  await key('s');
  await sleep(1200);
  const mid = await evaluate(`(() => ({
    painted: document.querySelectorAll("#race-board .cell[style*=background-color]").length,
    timer: Number(document.querySelector("#race-timer").textContent),
    foxY: Number(document.querySelector(".sprite.avatar.p1").style.getPropertyValue("--y")),
    robo: document.querySelector(".sprite.avatar.p2").textContent,
  }))()`);
  check('race runs: avatars paint and the clock ticks', mid.painted > 10 && mid.timer < 30, JSON.stringify(mid));
  check('keyboard steers Fox (S = down)', mid.foxY > 1);
  check('CPU opponent is Robo', mid.robo === '🤖');
  await shot('4-race-running');
  await key(' ', 'Space');
  await sleep(100);
  check('space pauses', await evaluate('!document.querySelector("#race-paused").hidden'));
  const frozen = await evaluate('document.querySelector("#race-timer").textContent');
  await sleep(500);
  check('clock stops while paused', (await evaluate('document.querySelector("#race-timer").textContent')) === frozen);
  await key(' ', 'Space');

  if (FULL) {
    await sleep(31_000);
    const end = await evaluate(`(() => ({
      result: !document.querySelector("#race-result").hidden,
      title: document.querySelector("#result-title").textContent,
      rounds: document.querySelector("#sb-extra").textContent,
      spotlight: document.querySelector("#race-board").classList.contains("spotlight"),
    }))()`);
    check('race ends with a result and updates the scoreboard', end.result && /1 race/.test(end.rounds), JSON.stringify(end));
    await shot('5-race-result');
  }

  // ---------- Mobile layout ----------
  await viewport(390, 844, true);
  await evaluate('document.querySelector("#tab-sketch").click()');
  await sleep(200);
  check('no horizontal scroll at phone width (sketch)', await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  await shot('6-mobile-sketch');
  await evaluate('document.querySelector("#tab-race").click()');
  await sleep(200);
  check('no horizontal scroll at phone width (race)', await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  await shot('7-mobile-race');
  await evaluate('document.querySelector("#race-settings").click()');
  await sleep(200);
  check('race setup fits the board at phone width', await evaluate('(() => { const o = document.querySelector("#race-overlay"); return o.scrollHeight <= o.clientHeight + 1; })()'));
  await shot('8-mobile-setup');

  check('no console errors or exceptions', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('smoke run completed', false, err.stack);
} finally {
  ws.close();
  chrome.kill();
  server.close();
  await sleep(200);
  rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${SHOTS}`);
process.exitCode = failed ? 1 : 0;
