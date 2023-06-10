const randomColorBtn = document.querySelector(".random-color");

const gridSize = 10; // Change this value to adjust the grid size
bgColor = 'green';



function random(min, max) {
    const num = Math.floor(Math.random() * (max - min)) + min;
    return num;
}

function randomColor(){
    return `rgb(${random(0, 255)}, ${random(0, 255)}, ${random(0, 255)})`;
}

// Get the container element
const container = document.getElementById('container');

// Set the grid size as a CSS variable
container.style.setProperty('--grid-size', gridSize);


// Create the grid squares
function createGrid(gridSize){
    for (let i = 0; i < gridSize * gridSize; i++) {
        const square = document.createElement('div');
        square.classList.add('grid-square');
        container.appendChild(square);

    square.addEventListener("mouseover", () => {
        square.style.backgroundColor = randomColor();
    });
    }
}
createGrid(gridSize);

function clearGrid() {
    return;
}
