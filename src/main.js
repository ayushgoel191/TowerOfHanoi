import './style.css'

// State management
let disksCount = 4;
let animationSpeed = 1; // Multiplier
let isPlaying = false;
let moves = [];
let currentMoveIndex = 0;
let animationGeneration = 0;

// Cancellable sleep — resolves to true if still valid, false if cancelled.
function sleep(ms, gen) {
  return new Promise(resolve => {
    setTimeout(() => resolve(gen === animationGeneration), ms);
  });
}

function cancelAnimation() {
  animationGeneration++;
}

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
      <span class="stat-label">Total Steps</span>
    </div>
  </div>

  <div id="high-disk-warning" style="display: none; text-align: center; color: #fbbf24; font-size: 0.9rem; margin-top: -1rem;">
    ⚠️ Note: With <span id="warn-count"></span> disks, it will take <span id="warn-moves"></span> moves!
  </div>

  <section class="stage">
    <div class="peg-container" id="peg-0">
      <div class="peg"></div>
      <div class="peg-label">Peg A</div>
    </div>
    <div class="peg-container" id="peg-1">
      <div class="peg"></div>
      <div class="peg-label">Peg B</div>
    </div>
    <div class="peg-container" id="peg-2">
      <div class="peg"></div>
      <div class="peg-label">Peg C</div>
    </div>
  </section>
`;

const diskInput = document.getElementById('disk-input');
const solveBtn = document.getElementById('solve-btn');
const resetBtn = document.getElementById('reset-btn');
const moveCounter = document.getElementById('move-counter');
const totalMovesEl = document.getElementById('total-moves');
const speedBtns = document.querySelectorAll('.speed-btn');
const pegContainers = [
  document.getElementById('peg-0'),
  document.getElementById('peg-1'),
  document.getElementById('peg-2')
];

// Logic
function getHanoiMoves(n, source, target, aux) {
  const result = [];
  function solve(n, s, t, a) {
    if (n === 0) return;
    solve(n - 1, s, a, t);
    result.push({ disk: n, from: s, to: t });
    solve(n - 1, a, t, s);
  }
  solve(n, source, target, aux);
  return result;
}

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

  for (let i = count; i >= 1; i--) {
    const disk = document.createElement('div');
    disk.className = 'disk';
    disk.id = `disk-${i}`;
    disk.textContent = i;
    
    // Width logic: largest disk is 180px, smallest is proportional
    const width = 60 + (i * (140 / count));
    disk.style.width = `${width}px`;
    disk.style.height = `${diskHeight}px`;
    disk.style.fontSize = fontSize;
    disk.style.background = `var(--disk-gradient-${((i - 1) % 8) + 1})`;
    
    // Position: bottom of peg 0
    const bottomOffset = (count - i) * spacing;
    disk.style.bottom = `${bottomOffset}px`;
    
    pegContainers[0].appendChild(disk);
  }

  moves = getHanoiMoves(count, 0, 2, 1);
  totalMovesEl.textContent = moves.length;
  
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
  
  // Move in DOM (actually we just update styles for animation)
  // To make it look like it's "jumping" over, we could do multi-step transition,
  // but for simplicity, we'll use a smooth translation.
  // We need to move the element to the new parent to keep the relative positioning,
  // but the animation might jitter. Better: keep them in a global container or 
  // calculate the transform relative to current position.
  
  // Strategy: Calculate current absolute position, append to new peg, calculate new position,
  // and use CSS transition.
  
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
  const myGen = ++animationGeneration;
  solveBtn.textContent = 'Playing...';
  solveBtn.disabled = true;
  diskInput.disabled = true;

  while (currentMoveIndex < moves.length && myGen === animationGeneration) {
    const move = moves[currentMoveIndex];
    moveDisk(move.disk, move.to);
    currentMoveIndex++;
    moveCounter.textContent = currentMoveIndex;

    const stillValid = await sleep(800 / animationSpeed, myGen);
    if (!stillValid) return;
  }

  if (currentMoveIndex >= moves.length) {
    isPlaying = false;
    solveBtn.textContent = 'Finished';
  }
}

function reset() {
  isPlaying = false;
  cancelAnimation();
  diskInput.disabled = false;
  initDisks();
}

// Event Listeners
diskInput.addEventListener('change', () => {
  if (diskInput.value > 12) diskInput.value = 12;
  if (diskInput.value < 1) diskInput.value = 1;
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

// Initialize
initDisks();
