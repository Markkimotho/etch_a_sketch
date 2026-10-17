// ---------------- Tabs ----------------
var sketchView = document.getElementById('sketch-view');
var raceView = document.getElementById('race-view');
var tabSketch = document.getElementById('tab-sketch');
var tabRace = document.getElementById('tab-race');

function showTab(race) {
  sketchView.hidden = race;
  raceView.hidden = !race;
  tabSketch.classList.toggle('active', !race);
  tabRace.classList.toggle('active', race);
  if (!race) stopRace();
}

tabSketch.addEventListener('click', function () { showTab(false); });
tabRace.addEventListener('click', function () { showTab(true); });

// ---------------- Sketch ----------------
var SWATCHES = ['#1f2937', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];

var board = document.getElementById('board');
var slider = document.getElementById('slider');
var sizeLabel = document.getElementById('size-label');
var colorPicker = document.getElementById('color-picker');
var swatchBox = document.getElementById('swatches');
var linesBox = document.getElementById('lines');
var modeButtons = document.querySelectorAll('[data-mode]');

var gridSize = 16;
var mode = 'color';
var color = colorPicker.value;
var cells = [];
var drawing = false;
var last = null;

function createGrid() {
  board.innerHTML = '';
  board.style.setProperty('--n', gridSize);
  board.style.setProperty('--line', 'rgba(0, 0, 0, ' + gridLineAlpha(gridSize) + ')');
  cells = [];
  for (var i = 0; i < gridSize * gridSize; i++) {
    var cell = document.createElement('div');
    cell.className = 'cell';
    board.appendChild(cell);
    cells.push(cell);
  }
}

function paint(x, y) {
  var cell = cells[y * gridSize + x];
  if (mode === 'color') cell.style.backgroundColor = color;
  else if (mode === 'rainbow') cell.style.backgroundColor = randomColor();
  else if (mode === 'eraser') cell.style.backgroundColor = '';
  else if (mode === 'shade') cell.style.backgroundColor = darken(getComputedStyle(cell).backgroundColor);
}

// Which cell is under the pointer, or null if outside the board.
function cellAt(event) {
  var rect = board.getBoundingClientRect();
  var x = Math.floor(((event.clientX - rect.left) / rect.width) * gridSize);
  var y = Math.floor(((event.clientY - rect.top) / rect.height) * gridSize);
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return null;
  return { x: x, y: y };
}

board.addEventListener('pointerdown', function (event) {
  var pos = cellAt(event);
  if (!pos) return;
  drawing = true;
  last = pos;
  board.setPointerCapture(event.pointerId);
  paint(pos.x, pos.y);
});

board.addEventListener('pointermove', function (event) {
  if (!drawing) return;
  var pos = cellAt(event);
  if (!pos || (pos.x === last.x && pos.y === last.y)) return;
  // Fill in every cell between the last position and this one.
  linePoints(last.x, last.y, pos.x, pos.y).slice(1).forEach(function (p) { paint(p.x, p.y); });
  last = pos;
});

['pointerup', 'pointercancel'].forEach(function (type) {
  board.addEventListener(type, function () { drawing = false; });
});

function setMode(newMode) {
  mode = newMode;
  modeButtons.forEach(function (b) { b.classList.toggle('active', b.dataset.mode === newMode); });
}

modeButtons.forEach(function (button) {
  button.addEventListener('click', function () { setMode(button.dataset.mode); });
});

// Picking a color selects it and switches back to the pen.
function setColor(newColor, fromPicker) {
  color = newColor;
  swatchBox.querySelectorAll('.swatch').forEach(function (s) {
    s.classList.toggle('active', fromPicker ? s.classList.contains('custom') : s.dataset.color === newColor);
  });
  setMode('color');
}

SWATCHES.forEach(function (c) {
  var swatch = document.createElement('button');
  swatch.className = 'swatch';
  swatch.dataset.color = c;
  swatch.style.background = c;
  swatch.title = c;
  swatch.setAttribute('aria-label', 'Color ' + c);
  swatch.addEventListener('click', function () { setColor(c, false); });
  swatchBox.insertBefore(swatch, swatchBox.lastElementChild);
});

colorPicker.addEventListener('input', function () { setColor(colorPicker.value, true); });

document.getElementById('clear').addEventListener('click', function () {
  cells.forEach(function (cell) { cell.style.backgroundColor = ''; });
});

function updateSlider() {
  sizeLabel.textContent = gridSize + ' x ' + gridSize;
  slider.style.setProperty('--fill', ((gridSize - 1) / 99) * 100 + '%');
}

slider.addEventListener('input', function () {
  gridSize = Number(slider.value);
  updateSlider();
  createGrid();
});

linesBox.addEventListener('change', function () {
  board.classList.toggle('no-lines', !linesBox.checked);
});

createGrid();
updateSlider();
setColor(SWATCHES[0], false);

