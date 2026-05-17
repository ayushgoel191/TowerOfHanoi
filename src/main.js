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
let sourcePeg = 0;
let targetPeg = 2;
let auxPeg = 1;
let animationGeneration = 0;
let playState = 'idle'; // 'idle' | 'playing' | 'paused' | 'finished'
let startTime = null;
let lastDirection = 'forward'; // 'forward' | 'reverse' — for readout

// Cancellable sleep — resolves to true if still valid, false if cancelled.
function sleep(ms, gen) {
  return new Promise(resolve => {
    setTimeout(() => resolve(gen === animationGeneration), ms);
  });
}

function cancelAnimation() {
  animationGeneration++;
}

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
      <button id="step-back-btn" class="icon-btn" title="Step Back (←)" aria-label="Step Back">&larr;</button>
      <button id="solve-btn" class="primary">
        <span class="btn-icon">&#9654;&#xFE0E;</span>
        <span class="btn-label">Play</span>
      </button>
      <button id="step-forward-btn" class="icon-btn" title="Step Forward (→)" aria-label="Step Forward">&rarr;</button>
      <button id="skip-end-btn" class="icon-btn" title="Skip to End" aria-label="Skip to End">&#9197;</button>
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
  <div id="move-readout"><span id="readout-text">Ready</span></div>

  <div id="high-disk-warning" style="display: none; text-align: center; color: #fbbf24; font-size: 0.9rem; margin-top: -1rem;">
    Note: With <span id="warn-count"></span> disks, it will take <span id="warn-moves"></span> moves!
  </div>

  <div class="stage-with-log">
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

    <aside class="move-log">
      <h3>Moves</h3>
      <ol id="move-log-list"></ol>
    </aside>
  </div>

  <div id="toast" class="toast" hidden></div>
  <div id="confetti" class="confetti" aria-hidden="true"></div>
