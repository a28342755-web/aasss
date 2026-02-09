const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const bestEl = document.getElementById("best");
const arena = document.getElementById("arena");
const target = document.getElementById("target");
const startButton = document.getElementById("start");
const resetButton = document.getElementById("reset");

const GAME_DURATION = 30;
const TARGET_SIZE = 96;

let score = 0;
let timeLeft = GAME_DURATION;
let timerId = null;
let playing = false;

const bestScore = Number(localStorage.getItem("click-sprint-best")) || 0;
bestEl.textContent = bestScore;

const updateScore = () => {
  scoreEl.textContent = score;
};

const updateTime = () => {
  timeEl.textContent = timeLeft;
};

const placeTarget = () => {
  const arenaRect = arena.getBoundingClientRect();
  const maxX = arenaRect.width - TARGET_SIZE;
  const maxY = arenaRect.height - TARGET_SIZE;
  const x = Math.max(0, Math.random() * maxX);
  const y = Math.max(0, Math.random() * maxY);

  target.style.transform = `translate(${x}px, ${y}px)`;
};

const endGame = () => {
  playing = false;
  clearInterval(timerId);
  timerId = null;
  startButton.disabled = false;
  startButton.textContent = "Play Again";

  const storedBest = Number(localStorage.getItem("click-sprint-best")) || 0;
  if (score > storedBest) {
    localStorage.setItem("click-sprint-best", String(score));
    bestEl.textContent = score;
  }
};

const tick = () => {
  timeLeft -= 1;
  updateTime();
  if (timeLeft <= 0) {
    endGame();
  }
};

const startGame = () => {
  score = 0;
  timeLeft = GAME_DURATION;
  updateScore();
  updateTime();
  playing = true;
  startButton.disabled = true;
  startButton.textContent = "Running...";

  placeTarget();

  if (timerId) {
    clearInterval(timerId);
  }
  timerId = setInterval(tick, 1000);
};

const handleTargetClick = () => {
  if (!playing) {
    return;
  }
  score += 1;
  updateScore();
  placeTarget();
};

const resetBest = () => {
  localStorage.removeItem("click-sprint-best");
  bestEl.textContent = "0";
};

startButton.addEventListener("click", startGame);
target.addEventListener("click", handleTargetClick);
resetButton.addEventListener("click", resetBest);

window.addEventListener("resize", () => {
  if (playing) {
    placeTarget();
  }
});

placeTarget();
