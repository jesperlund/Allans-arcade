import { CELLS, type Difficulty, generate, type Grid, PEERS, type Rng } from './logic';

export interface SavedSudoku {
  difficulty: Difficulty;
  puzzle: Grid;
  solution: Grid;
  values: Grid;
  notes: number[];
  mistakes: number;
  hints: number;
  elapsed: number;
}

interface Snapshot {
  cell: number;
  value: number;
  notes: number[];
}

export type MoveOutcome = 'placed' | 'mistake' | 'solved' | 'none';

export class SudokuGame {
  difficulty: Difficulty = 'easy';
  puzzle: Grid = [];
  solution: Grid = [];
  values: Grid = [];
  /** Pencil marks per cell as a bitmask of digits 1–9. */
  notes: number[] = [];
  mistakes = 0;
  hints = 0;
  /** Play time in milliseconds. */
  elapsed = 0;
  private history: Snapshot[] = [];

  constructor(difficulty: Difficulty = 'easy', rng?: Rng) {
    this.newGame(difficulty, rng);
  }

  newGame(difficulty: Difficulty, rng?: Rng) {
    const { puzzle, solution } = generate(difficulty, rng);
    this.difficulty = difficulty;
    this.puzzle = puzzle;
    this.solution = solution;
    this.values = puzzle.slice();
    this.notes = new Array(CELLS).fill(0);
    this.mistakes = 0;
    this.hints = 0;
    this.elapsed = 0;
    this.history = [];
  }

  get solved(): boolean {
    return this.values.every((v, i) => v === this.solution[i]);
  }

  isGiven(cell: number) {
    return this.puzzle[cell] !== 0;
  }

  isWrong(cell: number) {
    return this.values[cell] !== 0 && this.values[cell] !== this.solution[cell];
  }

  /** How many correct copies of a digit are on the board. */
  placedCount(digit: number) {
    return this.values.filter((v, i) => v === digit && v === this.solution[i]).length;
  }

  get canUndo() {
    return this.history.length > 0;
  }

  /** Records state for undo. Placing a digit also edits peer notes, so it snapshots all notes. */
  private snapshot(cell: number, allNotes = false) {
    this.history.push({ cell, value: this.values[cell], notes: allNotes ? this.notes.slice() : [this.notes[cell]] });
  }

  setValue(cell: number, digit: number): MoveOutcome {
    if (this.isGiven(cell) || this.solved) return 'none';
    if (this.values[cell] === digit) return 'none';
    this.snapshot(cell, true);
    this.values[cell] = digit;
    this.notes[cell] = 0;
    if (digit !== this.solution[cell]) {
      this.mistakes++;
      return 'mistake';
    }
    // A correct digit can't be a candidate for any peer any more.
    for (const p of PEERS[cell]) this.notes[p] &= ~(1 << digit);
    return this.solved ? 'solved' : 'placed';
  }

  toggleNote(cell: number, digit: number) {
    if (this.isGiven(cell) || this.values[cell] || this.solved) return;
    this.snapshot(cell);
    this.notes[cell] ^= 1 << digit;
  }

  erase(cell: number) {
    if (this.isGiven(cell) || this.solved) return;
    if (!this.values[cell] && !this.notes[cell]) return;
    this.snapshot(cell);
    this.values[cell] = 0;
    this.notes[cell] = 0;
  }

  /** Fills the selected cell, or if it's already correct, a random empty one. Returns the filled cell. */
  hint(cell: number | null, rng: Rng = Math.random): number | null {
    if (this.solved) return null;
    let target = cell;
    if (target === null || this.isGiven(target) || this.values[target] === this.solution[target]) {
      const open = this.values.map((v, i) => (v === this.solution[i] ? -1 : i)).filter((i) => i >= 0);
      target = open[Math.floor(rng() * open.length)];
    }
    this.hints++;
    this.setValue(target, this.solution[target]);
    return target;
  }

  undo(): number | null {
    const s = this.history.pop();
    if (!s) return null;
    this.values[s.cell] = s.value;
    if (s.notes.length === CELLS) this.notes = s.notes;
    else this.notes[s.cell] = s.notes[0];
    return s.cell;
  }

  save(): SavedSudoku {
    const { difficulty, puzzle, solution, values, notes, mistakes, hints, elapsed } = this;
    return { difficulty, puzzle, solution, values, notes, mistakes, hints, elapsed };
  }

  load(s: SavedSudoku): boolean {
    const grid = (g: unknown) => Array.isArray(g) && g.length === CELLS && g.every((v) => Number.isInteger(v));
    if (!s || !grid(s.puzzle) || !grid(s.solution) || !grid(s.values) || !grid(s.notes)) return false;
    Object.assign(this, {
      difficulty: s.difficulty,
      puzzle: s.puzzle,
      solution: s.solution,
      values: s.values,
      notes: s.notes,
      mistakes: s.mistakes || 0,
      hints: s.hints || 0,
      elapsed: s.elapsed || 0,
    });
    this.history = [];
    return true;
  }
}
