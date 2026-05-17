import './style.css'
import { getHanoiMoves } from './hanoi.js';

const CONFIG = {
  MAX_DISK_HEIGHT: 280,
  DISK_HEIGHT_CAP: 30,
  DISK_WIDTH_BASE: 60,
  DISK_WIDTH_RANGE: 140,
  BASE_MOVE_DURATION_MS: 600,
  BASE_STEP_DELAY_MS: 800,
  HIGH_DISK_WARN_THRESHOLD: 8,
  DISK_COUNT_MIN: 1,
  DISK_COUNT_MAX: 12,
};

// State management
let disksCount = 4;
let animationSpeed = 1; // Multiplier
let isPlaying = false;
let moves = [];
let currentMoveIndex = 0;
let timerId = null;
let sourcePeg = 0;
let targetPeg = 2;
let auxPeg = 1;

// localStorage helpers
const STORAGE_PREFIX = 'tower-of-hanoi.';
function loadSetting(key, fallback, validator) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return validator(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
function saveSetting(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(value));
  } catch {
    // ignore storage errors (private mode, quota)
  }
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
      <label for="from-peg">From</label>
      <select id="from-peg" class="peg-select">
        <option value="0">A</option>
        <option value="1">B</option>
        <option value="2">C</option>
      </select>
    </div>

    <div class="control-group">
      <label for="to-peg">To</label>
      <select id="to-peg" class="peg-select">
        <option value="0">A</option>
        <option value="1">B</option>
        <option value="2" selected>C</option>
      </select>
    </div>

    <div class="control-group">
      <label for="via-peg">Via</label>
      <select id="via-peg" class="peg-select">
        <option value="0">A</option>
        <option value="1" selected>B</option>
        <option value="2">C</option>
      </select>
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
const fromSelect = document.getElementById('from-peg');
const toSelect = document.getElementById('to-peg');
const viaSelect = document.getElementById('via-peg');
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

// Load persisted settings
disksCount = loadSetting('disks', 4, n => Number.isInteger(n) && n >= 1 && n <= 12);
animationSpeed = loadSetting('speed', 1, n => [1, 2, 3, 5, 10].includes(n));

const loadedSource = loadSetting('source', 0, n => [0, 1, 2].includes(n));
const loadedTarget = loadSetting('target', 2, n => [0, 1, 2].includes(n));
const loadedAux = loadSetting('aux', 1, n => [0, 1, 2].includes(n));

// Verify distinct; if any collision (corrupted storage), fall back to defaults
if (
  loadedSource === loadedTarget ||
  loadedSource === loadedAux ||
  loadedTarget === loadedAux
) {
  sourcePeg = 0;
  targetPeg = 2;
  auxPeg = 1;
} else {
  sourcePeg = loadedSource;
  targetPeg = loadedTarget;
  auxPeg = loadedAux;
}

// Apply loaded values to DOM
diskInput.value = disksCount;
fromSelect.value = String(sourcePeg);
toSelect.value = String(targetPeg);
viaSelect.value = String(auxPeg);
speedBtns.forEach(b => {
  b.classList.toggle('active', Number(b.dataset.speed) === animationSpeed);
});

// Logic

/**
 * Computes geometry parameters for the given disk count.
 * @param {number} count
 * @returns {{diskHeight:number, spacing:number, fontSize:string, widthFor:(i:number)=>number}}
 */
function getGeometry(count) {
  const diskHeight = Math.min(
    CONFIG.DISK_HEIGHT_CAP,
    Math.floor(CONFIG.MAX_DISK_HEIGHT / count)
  );
  const spacing = diskHeight + 2;
  const fontSize =
    Math.max(0.6, Math.min(0.8, diskHeight / CONFIG.DISK_HEIGHT_CAP)) + 'rem';
  const widthFor = (i) =>
    CONFIG.DISK_WIDTH_BASE + i * (CONFIG.DISK_WIDTH_RANGE / count);
  return { diskHeight, spacing, fontSize, widthFor };
}

/**
 * Renders all disks on peg 0 and resets the animation state.
 * @returns {void}
 */
