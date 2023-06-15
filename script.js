const colorPicker = document.getElementById("color-picker");
const randomColorBtn = document.querySelector(".random-color");
const eraserBtn = document.querySelector(".eraser");
const clearBtn = document.querySelector(".clear");
const slider = document.getElementById("slider");
let gridSize = 16; // Default grid size
let defaultColor = 'black';

/* Random Color Generator */
function generateRandomColor() {
  const random = (min, max) => Math.floor(Math.random() * (max - min)) + min;
  const red = random(0, 255);
  const green = random(0, 255);
  const blue = random(0, 255);
  return `rgb(${red}, ${green}, ${blue})`;
}

const container = document.getElementById('container');

// Function to create the grid squares
function createGrid() {
  container.innerHTML = ''; // Clear the container

  container.style.setProperty('--grid-size', gridSize);

  for (let i = 0; i < gridSize * gridSize; i++) {
    const square = document.createElement('div');
    square.classList.add('grid-square');
    container.appendChild(square);

    square.addEventListener("mouseover", () => {
      square.style.backgroundColor = defaultColor;
    });
  }
}

// Initial grid creation
createGrid();

eraserBtn.addEventListener("click", () => {
  const squares = document.querySelectorAll(".grid-square");
  squares.forEach((square) => {
    square.addEventListener("mouseover", () => {
      square.style.backgroundColor = "";
    });
  });
});

clearBtn.addEventListener("click", () => {
  const squares = document.querySelectorAll('.grid-square');
  squares.forEach((square) => {
    square.style.backgroundColor = "";
  });
});

randomColorBtn.addEventListener("click", () => {
  const squares = document.querySelectorAll(".grid-square");
  squares.forEach((square) => {
    square.addEventListener("mouseover", () => {
      square.style.backgroundColor = generateRandomColor();
    });
  });
});

colorPicker.addEventListener("input", (event) => {
  const selectedColor = event.target.value;
  const squares = document.querySelectorAll('.grid-square');
  squares.forEach((square) => {
    square.addEventListener("mouseover", () => {
      square.style.backgroundColor = selectedColor;
    });
  });
});

slider.addEventListener("input", (event) => {
  gridSize = event.target.value;
  const gridSizeValue = document.querySelector(".gridSizeValue")
  gridSizeValue.textContent = `Size: ${gridSize} x ${gridSize}`
  gridSizeValue.style.fontWeight = "bold";
  createGrid(); // Recreate the grid with the new size
});
