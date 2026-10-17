import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjust, hexToRgb, hslToHex, isHex, normalizeHex, randomColor, rgbToHex } from '../src/color.js';
import { mulberry32 } from '../src/game.js';

test('normalizeHex expands shorthand and lowercases', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc');
  assert.equal(normalizeHex('ff8800'), '#ff8800');
  assert.throws(() => normalizeHex('black'), TypeError);
  assert.throws(() => normalizeHex(null), TypeError);
});

test('isHex accepts 3 and 6 digit hex only', () => {
  assert.ok(isHex('#fff'));
  assert.ok(isHex('#a1b2c3'));
  assert.ok(!isHex('#ffff'));
  assert.ok(!isHex('rgb(0,0,0)'));
  assert.ok(!isHex(42));
});

test('hex and rgb round trip, out of range channels clamp', () => {
  assert.deepEqual(hexToRgb('#102030'), { r: 16, g: 32, b: 48 });
  assert.equal(rgbToHex({ r: 16, g: 32, b: 48 }), '#102030');
  assert.equal(rgbToHex({ r: -5, g: 300, b: 127.6 }), '#00ff80');
});

test('adjust by -0.1 reaches black within 10 passes from white', () => {
  let c = '#ffffff';
  for (let i = 0; i < 10; i++) c = adjust(c, -0.1);
  assert.equal(c, '#000000');
});

test('adjust lightens and clamps at white', () => {
  assert.equal(adjust('#f0f0f0', 0.1), '#ffffff');
});

test('hslToHex primaries', () => {
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(hslToHex(120, 100, 50), '#00ff00');
  assert.equal(hslToHex(240, 100, 50), '#0000ff');
  assert.equal(hslToHex(0, 0, 100), '#ffffff');
});

test('randomColor is a valid hex, deterministic with a seeded rng', () => {
  const a = randomColor(mulberry32(7));
  const b = randomColor(mulberry32(7));
  assert.ok(isHex(a));
  assert.equal(a, b);
});

test('randomColor never produces near-black or near-white (no muddy rainbow)', () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 500; i++) {
    const { r, g, b } = hexToRgb(randomColor(rng));
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    assert.ok(max > 150, `too dark: ${r},${g},${b}`);
    assert.ok(min < 140, `too pale: ${r},${g},${b}`);
  }
});
