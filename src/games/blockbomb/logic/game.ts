import {
  type Board,
  type Lines,
  canPlace,
  canPlaceAll,
  emptyBoard,
  fitsAnywhere,
  placeAndClear,
  SIZE,
} from './board';
import { type Piece, type Rng, randomPiece, shapeById } from './pieces';

export const TRAY_SIZE = 3;
/** Placements allowed without a clear before the combo streak resets. */
export const COMBO_GRACE = 3;
export const BOARD_CLEAR_BONUS = 300;

export interface MoveResult {
  placedCells: number[];
  cleared: number[];
  lines: Lines;
  points: number;
  combo: number;
  boardCleared: boolean;
  gameOver: boolean;
}

export interface SavedGame {
  board: Board;
  tray: ({ shape: string; color: number } | null)[];
  score: number;
  combo: number;
  movesSinceClear: number;
}

/** Points for clearing `lines` lines at once while on a `combo` streak. */
export function clearPoints(lines: number, combo: number): number {
  if (lines === 0) return 0;
  return 10 * lines * (lines + 1) * Math.max(1, combo);
}

export class Game {
  board: Board = emptyBoard();
  tray: (Piece | null)[] = [];
  score = 0;
  combo = 0;
  movesSinceClear = 0;
  gameOver = false;

  constructor(private rng: Rng = Math.random) {
    this.refillTray();
  }

  reset() {
    this.board = emptyBoard();
    this.score = 0;
    this.combo = 0;
    this.movesSinceClear = 0;
    this.gameOver = false;
    this.refillTray();
  }

  canPlace(trayIndex: number, row: number, col: number): boolean {
    const piece = this.tray[trayIndex];
    return !!piece && canPlace(this.board, piece.shape, row, col);
  }

  /** Whether a tray piece still fits somewhere on the board. */
  isPlayable(trayIndex: number): boolean {
    const piece = this.tray[trayIndex];
    return !!piece && fitsAnywhere(this.board, piece.shape);
  }

  place(trayIndex: number, row: number, col: number): MoveResult | null {
    const piece = this.tray[trayIndex];
    if (this.gameOver || !piece || !canPlace(this.board, piece.shape, row, col)) return null;

    const { board, lines, cleared } = placeAndClear(this.board, piece.shape, row, col, piece.color);
    const placedCells = piece.shape.cells.map(([r, c]) => (row + r) * SIZE + (col + c));
    const lineCount = lines.rows.length + lines.cols.length;

    let points = piece.shape.cells.length;
    if (lineCount > 0) {
      this.combo += 1;
      this.movesSinceClear = 0;
      points += clearPoints(lineCount, this.combo);
    } else {
      this.movesSinceClear += 1;
      if (this.movesSinceClear >= COMBO_GRACE) this.combo = 0;
    }
    const boardCleared = lineCount > 0 && board.every((v) => v === 0);
    if (boardCleared) points += BOARD_CLEAR_BONUS;

    this.board = board;
    this.score += points;
    this.tray[trayIndex] = null;
    if (this.tray.every((p) => p === null)) this.refillTray();
    this.gameOver = !this.tray.some((_, i) => this.isPlayable(i));

    return {
      placedCells,
      cleared,
      lines,
      points,
      combo: lineCount > 0 ? this.combo : 0,
      boardCleared,
      gameOver: this.gameOver,
    };
  }

  /**
   * Deal three new pieces. Like the original, dealing is "fair": we retry a
   * few times to find a set that can be fully placed on the current board,
   * falling back to a set where at least one piece fits.
   */
  private refillTray() {
    let fallback: Piece[] | null = null;
    let last: Piece[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      const set = Array.from({ length: TRAY_SIZE }, () => randomPiece(this.rng));
      last = set;
      const shapes = set.map((p) => p.shape);
      if (canPlaceAll(this.board, shapes)) {
        this.tray = set;
        return;
      }
      if (!fallback && shapes.some((s) => fitsAnywhere(this.board, s))) fallback = set;
    }
    this.tray = fallback ?? last;
  }

  save(): SavedGame {
    return {
      board: this.board.slice(),
      tray: this.tray.map((p) => (p ? { shape: p.shape.id, color: p.color } : null)),
      score: this.score,
      combo: this.combo,
      movesSinceClear: this.movesSinceClear,
    };
  }

  /** Restore a saved game. Returns false (leaving state untouched) if invalid. */
  load(data: SavedGame): boolean {
    if (!Array.isArray(data?.board) || data.board.length !== SIZE * SIZE) return false;
    if (!Array.isArray(data.tray) || data.tray.length !== TRAY_SIZE) return false;
    const tray: (Piece | null)[] = [];
    for (const p of data.tray) {
      if (p === null) {
        tray.push(null);
        continue;
      }
      const shape = shapeById(p.shape);
      if (!shape) return false;
      tray.push({ shape, color: p.color });
    }
    if (tray.every((p) => p === null)) return false;
    this.board = data.board.slice();
    this.tray = tray;
    this.score = data.score | 0;
    this.combo = data.combo | 0;
    this.movesSinceClear = data.movesSinceClear | 0;
    this.gameOver = !this.tray.some((_, i) => this.isPlayable(i));
    return true;
  }
}
