import type { GameContext, GameInstance } from '../../arcade/types';
import { BLOCK_COLORS, renderBlock, roundRect } from '../../shared/blocks';
import {
  COLOR,
  HEIGHT,
  HIDDEN,
  type LockResult,
  type PieceType,
  pieceCells,
  type SavedTetris,
  Tetris,
  WIDTH,
} from './logic';
import './style.css';

const CLEAR_MS = 320;
const FLOAT_MS = 1200;
/** Delayed auto shift: hold time before a held move button starts repeating. */
const DAS_MS = 170;
const REPEAT_MS = 50;
const SOFT_DROP_MS = 40;
const NEXT_COUNT = 3;
const SIDE_CELLS = 4.6;

const TEMPLATE = `
  <header class="hud">
    <button data-id="pause" class="icon-btn" aria-label="Pause">❚❚</button>
    <div class="scores">
      <div class="best"><span class="crown">♛</span> <span data-id="best">0</span></div>
      <div data-id="score" class="score">0</div>
    </div>
    <div class="icon-spacer"></div>
  </header>
  <canvas data-id="canvas"></canvas>
  <div class="controls">
    <button class="ctl" data-act="left" aria-label="Move left">◀</button>
    <button class="ctl" data-act="down" aria-label="Soft drop">▼</button>
    <button class="ctl" data-act="right" aria-label="Move right">▶</button>
    <button class="ctl" data-act="drop" aria-label="Hard drop">⤓</button>
    <button class="ctl big" data-act="rotate" aria-label="Rotate">⟳</button>
  </div>

  <div data-id="paused" class="overlay hidden" role="dialog" aria-modal="true">
    <div class="panel">
      <h1>Paused</h1>
      <div class="label">Swipe or use the buttons to move, tap to rotate, flick down to drop.</div>
      <button data-id="resume" class="primary">Resume</button>
      <button data-id="paused-new" class="secondary">New game</button>
    </div>
  </div>

  <div data-id="over" class="overlay hidden" role="dialog" aria-modal="true">
    <div class="panel">
      <h1>Game over</h1>
      <div class="label">Score</div>
      <div data-id="final-score" class="final-score">0</div>
      <div data-id="new-best" class="new-best hidden">New best!</div>
      <div class="label">Level <span data-id="final-level">0</span> · Lines <span data-id="final-lines">0</span></div>
      <div class="label">Best <span data-id="final-best">0</span></div>
      <button data-id="again" class="primary">Play again</button>
    </div>
  </div>
`;

