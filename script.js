
const mazeElement = document.getElementById("maze");
const speedSelect = document.getElementById("speed");
const sizeSelect = document.getElementById("size");

const solveBtn = document.getElementById("solveBtn");
const stepBtn = document.getElementById("stepBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const randomBtn = document.getElementById("randomBtn");
const editBtn = document.getElementById("editBtn");

const statusElement = document.getElementById("status");
const stackList = document.getElementById("stackList");

let rows = 16;
let cols = 16;
let start = { r: 0, c: 0 };
let finish = { r: 15, c: 15 };

let walls = new Set();
let visited = new Set();
let solutionPath = new Set();
let stack = [];

let frames = [];
let frameIndex = 0;
let timer = null;
let editing = false;
let running = false;
let paused = false;
let finished = false;

let operations = 0;
let maxStack = 0;
let currentCell = null;
let currentAction = "Waiting for DFS";
let currentDetail = "Press Solve Maze to start the simulation.";

function key(r, c) {
    return `${r},${c}`;
}

function sameCell(a, b) {
    return a && b && a.r === b.r && a.c === b.c;
}

function inBounds(r, c) {
    return r >= 0 && r < rows && c >= 0 && c < cols;
}

function isWall(r, c) {
    return walls.has(key(r, c));
}

function isStart(r, c) {
    return sameCell({ r, c }, start);
}

function isFinish(r, c) {
    return sameCell({ r, c }, finish);
}

// Four-directional movement: down, right, up, left.
function getNeighbors(cell) {
    const directions = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1]
    ];

    return directions
        .map(([dr, dc]) => ({
            r: cell.r + dr,
            c: cell.c + dc
        }))
        .filter(n =>
            inBounds(n.r, n.c) &&
            !isWall(n.r, n.c)
        );
}

// Check whether the destination is reachable.
function hasRoute() {
    const queue = [start];
    const seen = new Set([key(start.r, start.c)]);

    for (let head = 0; head < queue.length; head++) {
        const cell = queue[head];

        if (sameCell(cell, finish)) return true;

        for (const n of getNeighbors(cell)) {
            const k = key(n.r, n.c);

            if (!seen.has(k)) {
                seen.add(k);
                queue.push(n);
            }
        }
    }

    return false;
}

function clearTimer() {
    if (timer !== null) {
        clearTimeout(timer);
        timer = null;
    }
}

function setStatus(text, type = "") {
    statusElement.textContent = text;
    statusElement.className = "status " + type;
}

function resetStats() {
    document.getElementById("visitedStat").textContent = "0";
    document.getElementById("operationsStat").textContent = "0";
    document.getElementById("pathStat").textContent = "—";
    document.getElementById("maxStackStat").textContent = "0";
    document.getElementById("progress").textContent = "Ready to begin";
}

function clearSearch() {
    clearTimer();

    visited = new Set();
    solutionPath = new Set();
    stack = [];
    frames = [];
    frameIndex = 0;

    operations = 0;
    maxStack = 0;
    currentCell = null;
    currentAction = "Waiting for DFS";
    currentDetail = "Press Solve Maze to start the simulation.";

    running = false;
    paused = false;
    finished = false;

    solveBtn.disabled = false;
    stepBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = "❚❚ Pause";

    resetStats();
    render();
    updateStack();
    updateOperation();
}

function render() {
    mazeElement.style.gridTemplateColumns =
        `repeat(${cols}, var(--cell-size, auto))`;

    mazeElement.innerHTML = "";
    mazeElement.classList.toggle("editable", editing);

    const fragment = document.createDocumentFragment();

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement("button");
            const k = key(r, c);

            cell.type = "button";
            cell.className = "cell";
            cell.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}`);

            if (isWall(r, c)) {
                cell.classList.add("wall");
            }

            if (visited.has(k)) {
                cell.classList.add("visited");
            }

            if (solutionPath.has(k)) {
                cell.classList.add("path");
            }

            if (currentCell && key(currentCell.r, currentCell.c) === k) {
                cell.classList.add("current");
            }

            if (isStart(r, c)) {
                cell.classList.add("start");
            }

            if (isFinish(r, c)) {
                cell.classList.add("end");
            }

            cell.addEventListener("click", () => handleCellClick(r, c));
            fragment.appendChild(cell);
        }
    }

    mazeElement.appendChild(fragment);
}

function updateStack() {
    document.getElementById("stackCount").textContent = stack.length;
    stackList.innerHTML = "";

    if (stack.length === 0) {
        stackList.innerHTML =
            '<div class="empty-stack">Stack is empty</div>';
        return;
    }

    // The last array element is the TOP of the stack.
    for (let i = stack.length - 1; i >= 0; i--) {
        const item = document.createElement("div");
        item.className = "stack-item" + (i === stack.length - 1 ? " top" : "");

        const label = document.createElement("span");
        label.textContent = i === stack.length - 1 ? "TOP → " : "";
        label.textContent += `(${stack[i].r + 1}, ${stack[i].c + 1})`;

        const index = document.createElement("span");
        index.textContent = `#${i}`;

        item.append(label, index);
        stackList.appendChild(item);
    }

    stackList.scrollTop = 0;
}

