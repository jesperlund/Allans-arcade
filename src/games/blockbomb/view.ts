import { type Board, fullLines, idx, lineCells, placeShape, SIZE } from './logic/board';
import type { Game, MoveResult } from './logic/game';
import { COLORS, type Piece } from './logic/pieces';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Drag {
  index: number;
  px: number;
  py: number;
  target: { row: number; col: number } | null;
  /** Cells (board indices) that would be cleared by dropping at target. */
  clearPreview: Set<number>;
  start: number;
}

interface Clearing {
  cell: number;
  color: number;
  delay: number;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

const CLEAR_MS = 420;
const POP_MS = 180;
const FLOAT_MS = 1100;
const SNAP_MS = 120;
const EMPTY_CELL = 'rgba(10, 16, 48, 0.55)';
const BOARD_BG = 'rgba(8, 12, 36, 0.6)';

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => {
    const target = amount < 0 ? 0 : 255;
    return Math.round(v + (target - v) * Math.abs(amount));
  };
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export interface ViewCallbacks {
  onMove(result: MoveResult): void;
  onPickUp(): void;
  onInvalidDrop(): void;
}

export class GameView {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private board: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cell = 0;
  private slots: Rect[] = [];
  private trayCell = 0;
  private drag: Drag | null = null;
  private clearing: { items: Clearing[]; start: number } | null = null;
  private pops: { cells: Set<number>; start: number } | null = null;
  private floaters: { items: Floater[]; start: number }[] = [];
  private shake: { start: number; mag: number } | null = null;
  private sprites = new Map<string, HTMLCanvasElement>();
  private dirty = true;
  private raf = 0;
  private resizeObserver: ResizeObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private cb: ViewCallbacks,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMoveEvt);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Stops rendering and releases listeners when leaving the game. */
  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMoveEvt);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
  }

  /** Call after the game state changes outside the view (e.g. restart). */
  invalidate() {
    this.drag = null;
    this.clearing = null;
    this.pops = null;
    this.dirty = true;
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.layout();
    this.sprites.clear();
    this.dirty = true;
  }

  private layout() {
    const pad = 16;
    const gap = 24;
    // The tray holds pieces up to 5 cells wide at ~55% scale.
    const trayRatio = (0.55 * 5) / SIZE;
    const byWidth = Math.min(this.w - pad * 2, 520);
    const byHeight = (this.h - pad * 2 - gap - 24) / (1 + trayRatio);
    const size = Math.max(120, Math.min(byWidth, byHeight));
    this.cell = size / SIZE;
    this.trayCell = Math.min(this.cell * 0.55, (this.w - pad * 2) / 3 / 5.4);
    const trayH = this.trayCell * 5 + 24;
    const total = size + gap + trayH;
    const top = Math.max(pad, (this.h - total) * 0.4);
    this.board = { x: (this.w - size) / 2, y: top, w: size, h: size };
    const slotW = Math.min(this.w - pad * 2, size * 1.1) / 3;
    const trayX = (this.w - slotW * 3) / 2;
    const trayY = top + size + gap;
    this.slots = [0, 1, 2].map((i) => ({ x: trayX + slotW * i, y: trayY, w: slotW, h: trayH }));
  }

  // ---------------------------------------------------------------- input

  private pointerPos(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** How far above the finger a dragged piece floats, so it stays visible. */
  private lift() {
    return this.cell * 1.6;
  }

  private onDown = (e: PointerEvent) => {
    if (this.drag || this.game.gameOver) return;
    const { x, y } = this.pointerPos(e);
    const index = this.slots.findIndex((s) => x >= s.x && x <= s.x + s.w && y >= s.y - 10 && y <= s.y + s.h + 30);
    if (index < 0 || !this.game.tray[index]) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { index, px: x, py: y, target: null, clearPreview: new Set(), start: performance.now() };
    this.updateTarget();
    this.cb.onPickUp();
    this.dirty = true;
  };

  private onMoveEvt = (e: PointerEvent) => {
    if (!this.drag) return;
    const { x, y } = this.pointerPos(e);
    this.drag.px = x;
    this.drag.py = y;
    this.updateTarget();
    this.dirty = true;
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drag) return;
    const { x, y } = this.pointerPos(e);
    this.drag.px = x;
    this.drag.py = y;
    this.updateTarget();
    const { index, target } = this.drag;
    const piece = this.game.tray[index];
    this.drag = null;
    this.dirty = true;
    if (!target || !piece) {
      this.cb.onInvalidDrop();
      return;
    }
    const before = this.game.board.slice();
    const result = this.game.place(index, target.row, target.col);
    if (!result) {
      this.cb.onInvalidDrop();
      return;
    }
    this.startEffects(result, piece, before);
    this.cb.onMove(result);
  };

  private onCancel = () => {
    this.drag = null;
    this.dirty = true;
  };

  /** Top-left pixel of the dragged piece. */
  private dragOrigin(piece: Piece, d: Drag) {
    const t = Math.min(1, (performance.now() - d.start) / SNAP_MS);
    const cell = this.trayCell + (this.cell - this.trayCell) * t;
    const lift = this.lift() * t;
    return {
      cell,
      x: d.px - (piece.shape.cols * cell) / 2,
      y: d.py - lift - piece.shape.rows * cell,
    };
  }

  private updateTarget() {
    const d = this.drag;
    if (!d) return;
    const piece = this.game.tray[d.index];
    if (!piece) return;
    // Use the fully-lifted position so targeting doesn't jump while the
    // pick-up animation plays.
    const x = d.px - (piece.shape.cols * this.cell) / 2;
    const y = d.py - this.lift() - piece.shape.rows * this.cell;
    const col = Math.round((x - this.board.x) / this.cell);
    const row = Math.round((y - this.board.y) / this.cell);
    const prev = d.target;
    d.target = this.game.canPlace(d.index, row, col) ? { row, col } : null;
    if (d.target && (prev?.row !== row || prev?.col !== col || d.clearPreview.size === 0)) {
      const placed = placeShape(this.game.board, piece.shape, row, col, piece.color);
      d.clearPreview = new Set(lineCells(fullLines(placed)));
    } else if (!d.target) {
      d.clearPreview = new Set();
    }
  }

  // -------------------------------------------------------------- effects

  private startEffects(result: MoveResult, piece: Piece, before: Board) {
    const now = performance.now();
    this.pops = { cells: new Set(result.placedCells), start: now };
    if (result.cleared.length) {
      // Cells sweep away outward from the placed piece.
      const [pr, pc] = [Math.floor(result.placedCells[0] / SIZE), result.placedCells[0] % SIZE];
      this.clearing = {
        start: now,
        items: result.cleared.map((cell) => {
          const r = Math.floor(cell / SIZE);
          const c = cell % SIZE;
          const color = result.placedCells.includes(cell) ? piece.color : before[cell] - 1;
          return { cell, color, delay: (Math.abs(r - pr) + Math.abs(c - pc)) * 18 };
        }),
      };
      const lines = result.lines.rows.length + result.lines.cols.length;
      if (lines >= 2) this.shake = { start: now, mag: Math.min(10, 3 + lines * 2) };
    }

    // Floating score text near the placed piece.
    const cells = result.placedCells;
    const cx = cells.reduce((s, i) => s + (i % SIZE), 0) / cells.length;
    const cy = cells.reduce((s, i) => s + Math.floor(i / SIZE), 0) / cells.length;
    const x = this.board.x + (cx + 0.5) * this.cell;
    const y = this.board.y + (cy + 0.5) * this.cell;
    const items: Floater[] = [];
    if (result.cleared.length) {
      items.push({ text: `+${result.points}`, x, y, size: this.cell * 0.7, color: '#ffffff' });
      if (result.combo >= 2)
        items.push({ text: `Combo ×${result.combo}`, x, y: y - this.cell * 0.8, size: this.cell * 0.55, color: '#ffd23f' });
      const lines = result.lines.rows.length + result.lines.cols.length;
      const word = ['', '', 'Great!', 'Excellent!', 'Amazing!', 'Unbelievable!'][Math.min(lines, 5)];
      if (word)
        items.push({
          text: word,
          x: this.board.x + this.board.w / 2,
          y: this.board.y + this.board.h / 2,
          size: this.cell * 0.9,
          color: '#7ef0ff',
        });
    }
    if (result.boardCleared)
      items.push({
        text: 'Board Clear!',
        x: this.board.x + this.board.w / 2,
        y: this.board.y + this.board.h / 2 + this.cell,
        size: this.cell * 0.8,
        color: '#ffd23f',
      });
    if (items.length) this.floaters.push({ items, start: now });
  }

  // ------------------------------------------------------------ rendering

  /** Cached pre-rendered block sprite for a color at a pixel size. */
  private sprite(color: number, size: number): HTMLCanvasElement {
    const px = Math.max(1, Math.round(size * this.dpr));
    const key = `${color}:${px}`;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    const base = COLORS[color];
    const inset = px * 0.04;
    const s = px - inset * 2;
    const r = px * 0.14;
    // Dark rim
    g.fillStyle = shade(base, -0.35);
    roundRect(g, inset, inset, s, s, r);
    g.fill();
    // Main face
    const grad = g.createLinearGradient(0, inset, 0, inset + s);
    grad.addColorStop(0, shade(base, 0.18));
    grad.addColorStop(1, base);
    g.fillStyle = grad;
    roundRect(g, inset + px * 0.07, inset + px * 0.05, s - px * 0.14, s - px * 0.15, r * 0.7);
    g.fill();
    // Gloss
    g.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(g, inset + px * 0.14, inset + px * 0.1, s - px * 0.28, px * 0.12, px * 0.06);
    g.fill();
    this.sprites.set(key, c);
    return c;
  }

  private drawBlock(color: number, x: number, y: number, size: number, alpha = 1) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.sprite(color, size), x, y, size, size);
    ctx.globalAlpha = 1;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const animating =
      this.drag !== null ||
      (this.clearing && now - this.clearing.start < CLEAR_MS + 300) ||
      (this.pops && now - this.pops.start < POP_MS) ||
      this.floaters.length > 0 ||
      (this.shake && now - this.shake.start < 300);
    if (!animating && !this.dirty) return;
    this.dirty = false;
    this.draw(now);
  };

  private draw(now: number) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    ctx.save();
    if (this.shake) {
      const t = (now - this.shake.start) / 300;
      if (t < 1) {
        const m = this.shake.mag * (1 - t);
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      } else this.shake = null;
    }
    this.drawBoard(now);
    ctx.restore();

    this.drawTray();
    this.drawFloaters(now);
    this.drawDragged();
  }

  private drawBoard(now: number) {
    const { ctx, board: b, cell } = this;
    const pad = cell * 0.12;
    ctx.fillStyle = BOARD_BG;
    roundRect(ctx, b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, cell * 0.25);
    ctx.fill();

    const piece = this.drag ? this.game.tray[this.drag.index] : null;
    const target = this.drag?.target;
    const ghost = new Set<number>();
    if (piece && target)
      for (const [r, c] of piece.shape.cells) ghost.add(idx(target.row + r, target.col + c));

    const pop = this.pops && now - this.pops.start < POP_MS ? this.pops : null;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const i = idx(r, c);
        const x = b.x + c * cell;
        const y = b.y + r * cell;
        const v = this.game.board[i];
        ctx.fillStyle = EMPTY_CELL;
        roundRect(ctx, x + cell * 0.04, y + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.12);
        ctx.fill();
        if (v) {
          // Existing blocks in lines about to clear preview in the piece color.
          const color = piece && this.drag!.clearPreview.has(i) ? piece.color : v - 1;
          if (pop?.cells.has(i)) {
            const t = (now - pop.start) / POP_MS;
            const s = cell * (0.85 + 0.15 * easeOutBack(t));
            this.drawBlock(color, x + (cell - s) / 2, y + (cell - s) / 2, s);
          } else {
            this.drawBlock(color, x, y, cell);
          }
        } else if (ghost.has(i) && piece) {
          this.drawBlock(piece.color, x, y, cell, this.drag!.clearPreview.has(i) ? 0.85 : 0.4);
        }
      }
    }

    if (this.clearing) {
      const elapsed = now - this.clearing.start;
      let alive = false;
      for (const it of this.clearing.items) {
        const t = (elapsed - it.delay) / CLEAR_MS;
        if (t >= 1) continue;
        alive = true;
        const x = b.x + (it.cell % SIZE) * cell;
        const y = b.y + Math.floor(it.cell / SIZE) * cell;
        if (t < 0) {
          this.drawBlock(it.color, x, y, cell);
          continue;
        }
        const s = cell * (1 - t * 0.7);
        this.drawBlock(it.color, x + (cell - s) / 2, y + (cell - s) / 2, s, 1 - t);
        // White flash at the start of the clear.
        if (t < 0.4) {
          ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - t / 0.4)})`;
          roundRect(ctx, x + (cell - s) / 2, y + (cell - s) / 2, s, s, s * 0.14);
          ctx.fill();
        }
      }
      if (!alive) this.clearing = null;
    }
  }

  private drawTray() {
    this.game.tray.forEach((piece, i) => {
      if (!piece || this.drag?.index === i) return;
      const slot = this.slots[i];
      const cell = this.trayCell;
      const x = slot.x + (slot.w - piece.shape.cols * cell) / 2;
      const y = slot.y + (slot.h - piece.shape.rows * cell) / 2;
      const alpha = this.game.isPlayable(i) ? 1 : 0.3;
      for (const [r, c] of piece.shape.cells) this.drawBlock(piece.color, x + c * cell, y + r * cell, cell, alpha);
    });
  }

  private drawDragged() {
    const d = this.drag;
    if (!d) return;
    const piece = this.game.tray[d.index];
    if (!piece) return;
    const { cell, x, y } = this.dragOrigin(piece, d);
    for (const [r, c] of piece.shape.cells) this.drawBlock(piece.color, x + c * cell, y + r * cell, cell);
  }

  private drawFloaters(now: number) {
    const { ctx } = this;
    this.floaters = this.floaters.filter((f) => now - f.start < FLOAT_MS);
    for (const group of this.floaters) {
      const t = (now - group.start) / FLOAT_MS;
      const scale = t < 0.15 ? easeOutBack(t / 0.15) : 1;
      const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      for (const f of group.items) {
        ctx.save();
        ctx.font = `900 ${f.size}px system-ui, -apple-system, Roboto, sans-serif`;
        // Keep text fully on screen near the edges.
        const half = ctx.measureText(f.text).width / 2 + f.size * 0.2;
        const x = Math.min(Math.max(f.x, half), this.w - half);
        ctx.globalAlpha = alpha;
        ctx.translate(x, f.y - t * this.cell * 1.2);
        ctx.scale(scale, scale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = f.size * 0.18;
        ctx.strokeStyle = 'rgba(10,16,48,0.85)';
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
    }
  }
}
