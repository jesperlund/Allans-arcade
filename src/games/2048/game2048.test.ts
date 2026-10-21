import { describe, expect, it } from 'vitest';
import { type Direction, Game2048, SIZE } from './logic';

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

/** Builds a game from rows of values (0 = empty). */
function fromRows(rows: number[][]) {
  const g = new Game2048(seeded(1));
  g.load({
    tiles: rows.flatMap((r, row) => r.flatMap((value, col) => (value ? [{ value, row, col }] : []))),
    score: 0,
    won: false,
    keepPlaying: false,
  });
  return g;
}

function toRows(g: Game2048) {
  return Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => g.tileAt(r, c)?.value ?? 0));
}

/** Moves and removes the spawned tile, so the result is deterministic. */
function slide(g: Game2048, dir: Direction) {
  const res = g.move(dir);
  if (res.spawned) g.tiles = g.tiles.filter((t) => t !== res.spawned);
  return res;
}

describe('Game2048', () => {
  it('starts with two tiles', () => {
    const g = new Game2048(seeded(3));
    expect(g.tiles).toHaveLength(2);
    expect(g.tiles.every((t) => t.value === 2 || t.value === 4)).toBe(true);
  });

  it('slides and merges each pair once', () => {
    const g = fromRows([
      [2, 2, 2, 2],
      [2, 2, 4, 0],
      [4, 0, 4, 8],
      [0, 0, 0, 2],
    ]);
    const res = slide(g, 'left');
    expect(toRows(g)).toEqual([
      [4, 4, 0, 0],
      [4, 4, 0, 0],
      [8, 8, 0, 0],
      [2, 0, 0, 0],
    ]);
    expect(res.points).toBe(4 + 4 + 4 + 8);
    expect(g.score).toBe(20);
    expect(res.merged).toHaveLength(4);
    expect(res.consumed).toHaveLength(8);
  });

  it('merges towards the move direction first', () => {
    const g = fromRows([
      [2, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    slide(g, 'right');
    expect(toRows(g)[0]).toEqual([0, 0, 2, 4]);
  });

  it('moves vertically', () => {
    const g = fromRows([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [4, 0, 0, 0],
      [4, 0, 0, 0],
    ]);
    slide(g, 'down');
    expect(toRows(g).map((r) => r[0])).toEqual([0, 0, 4, 8]);
    slide(g, 'up');
    expect(toRows(g).map((r) => r[0])).toEqual([4, 8, 0, 0]);
  });

  it('does nothing and spawns nothing when no tile can move', () => {
    const g = fromRows([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const res = g.move('left');
    expect(res.moved).toBe(false);
    expect(res.spawned).toBeNull();
    expect(g.tiles).toHaveLength(2);
  });

  it('spawns a tile after a move', () => {
    const g = fromRows([
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const res = g.move('left');
    expect(res.spawned).not.toBeNull();
    expect(g.tiles).toHaveLength(2);
  });

  it('detects game over and win', () => {
    const full = fromRows([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(full.gameOver).toBe(true);
    const almost = fromRows([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(almost.gameOver).toBe(false);
    slide(almost, 'left');
    expect(almost.won).toBe(true);
    expect(almost.maxTile).toBe(2048);
  });

  it('round-trips through save/load and rejects bad data', () => {
    const g = new Game2048(seeded(5));
    for (const d of ['left', 'up', 'right', 'down'] as const) g.move(d);
    const copy = new Game2048(seeded(6));
    expect(copy.load(JSON.parse(JSON.stringify(g.save())))).toBe(true);
    expect(copy.save()).toEqual(g.save());
    expect(copy.load({ tiles: [{ value: 2, row: 9, col: 0 }], score: 0, won: false, keepPlaying: false })).toBe(false);
    expect(copy.load({} as never)).toBe(false);
  });
});