function updateOperation() {
    document.getElementById("lastOperation").textContent = currentAction;
    document.getElementById("operationDetail").textContent = currentDetail;
}

// Store an independent snapshot after each operation.
function saveFrame(action, detail, cell, path = null) {
    frames.push({
        stack: stack.map(p => ({ ...p })),
        visited: [...visited],
        path: path ? [...path] : [],
        operations,
        maxStack,
        cell: cell ? { ...cell } : null,
        action,
        detail
    });
}

// Prepare a complete DFS run, one operation at a time.
function buildSolution() {
    clearSearch();

    if (isWall(start.r, start.c) || isWall(finish.r, finish.c)) {
        setStatus("INVALID MAZE", "error");
        return false;
    }

    if (!hasRoute()) {
        setStatus("NO ROUTE", "error");
        currentAction = "No solution";
        currentDetail = "The finish cannot be reached. Edit the walls or generate another maze.";
        updateOperation();
        return false;
    }

    const startKey = key(start.r, start.c);

    stack.push({ ...start });
    visited.add(startKey);
    operations = 1;
    maxStack = 1;

    saveFrame(
        "PUSH",
        "Push the starting cell onto the stack.",
        start
    );

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        currentCell = current;

        if (sameCell(current, finish)) {
            const path = stack.map(p => ({ ...p }));

            solutionPath = new Set(path.map(p => key(p.r, p.c)));

            saveFrame(
                "GOAL FOUND",
                `Destination reached! Path contains ${path.length} cells.`,
                current,
                path
            );

            break;
        }

        const next = getNeighbors(current).find(n =>
            !visited.has(key(n.r, n.c))
        );

        if (next) {
            // DFS explores the first unvisited neighbor.
            stack.push(next);
            visited.add(key(next.r, next.c));
            operations++;

            maxStack = Math.max(maxStack, stack.length);

            saveFrame(
                "PUSH",
                `Explore cell (${next.r + 1}, ${next.c + 1}).`,
                next
            );
        } else {
            // No unvisited neighbor: backtrack.
            const deadEnd = stack.pop();
            operations++;

            saveFrame(
                "POP / BACKTRACK",
                `No unvisited neighbor. Remove (${deadEnd.r + 1}, ${deadEnd.c + 1}) from the stack.`,
                stack.length ? stack[stack.length - 1] : deadEnd
            );
        }
    }

    document.getElementById("visitedStat").textContent = visited.size;
    document.getElementById("operationsStat").textContent = operations;
    document.getElementById("maxStackStat").textContent = maxStack;
    document.getElementById("pathStat").textContent =
        solutionPath.size || "—";

    return true;
}

// Apply one saved animation frame.
function applyFrame(frame) {
    stack = frame.stack.map(p => ({ ...p }));
    visited = new Set(frame.visited);
    solutionPath = new Set(frame.path);
    operations = frame.operations;
    maxStack = frame.maxStack;
    currentCell = frame.cell;
    currentAction = frame.action;
    currentDetail = frame.detail;

    document.getElementById("visitedStat").textContent = visited.size;
    document.getElementById("operationsStat").textContent = operations;
    document.getElementById("maxStackStat").textContent = maxStack;
    document.getElementById("pathStat").textContent =
        solutionPath.size || "—";

    document.getElementById("progress").textContent =
        `Step ${frameIndex} / ${frames.length}`;

    if (frame.action === "GOAL FOUND") {
        setStatus("SOLVED");
    } else {
        setStatus(frame.action, "running");
    }

    updateStack();
    updateOperation();
    render();
}

