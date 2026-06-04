const TILE = 64;
const VIEW_COLS = 10;
const VIEW_ROWS = 8;
const CELL = {
  WALL: "#",
  FLOOR: " ",
  GOAL: ".",
  BOX: "$",
  PLAYER: "@",
  BOX_ON_GOAL: "*",
  PLAYER_ON_GOAL: "+"
};

const LEVELS = [
  {
    name: "1",
    map: [
      "##########",
      "# .   #. #",
      "#  ##    #",
      "# $  #   #",
      "#  $ # . #",
      "#   $@ # #",
      "#   ##   #",
      "##########"
    ]
  },
  {
    name: "2",
    map: [
      "##########",
      "# .#   . #",
      "#    ##  #",
      "#   #  $ #",
      "# . ##$  #",
      "# # @$   #",
      "#   #    #",
      "##########"
    ]
  },
  {
    name: "3",
    map: [
      "##########",
      "#    #   #",
      "#   $@ # #",
      "#  $ # . #",
      "# $# #   #",
      "#  ##    #",
      "##.   #. #",
      "##########"
    ]
  },
  {
    name: "4",
    map: [
      "##########",
      "##.   #. #",
      "#  ##    #",
      "# $  #   #",
      "## $ # . #",
      "#   $@ # #",
      "#    #   #",
      "##########"
    ]
  },
  {
    name: "5",
    map: [
      "##########",
      "#   #    #",
      "# # @$ # #",
      "# . # $  #",
      "#   #  $##",
      "#    ##  #",
      "# .#   . #",
      "##########"
    ]
  }
];

const canvas = document.querySelector("#board");
const ctx = canvas.getContext("2d");
const levelNumber = document.querySelector("#levelNumber");
const levelTotal = document.querySelector("#levelTotal");
const moveCount = document.querySelector("#moveCount");
const pushCount = document.querySelector("#pushCount");
const levelSelect = document.querySelector("#levelSelect");
const clearBanner = document.querySelector("#clearBanner");

const GOAL_EFFECT_DURATION = 320;
const CLEAR_EFFECT_DURATION = 520;

let state;
let currentLevel = 0;
let history = [];
let moves = 0;
let pushes = 0;
let won = false;
let clearedLevels = new Set();
let goalEffects = [];
let clearEffectStart = 0;
let animationFrameId = null;
let clearBannerTimer = 0;

const directions = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 }
};

function makeState(level) {
  const height = level.map.length;
  const width = Math.max(...level.map.map((row) => row.length));
  const goals = new Set();
  const walls = new Set();
  const boxes = new Set();
  let player = { x: 0, y: 0 };

  level.map.forEach((row, y) => {
    [...row.padEnd(width, CELL.FLOOR)].forEach((cell, x) => {
      const key = toKey(x, y);
      if (cell === CELL.WALL) walls.add(key);
      if (cell === CELL.GOAL || cell === CELL.BOX_ON_GOAL || cell === CELL.PLAYER_ON_GOAL) goals.add(key);
      if (cell === CELL.BOX || cell === CELL.BOX_ON_GOAL) boxes.add(key);
      if (cell === CELL.PLAYER || cell === CELL.PLAYER_ON_GOAL) player = { x, y };
    });
  });

  return { width, height, goals, walls, boxes, player };
}

function cloneState() {
  return {
    width: state.width,
    height: state.height,
    goals: new Set(state.goals),
    walls: new Set(state.walls),
    boxes: new Set(state.boxes),
    player: { ...state.player },
    moves,
    pushes,
    won
  };
}

function restore(snapshot) {
  resetEffects();
  state = {
    width: snapshot.width,
    height: snapshot.height,
    goals: new Set(snapshot.goals),
    walls: new Set(snapshot.walls),
    boxes: new Set(snapshot.boxes),
    player: { ...snapshot.player }
  };
  moves = snapshot.moves;
  pushes = snapshot.pushes;
  won = snapshot.won;
  clearBanner.hidden = true;
  draw();
}

function loadLevel(index) {
  resetEffects();
  currentLevel = (index + LEVELS.length) % LEVELS.length;
  state = makeState(LEVELS[currentLevel]);
  history = [];
  moves = 0;
  pushes = 0;
  won = false;
  clearBanner.hidden = true;
  draw();
}

function toKey(x, y) {
  return `${x},${y}`;
}

