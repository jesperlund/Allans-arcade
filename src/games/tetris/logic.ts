export const WIDTH = 10;
/** Visible rows. Two hidden rows above the board give pieces room to spawn. */
export const HEIGHT = 20;
export const HIDDEN = 2;
export const ROWS = HEIGHT + HIDDEN;
export const LOCK_MS = 500;
/** Moves/rotations on the ground that restart the lock timer, so a piece can't stall forever. */
export const MAX_LOCK_RESETS = 15;
export const LINES_PER_LEVEL = 10;

export type Rng = () => number;
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** Spawn-orientation shapes in their rotation box (SRS). */
const SHAPES: Record<PieceType, string[]> = {
  I: ['....', '####', '....', '....'],
  O: ['##', '##'],
  T: ['.#.', '###', '...'],
  S: ['.##', '##.', '...'],
  Z: ['##.', '.##', '...'],
  J: ['#..', '###', '...'],
  L: ['..#', '###', '...'],
};

/** Index into the shared block palette (red, orange, yellow, green, cyan, blue, purple). */
export const COLOR: Record<PieceType, number> = { Z: 0, L: 1, O: 2, S: 3, I: 4, J: 5, T: 6 };

type Cell = [number, number]; // [row, col]

function rotateCW(cells: Cell[], size: number): Cell[] {
  return cells.map(([r, c]) => [c, size - 1 - r]);
}

/** CELLS[type][rotation] = occupied cells within the rotation box. */
const CELLS = Object.fromEntries(
  TYPES.map((t) => {
    const rows = SHAPES[t];
    const size = rows.length;
    const base: Cell[] = [];
    rows.forEach((line, r) => [...line].forEach((ch, c) => ch === '#' && base.push([r, c])));
    const rots = [base];
    for (let i = 1; i < 4; i++) rots.push(rotateCW(rots[i - 1], size));
    return [t, rots];
  }),
) as Record<PieceType, Cell[][]>;

export function pieceCells(type: PieceType, rotation: number): readonly Cell[] {
  return CELLS[type][rotation];
}

