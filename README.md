# Etch-A-Sketch

A browser sketch pad, built with plain HTML, CSS and JavaScript. No frameworks, no build step.

[PLAY HERE](https://markkimotho.github.io/etch_a_sketch/)

## Sketch

Click and drag (or touch) to draw. Pick a color, or use Rainbow, Shade (darkens 10% per pass) or Eraser. The slider sets the grid from 1x1 to 100x100. Grid lines fade as the grid gets bigger and can be turned off.

## Paint Race

Two players move around a 24x24 board, painting cells their color and painting over each other. The biggest connected patch wins: first to cover a quarter of the board, or the biggest when the 60 seconds run out.

- Player 1: W A S D (or arrow keys when playing the computer)
- Player 2: arrow keys

## Files

- `index.html`: the page
- `styles.css`: styles
- `logic.js`: drawing helpers and race rules (no DOM, so it can be tested)
- `script.js`: connects everything to the page

Open `index.html` in a browser to run it locally.

## Tests

```sh
node --test
```
