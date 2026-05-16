import './style.css'
import {
  getHanoiMoves,
  getMovesForMode,
  classicalMoves,
  buildTree,
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
let playMode = 'auto'; // 'auto' or 'manual'

// Manual mode state
let manualState = []; // array of arrays; each is disk ids bottom→top
let selectedPegIdx = null;
let manualMoveCount = 0;
let manualDeviated = false;
let manualOptimalPtr = 0;
let manualBusy = false;

// Recursion tree state
let recursionTreeRoot = null;
let lastActiveLeaf = null;
let lastActiveAncestors = [];

const TREE_CAP = 8;

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
      <label>Play</label>
      <div class="mode-options" id="play-mode-options">
        <button class="mode-btn active" data-play="auto">Auto</button>
        <button class="mode-btn" data-play="manual">Manual</button>
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
      <button id="hint-btn" class="primary manual-only" style="display:none;">Hint</button>
      <button id="giveup-btn" class="secondary manual-only" style="display:none;">Give Up</button>
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

  <div id="manual-status" class="manual-status" style="display:none;"></div>

  <div id="high-disk-warning" style="display: none; text-align: center; color: #fbbf24; font-size: 0.9rem; margin-top: -1rem;">
    Note: With <span id="warn-count"></span> disks, it will take <span id="warn-moves"></span> moves.
  </div>

  <section class="stage" id="stage"></section>

  <aside id="tree-panel" class="tree-panel collapsed">
    <div class="tree-header" id="tree-header">
      <span>Recursion Tree</span>
      <span class="tree-toggle">[+]</span>
    </div>
    <div class="tree-body" id="tree-body"></div>
  </aside>

  <div id="win-banner" class="win-banner" style="display:none;"></div>
`;

const diskInput = document.getElementById('disk-input');
const solveBtn = document.getElementById('solve-btn');
const resetBtn = document.getElementById('reset-btn');
const hintBtn = document.getElementById('hint-btn');
const giveupBtn = document.getElementById('giveup-btn');
const moveCounter = document.getElementById('move-counter');
const totalMovesEl = document.getElementById('total-moves');
const totalMovesLabel = document.getElementById('total-moves-label');
const speedBtns = document.querySelectorAll('.speed-btn');
const pegModeBtns = document.querySelectorAll('#peg-mode-options .mode-btn');
const playModeBtns = document.querySelectorAll('#play-mode-options .mode-btn');
const stageEl = document.getElementById('stage');
const treePanel = document.getElementById('tree-panel');
const treeHeader = document.getElementById('tree-header');
const treeBody = document.getElementById('tree-body');
const treeToggle = treePanel.querySelector('.tree-toggle');
const manualStatus = document.getElementById('manual-status');
const winBanner = document.getElementById('win-banner');

let pegContainers = [];

function pegCount() {
  return currentMode === '4' ? 4 : 3;
}

function targetPegIdx() {
  return currentMode === '4' ? 3 : 2;
}

function pegLabel(idx) {
  return ['A', 'B', 'C', 'D'][idx] ?? `P${idx}`;
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
    container.addEventListener('click', () => onPegClick(i));
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

  manualMoveCount = 0;
  manualDeviated = false;
  manualOptimalPtr = 0;
  selectedPegIdx = null;
  manualBusy = false;
  manualState = [];
  for (let i = 0; i < pegCount(); i++) manualState.push([]);
  for (let i = count; i >= 1; i--) manualState[0].push(i);

  hideWinBanner();
  applyPlayModeUI();
  rebuildTreePanel();
  updateManualStatus('');
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
  if (playMode !== 'auto') return;
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
    highlightTreeStep(currentMoveIndex - 1);

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

// ---------- Manual mode ----------

function applyPlayModeUI() {
  const manualOnly = document.querySelectorAll('.manual-only');
  if (playMode === 'manual') {
    solveBtn.style.display = 'none';
    manualOnly.forEach(el => (el.style.display = ''));
    manualStatus.style.display = '';
    updateManualStatus(
      `Click a peg to pick up its top disk. Goal: move all disks to peg ${pegLabel(targetPegIdx())}.`
    );
  } else {
    solveBtn.style.display = '';
    manualOnly.forEach(el => (el.style.display = 'none'));
    manualStatus.style.display = 'none';
    clearSelection();
  }
}

function onPegClick(pegIdx) {
  if (playMode !== 'manual') return;
  if (manualBusy) return;
  if (isWon()) return;

  if (selectedPegIdx === null) {
    // Pick up top disk of pegIdx.
    const stack = manualState[pegIdx];
    if (stack.length === 0) return;
    selectedPegIdx = pegIdx;
    highlightSelectedDisk(pegIdx);
    return;
  }

  if (selectedPegIdx === pegIdx) {
    clearSelection();
    return;
  }

  // Attempt move from selectedPegIdx → pegIdx.
  const fromStack = manualState[selectedPegIdx];
  const toStack = manualState[pegIdx];
  const movingDisk = fromStack[fromStack.length - 1];
  const targetTop = toStack[toStack.length - 1];

  if (targetTop !== undefined && targetTop < movingDisk) {
    // Invalid: larger on smaller.
    shakePeg(pegIdx);
    clearSelection();
    return;
  }

  // Valid move.
  manualBusy = true;
  fromStack.pop();
  toStack.push(movingDisk);
  const fromIdx = selectedPegIdx;
  clearSelection();
  moveDisk(movingDisk, pegIdx);
  manualMoveCount++;
  moveCounter.textContent = String(manualMoveCount);

  // Track optimal-path adherence.
  if (!manualDeviated) {
    const expected = moves[manualOptimalPtr];
    if (
      expected &&
      expected.disk === movingDisk &&
      expected.from === fromIdx &&
      expected.to === pegIdx
    ) {
      highlightTreeStep(manualOptimalPtr);
      manualOptimalPtr++;
    } else {
      manualDeviated = true;
      updateManualStatus(
        'You have deviated from the optimal path. Hints are disabled. Reset to use hints, or click Give Up.'
      );
    }
  }

  setTimeout(() => {
    manualBusy = false;
    if (isWon()) showWinBanner();
  }, 650 / animationSpeed);
}

function highlightSelectedDisk(pegIdx) {
  const stack = manualState[pegIdx];
  const topDiskId = stack[stack.length - 1];
  const el = document.getElementById(`disk-${topDiskId}`);
  if (el) el.classList.add('selected');
  pegContainers[pegIdx].classList.add('peg-selected');
}

function clearSelection() {
  if (selectedPegIdx === null) {
    document.querySelectorAll('.disk.selected').forEach(d => d.classList.remove('selected'));
    document.querySelectorAll('.peg-container.peg-selected').forEach(p => p.classList.remove('peg-selected'));
    return;
  }
  const stack = manualState[selectedPegIdx];
  const topDiskId = stack[stack.length - 1];
  if (topDiskId !== undefined) {
    const el = document.getElementById(`disk-${topDiskId}`);
    if (el) el.classList.remove('selected');
  }
  pegContainers[selectedPegIdx]?.classList.remove('peg-selected');
  selectedPegIdx = null;
}

function shakePeg(pegIdx) {
  const c = pegContainers[pegIdx];
  if (!c) return;
  c.classList.remove('shake');
  // Force reflow to restart animation.
  void c.offsetWidth;
  c.classList.add('shake');
  setTimeout(() => c.classList.remove('shake'), 350);
}

function isWon() {
  const tgt = targetPegIdx();
  return manualState[tgt] && manualState[tgt].length === disksCount;
}

function showWinBanner() {
  const optimal = moves.length;
  winBanner.style.display = '';
  winBanner.innerHTML = `<strong>You won!</strong> Solved in ${manualMoveCount} moves (optimal: ${optimal}).`;
}

function hideWinBanner() {
  winBanner.style.display = 'none';
  winBanner.textContent = '';
}

function updateManualStatus(msg) {
  manualStatus.textContent = msg || '';
}

function handleHint() {
  if (playMode !== 'manual') return;
  if (manualBusy) return;
  if (isWon()) return;
  if (manualDeviated) {
    updateManualStatus(
      'Cannot hint after deviation. Click Reset to start over, or Give Up to replay the optimal solution.'
    );
    return;
  }
  if (manualOptimalPtr >= moves.length) {
    updateManualStatus('Already at the final state.');
    return;
  }
  const next = moves[manualOptimalPtr];
  manualBusy = true;
  const fromStack = manualState[next.from];
  const toStack = manualState[next.to];
  fromStack.pop();
  toStack.push(next.disk);
  moveDisk(next.disk, next.to);
  manualOptimalPtr++;
  manualMoveCount++;
  moveCounter.textContent = String(manualMoveCount);
  highlightTreeStep(manualOptimalPtr - 1);
  updateManualStatus(
    `Hint: moved disk ${next.disk} from ${pegLabel(next.from)} to ${pegLabel(next.to)}.`
  );
  setTimeout(() => {
    manualBusy = false;
    if (isWon()) showWinBanner();
  }, 650 / animationSpeed);
}

function handleGiveUp() {
  if (playMode !== 'manual') return;
  // Always reset and replay the full optimal solution from scratch.
  playMode = 'auto';
  playModeBtns.forEach(b => b.classList.toggle('active', b.dataset.play === 'auto'));
  reset();
  applyPlayModeUI();
  startAnimation();
}

// ---------- Recursion tree ----------

function rebuildTreePanel() {
  treeBody.innerHTML = '';
  recursionTreeRoot = null;
  lastActiveLeaf = null;
  lastActiveAncestors = [];

  if (disksCount > TREE_CAP) {
    const note = document.createElement('div');
    note.className = 'tree-omitted';
    note.textContent = `Tree omitted for n > ${TREE_CAP} (${moves.length} moves would yield a very large tree). Reduce disks to view the recursion tree.`;
    treeBody.appendChild(note);
    return;
  }

  const built = buildTree(currentMode, disksCount);
  recursionTreeRoot = built.root;
  const rendered = renderNode(built.root);
  treeBody.appendChild(rendered);
}

function renderNode(node) {
  const wrapper = document.createElement('div');
  if (node.kind === 'leaf') {
    wrapper.className = 'tree-leaf';
    wrapper.dataset.moveIndex = String(node.moveIndex);
    wrapper.textContent = node.call;
    return wrapper;
  }
  wrapper.className = `tree-node tree-${node.kind}`;
  wrapper.dataset.moveStart = String(node.moveStart);
  wrapper.dataset.moveEnd = String(node.moveEnd);
  const label = document.createElement('div');
  label.className = 'tree-node-label';
  label.textContent = node.call;
  wrapper.appendChild(label);
  if (node.children && node.children.length) {
    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'tree-children';
    for (const c of node.children) {
      childrenWrap.appendChild(renderNode(c));
    }
    wrapper.appendChild(childrenWrap);
  }
  return wrapper;
}

function highlightTreeStep(moveIdx) {
  if (!recursionTreeRoot) return;
  if (lastActiveLeaf) lastActiveLeaf.classList.remove('active');
  lastActiveAncestors.forEach(a => a.classList.remove('in-progress'));
  lastActiveAncestors = [];

  const leaf = treeBody.querySelector(`.tree-leaf[data-move-index="${moveIdx}"]`);
  if (!leaf) return;
  leaf.classList.add('active');
  lastActiveLeaf = leaf;
  // Walk up the DOM marking ancestor tree-nodes whose range includes moveIdx.
  let parent = leaf.parentElement;
  while (parent && parent !== treeBody) {
    if (parent.classList && parent.classList.contains('tree-node')) {
      const s = parseInt(parent.dataset.moveStart);
      const e = parseInt(parent.dataset.moveEnd);
      if (moveIdx >= s && moveIdx <= e) {
        parent.classList.add('in-progress');
        lastActiveAncestors.push(parent);
      }
    }
    parent = parent.parentElement;
  }
}

function toggleTreePanel() {
  treePanel.classList.toggle('collapsed');
  treeToggle.textContent = treePanel.classList.contains('collapsed') ? '[+]' : '[−]';
}

// Event Listeners
diskInput.addEventListener('change', () => {
  if (parseInt(diskInput.value) > 12) diskInput.value = 12;
  if (parseInt(diskInput.value) < 1) diskInput.value = 1;
  reset();
});

solveBtn.addEventListener('click', startAnimation);
resetBtn.addEventListener('click', reset);
hintBtn.addEventListener('click', handleHint);
giveupBtn.addEventListener('click', handleGiveUp);

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

playModeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.play === playMode) return;
    playModeBtns.forEach(b => b.classList.toggle('active', b === btn));
    playMode = btn.dataset.play;
    reset();
  });
});

treeHeader.addEventListener('click', toggleTreePanel);

// Initialize
rebuildStage();
initDisks();
