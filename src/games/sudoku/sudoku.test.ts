import { describe, expect, it } from 'vitest';
import { SudokuGame } from './game';
import { CELLS, countSolutions, DIFFICULTIES, generate, isValid, PEERS, randomSolved, solve } from './logic';

/** Deterministic PRNG (mulberry32) so tests are reproducible. */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const parse = (s: string) => [...s.replace(/\s/g, '')].map((c) => (c === '.' ? 0 : Number(c)));

describe('sudoku logic', () => {
  it('every cell has 20 peers', () => {
    expect(PEERS.every((p) => p.length === 20)).toBe(true);
  });

  it('solves a known puzzle', () => {
    const puzzle = parse(`
      53..7.... 6..195... .98....6. 8...6...3 4..8.3..1 7...2...6 .6....28. ...419..5 ....8..79`);
    const solution = solve(puzzle)!;
    expect(solution.join('')).toBe(
      '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
    );
    expect(countSolutions(puzzle)).toBe(1);
  });

  it('detects multiple solutions', () => {
    expect(countSolutions(new Array(CELLS).fill(0))).toBe(2);
  });

  it('builds valid solved grids', () => {
    const g = randomSolved(seeded(1));
    expect(g.every((v) => v >= 1 && v <= 9)).toBe(true);
    expect(isValid(g)).toBe(true);
  });

  it.each(DIFFICULTIES)('generates unique $name puzzles', ({ id, clues }) => {
    const rng = seeded(clues);
    for (let n = 0; n < 3; n++) {
      const { puzzle, solution } = generate(id, rng);
      expect(countSolutions(puzzle)).toBe(1);
      expect(solve(puzzle)).toEqual(solution);
      expect(puzzle.every((v, i) => v === 0 || v === solution[i])).toBe(true);
      const given = puzzle.filter((v) => v).length;
      expect(given).toBeGreaterThanOrEqual(clues - 1);
      expect(given).toBeLessThanOrEqual(clues + 8);
    }
  });
});

describe('SudokuGame', () => {
  const empty = (g: SudokuGame) => g.values.findIndex((v) => v === 0);

  it('counts mistakes and solves', () => {
    const g = new SudokuGame('easy', seeded(7));
    const cell = empty(g);
    const wrong = (g.solution[cell] % 9) + 1;
    expect(g.setValue(cell, wrong)).toBe('mistake');
    expect(g.isWrong(cell)).toBe(true);
    expect(g.mistakes).toBe(1);
    let last = 'none';
    g.values.forEach((_, i) => {
      if (g.values[i] !== g.solution[i]) last = g.setValue(i, g.solution[i]);
    });
    expect(last).toBe('solved');
    expect(g.solved).toBe(true);
  });

  it('never changes givens', () => {
    const g = new SudokuGame('easy', seeded(3));
    const given = g.puzzle.findIndex((v) => v);
    expect(g.setValue(given, (g.puzzle[given] % 9) + 1)).toBe('none');
    g.erase(given);
    expect(g.values[given]).toBe(g.puzzle[given]);
  });

  it('clears peer notes on a correct digit and undoes it', () => {
    const g = new SudokuGame('medium', seeded(5));
    const cell = empty(g);
    const digit = g.solution[cell];
    const peer = PEERS[cell].find((p) => !g.values[p])!;
    g.toggleNote(peer, digit);
    expect(g.notes[peer]).toBe(1 << digit);
    g.setValue(cell, digit);
    expect(g.notes[peer]).toBe(0);
    g.undo();
    expect(g.values[cell]).toBe(0);
    expect(g.notes[peer]).toBe(1 << digit);
    g.undo();
    expect(g.notes[peer]).toBe(0);
    expect(g.canUndo).toBe(false);
  });

  it('hints fill a correct digit', () => {
    const g = new SudokuGame('hard', seeded(9));
    const cell = g.hint(null, seeded(1))!;
    expect(g.values[cell]).toBe(g.solution[cell]);
    expect(g.hints).toBe(1);
  });

  it('round-trips through save/load', () => {
    const g = new SudokuGame('easy', seeded(11));
    g.setValue(empty(g), 1);
    g.elapsed = 1234;
    const copy = new SudokuGame('easy', seeded(12));
    expect(copy.load(JSON.parse(JSON.stringify(g.save())))).toBe(true);
    expect(copy.save()).toEqual(g.save());
    expect(copy.load({} as never)).toBe(false);
  });
});
