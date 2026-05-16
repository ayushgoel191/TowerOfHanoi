import './style.css'
import {
  getHanoiMoves,
  getMovesForMode,
  classicalMoves,
} from './hanoi.js'

// Re-export the legacy interface so any consumer reaching for it still finds it.
export { getHanoiMoves }
if (typeof window !== 'undefined') {
  window.getHanoiMoves = getHanoiMoves
}

// State management
let disksCount = 4;
let animationSpeed = 1; // Multiplier
let isPlaying = false;
let moves = [];
let currentMoveIndex = 0;
let timerId = null;
let currentMode = '3'; // '3' or '4'

// DOM Elements
const app = document.querySelector('#app');
app.innerHTML = `
  <header>
    <h1>Tower of Hanoi</h1>
    <p class="subtitle">Animated Step-by-Step Solver</p>
  </header>

  <section class="controls">
    <div class="control-group">
      <label for="disk-input">Disks</label>
      <input type="number" id="disk-input" min="1" max="12" value="4">
    </div>

    <div class="control-group">
      <label>Pegs</label>
      <div class="mode-options" id="peg-mode-options">
        <button class="mode-btn active" data-mode="3">3 Pegs</button>
        <button class="mode-btn" data-mode="4">4 Pegs</button>
      </div>
    </div>

    <div class="control-group">
      <label>Animation Speed</label>
      <div class="speed-options">
        <button class="speed-btn active" data-speed="1">1x</button>
        <button class="speed-btn" data-speed="2">2x</button>
        <button class="speed-btn" data-speed="3">3x</button>
        <button class="speed-btn" data-speed="5">5x</button>
        <button class="speed-btn" data-speed="10">10x</button>
      </div>
    </div>

    <div class="action-btns">
      <button id="solve-btn" class="primary">Start Animation</button>
      <button id="reset-btn" class="secondary">Reset</button>
    </div>
  </section>

  <div class="stats">
    <div class="stat-item">
      <span id="move-counter" class="stat-value">0</span>
      <span class="stat-label">Moves</span>
    </div>
    <div class="stat-item">
      <span id="total-moves" class="stat-value">0</span>
      <span class="stat-label" id="total-moves-label">Total Steps</span>
    </div>
  </div>

  <div id="high-disk-warning" style="display: none; text-align: center; color: #fbbf24; font-size: 0.9rem; margin-top: -1rem;">
    Note: With <span id="warn-count"></span> disks, it will take <span id="warn-moves"></span> moves.
  </div>

  <section class="stage" id="stage"></section>
`;

const diskInput = document.getElementById('disk-input');
const solveBtn = document.getElementById('solve-btn');
const resetBtn = document.getElementById('reset-btn');
const moveCounter = document.getElementById('move-counter');
const totalMovesEl = document.getElementById('total-moves');
const totalMovesLabel = document.getElementById('total-moves-label');
const speedBtns = document.querySelectorAll('.speed-btn');
const pegModeBtns = document.querySelectorAll('#peg-mode-options .mode-btn');
const stageEl = document.getElementById('stage');

let pegContainers = [];

function pegCount() {
  return currentMode === '4' ? 4 : 3;
}

function rebuildStage() {
  stageEl.innerHTML = '';
  const labels = ['A', 'B', 'C', 'D'];
  const count = pegCount();
  stageEl.classList.toggle('four-peg', currentMode === '4');
  pegContainers = [];
  for (let i = 0; i < count; i++) {
    const container = document.createElement('div');
    container.className = 'peg-container';
    container.id = `peg-${i}`;
    container.dataset.pegIndex = String(i);
    container.innerHTML = `
      <div class="peg"></div>
      <div class="peg-label">Peg ${labels[i]}</div>
    `;
    stageEl.appendChild(container);
    pegContainers.push(container);
  }
}