function has(set, x, y) {
  return set.has(toKey(x, y));
}

function movePlayer(dir) {
  if (won) return;

  const nx = state.player.x + dir.x;
  const ny = state.player.y + dir.y;
  if (has(state.walls, nx, ny)) return;

  const nextKey = toKey(nx, ny);
  const isBox = state.boxes.has(nextKey);
  const bx = nx + dir.x;
  const by = ny + dir.y;
  const boxNextKey = toKey(bx, by);

  if (isBox && (has(state.walls, bx, by) || state.boxes.has(boxNextKey))) return;

  history.push(cloneState());
  state.player = { x: nx, y: ny };
  moves += 1;

  if (isBox) {
    state.boxes.delete(nextKey);
    state.boxes.add(boxNextKey);
    pushes += 1;

    if (state.goals.has(boxNextKey)) {
      addGoalEffect(bx, by);
    }
  }

  won = [...state.boxes].every((box) => state.goals.has(box));
  draw();

  if (won) {
    markLevelCleared(currentLevel);
    startClearEffect();
    clearBannerTimer = window.setTimeout(() => {
      clearBanner.hidden = false;
    }, CLEAR_EFFECT_DURATION);
  }
}

function undo() {
  const snapshot = history.pop();
  if (snapshot) restore(snapshot);
}

function draw() {
  const now = performance.now();

  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const offsetX = Math.floor((canvas.width - state.width * TILE) / 2);
  const offsetY = Math.floor((canvas.height - state.height * TILE) / 2);

  drawBackdrop();

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      drawFloor(offsetX + x * TILE, offsetY + y * TILE, x, y);
    }
  }

  state.goals.forEach((key) => {
    const { x, y } = fromKey(key);
    drawGoal(offsetX + x * TILE, offsetY + y * TILE);
  });

  state.walls.forEach((key) => {
    const { x, y } = fromKey(key);
    drawWall(offsetX + x * TILE, offsetY + y * TILE);
  });

  state.boxes.forEach((key) => {
    const { x, y } = fromKey(key);
    drawBox(offsetX + x * TILE, offsetY + y * TILE, state.goals.has(key));
  });

  drawPlayer(offsetX + state.player.x * TILE, offsetY + state.player.y * TILE);
  drawGoalEffects(offsetX, offsetY, now);
  drawClearEffect(now);
  updateHud();
  pruneEffects(now);
}

function resizeCanvas() {
  canvas.width = VIEW_COLS * TILE;
  canvas.height = VIEW_ROWS * TILE;
}

function fromKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function px(x, y, w, h, color) {
  const s = TILE / 16;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.round(w * s), Math.round(h * s));
}

function withTile(tx, ty, drawFn) {
  ctx.save();
  ctx.translate(tx, ty);
  drawFn();
  ctx.restore();
}

function drawBackdrop() {
  ctx.fillStyle = "#e6f6ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawFloor(tx, ty, x, y) {
  withTile(tx, ty, () => {
    px(0, 0, 16, 16, x % 2 === y % 2 ? "#e9f8ff" : "#daf1ff");
    px(0, 15, 16, 1, "#b8ddf5");
  });
}

function drawGoal(tx, ty) {
  withTile(tx, ty, () => {
    px(2, 2, 12, 1, "#ff4f86");
    px(2, 13, 12, 1, "#ff4f86");
    px(2, 2, 1, 12, "#ff4f86");
    px(13, 2, 1, 12, "#ff4f86");
  });
}

function drawWall(tx, ty) {
  withTile(tx, ty, () => {
    px(1, 1, 14, 14, "#6474a6");
  });
}

function drawBox(tx, ty, onGoal) {
  withTile(tx, ty, () => {
    px(4, 3, 8, 1, "#3977ff");
    px(3, 4, 10, 8, "#3977ff");
    px(4, 12, 8, 1, "#3977ff");
  });
}

function drawPlayer(tx, ty) {
  withTile(tx, ty, () => {
    px(4, 3, 8, 1, "#16c784");
    px(3, 4, 10, 8, "#16c784");
    px(4, 12, 8, 1, "#16c784");
    px(5, 6, 2, 2, "#ffffff");
    px(9, 6, 2, 2, "#ffffff");
  });
}

function addGoalEffect(x, y) {
  goalEffects.push({ x, y, start: performance.now() });
  requestEffectFrame();
}

