import { describe, it, expect } from 'vitest';
import { getHanoiMoves } from './hanoi.js';

describe('getHanoiMoves', () => {
  it('returns an empty array when n is 0', () => {
    expect(getHanoiMoves(0)).toEqual([]);
  });

  it('produces 2^n - 1 moves for n = 1..10', () => {
    for (let n = 1; n <= 10; n++) {
      const moves = getHanoiMoves(n);
      expect(moves.length).toBe(2 ** n - 1);
    }
  });

  it('produces a valid sequence of moves that solves the puzzle', () => {
    for (let n = 1; n <= 8; n++) {
      const moves = getHanoiMoves(n);

      // Initial layout: source has disks [n, n-1, ..., 1] (largest at bottom = index 0).
      const initial = [];
      for (let i = n; i >= 1; i--) initial.push(i);
      const pegs = [[...initial], [], []];

      for (const { disk, from, to } of moves) {
        const source = pegs[from];
        const target = pegs[to];

        // The disk being moved must be on top of the source peg.
        expect(source.length).toBeGreaterThan(0);
        expect(source[source.length - 1]).toBe(disk);

        // If the target is non-empty, the moved disk must be smaller than its top disk.
        if (target.length > 0) {
          const topOfTarget = target[target.length - 1];
          expect(disk).toBeLessThan(topOfTarget);
        }

        source.pop();
        target.push(disk);
      }

      // After all moves: target peg (index 2) holds the full stack; source and aux are empty.
      expect(pegs[2]).toEqual(initial);
      expect(pegs[0]).toEqual([]);
      expect(pegs[1]).toEqual([]);
    }
  });

  it('honors custom source/target/aux arguments', () => {
    const moves = getHanoiMoves(3, 1, 0, 2);
    expect(moves.length).toBe(7);
    // First move is the smallest disk leaving the source peg toward the final target.
    expect(moves[0]).toEqual({ disk: 1, from: 1, to: 0 });
    // The largest disk (n) moves exactly once, directly from source to target.
    const largestMoves = moves.filter(m => m.disk === 3);
    expect(largestMoves).toEqual([{ disk: 3, from: 1, to: 0 }]);

    // Simulating the sequence should leave all 3 disks on the requested target peg.
    const pegs = [[], [3, 2, 1], []];
    for (const { disk, from, to } of moves) {
      expect(pegs[from][pegs[from].length - 1]).toBe(disk);
      if (pegs[to].length > 0) {
        expect(disk).toBeLessThan(pegs[to][pegs[to].length - 1]);
      }
      pegs[from].pop();
      pegs[to].push(disk);
    }
    expect(pegs[0]).toEqual([3, 2, 1]);
    expect(pegs[1]).toEqual([]);
    expect(pegs[2]).toEqual([]);
  });
});