// Logic
function initDisks() {
  // Clear existing disks
  document.querySelectorAll('.disk').forEach(d => d.remove());

  const count = parseInt(diskInput.value);
  disksCount = count;

  // Dynamic sizing based on number of disks
  const maxHeight = 280;
  const diskHeight = Math.min(30, Math.floor(maxHeight / count));
  const spacing = diskHeight + 2;
  const fontSize = Math.max(0.6, Math.min(0.8, diskHeight / 30)) + 'rem';

  // Per-peg disk width: 4-peg pegs are narrower, so smaller disks too.
  const maxDiskWidth = currentMode === '4' ? 140 : 180;
  const minDiskWidth = 50;

  for (let i = count; i >= 1; i--) {
    const disk = document.createElement('div');
    disk.className = 'disk';
    disk.id = `disk-${i}`;
    disk.textContent = i;

    const width = minDiskWidth + (i * ((maxDiskWidth - minDiskWidth) / Math.max(1, count)));
    disk.style.width = `${width}px`;
    disk.style.height = `${diskHeight}px`;
    disk.style.fontSize = fontSize;
    disk.style.background = `var(--disk-gradient-${((i - 1) % 8) + 1})`;

    // Position: bottom of peg 0
    const bottomOffset = (count - i) * spacing;
    disk.style.bottom = `${bottomOffset}px`;

    pegContainers[0].appendChild(disk);
  }

  moves = getMovesForMode(currentMode, count);
  updateMoveStats();

  const warning = document.getElementById('high-disk-warning');
  if (count > 8) {
    warning.style.display = 'block';
    document.getElementById('warn-count').textContent = count;
    document.getElementById('warn-moves').textContent = moves.length;
  } else {
    warning.style.display = 'none';
  }

  currentMoveIndex = 0;
  moveCounter.textContent = '0';
  isPlaying = false;
  solveBtn.textContent = 'Start Animation';
  solveBtn.disabled = false;
}

function updateMoveStats() {
  if (currentMode === '4') {
    const classical = classicalMoves(disksCount);
    totalMovesEl.textContent = `${moves.length} (vs 2^${disksCount}−1 = ${classical})`;
    totalMovesLabel.textContent = '4-Peg Steps';
  } else {
    totalMovesEl.textContent = String(moves.length);
    totalMovesLabel.textContent = 'Total Steps';
  }
}

function moveDisk(diskId, toPegIndex) {
  const disk = document.getElementById(`disk-${diskId}`);
  const targetPeg = pegContainers[toPegIndex];

  // Dynamic sizing
  const count = parseInt(diskInput.value);
  const maxHeight = 280;
  const diskHeight = Math.min(30, Math.floor(maxHeight / count));
  const spacing = diskHeight + 2;

  // Calculate new position
  const disksInTarget = targetPeg.querySelectorAll('.disk').length;
  const newBottom = disksInTarget * spacing;

  const oldRect = disk.getBoundingClientRect();
  targetPeg.appendChild(disk);
  disk.style.bottom = `${newBottom}px`;
  const newRect = disk.getBoundingClientRect();

  // Inverse transform for smooth transition
  const deltaX = oldRect.left - newRect.left;
  const deltaY = oldRect.top - newRect.top;

  disk.style.transition = 'none';
  disk.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

  // Force reflow
  disk.offsetHeight;

  // Transition duration based on speed
  const duration = 600 / animationSpeed;
  disk.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  disk.style.transform = 'translate(0, 0)';
}

async function startAnimation() {
  if (isPlaying) return;
  isPlaying = true;
  solveBtn.textContent = 'Playing...';
  solveBtn.disabled = true;
  diskInput.disabled = true;

  while (currentMoveIndex < moves.length && isPlaying) {
    const move = moves[currentMoveIndex];
    moveDisk(move.disk, move.to);
    currentMoveIndex++;
    moveCounter.textContent = currentMoveIndex;

    await new Promise(resolve => {
      timerId = setTimeout(resolve, 800 / animationSpeed);
    });
  }

  if (currentMoveIndex >= moves.length) {
    solveBtn.textContent = 'Finished';
  }
}

function reset() {
  isPlaying = false;
  clearTimeout(timerId);
  diskInput.disabled = false;
  initDisks();
}

// Event Listeners
diskInput.addEventListener('change', () => {
  if (parseInt(diskInput.value) > 12) diskInput.value = 12;
  if (parseInt(diskInput.value) < 1) diskInput.value = 1;
  reset();
});

solveBtn.addEventListener('click', startAnimation);
resetBtn.addEventListener('click', reset);

speedBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    speedBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    animationSpeed = parseFloat(btn.dataset.speed);
  });
});

pegModeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode === currentMode) return;
    pegModeBtns.forEach(b => b.classList.toggle('active', b === btn));
    currentMode = btn.dataset.mode;
    rebuildStage();
    reset();
  });
});

// Initialize
rebuildStage();
initDisks();