/** SRS wall kicks as [dx, dy] with y pointing down, keyed by "from>to". */
const KICKS_JLSTZ: Record<string, Cell[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const KICKS_I: Record<string, Cell[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

/** NES frames-per-row (at 60 fps) by level. */
const GRAVITY_FRAMES = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3];

export function gravityMs(level: number): number {
  const frames = level < GRAVITY_FRAMES.length ? GRAVITY_FRAMES[level] : level < 29 ? 2 : 1;
  return (frames * 1000) / 60;
}

/** Classic NES line-clear scores, multiplied by (level + 1). */
const LINE_POINTS = [0, 40, 100, 300, 1200];

export interface Piece {
  type: PieceType;
  rotation: number;
  /** Board position of the rotation box's top-left corner. */
  x: number;
  y: number;
}

export interface LockResult {
  /** The piece where it locked. */
  piece: Piece;
  /** Board rows (0 = top hidden row) that were cleared, before collapsing. */
  rows: number[];
  points: number;
  levelUp: boolean;
  gameOver: boolean;
}

export interface SavedTetris {
  board: number[];
  piece: Piece;
  bag: PieceType[];
  score: number;
  lines: number;
  level: number;
}

export class Tetris {
  /** Row-major ROWS×WIDTH. 0 = empty, otherwise color index + 1. */
  board: number[] = [];
  piece!: Piece;
  /** Upcoming pieces; always holds at least one full bag. */
  queue: PieceType[] = [];
  score = 0;
  lines = 0;
  level = 0;
  gameOver = false;
  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;

  constructor(private rng: Rng = Math.random) {
    this.reset();
  }

  reset() {
    this.board = new Array(ROWS * WIDTH).fill(0);
    this.queue = [];
    this.score = 0;
    this.lines = 0;
    this.level = 0;
    this.gameOver = false;
    this.spawn();
  }

  /** 7-bag randomizer: every piece once per bag, in random order. */
  private refill() {
    while (this.queue.length < TYPES.length) {
      const bag = TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.queue.push(...bag);
    }
  }

  next(count: number): PieceType[] {
    return this.queue.slice(0, count);
  }

  private spawn() {
    this.refill();
    const type = this.queue.shift()!;
    this.refill();
    const size = SHAPES[type].length;
    this.piece = { type, rotation: 0, x: Math.floor((WIDTH - size) / 2), y: type === 'I' ? 0 : 1 };
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (!this.fits(this.piece)) this.gameOver = true;
  }

  fits(p: Piece): boolean {
    for (const [r, c] of pieceCells(p.type, p.rotation)) {
      const row = p.y + r;
      const col = p.x + c;
      if (col < 0 || col >= WIDTH || row < 0 || row >= ROWS) return false;
      if (this.board[row * WIDTH + col]) return false;
    }
    return true;
  }

  get onGround(): boolean {
    return !this.fits({ ...this.piece, y: this.piece.y + 1 });
  }

  /** Row the current piece would land on (for the ghost piece). */
  ghostY(): number {
    let y = this.piece.y;
    while (this.fits({ ...this.piece, y: y + 1 })) y++;
    return y;
  }

  private moved() {
    if (this.onGround && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx: number): boolean {
    if (this.gameOver) return false;
    const p = { ...this.piece, x: this.piece.x + dx };
    if (!this.fits(p)) return false;
    this.piece = p;
    this.moved();
    return true;
  }

  /** Rotates 1 = clockwise, -1 = counter-clockwise, trying SRS wall kicks. */
  rotate(dir: 1 | -1): boolean {
    if (this.gameOver || this.piece.type === 'O') return false;
    const from = this.piece.rotation;
    const to = (from + dir + 4) % 4;
    const kicks = (this.piece.type === 'I' ? KICKS_I : KICKS_JLSTZ)[`${from}>${to}`];
    for (const [dx, dy] of kicks) {
      const p = { ...this.piece, rotation: to, x: this.piece.x + dx, y: this.piece.y + dy };
      if (this.fits(p)) {
        this.piece = p;
        this.moved();
        return true;
      }
    }
    return false;
  }

  /** Moves down one row for 1 point. Returns false when the piece is on the ground. */
  softDrop(): boolean {
    if (this.gameOver || this.onGround) return false;
    this.piece = { ...this.piece, y: this.piece.y + 1 };
    this.gravityAcc = 0;
    this.score += 1;
    return true;
  }

  /** Drops to the bottom (2 points per row) and locks immediately. */
  hardDrop(): LockResult {
    const y = this.ghostY();
    this.score += (y - this.piece.y) * 2;
    this.piece = { ...this.piece, y };
    return this.lock();
  }

  /** Advances gravity and the lock timer. Returns a result when the piece locked. */
  update(dt: number): LockResult | null {
    if (this.gameOver) return null;
    if (this.onGround) {
      this.lockTimer += dt;
      return this.lockTimer >= LOCK_MS ? this.lock() : null;
    }
    this.gravityAcc += dt;
    const step = gravityMs(this.level);
    while (this.gravityAcc >= step && !this.onGround) {
      this.gravityAcc -= step;
      this.piece = { ...this.piece, y: this.piece.y + 1 };
    }
    if (this.onGround) this.gravityAcc = 0;
    return null;
  }

  private lock(): LockResult {
    const piece = this.piece;
    const { type, rotation, x, y } = piece;
    for (const [r, c] of pieceCells(type, rotation)) this.board[(y + r) * WIDTH + x + c] = COLOR[type] + 1;
    // Locking entirely inside the hidden rows ends the game.
    const above = pieceCells(type, rotation).every(([r]) => y + r < HIDDEN);

    const rows: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (this.board.slice(r * WIDTH, (r + 1) * WIDTH).every((v) => v)) rows.push(r);
    }
    for (const r of rows) {
      this.board.splice(r * WIDTH, WIDTH);
      this.board.unshift(...new Array(WIDTH).fill(0));
    }
    const points = LINE_POINTS[rows.length] * (this.level + 1);
    this.score += points;
    this.lines += rows.length;
    const level = Math.floor(this.lines / LINES_PER_LEVEL);
    const levelUp = level > this.level;
    this.level = Math.max(this.level, level);

    if (above) this.gameOver = true;
    else this.spawn();
    return { piece, rows, points, levelUp, gameOver: this.gameOver };
  }

  save(): SavedTetris {
    const { board, piece, queue, score, lines, level } = this;
    return { board: board.slice(), piece: { ...piece }, bag: queue.slice(), score, lines, level };
  }

  load(s: SavedTetris): boolean {
    if (!s || !Array.isArray(s.board) || s.board.length !== ROWS * WIDTH) return false;
    if (!s.piece || !TYPES.includes(s.piece.type) || !Array.isArray(s.bag) || !s.bag.every((t) => TYPES.includes(t)))
      return false;
    this.board = s.board.slice();
    this.piece = { ...s.piece };
    this.queue = s.bag.slice();
    this.refill();
    this.score = Number(s.score) || 0;
    this.lines = Number(s.lines) || 0;
    this.level = Number(s.level) || 0;
    this.gameOver = !this.fits(this.piece);
    this.gravityAcc = this.lockTimer = this.lockResets = 0;
    return true;
  }
}