export function mount(root: HTMLElement, { store, sound, haptics }: GameContext): GameInstance {
  root.classList.add('tetris');
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`[data-id="${id}"]`) as T;
  const canvas = $<HTMLCanvasElement>('canvas');
  const ctx = canvas.getContext('2d')!;
  const pausedEl = $('paused');
  const overEl = $('over');

  const game = new Tetris();
  const saved = store.getJSON<SavedTetris>('game');
  const resumed = !!saved && game.load(saved) && !game.gameOver;
  if (!resumed) game.reset();

  let best = store.getNumber('best');
  let bestBefore = best;
  let paused = resumed;
  let clearing: { board: number[]; rows: number[]; start: number } | null = null;
  let floaters: { text: string; color: string; start: number }[] = [];

  // ---------------------------------------------------------------- state

  function persist() {
    store.setJSON('game', game.gameOver ? null : game.save());
    if (game.score > best) {
      best = game.score;
      store.set('best', String(best));
    }
  }

  function renderScore() {
    $('score').textContent = String(game.score);
    $('best').textContent = String(Math.max(best, game.score));
  }

  const playing = () => !paused && !game.gameOver && !clearing;

  function setPaused(p: boolean) {
    if (game.gameOver) return;
    paused = p;
    pausedEl.classList.toggle('hidden', !p);
    if (p) persist();
    stopRepeat();
  }

  function restart() {
    game.reset();
    bestBefore = best;
    clearing = null;
    floaters = [];
    overEl.classList.add('hidden');
    setPaused(false);
    persist();
    renderScore();
  }

  function showGameOver() {
    sound.gameOver();
    haptics.error();
    persist();
    $('final-score').textContent = String(game.score);
    $('final-level').textContent = String(game.level);
    $('final-lines').textContent = String(game.lines);
    $('final-best').textContent = String(best);
    $('new-best').classList.toggle('hidden', !(game.score > bestBefore));
    later(() => overEl.classList.remove('hidden'), 600);
  }

  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  /**
   * Runs an action that may lock the piece. The pre-lock board (with the
   * piece placed) is kept so cleared rows can flash before they collapse.
   */
  function withLock(action: () => LockResult | null) {
    const board = game.board.slice();
    const res = action();
    if (!res) return;
    const { piece } = res;
    for (const [r, c] of pieceCells(piece.type, piece.rotation))
      board[(piece.y + r) * WIDTH + piece.x + c] = COLOR[piece.type] + 1;
    onLock(res, board);
  }

  function onLock(res: LockResult, board: number[]) {
    const n = res.rows.length;
    if (n) {
      clearing = { board, rows: res.rows, start: performance.now() };
      sound.clear(n, Math.max(1, game.level));
      if (n === 4) {
        haptics.heavy();
        floaters.push({ text: 'TETRIS!', color: '#7ef0ff', start: performance.now() });
      } else haptics.medium();
    } else {
      sound.place();
      haptics.light();
    }
    if (res.levelUp) floaters.push({ text: `Level ${game.level}`, color: '#ffd23f', start: performance.now() + 150 });
    persist();
    renderScore();
    if (res.gameOver) showGameOver();
  }

  // ---------------------------------------------------------------- input

  type Action = 'left' | 'right' | 'down' | 'drop' | 'rotate' | 'rotateCCW';

  function act(a: Action) {
    if (!playing()) return;
    sound.unlock();
    switch (a) {
      case 'left':
      case 'right':
        game.move(a === 'left' ? -1 : 1);
        break;
      case 'down':
        if (game.softDrop()) renderScore();
        break;
      case 'drop':
        withLock(() => game.hardDrop());
        break;
      case 'rotate':
      case 'rotateCCW':
        if (game.rotate(a === 'rotate' ? 1 : -1)) sound.pickUp();
        break;
    }
  }

  let repeat: { timer: ReturnType<typeof setTimeout>; pointer: number } | null = null;
  function stopRepeat() {
    if (repeat) clearTimeout(repeat.timer);
    repeat = null;
  }

  root.querySelectorAll<HTMLButtonElement>('.ctl').forEach((btn) => {
    const a = btn.dataset.act as Action;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stopRepeat();
      act(a);
      haptics.light();
      if (a === 'drop' || a === 'rotate') return;
      const interval = a === 'down' ? SOFT_DROP_MS : REPEAT_MS;
      const tick = () => {
        act(a);
        repeat = { timer: setTimeout(tick, interval), pointer: e.pointerId };
      };
      repeat = { timer: setTimeout(tick, a === 'down' ? SOFT_DROP_MS : DAS_MS), pointer: e.pointerId };
      btn.setPointerCapture(e.pointerId);
    });
    const end = (e: PointerEvent) => {
      if (repeat?.pointer === e.pointerId) stopRepeat();
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
  });

  // Gestures on the board: drag to move, drag down to soft drop, tap to rotate, flick down to hard drop.
  let gesture: { id: number; x: number; y: number; ax: number; ay: number; t: number; moved: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    sound.unlock();
    canvas.setPointerCapture(e.pointerId);
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, ax: e.clientX, ay: e.clientY, t: performance.now(), moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.id !== e.pointerId || !playing()) return;
    const step = layout.cell;
    while (e.clientX - gesture.ax >= step) {
      act('right');
      gesture.ax += step;
      gesture.moved = true;
    }
    while (gesture.ax - e.clientX >= step) {
      act('left');
      gesture.ax -= step;
      gesture.moved = true;
    }
    while (e.clientY - gesture.ay >= step) {
      act('down');
      gesture.ay += step;
      gesture.moved = true;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!gesture || gesture.id !== e.pointerId) return;
    const dt = performance.now() - gesture.t;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    const g = gesture;
    gesture = null;
    if (!playing()) return;
    if (dy > layout.cell * 2 && dy / dt > 0.9 && Math.abs(dy) > Math.abs(dx) * 2) act('drop');
    else if (!g.moved && dt < 300 && Math.hypot(dx, dy) < 12) act('rotate');
  });
  canvas.addEventListener('pointercancel', () => (gesture = null));

  const KEYS: Record<string, Action> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowUp: 'rotate',
    x: 'rotate',
    z: 'rotateCCW',
    ' ': 'drop',
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'p' || e.key === 'Escape') {
      setPaused(!paused);
      e.preventDefault();
      return;
    }
    const a = KEYS[e.key];
    if (!a) return;
    e.preventDefault();
    if (e.repeat && (a === 'drop' || a === 'rotate' || a === 'rotateCCW')) return;
    act(a);
  };
  document.addEventListener('keydown', onKey);

  const onVisibility = () => {
    if (document.hidden && playing()) setPaused(true);
  };
  document.addEventListener('visibilitychange', onVisibility);

  $('pause').addEventListener('click', () => setPaused(true));
  $('resume').addEventListener('click', () => setPaused(false));
  $('paused-new').addEventListener('click', restart);
  $('again').addEventListener('click', restart);

  // ------------------------------------------------------------- rendering

  let dpr = 1;
  let w = 0;
  let h = 0;
  const layout = { cell: 20, x: 0, y: 0, sideX: 0 };
  const sprites = new Map<string, HTMLCanvasElement>();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const pad = 8;
    const cell = Math.max(8, Math.floor(Math.min((h - pad * 2) / HEIGHT, (w - pad * 2) / (WIDTH + SIDE_CELLS + 0.6))));
    const total = (WIDTH + SIDE_CELLS + 0.6) * cell;
    layout.cell = cell;
    layout.x = Math.round((w - total) / 2);
    layout.y = Math.round((h - HEIGHT * cell) / 2);
    layout.sideX = layout.x + (WIDTH + 0.6) * cell;
    sprites.clear();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  function block(color: number, x: number, y: number, size: number, alpha = 1) {
    const px = Math.max(1, Math.round(size * dpr));
    const key = `${color}:${px}`;
    let s = sprites.get(key);
    if (!s) sprites.set(key, (s = renderBlock(BLOCK_COLORS[color], px)));
    ctx.globalAlpha = alpha;
    ctx.drawImage(s, x, y, size, size);
    ctx.globalAlpha = 1;
  }

  function drawPreview(type: PieceType, cx: number, cy: number, size: number) {
    const cells = pieceCells(type, 0);
    const rows = cells.map(([r]) => r);
    const cols = cells.map(([, c]) => c);
    const pw = (Math.max(...cols) - Math.min(...cols) + 1) * size;
    const ph = (Math.max(...rows) - Math.min(...rows) + 1) * size;
    for (const [r, c] of cells) {
      block(
        COLOR[type],
        cx - pw / 2 + (c - Math.min(...cols)) * size,
        cy - ph / 2 + (r - Math.min(...rows)) * size,
        size,
      );
    }
  }

  function draw(now: number) {
    const { cell, x: bx, y: by, sideX } = layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Board background and grid.
    const pad = cell * 0.15;
    ctx.fillStyle = 'rgba(8, 12, 36, 0.6)';
    roundRect(ctx, bx - pad, by - pad, WIDTH * cell + pad * 2, HEIGHT * cell + pad * 2, cell * 0.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(10, 16, 48, 0.55)';
    for (let r = 0; r < HEIGHT; r++)
      for (let c = 0; c < WIDTH; c++) {
        roundRect(ctx, bx + c * cell + 1, by + r * cell + 1, cell - 2, cell - 2, cell * 0.12);
        ctx.fill();
      }

    const board = clearing ? clearing.board : game.board;
    for (let r = HIDDEN; r < HEIGHT + HIDDEN; r++)
      for (let c = 0; c < WIDTH; c++) {
        const v = board[r * WIDTH + c];
        if (v) block(v - 1, bx + c * cell, by + (r - HIDDEN) * cell, cell);
      }

    if (clearing) {
      const t = (now - clearing.start) / CLEAR_MS;
      if (t >= 1) clearing = null;
      else
        for (const r of clearing.rows) {
          if (r < HIDDEN) continue;
          ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - t)})`;
          const shrink = (WIDTH * cell * t) / 2;
          roundRect(ctx, bx + shrink, by + (r - HIDDEN) * cell, WIDTH * cell - shrink * 2, cell, cell * 0.2);
          ctx.fill();
        }
    }

    if (!clearing && !game.gameOver) {
      const p = game.piece;
      const ghost = game.ghostY();
      for (const [r, c] of pieceCells(p.type, p.rotation)) {
        if (ghost + r >= HIDDEN) block(COLOR[p.type], bx + (p.x + c) * cell, by + (ghost + r - HIDDEN) * cell, cell, 0.22);
      }
      for (const [r, c] of pieceCells(p.type, p.rotation)) {
        if (p.y + r >= HIDDEN) block(COLOR[p.type], bx + (p.x + c) * cell, by + (p.y + r - HIDDEN) * cell, cell);
      }
    }

    // Side panel: next pieces, level, lines.
    const sw = SIDE_CELLS * cell;
    const label = (text: string, y: number) => {
      ctx.fillStyle = '#b8c4ff';
      ctx.font = `700 ${Math.round(cell * 0.5)}px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(text, sideX + sw / 2, y);
    };
    const value = (text: string, y: number) => {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(cell * 0.9)}px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(text, sideX + sw / 2, y);
    };
    ctx.fillStyle = 'rgba(8, 12, 36, 0.45)';
    roundRect(ctx, sideX, by - pad, sw, cell * 9.6, cell * 0.3);
    ctx.fill();
    label('NEXT', by + cell * 0.3);
    game.next(NEXT_COUNT).forEach((type, i) => {
      const size = i === 0 ? cell * 0.8 : cell * 0.6;
      const cy = i === 0 ? by + cell * 2.6 : by + cell * (4.9 + (i - 1) * 2.1);
      drawPreview(type, sideX + sw / 2, cy, size);
    });
    roundRect(ctx, sideX, by + cell * 10.2, sw, cell * 4.6, cell * 0.3);
    ctx.fillStyle = 'rgba(8, 12, 36, 0.45)';
    ctx.fill();
    label('LEVEL', by + cell * 10.6);
    value(String(game.level), by + cell * 11.3);
    label('LINES', by + cell * 12.8);
    value(String(game.lines), by + cell * 13.5);

    // Floating texts over the board.
    floaters = floaters.filter((f) => now - f.start < FLOAT_MS);
    for (const [i, f] of floaters.entries()) {
      const t = Math.max(0, (now - f.start) / FLOAT_MS);
      ctx.save();
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.font = `900 ${cell * 1.2}px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = cell * 0.22;
      ctx.strokeStyle = 'rgba(10,16,48,0.85)';
      const fx = bx + (WIDTH * cell) / 2;
      const fy = by + HEIGHT * cell * 0.4 + i * cell * 1.5 - t * cell * 1.5;
      ctx.strokeText(f.text, fx, fy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ loop

  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(now - last, 100);
    last = now;
    if (playing()) withLock(() => game.update(dt));
    draw(now);
  };
  raf = requestAnimationFrame(frame);

  renderScore();
  pausedEl.classList.toggle('hidden', !paused);

  return {
    save: persist,
    destroy() {
      persist();
      cancelAnimationFrame(raf);
      stopRepeat();
      timers.forEach(clearTimeout);
      resizeObserver.disconnect();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
