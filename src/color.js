// Color helpers. Pure functions, no DOM.

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

// '#ABC' / 'abc' / '#aabbcc' -> '#aabbcc'
export function normalizeHex(value) {
  const match = typeof value === 'string' && value.match(HEX_RE);
  if (!match) throw new TypeError(`Not a hex color: ${value}`);
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

export function hexToRgb(value) {
  const hex = normalizeHex(value);
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const part = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

// Shift every channel by delta * 255. Negative darkens, positive lightens.
// The step rounds away from zero so 0.1 takes any color to pure black (or white)
// in at most 10 passes; rounding per pass would otherwise stall at #050505.
export function adjust(value, delta) {
  const { r, g, b } = hexToRgb(value);
  const step = Math.sign(delta) * Math.ceil(Math.abs(delta) * 255);
  return rgbToHex({ r: r + step, g: g + step, b: b + step });
}

// h in degrees, s and l in percent.
export function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}

// Saturated, mid-light colors only, so rainbow strokes never come out muddy.
export function randomColor(rng = Math.random) {
  return hslToHex(rng() * 360, 70 + rng() * 25, 48 + rng() * 12);
}
