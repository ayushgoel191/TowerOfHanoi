import './style.css'

// State management
let disksCount = 4;
let animationSpeed = 1; // Multiplier
let isPlaying = false;
let moves = [];
let currentMoveIndex = 0;
let timerId = null;

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
      <label id="speed-label">Animation Speed</label>
      <div class="speed-options" role="group" aria-label="Animation speed">
        <button class="speed-btn active" data-speed="1" aria-pressed="true">1x</button>
        <button class="speed-btn" data-speed="2" aria-pressed="false">2x</button>
        <button class="speed-btn" data-speed="3" aria-pressed="false">3x</button>
        <button class="speed-btn" data-speed="5" aria-pressed="false">5x</button>
        <button class="speed-btn" data-speed="10" aria-pressed="false">10x</button>
      </div>
    </div>

    <div class="action-btns">
      <button id="solve-btn" class="primary">Start Animation</button>
      <button id="reset-btn" class="secondary">Reset</button>
    </div>
  </section>

  <div class="stats">
    <div class="stat-item" aria-live="polite" aria-atomic="true">
      <span id="move-counter" class="stat-value">0</span>
      <span class="stat-label">Moves</span>
    </div>
    <div class="stat-item">
      <span id="total-moves" class="stat-value">0</span>
      <span class="stat-label">Total Steps</span>
    </div>
  </div>

  <div id="move-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>

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
const moveAnnouncer = document.getElementById('move-announcer');
const speedBtns = document.querySelectorAll('.speed-btn');
const pegContainers = [
  document.getElementById('peg-0'),
  document.getElementById('peg-1'),
  document.getElementById('peg-2')
];
const stage = document.querySelector('.stage');

// Function form (not cached) so it re-checks the OS setting each call —
// users can toggle reduced-motion mid-session.
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const pegLetter = (i) => ['A', 'B', 'C'][i];

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

  // Dynamic sizing — must match initDisks()
  const count = parseInt(diskInput.value);
  const maxHeight = 280;
  const diskHeight = Math.min(30, Math.floor(maxHeight / count));
  const spacing = diskHeight + 2;

  // Calculate the disk's final resting bottom on the target peg
  const disksInTarget = targetPeg.querySelectorAll('.disk').length;
  const newBottom = disksInTarget * spacing;

  // FLIP-style: capture old viewport position, reparent + set final bottom,
  // then capture the new (final) viewport position so we can derive the
  // visual delta the disk needs to travel from.
  const oldRect = disk.getBoundingClientRect();
  targetPeg.appendChild(disk);
  disk.style.bottom = `${newBottom}px`;
  const newRect = disk.getBoundingClientRect();

  // Defensive: cancel any in-flight animation on this disk so we don't
  // accumulate competing animations at high playback speeds.
  if (disk.getAnimations) {
    disk.getAnimations().forEach(a => a.cancel());
  }

  // If the user prefers reduced motion, snap directly: the disk is already
  // at its final DOM position; we just ensure no stale transform lingers.
  if (prefersReducedMotion()) {
    disk.style.transform = '';
    return;
  }

  // Visual deltas from final-resting-position back to where the disk was.
  const deltaX = oldRect.left - newRect.left;
  const deltaY = oldRect.top - newRect.top;

  // Apex Y: lift the disk to just above the top of the stage. Expressed as
  // a translateY relative to the disk's final resting position so we can
  // mix it cleanly with the X deltas in the keyframes.
  const stageRect = stage.getBoundingClientRect();
  const apexTranslateY = (stageRect.top + 20) - newRect.top;

  // 3-phase parabolic trajectory via WAAPI keyframes with per-segment easing.
  // Each `easing` applies to the segment ENDING at that keyframe.
  //   0     -> 0.33  lift   : decelerate into apex (ease-out feel)
  //   0.33  -> 0.66  traverse: smooth horizontal sweep
  //   0.66  -> 1.0   drop   : accelerate downward (gravity-like)
  const keyframes = [
    {
      offset: 0,
      transform: `translate(${deltaX}px, ${deltaY}px)`,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    {
      offset: 0.33,
      transform: `translate(${deltaX}px, ${apexTranslateY}px)`,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
    },
    {
      offset: 0.66,
      transform: `translate(0px, ${apexTranslateY}px)`,
      easing: 'cubic-bezier(0.55, 0, 0.85, 0.4)',
    },
    {
      offset: 1,
      transform: 'translate(0px, 0px)',
    },
  ];

  const duration = 600 / animationSpeed;
  disk.animate(keyframes, {
    duration,
    easing: 'linear', // per-keyframe easings drive the shape; outer is linear
    fill: 'none',
  });
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
    moveAnnouncer.textContent = `Move ${currentMoveIndex}: Disk ${move.disk} from peg ${pegLetter(move.from)} to peg ${pegLetter(move.to)}`;

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
  if (moveAnnouncer) moveAnnouncer.textContent = '';
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
    speedBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    animationSpeed = parseFloat(btn.dataset.speed);
  });
});

// Initialize
initDisks();
