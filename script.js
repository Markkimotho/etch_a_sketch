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
var board = document.getElementById('board');
var slider = document.getElementById('slider');
var sizeLabel = document.getElementById('size-label');
var colorPicker = document.getElementById('color-picker');
var linesBox = document.getElementById('lines');
var modeButtons = document.querySelectorAll('[data-mode]');

var gridSize = 16;
var mode = 'color';
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
  if (mode === 'color') cell.style.backgroundColor = colorPicker.value;
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

modeButtons.forEach(function (button) {
  button.addEventListener('click', function () {
    mode = button.dataset.mode;
    modeButtons.forEach(function (b) { b.classList.toggle('active', b === button); });
  });
});

colorPicker.addEventListener('input', function () {
  modeButtons[0].click(); // picking a color switches back to Color mode
});

document.getElementById('clear').addEventListener('click', function () {
  cells.forEach(function (cell) { cell.style.backgroundColor = ''; });
});

slider.addEventListener('input', function () {
  gridSize = Number(slider.value);
  sizeLabel.textContent = gridSize + ' x ' + gridSize;
  createGrid();
});

linesBox.addEventListener('change', function () {
  board.classList.toggle('no-lines', !linesBox.checked);
});

createGrid();

// ---------------- Paint Race ----------------
var RACE_SIZE = 24;
var RACE_SECONDS = 60;
var TICK_MS = 125;
var COLORS = ['#e4572e', '#2a9d8f'];

var raceBoard = document.getElementById('race-board');
var raceMode = document.getElementById('race-mode');
var startButton = document.getElementById('race-start');
var timerEl = document.getElementById('race-timer');
var messageEl = document.getElementById('race-message');
var raceCells = [];
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
  game.players.forEach(function (p) { raceCells[p.y * RACE_SIZE + p.x].classList.add('player'); });
}

function showScores() {
  document.getElementById('score-0').textContent = game.scores[0] + ' / ' + game.goal;
  document.getElementById('score-1').textContent = game.scores[1] + ' / ' + game.goal;
  timerEl.textContent = Math.ceil((game.ticksLeft * TICK_MS) / 1000);
}

function updateNames() {
  var cpu = raceMode.value === 'cpu';
  document.getElementById('name-1').textContent = cpu ? 'Computer' : 'Player 2';
  messageEl.textContent = cpu
    ? 'Player 1: W A S D or arrow keys.'
    : 'Player 1: W A S D. Player 2: arrow keys.';
}

function startRace() {
  stopRace();
  game = createGame(RACE_SIZE, RACE_SECONDS, TICK_MS);
  drawRaceBoard();
  showPlayers();
  showScores();
  updateNames();
  startButton.textContent = 'Restart';
  timer = setInterval(step, TICK_MS);
}

function stopRace() {
  clearInterval(timer);
  timer = null;
}

function step() {
  if (raceMode.value === 'cpu') steer(game, 1, computerDir(game, 1));
  tick(game).forEach(function (i) { raceCells[i].style.backgroundColor = COLORS[game.owner[i]]; });
  showPlayers();
  showScores();
  if (game.over) {
    stopRace();
    var names = ['Player 1', document.getElementById('name-1').textContent];
    messageEl.textContent = game.winner === null
      ? 'Draw!'
      : names[game.winner] + ' wins with a patch of ' + game.scores[game.winner] + ' cells!';
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
    steer(game, raceMode.value === 'cpu' ? 0 : 1, ARROWS[key]);
  }
});

startButton.addEventListener('click', startRace);
raceMode.addEventListener('change', function () {
  stopRace();
  updateNames();
  startButton.textContent = 'Start';
});

drawRaceBoard();
