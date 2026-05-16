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
