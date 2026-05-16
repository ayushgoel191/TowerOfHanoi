// Tower of Hanoi solvers + recursion tree builder.
// 3-peg classical and 4-peg Frame-Stewart with optimal k chosen by min total moves.
//
// Move object shape: { disk: <1..n>, from: <peg index>, to: <peg index> }
// Peg indices: 0=A, 1=B, 2=C, 3=D
//
// Tree node shape:
//   { call: <label>, n, src, tgt, kind: 'fs4' | 'h3' | 'leaf',
//     children: Node[], moveStart, moveEnd, moveIndex? }

// ---------- 3-peg classical ----------

export function hanoi3(n, source, target, aux) {
  const result = [];
  function solve(k, s, t, a) {
    if (k === 0) return;
    solve(k - 1, s, a, t);
    result.push({ disk: k, from: s, to: t });
    solve(k - 1, a, t, s);
  }
  solve(n, source, target, aux);
  return result;
}

// Back-compat export for any code that imported the original interface.
export function getHanoiMoves(n, source, target, aux) {
  return hanoi3(n, source, target, aux);
}

// ---------- 4-peg Frame-Stewart ----------

// Memoized minimum move count for n disks with 4 pegs.
const fsCountCache = new Map();
// Memoized optimal split k for n disks with 4 pegs.
const fsKCache = new Map();

function fsCount(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (fsCountCache.has(n)) return fsCountCache.get(n);

  let best = Infinity;
  let bestK = 1;
  for (let k = 1; k <= n - 1; k++) {
    // Move top k via 4 pegs to an aux, move bottom (n-k) via 3 pegs,
    // then move top k via 4 pegs onto target.
    const cost = 2 * fsCount(k) + (Math.pow(2, n - k) - 1);
    if (cost < best) {
      best = cost;
      bestK = k;
    }
  }
  fsCountCache.set(n, best);
  fsKCache.set(n, bestK);
  return best;
}

function optimalK(n) {
  fsCount(n);
  return fsKCache.get(n) ?? 1;
}

export function frameStewart(n, src, tgt, aux1, aux2) {
  const moves = [];
  fsInternal(n, src, tgt, aux1, aux2, moves);
  return moves;
}

function fsInternal(n, src, tgt, aux1, aux2, moves) {
  if (n === 0) return;
  if (n === 1) {
    moves.push({ disk: 1, from: src, to: tgt });
    return;
  }
  const k = optimalK(n);
  // Step 1: move top k disks (1..k) from src to aux1 using all 4 pegs (tgt is free).
  fsInternal(k, src, aux1, aux2, tgt, moves);
  // Step 2: move bottom (n-k) disks (k+1..n) from src to tgt using 3 pegs (aux2),
  // aux1 holds the top stack and is unusable.
  hanoi3Append(n - k, src, tgt, aux2, k, moves);
  // Step 3: move the top k disks from aux1 to tgt using all 4 pegs.
  fsInternal(k, aux1, tgt, aux2, src, moves);
}

// 3-peg helper that appends to an existing moves array with disk-id offset.
// Disks k+1..n live on the stack, so we shift the disk id by `offset`.
function hanoi3Append(n, src, tgt, aux, offset, moves) {
  function solve(k, s, t, a) {
    if (k === 0) return;
    solve(k - 1, s, a, t);
    moves.push({ disk: k + offset, from: s, to: t });
    solve(k - 1, a, t, s);
  }
  solve(n, src, tgt, aux);
}

// ---------- Public mode-aware accessor ----------

export function getMovesForMode(mode, n) {
  if (mode === '4') {
    return frameStewart(n, 0, 3, 1, 2);
  }
  return hanoi3(n, 0, 2, 1);
}

// ---------- Recursion tree builder ----------
// Mirrors the recursive solve calls. Each leaf carries a move index that
// maps to the corresponding entry in the moves array produced alongside it.

export function buildTree(mode, n) {
  const moves = [];
  let cursor = 0;

  function makeH3Node(k, s, t, a, offset = 0) {
    const start = cursor;
    if (k === 0) {
      const end = cursor - 1;
      return { call: `H3(n=0)`, n: 0, src: s, tgt: t, kind: 'h3', children: [], moveStart: start, moveEnd: end };
    }
    if (k === 1) {
      const idx = cursor;
      moves.push({ disk: 1 + offset, from: s, to: t });
      cursor++;
      return {
        call: `move disk ${1 + offset}: ${pegLabel(s)} → ${pegLabel(t)}`,
        n: 1,
        src: s,
        tgt: t,
        kind: 'leaf',
        children: [],
        moveStart: idx,
        moveEnd: idx,
        moveIndex: idx,
      };
    }
    const children = [];
    children.push(makeH3Node(k - 1, s, a, t, offset));
    const leafIdx = cursor;
    moves.push({ disk: k + offset, from: s, to: t });
    cursor++;
    children.push({
      call: `move disk ${k + offset}: ${pegLabel(s)} → ${pegLabel(t)}`,
      n: 1,
      src: s,
      tgt: t,
      kind: 'leaf',
      children: [],
      moveStart: leafIdx,
      moveEnd: leafIdx,
      moveIndex: leafIdx,
    });
    children.push(makeH3Node(k - 1, a, t, s, offset));
    const end = cursor - 1;
    return {
      call: `H3(n=${k}, ${pegLabel(s)}→${pegLabel(t)} via ${pegLabel(a)})`,
      n: k,
      src: s,
      tgt: t,
      kind: 'h3',
      children,
      moveStart: start,
      moveEnd: end,
    };
  }

  function makeFS4Node(k, s, t, a1, a2) {
    const start = cursor;
    if (k === 0) {
      return { call: `FS(n=0)`, n: 0, src: s, tgt: t, kind: 'fs4', children: [], moveStart: start, moveEnd: cursor - 1 };
    }
    if (k === 1) {
      const idx = cursor;
      moves.push({ disk: 1, from: s, to: t });
      cursor++;
      return {
        call: `move disk 1: ${pegLabel(s)} → ${pegLabel(t)}`,
        n: 1,
        src: s,
        tgt: t,
        kind: 'leaf',
        children: [],
        moveStart: idx,
        moveEnd: idx,
        moveIndex: idx,
      };
    }
    const split = optimalK(k);
    const children = [];
    children.push(makeFS4Node(split, s, a1, a2, t));
    children.push(makeH3Node(k - split, s, t, a2, split));
    children.push(makeFS4Node(split, a1, t, a2, s));
    const end = cursor - 1;
    return {
      call: `FS(n=${k}, k=${split}, ${pegLabel(s)}→${pegLabel(t)})`,
      n: k,
      src: s,
      tgt: t,
      kind: 'fs4',
      children,
      moveStart: start,
      moveEnd: end,
    };
  }

  let root;
  if (mode === '4') {
    root = makeFS4Node(n, 0, 3, 1, 2);
  } else {
    root = makeH3Node(n, 0, 2, 1, 0);
  }
  return { root, moves };
}

function pegLabel(idx) {
  return ['A', 'B', 'C', 'D'][idx] ?? `P${idx}`;
}

// Helper for stats display.
export function classicalMoves(n) {
  return Math.pow(2, n) - 1;
}
