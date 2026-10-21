export const SIZE = 4;
export const WIN_VALUE = 2048;

export type Rng = () => number;
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Tile {
  /** Stable id so the view can animate a tile as it slides. */
  id: number;
  value: number;
  row: number;
  col: number;
}

export interface MoveResult {
  moved: boolean;
  points: number;
  /** Tiles that slid into another tile and disappeared, at the cell they merged into. */
  consumed: Tile[];
  /** Ids of tiles created by a merge this move. */
  merged: number[];
  /** The tile spawned after the move. */
  spawned: Tile | null;
}

export interface Saved2048 {
  tiles: { value: number; row: number; col: number }[];
  score: number;
  won: boolean;
  keepPlaying: boolean;
}

const VECTORS: Record<Direction, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

export class Game2048 {
  tiles: Tile[] = [];
  score = 0;
  /** Reached 2048 at least once this game. */
  won = false;
  /** The player chose to continue after winning. */
  keepPlaying = false;
  private nextId = 1;

  constructor(private rng: Rng = Math.random) {
    this.reset();
  }

  reset() {
    this.tiles = [];
    this.score = 0;
    this.won = false;
    this.keepPlaying = false;
    this.spawn();
    this.spawn();
  }

  tileAt(row: number, col: number): Tile | undefined {
    return this.tiles.find((t) => t.row === row && t.col === col);
  }

  /** Adds a 2 (90%) or 4 (10%) on a random empty cell. */
  spawn(): Tile | null {
    const empty: [number, number][] = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!this.tileAt(r, c)) empty.push([r, c]);
    if (!empty.length) return null;
    const [row, col] = empty[Math.floor(this.rng() * empty.length)];
    const tile = { id: this.nextId++, value: this.rng() < 0.9 ? 2 : 4, row, col };
    this.tiles.push(tile);
    return tile;
  }

  move(dir: Direction): MoveResult {
    const [dr, dc] = VECTORS[dir];
    const result: MoveResult = { moved: false, points: 0, consumed: [], merged: [], spawned: null };
    const grid: (Tile | null)[][] = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
    for (const t of this.tiles) grid[t.row][t.col] = t;
    /** Tiles created by a merge this move can't merge again. */
    const fresh = new Set<Tile>();
    // Walk from the edge the tiles move towards, so each tile slides as far as it can.
    const order = [...Array(SIZE).keys()];
    const rows = dr > 0 ? order.slice().reverse() : order;
    const cols = dc > 0 ? order.slice().reverse() : order;

    for (const r of rows) {
      for (const c of cols) {
        const tile = grid[r][c];
        if (!tile) continue;
        let [nr, nc] = [r, c];
        while (true) {
          const [tr, tc] = [nr + dr, nc + dc];
          if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE || grid[tr][tc]) break;
          [nr, nc] = [tr, tc];
        }
        const [br, bc] = [nr + dr, nc + dc];
        const blocker = br >= 0 && br < SIZE && bc >= 0 && bc < SIZE ? grid[br][bc] : null;
        grid[r][c] = null;
        if (blocker && blocker.value === tile.value && !fresh.has(blocker)) {
          const merged: Tile = { id: this.nextId++, value: tile.value * 2, row: br, col: bc };
          grid[br][bc] = merged;
          fresh.add(merged);
          result.consumed.push({ ...tile, row: br, col: bc }, { ...blocker });
          result.merged.push(merged.id);
          result.points += merged.value;
          if (merged.value >= WIN_VALUE) this.won = true;
          result.moved = true;
        } else {
          grid[nr][nc] = tile;
          if (nr !== r || nc !== c) result.moved = true;
          tile.row = nr;
          tile.col = nc;
        }
      }
    }

    if (!result.moved) return result;
    this.tiles = grid.flat().filter((t): t is Tile => t !== null);
    this.score += result.points;
    result.spawned = this.spawn();
    return result;
  }

  get canMove(): boolean {
    if (this.tiles.length < SIZE * SIZE) return true;
    return this.tiles.some((t) => {
      const right = this.tileAt(t.row, t.col + 1);
      const down = this.tileAt(t.row + 1, t.col);
      return right?.value === t.value || down?.value === t.value;
    });
  }

  get gameOver(): boolean {
    return !this.canMove;
  }

  get maxTile(): number {
    return Math.max(0, ...this.tiles.map((t) => t.value));
  }

  save(): Saved2048 {
    return {
      tiles: this.tiles.map(({ value, row, col }) => ({ value, row, col })),
      score: this.score,
      won: this.won,
      keepPlaying: this.keepPlaying,
    };
  }

  load(s: Saved2048): boolean {
    const inRange = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < SIZE;
    if (!s || !Array.isArray(s.tiles) || !s.tiles.length) return false;
    const seen = new Set<number>();
    for (const t of s.tiles) {
      if (!inRange(t.row) || !inRange(t.col) || !Number.isInteger(t.value) || t.value < 2) return false;
      if (seen.has(t.row * SIZE + t.col)) return false;
      seen.add(t.row * SIZE + t.col);
    }
    this.tiles = s.tiles.map((t) => ({ id: this.nextId++, value: t.value, row: t.row, col: t.col }));
    this.score = Number(s.score) || 0;
    this.won = !!s.won;
    this.keepPlaying = !!s.keepPlaying;
    return true;
  }
}
