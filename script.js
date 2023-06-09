const gridSize = 100; // Change this value to adjust the grid size

// Get the container element
const container = document.querySelector('.container');

// Set the grid size as a CSS variable
container.style.setProperty('--grid-size', gridSize);

// Create the grid squares
function createGrid(gridSize) {
    for (let i = 0; i < gridSize * gridSize; i++) {
    const square = document.createElement('div');
    square.classList.add('grid-square');
    container.appendChild(square);
    }
}

createGrid(gridSize);
