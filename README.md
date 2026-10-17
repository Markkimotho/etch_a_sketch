# Etch-A-Sketch

A browser Etch-A-Sketch with real drawing tools, plus **Paint Race**: a two-player territory game on the same grid. Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies.

[PLAY HERE](https://markkimotho.github.io/etch_a_sketch/)

## Sketch

| Feature | How |
| --- | --- |
| Draw | Click and drag (mouse, pen or touch). Fast strokes stay continuous because the gaps between pointer events are filled in. |
| Hover draw | Toggle **Hover draw** (or `H`) to paint by just moving the mouse, like the classic. |
| Knobs | Drag, scroll or focus a knob and use the arrow keys. The left knob moves sideways, the right knob moves up and down. The arrow keys also work anywhere on the page. |
| Tools | Pen `B`, Rainbow `R`, Shade `S` (10% darker per pass), Lighten `L`, Eraser `E`, Fill bucket `F`, Color picker `I` |
| Colors | 10 preset swatches plus a custom color well |
| Grid size | 1×1 to 100×100. Resizing rescales your drawing instead of wiping it. |
| Grid lines | Toggle with `G`. Lines get fainter as the grid gets denser, so they never swamp the drawing. |
| Undo / redo | `Ctrl/⌘ Z`, `Ctrl/⌘ Shift Z` or `Ctrl Y`. Each stroke, fill, shake and resize is one step. |
| Shake | `X` or the Shake button shakes the frame and clears the board. You can undo it. |
| Export | **PNG** downloads the drawing at about 1024px. |
| Autosave | The drawing and your settings are saved in localStorage. |

## Paint Race (issue #1)

Two avatars race around the board, painting every cell they step on. Stepping on your opponent's cells steals them.

**The winner is the player with the largest connected patch of color** (cells joined edge to edge):

- the first to grow a patch covering 25% of the board wins on the spot, or
- when the clock runs out, the bigger patch wins. If the patches are equal, the most cells painted wins. If that is equal too, it's a draw.

Painting a lot of scattered cells doesn't help you. Cutting a line through your opponent's biggest patch splits it and shrinks their score.

- **Opponents:** 🤖 Robo the CPU (Easy / Normal / Hard) or 🐸 a friend on the same keyboard
- **Controls:** 🦊 Fox uses `W A S D` (and the arrow keys against Robo), 🐸 Frog uses the arrow keys, and `Space`/`P`/`Esc` pauses. On touch screens, swipe on the board or use the on-screen pads.
- **Power-ups:** ⚡ speed burst (double moves for 3s), 💥 paint splash (claims a 5×5 square)
- **Options:** board size (16, 24 or 32), duration (30, 60 or 90s)
- **Scoreboard:** win tally, draws, current and best streak, and the fastest goal time, all saved between visits. The winning patch is highlighted at the end of every round.

## Run locally

ES modules don't load from `file://`, so serve the folder:

```sh
npm start          # http://localhost:8080 (zero-dependency static server)
```

Any static server works too (`python3 -m http.server`).

## Tests

```sh
npm test           # gate: 56 unit tests on the pure logic, under 1s, runs on every commit
npm run eval       # CPU strength: checks Hard > Normal > Easy > random walker by win rate
npm run smoke      # headless Chrome end-to-end run of sketch, race and mobile layout (~10s)
npm run smoke -- --full   # also plays a full 30s race through to the result screen
```

Enable the pre-commit hook once per clone:

```sh
git config core.hooksPath .githooks
```

The smoke test drives Chrome over the DevTools protocol using Node's built-in WebSocket, so it needs Node 22+ and Chrome. Set `CHROME_PATH` if Chrome isn't in the default location. Screenshots go to `$SHOTS` (default: the OS temp dir).

## Layout

```text
index.html           markup for both views
styles.css           all styling (red frame, knobs, race HUD, responsive)
src/
  color.js           hex/rgb/hsl helpers, shade/lighten, random colors        (pure)
  grid.js            geometry, Bresenham lines, flood fill, resample, grid-line fade (pure)
  tools.js           what each paint tool does to a cell                       (pure)
  history.js         undo/redo (stroke diffs + resize snapshots)               (pure)
  game.js            Paint Race engine: movement, scoring, power-ups, CPU AI   (pure, seeded)
  stats.js           scoreboard bookkeeping                                    (pure)
  storage.js         localStorage that never throws
  fx.js              confetti + synth sounds
  main.js            sketch view + tabs (DOM)
  race-ui.js         race view (DOM)
scripts/serve.mjs    static dev server
tests/               node:test unit tests, evals/, e2e/
```

All the game and drawing rules live in pure modules with no DOM access, which is why they can be tested in Node. The two `*-ui` files only connect those modules to the page.