`;

const diskInput = document.getElementById('disk-input');
const solveBtn = document.getElementById('solve-btn');
const solveBtnIcon = solveBtn.querySelector('.btn-icon');
const solveBtnLabel = solveBtn.querySelector('.btn-label');
const resetBtn = document.getElementById('reset-btn');
const stepBackBtn = document.getElementById('step-back-btn');
const stepForwardBtn = document.getElementById('step-forward-btn');
const skipEndBtn = document.getElementById('skip-end-btn');
const moveCounter = document.getElementById('move-counter');
const totalMovesEl = document.getElementById('total-moves');
const moveAnnouncer = document.getElementById('move-announcer');
const readoutText = document.getElementById('readout-text');
const moveLogList = document.getElementById('move-log-list');
const toastEl = document.getElementById('toast');
const confettiEl = document.getElementById('confetti');
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
  startTime = null;
  lastDirection = 'forward';
  setPlayState('idle');
  buildMoveLog();
  updateReadout();
  updateMoveLog();
  updateStepButtons();
  hideToast();
}

/**
 * Animates a single disk to its new peg with parabolic motion (Web Animations API).
 * @param {number} diskId - The disk number (1-indexed).
 * @param {number} toPegIndex - Destination peg index.
 * @param {{snap?: boolean}} [opts] - snap=true skips animation (used by skip-to-end).
 * @returns {void}
 */
function moveDisk(diskId, toPegIndex, { snap = false } = {}) {
  const disk = document.getElementById(`disk-${diskId}`);
  const targetPeg = pegContainers[toPegIndex];

  // Dynamic sizing
  const { spacing } = getGeometry(disksCount);

  // Calculate the disk's final resting bottom on the target peg
  const disksInTarget = targetPeg.querySelectorAll('.disk').length;
  const newBottom = disksInTarget * spacing;

  if (snap) {
    // No transition — instant placement (used by skip-to-end).
    if (disk.getAnimations) disk.getAnimations().forEach(a => a.cancel());
    targetPeg.appendChild(disk);
    disk.style.bottom = `${newBottom}px`;
    disk.style.transform = '';
    return;
  }

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

  // Apex Y: lift the disk to just above the top of the stage.
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

function applyMoveAt(index, reverse = false, opts = {}) {
  const move = moves[index];
  if (!move) return;
  const target = reverse ? move.from : move.to;
  moveDisk(move.disk, target, opts);
}

function setPlayState(state) {
  playState = state;
  isPlaying = state === 'playing';
  if (state === 'idle') {
    solveBtnIcon.innerHTML = '&#9654;&#xFE0E;';
    solveBtnLabel.textContent = 'Play';
    solveBtn.disabled = false;
    diskInput.disabled = false;
  } else if (state === 'playing') {
    solveBtnIcon.innerHTML = '&#10074;&#10074;';
    solveBtnLabel.textContent = 'Pause';
    solveBtn.disabled = false;
    diskInput.disabled = true;
  } else if (state === 'paused') {
    solveBtnIcon.innerHTML = '&#9654;&#xFE0E;';
    solveBtnLabel.textContent = 'Resume';
    solveBtn.disabled = false;
    diskInput.disabled = true;
  } else if (state === 'finished') {
    solveBtnIcon.innerHTML = '&#10003;';
    solveBtnLabel.textContent = 'Finished';
    solveBtn.disabled = true;
    diskInput.disabled = false;
  }
  updateStepButtons();
}

function updateStepButtons() {
  stepBackBtn.disabled = currentMoveIndex <= 0;
  stepForwardBtn.disabled = currentMoveIndex >= moves.length;
  skipEndBtn.disabled = currentMoveIndex >= moves.length;
}

function updateReadout() {
  if (!moves.length) {
    readoutText.textContent = 'Ready';
    return;
  }
  if (playState === 'finished' || currentMoveIndex >= moves.length) {
    readoutText.textContent = `Solved in ${moves.length} moves!`;
    return;
  }
  if (currentMoveIndex === 0 && playState === 'idle') {
    readoutText.innerHTML = `Ready &mdash; <span class="readout-count">0</span> / ${moves.length} moves`;
    return;
  }
  // Display the most recently applied move (currentMoveIndex - 1).
  const shownIdx = Math.max(0, currentMoveIndex - 1);
  const move = moves[shownIdx];
  const reverse = lastDirection === 'reverse';
  const from = reverse ? move.to : move.from;
  const to = reverse ? move.from : move.to;
  const suffix = reverse ? ' (undo)' : '';
  readoutText.innerHTML =
    `Move <span class="readout-count">${currentMoveIndex}</span> / ${moves.length} ` +
    `&mdash; Disk ${move.disk}: Peg ${pegLetter(from)} &rarr; Peg ${pegLetter(to)}${suffix}`;
}

function buildMoveLog() {
  const html = moves
    .map(
      (m, i) =>
        `<li class="move-log-item" data-index="${i}">` +
        `<span class="log-num">${i + 1}.</span> ` +
        `Disk ${m.disk}: ${pegLetter(m.from)} &rarr; ${pegLetter(m.to)}` +
        `</li>`
    )
    .join('');
  moveLogList.innerHTML = html;
}

function updateMoveLog() {
  const items = moveLogList.querySelectorAll('.move-log-item');
  items.forEach((li, i) => {
    li.classList.remove('current', 'played');
    if (i < currentMoveIndex - 1) {
      li.classList.add('played');
    } else if (i === currentMoveIndex - 1 && currentMoveIndex > 0) {
      li.classList.add('current');
    }
  });
  if (currentMoveIndex > 0) {
    const cur = moveLogList.querySelector('.move-log-item.current');
    if (cur && cur.scrollIntoView) {
      cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  } else if (items[0]) {
    moveLogList.scrollTop = 0;
  }
}

function showCompletionToast() {
  const seconds =
    startTime != null ? ((performance.now() - startTime) / 1000).toFixed(1) : '0.0';
  toastEl.textContent = `Solved in ${moves.length} moves! (${seconds} s)`;
  toastEl.classList.remove('toast-hide');
  toastEl.classList.add('toast-success', 'toast-show');
  toastEl.hidden = false;
  clearTimeout(showCompletionToast._dismissId);
  showCompletionToast._dismissId = setTimeout(hideToast, 4000);
  fireConfetti();
}

function hideToast() {
  if (toastEl.hidden) return;
  toastEl.classList.remove('toast-show');
  toastEl.classList.add('toast-hide');
  setTimeout(() => {
    toastEl.hidden = true;
    toastEl.classList.remove('toast-hide');
  }, 400);
}

function fireConfetti() {
  const pieces = [];
  const count = 24;
  for (let i = 0; i < count; i++) {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.4;
    const duration = 1.6 + Math.random() * 1.2;
    const drift = (Math.random() * 2 - 1) * 80;
    const rot = Math.random() * 720 - 360;
    pieces.push(
      `<div class="confetti-piece" style="left:${left}%;animation-delay:${delay}s;animation-duration:${duration}s;--drift:${drift}px;--rot:${rot}deg;"></div>`
    );
  }
  confettiEl.innerHTML = pieces.join('');
  confettiEl.classList.add('confetti-active');
  clearTimeout(fireConfetti._stopId);
  fireConfetti._stopId = setTimeout(() => {
    confettiEl.classList.remove('confetti-active');
    confettiEl.innerHTML = '';
  }, 3000);
}

function announceMove(index, reverse = false) {
  const move = moves[index];
  if (!move || !moveAnnouncer) return;
  const from = reverse ? move.to : move.from;
  const to = reverse ? move.from : move.to;
  moveAnnouncer.textContent = `Move ${index + 1}: Disk ${move.disk} from peg ${pegLetter(from)} to peg ${pegLetter(to)}`;
}

function finishSequence() {
  setPlayState('finished');
  currentMoveIndex = moves.length;
  moveCounter.textContent = currentMoveIndex;
  updateReadout();
  updateMoveLog();
  showCompletionToast();
}

async function startAnimation() {
  if (playState === 'playing') return;
  if (currentMoveIndex >= moves.length) return;
  if (startTime == null) startTime = performance.now();
  setPlayState('playing');
  const myGen = ++animationGeneration;
  lastDirection = 'forward';

  while (currentMoveIndex < moves.length && myGen === animationGeneration) {
    announceMove(currentMoveIndex);
    applyMoveAt(currentMoveIndex);
    currentMoveIndex++;
    moveCounter.textContent = currentMoveIndex;
    updateReadout();
    updateMoveLog();
    updateStepButtons();

    const stillValid = await sleep(CONFIG.BASE_STEP_DELAY_MS / animationSpeed, myGen);
    if (!stillValid) return;
  }

  if (currentMoveIndex >= moves.length && myGen === animationGeneration) {
    finishSequence();
  }
}

function pauseAnimation() {
  if (playState !== 'playing') return;
  cancelAnimation();
  setPlayState('paused');
  updateReadout();
}

function toggleSolve() {
  if (playState === 'playing') {
    pauseAnimation();
  } else if (playState === 'idle' || playState === 'paused') {
    startAnimation();
  }
}

function stepForward() {
  if (playState === 'playing') pauseAnimation();
  if (currentMoveIndex >= moves.length) return;
  if (startTime == null) startTime = performance.now();
  lastDirection = 'forward';
  announceMove(currentMoveIndex);
  applyMoveAt(currentMoveIndex);
  currentMoveIndex++;
  moveCounter.textContent = currentMoveIndex;
  updateReadout();
  updateMoveLog();
  if (currentMoveIndex >= moves.length) {
    finishSequence();
  } else {
    updateStepButtons();
    if (playState === 'idle') setPlayState('paused');
  }
}

function stepBackward() {
  if (playState === 'playing') pauseAnimation();
  if (currentMoveIndex <= 0) return;
  currentMoveIndex--;
  lastDirection = 'reverse';
  announceMove(currentMoveIndex, true);
  applyMoveAt(currentMoveIndex, true);
  moveCounter.textContent = currentMoveIndex;
  updateReadout();
  updateMoveLog();
  updateStepButtons();
  if (playState === 'finished') {
    hideToast();
    setPlayState('paused');
  } else if (playState === 'idle' && currentMoveIndex > 0) {
    setPlayState('paused');
  } else if (currentMoveIndex === 0 && playState !== 'playing') {
    setPlayState('idle');
  }
}

function skipToEnd() {
  if (playState === 'playing') pauseAnimation();
  if (currentMoveIndex >= moves.length) return;
  if (startTime == null) startTime = performance.now();
  lastDirection = 'forward';
  while (currentMoveIndex < moves.length) {
    applyMoveAt(currentMoveIndex, false, { snap: true });
    currentMoveIndex++;
  }
  moveCounter.textContent = currentMoveIndex;
  finishSequence();
}

function reset() {
  cancelAnimation();
  hideToast();
  confettiEl.classList.remove('confetti-active');
  confettiEl.innerHTML = '';
  if (moveAnnouncer) moveAnnouncer.textContent = '';
  initDisks();
}

function setSpeed(n) {
  const btn = Array.from(speedBtns).find(b => parseFloat(b.dataset.speed) === n);
  if (!btn) return;
  speedBtns.forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-pressed', 'true');
  animationSpeed = n;
  saveSetting('speed', n);
}

// Peg dropdown conflict resolution
function resolvePegConflict(changedSelect) {
  const selects = [fromSelect, toSelect, viaSelect];
  const changedValue = Number(changedSelect.value);
  const others = selects.filter(s => s !== changedSelect);

  for (const other of others) {
    const otherVal = Number(other.value);
    const locked = [changedValue];
    for (const o of others) {
      if (o !== other) locked.push(Number(o.value));
    }
    if (locked.includes(otherVal)) {
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

solveBtn.addEventListener('click', toggleSolve);
resetBtn.addEventListener('click', reset);
stepForwardBtn.addEventListener('click', stepForward);
stepBackBtn.addEventListener('click', stepBackward);
skipEndBtn.addEventListener('click', skipToEnd);
toastEl.addEventListener('click', hideToast);

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

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  const t = event.target;
  if (t && (t.tagName === 'INPUT' || t.isContentEditable)) return;
  switch (event.key) {
    case ' ':
    case 'Spacebar':
      event.preventDefault();
      toggleSolve();
      break;
    case 'r':
    case 'R':
      event.preventDefault();
      reset();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      stepBackward();
      break;
    case 'ArrowRight':
      event.preventDefault();
      stepForward();
      break;
    case '1':
      setSpeed(1);
      break;
    case '2':
      setSpeed(2);
      break;
    case '3':
      setSpeed(3);
      break;
    case '4':
      setSpeed(5);
      break;
    case '5':
      setSpeed(10);
      break;
  }
});

// Initialize
initDisks();
