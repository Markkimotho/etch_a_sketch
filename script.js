function createGrid(n) {
    const container = document.getElementById("container");
    
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            let square = document.createElement("div");
            square.className = "box";
            container.appendChild(square);
        }
        let newLine = document.createElement("br");
        container.appendChild(newLine);   
    }
}
createGrid(16);