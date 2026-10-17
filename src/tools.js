// What each paint tool does to a single cell. Pure, no DOM.

import { adjust, normalizeHex, randomColor } from './color.js';

export const PAINT_TOOLS = ['pen', 'rainbow', 'shade', 'lighten', 'eraser'];
export const CLICK_TOOLS = ['fill', 'picker'];
export const TOOLS = [...PAINT_TOOLS, ...CLICK_TOOLS];

// Empty cells show the screen color, so shading starts from it.
export const SCREEN_COLOR = '#e9e7e1';
export const SHADE_STEP = 0.1;

// Returns the cell's next color (hex or null for empty).
export function applyTool(tool, current, { color = '#222222', rng = Math.random } = {}) {
  switch (tool) {
    case 'pen':
      return normalizeHex(color);
    case 'rainbow':
      return randomColor(rng);
    case 'eraser':
      return null;
    case 'shade':
      return adjust(current ?? SCREEN_COLOR, -SHADE_STEP);
    case 'lighten':
      return current == null ? null : adjust(current, SHADE_STEP);
    default:
      throw new Error(`Not a paint tool: ${tool}`);
  }
}