function startClearEffect() {
  clearEffectStart = performance.now();
  requestEffectFrame();
}

function resetEffects() {
  goalEffects = [];
  clearEffectStart = 0;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (clearBannerTimer) {
    clearTimeout(clearBannerTimer);
    clearBannerTimer = 0;
  }
}

function requestEffectFrame() {
  if (animationFrameId) return;

  animationFrameId = requestAnimationFrame(() => {
    animationFrameId = null;
    draw();

    if (hasActiveEffects(performance.now())) {
      requestEffectFrame();
    }
  });
}

function hasActiveEffects(now) {
  const hasGoalEffects = goalEffects.some((effect) => now - effect.start < GOAL_EFFECT_DURATION);
  const hasClearEffect = clearEffectStart && now - clearEffectStart < CLEAR_EFFECT_DURATION;
  return hasGoalEffects || hasClearEffect;
}

function pruneEffects(now) {
  goalEffects = goalEffects.filter((effect) => now - effect.start < GOAL_EFFECT_DURATION);
}

function drawGoalEffects(offsetX, offsetY, now) {
  goalEffects.forEach((effect) => {
    const progress = Math.min((now - effect.start) / GOAL_EFFECT_DURATION, 1);
    const tx = offsetX + effect.x * TILE;
    const ty = offsetY + effect.y * TILE;
    drawGoalPulse(tx, ty, progress);
  });
}

function drawGoalPulse(tx, ty, progress) {
  withTile(tx, ty, () => {
    ctx.globalAlpha = 1 - progress;
    px(1, 1, 14, 1, "#ffffff");
    px(1, 14, 14, 1, "#ffffff");
    px(1, 1, 1, 14, "#ffffff");
    px(14, 1, 1, 14, "#ffffff");
    ctx.globalAlpha = Math.max(0, 0.7 - progress);
    px(0, 0, 2, 2, "#ff4f86");
    px(14, 0, 2, 2, "#ff4f86");
    px(0, 14, 2, 2, "#ff4f86");
    px(14, 14, 2, 2, "#ff4f86");
    ctx.globalAlpha = 1;
  });
}

function drawClearEffect(now) {
  if (!clearEffectStart) return;

  const progress = (now - clearEffectStart) / CLEAR_EFFECT_DURATION;
  if (progress >= 1) {
    clearEffectStart = 0;
    return;
  }

  ctx.globalAlpha = Math.max(0, 0.22 * (1 - progress));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = Math.max(0, 0.32 * (1 - progress));
  ctx.strokeStyle = "#ff4f86";
  ctx.lineWidth = Math.max(2, Math.round(TILE / 14));
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.globalAlpha = 1;
}

function updateHud() {
  levelNumber.textContent = String(currentLevel + 1);
  levelTotal.textContent = String(LEVELS.length);
  moveCount.textContent = String(moves);
  pushCount.textContent = String(pushes);

  [...levelSelect.children].forEach((button, index) => {
    button.setAttribute("aria-current", String(index === currentLevel));
    button.classList.toggle("is-cleared", clearedLevels.has(index));
  });
}

function buildLevelSelect() {
  levelSelect.innerHTML = "";
  LEVELS.forEach((level, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = level.name;
    button.title = `Level ${level.name}`;
    button.setAttribute("aria-label", `Level ${level.name}`);
    button.addEventListener("click", () => loadLevel(index));
    levelSelect.append(button);
  });
}

function markLevelCleared(index) {
  if (clearedLevels.has(index)) return;
  clearedLevels.add(index);
}

document.addEventListener("keydown", (event) => {
  const dir = directions[event.key];
  if (dir) {
    event.preventDefault();
    movePlayer(dir);
  }

  if (event.key === "Backspace" || event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  }

  if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    loadLevel(currentLevel);
  }
});

document.querySelector("#prevLevel").addEventListener("click", () => loadLevel(currentLevel - 1));
document.querySelector("#nextLevel").addEventListener("click", () => loadLevel(currentLevel + 1));
document.querySelector("#undo").addEventListener("click", undo);
document.querySelector("#reset").addEventListener("click", () => loadLevel(currentLevel));
document.querySelector("#continue").addEventListener("click", () => loadLevel(currentLevel + 1));

buildLevelSelect();
loadLevel(0);