function completeRun() {
    clearTimer();

    running = false;
    paused = false;
    finished = true;

    solveBtn.disabled = false;
    stepBtn.disabled = true;
    pauseBtn.disabled = true;
    pauseBtn.textContent = "❚❚ Pause";

    const solved = solutionPath.size > 0;

    setStatus(solved ? "SOLVED" : "NO SOLUTION", solved ? "" : "error");

    currentAction = solved ? "Maze solved!" : "No solution";
    currentDetail = solved
        ? `DFS found a path of ${solutionPath.size} cells.`
        : "No path to the destination exists.";

    updateOperation();
    document.getElementById("progress").textContent = "Simulation complete";
}

function advanceOneStep() {
    if (frameIndex >= frames.length) {
        completeRun();
        return;
    }

    applyFrame(frames[frameIndex]);
    frameIndex++;

    if (frameIndex >= frames.length) {
        completeRun();
    }
}

function play() {
    if (paused || !running) return;

    advanceOneStep();

    if (running && !paused) {
        timer = setTimeout(play, Number(speedSelect.value));
    }
}

function startSolve() {
    if (running) return;

    if (!buildSolution()) {
        render();
        return;
    }

    editing = false;
    editBtn.textContent = "✎ Edit Walls: OFF";
    render();

    running = true;
    paused = false;
    finished = false;

    solveBtn.disabled = true;
    stepBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = "❚❚ Pause";

    frameIndex = 0;
    play();
}

function stepSolve() {
    if (running || finished) return;

    if (frames.length === 0) {
        if (!buildSolution()) {
            render();
            return;
        }

        editing = false;
        editBtn.textContent = "✎ Edit Walls: OFF";
        render();
    }

    paused = true;
    advanceOneStep();
}

function togglePause() {
    if (!running) return;

    if (!paused) {
        paused = true;
        clearTimer();
        pauseBtn.textContent = "▶ Resume";
        setStatus("PAUSED");
    } else {
        paused = false;
        pauseBtn.textContent = "❚❚ Pause";
        setStatus("RUNNING", "running");
        play();
    }
}

function handleCellClick(r, c) {
    if (!editing || running || isStart(r, c) || isFinish(r, c)) {
        return;
    }

    const k = key(r, c);

    if (walls.has(k)) {
        walls.delete(k);
    } else {
        walls.add(k);
    }

    clearSearch();
    setStatus("EDITING");
}

function generateRandomMaze() {
    clearSearch();

    rows = Number(sizeSelect.value);
    cols = rows;

    start = { r: 0, c: 0 };
    finish = { r: rows - 1, c: cols - 1 };

    // Retry until the randomly generated maze is solvable.
    let attempts = 0;

    do {
        walls = new Set();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (isStart(r, c) || isFinish(r, c)) continue;

                if (Math.random() < 0.29) {
                    walls.add(key(r, c));
                }
            }
        }

        attempts++;
    } while (!hasRoute() && attempts < 500);

    // Guaranteed fallback: create a connected corridor.
    if (!hasRoute()) {
        walls.clear();
        for (let c = 1; c < cols; c++) {
            walls.add(key(0, c));
        }
        for (let r = 0; r < rows - 1; r++) {
            walls.add(key(r, cols - 1));
        }
    }

    editing = false;
    editBtn.textContent = "✎ Edit Walls: OFF";

    render();
    setStatus("READY");
}

function resetSimulation() {
    clearSearch();
    setStatus("READY");
}

function toggleEdit() {
    if (running) return;

    editing = !editing;

    if (editing) {
        clearSearch();
        setStatus("EDITING");
    } else {
        setStatus("READY");
    }

    editBtn.textContent = editing
        ? "✎ Edit Walls: ON"
        : "✎ Edit Walls: OFF";

    render();
}

solveBtn.addEventListener("click", startSolve);
stepBtn.addEventListener("click", stepSolve);
pauseBtn.addEventListener("click", togglePause);
resetBtn.addEventListener("click", resetSimulation);
randomBtn.addEventListener("click", generateRandomMaze);
editBtn.addEventListener("click", toggleEdit);

sizeSelect.addEventListener("change", generateRandomMaze);

speedSelect.addEventListener("change", () => {
    if (running && !paused) {
        clearTimer();
        timer = setTimeout(play, Number(speedSelect.value));
    }
});

// Start with a randomly generated, solvable maze.
generateRandomMaze();
