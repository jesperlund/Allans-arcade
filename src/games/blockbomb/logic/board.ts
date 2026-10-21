import type { Shape } from './pieces';

export const SIZE = 8;

/** Flat row-major grid. 0 = empty, otherwise color index + 1. */
export type Board = number[];

export function emptyBoard(): Board {
  return new Array(SIZE * SIZE).fill(0);
}

export const idx = (row: number, col: number) => row * SIZE + col;

export function canPlace(board: Board, shape: Shape, row: number, col: number): boolean {
  if (row < 0 || col < 0 || row + shape.rows > SIZE || col + shape.cols > SIZE) return false;
  for (const [r, c] of shape.cells) {
    if (board[idx(row + r, col + c)] !== 0) return false;
  }
  return true;
}

export function fitsAnywhere(board: Board, shape: Shape): boolean {
  for (let r = 0; r <= SIZE - shape.rows; r++) {
    for (let c = 0; c <= SIZE - shape.cols; c++) {
      if (canPlace(board, shape, r, c)) return true;
    }
  }
  return false;
}

export function placeShape(board: Board, shape: Shape, row: number, col: number, color: number): Board {
  const next = board.slice();
  for (const [r, c] of shape.cells) next[idx(row + r, col + c)] = color + 1;
  return next;
}

export interface Lines {
  rows: number[];
  cols: number[];
}

export function fullLines(board: Board): Lines {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let i = 0; i < SIZE; i++) {
    let rowFull = true;
    let colFull = true;
    for (let j = 0; j < SIZE; j++) {
      if (board[idx(i, j)] === 0) rowFull = false;
      if (board[idx(j, i)] === 0) colFull = false;
    }
    if (rowFull) rows.push(i);
    if (colFull) cols.push(i);
  }
  return { rows, cols };
}

/** Indices of every cell that belongs to one of the given lines. */
export function lineCells(lines: Lines): number[] {
  const set = new Set<number>();
  for (const r of lines.rows) for (let c = 0; c < SIZE; c++) set.add(idx(r, c));
  for (const c of lines.cols) for (let r = 0; r < SIZE; r++) set.add(idx(r, c));
  return [...set];
}

export function clearCells(board: Board, cells: number[]): Board {
  const next = board.slice();
  for (const i of cells) next[i] = 0;
  return next;
}

/** Place a shape and resolve any completed lines in one step. */
export function placeAndClear(board: Board, shape: Shape, row: number, col: number, color: number) {
  const placed = placeShape(board, shape, row, col, color);
  const lines = fullLines(placed);
  const cleared = lineCells(lines);
  return { board: clearCells(placed, cleared), placed, lines, cleared };
}

/**
 * Whether every shape can be placed, in some order, onto the board (resolving
 * line clears between placements). `budget` caps the search so worst cases
 * stay cheap; running out of budget counts as success.
 */
export function canPlaceAll(board: Board, shapes: Shape[], budget = { n: 4000 }): boolean {
  if (shapes.length === 0) return true;
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    const rest = shapes.filter((_, j) => j !== i);
    for (let r = 0; r <= SIZE - shape.rows; r++) {
      for (let c = 0; c <= SIZE - shape.cols; c++) {
        if (--budget.n < 0) return true;
        if (!canPlace(board, shape, r, c)) continue;
        if (canPlaceAll(placeAndClear(board, shape, r, c, 0).board, rest, budget)) return true;
      }
    }
  }
  return false;
}
