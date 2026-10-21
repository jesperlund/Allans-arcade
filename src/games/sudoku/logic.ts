/** Flat row-major 9×9 grid. 0 = empty, otherwise 1–9. */
export type Grid = number[];
export type Rng = () => number;

export const SIZE = 9;
export const CELLS = SIZE * SIZE;
const ALL = 0x3fe; // bits 1–9

export const row = (i: number) => Math.floor(i / SIZE);
export const col = (i: number) => i % SIZE;
export const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

/** For every cell, the 20 other cells sharing its row, column or box. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: CELLS }, (_, i) => {
  const peers: number[] = [];
  for (let j = 0; j < CELLS; j++) {
    if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) peers.push(j);
  }
  return peers;
});

/** Bitmask of the digits that can legally go in cell i. */
export function candidates(grid: Grid, i: number): number {
  let used = 0;
  for (const p of PEERS[i]) used |= 1 << grid[p];
  return ALL & ~used;
}

function bitCount(n: number) {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Backtracking search that always branches on the most constrained cell.
 * Calls `found` for each solution; stops early when it returns true.
 */
function search(grid: Grid, rng: Rng | null, found: (g: Grid) => boolean): boolean {
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let i = 0; i < CELLS; i++) {
    if (grid[i]) continue;
    const mask = candidates(grid, i);
    const count = bitCount(mask);
    if (count === 0) return false;
    if (count < bestCount) {
      best = i;
      bestMask = mask;
      bestCount = count;
      if (count === 1) break;
    }
  }
  if (best < 0) return found(grid);
  const digits: number[] = [];
  for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
  if (rng) shuffle(digits, rng);
  for (const d of digits) {
    grid[best] = d;
    if (search(grid, rng, found)) {
      grid[best] = 0;
      return true;
    }
  }
  grid[best] = 0;
  return false;
}

/** Number of solutions, counting no further than `limit`. */
export function countSolutions(grid: Grid, limit = 2): number {
  let n = 0;
  search(grid.slice(), null, () => ++n >= limit);
  return n;
}

export function solve(grid: Grid): Grid | null {
  let solution: Grid | null = null;
  search(grid.slice(), null, (g) => {
    solution = g.slice();
    return true;
  });
  return solution;
}

/** True when no digit repeats in any row, column or box. */
export function isValid(grid: Grid): boolean {
  return grid.every((v, i) => !v || PEERS[i].every((p) => grid[p] !== v));
}

export function randomSolved(rng: Rng = Math.random): Grid {
  let solution: Grid = [];
  search(new Array(CELLS).fill(0), rng, (g) => {
    solution = g.slice();
    return true;
  });
  return solution;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export const DIFFICULTIES: { id: Difficulty; name: string; clues: number }[] = [
  { id: 'easy', name: 'Easy', clues: 40 },
  { id: 'medium', name: 'Medium', clues: 33 },
  { id: 'hard', name: 'Hard', clues: 28 },
  { id: 'expert', name: 'Expert', clues: 24 },
];

export interface Puzzle {
  puzzle: Grid;
  solution: Grid;
}

/**
 * Generates a puzzle with exactly one solution by removing clues in
 * symmetric pairs from a random solved grid, as long as it stays unique.
 */
export function generate(difficulty: Difficulty, rng: Rng = Math.random): Puzzle {
  const target = DIFFICULTIES.find((d) => d.id === difficulty)!.clues;
  const solution = randomSolved(rng);
  const puzzle = solution.slice();
  let clues = CELLS;
  const order = shuffle(
    Array.from({ length: 41 }, (_, i) => i),
    rng,
  );
  for (const i of order) {
    if (clues <= target) break;
    const j = CELLS - 1 - i;
    const pair = i === j ? [i] : [i, j];
    if (clues - pair.length < target - 1) continue;
    const saved = pair.map((c) => puzzle[c]);
    for (const c of pair) puzzle[c] = 0;
    if (countSolutions(puzzle) === 1) clues -= pair.length;
    else pair.forEach((c, k) => (puzzle[c] = saved[k]));
  }
  return { puzzle, solution };
}
