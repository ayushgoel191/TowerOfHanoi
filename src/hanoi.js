/**
 * Generates the sequence of moves to solve Tower of Hanoi.
 * @param {number} n - Number of disks.
 * @param {number} [source=0] - Source peg index.
 * @param {number} [target=2] - Target peg index.
 * @param {number} [aux=1] - Auxiliary peg index.
 * @returns {Array<{disk:number, from:number, to:number}>}
 */
export function getHanoiMoves(n, source = 0, target = 2, aux = 1) {
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
