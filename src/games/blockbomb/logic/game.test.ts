import { describe, expect, it } from 'vitest';
import { canPlace, canPlaceAll, emptyBoard, fullLines, idx, placeAndClear, SIZE } from './board';
import { clearPoints, Game } from './game';
import { SHAPES, shapeById } from './pieces';

const shape = (id: string) => {
  const s = shapeById(id);
  if (!s) throw new Error(`no shape ${id}`);
  return s;
};

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

describe('pieces', () => {
  it('has unique ids and valid bounds', () => {
    const ids = new Set(SHAPES.map((s) => s.id));
    expect(ids.size).toBe(SHAPES.length);
    for (const s of SHAPES) {
      expect(s.rows).toBeLessThanOrEqual(5);
      expect(s.cols).toBeLessThanOrEqual(5);
      expect(s.cells.length).toBeGreaterThan(0);
    }
  });

  it('generates rotations', () => {
    expect(shape('i30').cols).toBe(3);
    expect(shape('i31').rows).toBe(3);
    expect(SHAPES.filter((s) => s.id.startsWith('l3'))).toHaveLength(4);
  });
});

describe('board', () => {
  it('rejects out-of-bounds and overlapping placements', () => {
    const b = emptyBoard();
    expect(canPlace(b, shape('i50'), 0, 3)).toBe(true);
    expect(canPlace(b, shape('i50'), 0, 4)).toBe(false);
    expect(canPlace(b, shape('dot'), -1, 0)).toBe(false);
    const filled = placeAndClear(b, shape('dot'), 2, 2, 0).board;
    expect(canPlace(filled, shape('sq2'), 1, 1)).toBe(false);
  });

  it('clears full rows and columns simultaneously', () => {
    let b = emptyBoard();
    for (let c = 0; c < SIZE; c++) if (c !== 3) b[idx(5, c)] = 1;
    for (let r = 0; r < SIZE; r++) if (r !== 5) b[idx(r, 3)] = 1;
    const res = placeAndClear(b, shape('dot'), 5, 3, 0);
    expect(res.lines).toEqual({ rows: [5], cols: [3] });
    expect(res.cleared).toHaveLength(15);
    expect(res.board.every((v) => v === 0)).toBe(true);
    b = res.board;
    expect(fullLines(b)).toEqual({ rows: [], cols: [] });
  });

  it('detects unsolvable sets', () => {
    const b = emptyBoard().fill(1);
    for (let i = 0; i < SIZE; i++) {
      b[idx(i, i)] = 0;
      b[idx(i, (i + 1) % SIZE)] = 0;
    }
    expect(canPlaceAll(b, [shape('dot'), shape('i20')])).toBe(true);
    expect(canPlaceAll(b, [shape('dot'), shape('sq2')])).toBe(false);
  });
});

describe('game', () => {
  it('scores placements and line clears with combo', () => {
    expect(clearPoints(0, 1)).toBe(0);
    expect(clearPoints(1, 1)).toBe(20);
    expect(clearPoints(2, 1)).toBe(60);
    expect(clearPoints(1, 3)).toBe(60);
  });

  it('places a piece, refills tray after three placements', () => {
    const g = new Game(seeded(1));
    expect(g.tray.every(Boolean)).toBe(true);
    const placed: number[] = [];
    for (let i = 0; i < 3; i++) {
      const p = g.tray[i]!;
      let done = false;
      for (let r = 0; r < SIZE && !done; r++)
        for (let c = 0; c < SIZE && !done; c++)
          if (g.canPlace(i, r, c)) {
            const res = g.place(i, r, c);
            expect(res).not.toBeNull();
            placed.push(p.shape.cells.length);
            done = true;
          }
    }
    expect(g.tray.every(Boolean)).toBe(true);
    expect(g.score).toBeGreaterThanOrEqual(placed.reduce((a, b) => a + b, 0));
  });

  it('awards line clear points and board-clear bonus', () => {
    const g = new Game(seeded(2));
    for (let c = 0; c < SIZE; c++) if (c !== 0) g.board[idx(7, c)] = 1;
    g.tray[0] = { shape: shape('dot'), color: 0 };
    const res = g.place(0, 7, 0)!;
    expect(res.lines.rows).toEqual([7]);
    expect(res.combo).toBe(1);
    expect(res.boardCleared).toBe(true);
    expect(res.points).toBe(1 + 20 + 300);
  });

  it('resets combo after missing the grace window', () => {
    const g = new Game(seeded(3));
    g.combo = 2;
    for (let i = 0; i < 3; i++) {
      g.tray[0] = { shape: shape('dot'), color: 0 };
      g.place(0, 0, i);
    }
    expect(g.combo).toBe(0);
  });

  it('detects game over', () => {
    const g = new Game(seeded(4));
    // Two holes per row/column, never forming a 2x2 gap.
    g.board = emptyBoard().fill(1);
    for (let i = 0; i < SIZE; i++) {
      g.board[idx(i, i)] = 0;
      g.board[idx(i, (i + 1) % SIZE)] = 0;
    }
    g.tray = [
      { shape: shape('dot'), color: 0 },
      { shape: shape('sq2'), color: 1 },
      null,
    ];
    const res = g.place(0, 0, 0)!;
    expect(res.gameOver).toBe(true);
    expect(g.place(1, 0, 0)).toBeNull();
  });

  it('round-trips through save/load', () => {
    const g = new Game(seeded(5));
    g.place(0, 0, 0) ?? g.place(1, 0, 0) ?? g.place(2, 0, 0);
    const copy = new Game(seeded(99));
    expect(copy.load(JSON.parse(JSON.stringify(g.save())))).toBe(true);
    expect(copy.save()).toEqual(g.save());
    expect(copy.load({ board: [], tray: [], score: 0, combo: 0, movesSinceClear: 0 })).toBe(false);
  });

  it('plays many random games without crashing', () => {
    const rng = seeded(42);
    for (let game = 0; game < 20; game++) {
      const g = new Game(rng);
      let moves = 0;
      while (!g.gameOver && moves < 500) {
        const options: [number, number, number][] = [];
        g.tray.forEach((p, i) => {
          if (!p) return;
          for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (g.canPlace(i, r, c)) options.push([i, r, c]);
        });
        expect(options.length).toBeGreaterThan(0);
        const [i, r, c] = options[Math.floor(rng() * options.length)];
        expect(g.place(i, r, c)).not.toBeNull();
        moves++;
      }
      expect(moves).toBeGreaterThan(3);
    }
  });
});
