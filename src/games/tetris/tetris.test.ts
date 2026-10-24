import { describe, expect, it } from 'vitest';
import { gravityMs, HIDDEN, LOCK_MS, pieceCells, ROWS, Tetris, TYPES, WIDTH } from './logic';

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

/** A game whose current piece is `type`. */
function withPiece(type: (typeof TYPES)[number]) {
  for (let seed = 1; ; seed++) {
    const g = new Tetris(seeded(seed));
    if (g.piece.type === type) return g;
  }
}

const fillRow = (g: Tetris, row: number, except: number[] = []) => {
  for (let c = 0; c < WIDTH; c++) g.board[row * WIDTH + c] = except.includes(c) ? 0 : 1;
};

describe('Tetris', () => {
  it('has four cells in every rotation', () => {
    for (const t of TYPES) for (let r = 0; r < 4; r++) expect(pieceCells(t, r)).toHaveLength(4);
  });

  it('deals every piece once per bag', () => {
    const g = new Tetris(seeded(1));
    const seen = [g.piece.type, ...g.next(6)];
    expect(new Set(seen).size).toBe(7);
  });

  it('moves within the walls', () => {
    const g = withPiece('T');
    while (g.move(-1));
    expect(Math.min(...pieceCells('T', g.piece.rotation).map(([, c]) => g.piece.x + c))).toBe(0);
    while (g.move(1));
    expect(Math.max(...pieceCells('T', g.piece.rotation).map(([, c]) => g.piece.x + c))).toBe(WIDTH - 1);
  });

  it('kicks off the wall when rotating', () => {
    const g = withPiece('I');
    g.rotate(1); // vertical
    while (g.move(-1));
    expect(g.rotate(1)).toBe(true);
    expect(g.fits(g.piece)).toBe(true);
  });

  it('hard drops, scores and spawns the next piece', () => {
    const g = withPiece('O');
    const next = g.next(1)[0];
    const res = g.hardDrop();
    expect(res.rows).toEqual([]);
    expect(g.board.slice((ROWS - 2) * WIDTH).filter((v) => v)).toHaveLength(4);
    expect(g.score).toBe((ROWS - 2 - 1) * 2);
    expect(g.piece.type).toBe(next);
  });

  it('clears lines with NES scoring', () => {
    const g = withPiece('I');
    for (let r = ROWS - 4; r < ROWS; r++) fillRow(g, r, [0]);
    g.rotate(1);
    while (g.move(-1));
    const before = g.score;
    const dropPoints = (g.ghostY() - g.piece.y) * 2;
    const res = g.hardDrop();
    expect(res.rows).toEqual([ROWS - 4, ROWS - 3, ROWS - 2, ROWS - 1]);
    expect(res.points).toBe(1200);
    expect(g.score - before).toBe(1200 + dropPoints);
    expect(g.lines).toBe(4);
    expect(g.board.every((v) => v === 0)).toBe(true);
  });

  it('levels up every 10 lines and speeds up', () => {
    const g = withPiece('I');
    g.lines = 9;
    fillRow(g, ROWS - 1, [3, 4, 5, 6]);
    g.hardDrop();
    expect(g.level).toBe(1);
    expect(gravityMs(1)).toBeLessThan(gravityMs(0));
    expect(gravityMs(40)).toBeCloseTo(1000 / 60);
  });

  it('falls with gravity and locks after the lock delay', () => {
    const g = withPiece('T');
    const y = g.piece.y;
    g.update(gravityMs(0) + 1);
    expect(g.piece.y).toBe(y + 1);
    g.update(100_000);
    expect(g.onGround).toBe(true);
    expect(g.update(LOCK_MS - 1)).toBeNull();
    expect(g.update(2)).not.toBeNull();
  });

  it('ends the game when a piece cannot spawn', () => {
    const g = new Tetris(seeded(2));
    for (let r = HIDDEN; r < ROWS; r++) fillRow(g, r, [r % WIDTH]);
    for (let i = 0; i < 20 && !g.gameOver; i++) g.hardDrop();
    expect(g.gameOver).toBe(true);
  });

  it('round-trips through save/load and rejects bad data', () => {
    const g = new Tetris(seeded(4));
    g.hardDrop();
    g.move(1);
    const copy = new Tetris(seeded(5));
    expect(copy.load(JSON.parse(JSON.stringify(g.save())))).toBe(true);
    expect(copy.save()).toEqual(g.save());
    expect(copy.load({} as never)).toBe(false);
  });
});