// ---------------- Paint Race ----------------
var RACE_SIZE = 24;
var RACE_SECONDS = 60;
var TICK_MS = 125;
var COLORS = ['#f97316', '#14b8a6']; // match --p1 and --p2 in styles.css

var raceBoard = document.getElementById('race-board');
var modeBox = document.getElementById('race-mode');
var startButton = document.getElementById('race-start');
var timerEl = document.getElementById('race-timer');
var overlay = document.getElementById('race-overlay');
var overlayTitle = document.getElementById('overlay-title');
var messageEl = document.getElementById('race-message');
var raceCells = [];
var vsComputer = true;
var game = null;
var timer = null;

function drawRaceBoard() {
  raceBoard.innerHTML = '';
  raceBoard.style.setProperty('--n', RACE_SIZE);
  raceBoard.style.setProperty('--line', 'rgba(0, 0, 0, ' + gridLineAlpha(RACE_SIZE) + ')');
  raceCells = [];
  for (var i = 0; i < RACE_SIZE * RACE_SIZE; i++) {
    var cell = document.createElement('div');
    cell.className = 'cell';
    var who = game ? game.owner[i] : -1;
    if (who !== -1) cell.style.backgroundColor = COLORS[who];
    raceBoard.appendChild(cell);
    raceCells.push(cell);
  }
}

function showPlayers() {
  raceCells.forEach(function (cell) { cell.classList.remove('player'); });
  game.players.forEach(function (p, id) {
    var cell = raceCells[p.y * RACE_SIZE + p.x];
    cell.classList.add('player');
    cell.style.setProperty('--pc', COLORS[id]);
  });
}

function showScores() {
  for (var id = 0; id < 2; id++) {
    var score = game ? game.scores[id] : 0;
    var goal = game ? game.goal : Math.ceil(RACE_SIZE * RACE_SIZE * 0.25);
    document.getElementById('score-' + id).textContent = score + ' / ' + goal;
    document.getElementById('bar-' + id).style.width = Math.min(100, (score / goal) * 100) + '%';
  }
  var secondsLeft = game ? Math.ceil((game.ticksLeft * TICK_MS) / 1000) : RACE_SECONDS;
  timerEl.textContent = secondsLeft;
  timerEl.parentElement.classList.toggle('hurry', !!timer && secondsLeft <= 10);
}

function updateNames() {
  document.getElementById('name-1').textContent = vsComputer ? 'Computer' : 'Player 2';
  document.getElementById('keys-0').textContent = vsComputer ? 'W A S D or arrows' : 'W A S D';
  document.getElementById('keys-1').textContent = vsComputer ? 'Plays automatically' : 'Arrow keys';
}

function startRace() {
  stopRace();
  game = createGame(RACE_SIZE, RACE_SECONDS, TICK_MS);
  drawRaceBoard();
  showPlayers();
  overlay.hidden = true;
  startButton.textContent = 'Restart';
  timer = setInterval(step, TICK_MS);
  showScores();
}

function stopRace() {
  clearInterval(timer);
  timer = null;
}

function step() {
  if (vsComputer) steer(game, 1, computerDir(game, 1));
  tick(game).forEach(function (i) { raceCells[i].style.backgroundColor = COLORS[game.owner[i]]; });
  showPlayers();
  showScores();
  if (game.over) {
    stopRace();
    showScores();
    var names = ['Player 1', vsComputer ? 'Computer' : 'Player 2'];
    overlayTitle.textContent = game.winner === null ? 'Draw' : names[game.winner] + ' wins';
    messageEl.textContent = game.winner === null
      ? 'Both patches ended the same size.'
      : 'Biggest patch: ' + game.scores[game.winner] + ' cells vs ' + game.scores[1 - game.winner] + '.';
    startButton.textContent = 'Play again';
    overlay.hidden = false;
  }
}

var P1_KEYS = { w: 'up', a: 'left', s: 'down', d: 'right' };
var ARROWS = { ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right' };

document.addEventListener('keydown', function (event) {
  if (!timer) return;
  var key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (P1_KEYS[key]) {
    steer(game, 0, P1_KEYS[key]);
  } else if (ARROWS[key]) {
    event.preventDefault(); // stop the page from scrolling
    steer(game, vsComputer ? 0 : 1, ARROWS[key]);
  }
});

startButton.addEventListener('click', startRace);

modeBox.querySelectorAll('button').forEach(function (button) {
  button.addEventListener('click', function () {
    vsComputer = button.dataset.value === 'cpu';
    modeBox.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b === button); });
    stopRace();
    game = null;
    drawRaceBoard();
    showScores();
    updateNames();
    overlayTitle.textContent = 'Paint Race';
    messageEl.textContent = 'Press Start race when you are ready.';
    overlay.hidden = false;
    startButton.textContent = 'Start race';
  });
});

drawRaceBoard();
showScores();
updateNames();