function initDisks() {
  // Clear existing disks
  document.querySelectorAll('.disk').forEach(d => d.remove());

  const count = disksCount;

  // Dynamic sizing based on number of disks
  const { diskHeight, spacing, fontSize, widthFor } = getGeometry(count);

  for (let i = count; i >= 1; i--) {
    const disk = document.createElement('div');
    disk.className = 'disk';
    disk.id = `disk-${i}`;
    disk.textContent = i;

    // Width logic: largest disk is 180px, smallest is proportional
    const width = widthFor(i);
    disk.style.width = `${width}px`;
    disk.style.height = `${diskHeight}px`;
    disk.style.fontSize = fontSize;
    disk.style.background = `var(--disk-gradient-${((i - 1) % 8) + 1})`;

    // Position: bottom of source peg
    const bottomOffset = (count - i) * spacing;
    disk.style.bottom = `${bottomOffset}px`;

    pegContainers[sourcePeg].appendChild(disk);
  }

  moves = getHanoiMoves(count, sourcePeg, targetPeg, auxPeg);
  totalMovesEl.textContent = moves.length;

  const warning = document.getElementById('high-disk-warning');
  if (count > CONFIG.HIGH_DISK_WARN_THRESHOLD) {
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

/**
 * Animates a single disk to its new peg using inverse-transform transition.
 * @param {number} diskId - The disk number (1-indexed).
 * @param {number} toPegIndex - Destination peg index (0-2).
 * @returns {void}
 */
function moveDisk(diskId, toPegIndex) {
  const disk = document.getElementById(`disk-${diskId}`);
  const targetPeg = pegContainers[toPegIndex];

  // Dynamic sizing
  const { spacing } = getGeometry(disksCount);

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

  const duration = CONFIG.BASE_MOVE_DURATION_MS / animationSpeed;
  disk.animate(keyframes, {
    duration,
    easing: 'linear',
    fill: 'none',
  });
}

/**
 * Plays back all moves in sequence, stopping if reset/paused.
 * @returns {Promise<void>}
 */
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
      timerId = setTimeout(resolve, CONFIG.BASE_STEP_DELAY_MS / animationSpeed);
    });
  }

  if (currentMoveIndex >= moves.length) {
    solveBtn.textContent = 'Finished';
  }
}

/**
 * Stops playback and re-initializes disks to the starting state.
 * @returns {void}
 */
function reset() {
  isPlaying = false;
  clearTimeout(timerId);
  diskInput.disabled = false;
  if (moveAnnouncer) moveAnnouncer.textContent = '';
  initDisks();
}

// Peg dropdown conflict resolution
function resolvePegConflict(changedSelect) {
  const selects = [fromSelect, toSelect, viaSelect];
  const changedValue = Number(changedSelect.value);
  const others = selects.filter(s => s !== changedSelect);

  // Walk through the non-changed selects; if duplicate, pick lowest unused in {0,1,2}
  for (const other of others) {
    const otherVal = Number(other.value);
    // Collect currently locked values (the changed one + any already-distinct other)
    const locked = [changedValue];
    for (const o of others) {
      if (o !== other) locked.push(Number(o.value));
    }
    if (locked.includes(otherVal)) {
      // Find lowest unused peg in {0,1,2} not in the two locked values
      const lockedSet = new Set([changedValue, ...others.filter(o => o !== other).map(o => Number(o.value))]);
      for (const candidate of [0, 1, 2]) {
        if (!lockedSet.has(candidate)) {
          other.value = String(candidate);
          break;
        }
      }
    }
  }

  sourcePeg = Number(fromSelect.value);
  targetPeg = Number(toSelect.value);
  auxPeg = Number(viaSelect.value);

  saveSetting('source', sourcePeg);
  saveSetting('target', targetPeg);
  saveSetting('aux', auxPeg);

  reset();
}

// Event Listeners
diskInput.addEventListener('input', () => {
  let n = Number(diskInput.value);
  if (!Number.isFinite(n)) return;
  if (n > CONFIG.DISK_COUNT_MAX) n = CONFIG.DISK_COUNT_MAX;
  if (n < CONFIG.DISK_COUNT_MIN) n = CONFIG.DISK_COUNT_MIN;
  const clampedStr = String(n);
  if (diskInput.value !== clampedStr) diskInput.value = clampedStr;
  if (n === disksCount) return;
  disksCount = n;
  saveSetting('disks', n);
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
    saveSetting('speed', animationSpeed);
  });
});

fromSelect.addEventListener('change', () => resolvePegConflict(fromSelect));
toSelect.addEventListener('change', () => resolvePegConflict(toSelect));
viaSelect.addEventListener('change', () => resolvePegConflict(viaSelect));

// Initialize
initDisks();
