import type { GameContext, GameInstance } from '../../arcade/types';
import { type Direction, Game2048, type Saved2048, SIZE, type Tile, WIN_VALUE } from './logic';
import './style.css';

/** Slide duration; keep in sync with the transition in style.css. */
const SLIDE_MS = 110;
const SWIPE_MIN_PX = 24;

const TEMPLATE = `
  <header class="hud">
    <button data-id="restart" class="icon-btn" aria-label="New game">⟲</button>
    <div class="scores">
      <div class="score-box"><div class="score-label">Score</div><div data-id="score" class="score-value">0</div></div>
      <div class="score-box"><div class="score-label">Best</div><div data-id="best" class="score-value">0</div></div>
    </div>
    <button data-id="undo" class="icon-btn" aria-label="Undo">↶</button>
  </header>
  <div class="board-wrap">
    <div data-id="board" class="board">
      ${'<div class="slot"></div>'.repeat(SIZE * SIZE)}
      <div data-id="tiles" class="tiles"></div>
    </div>
  </div>
  <p class="hint">Swipe to move the tiles. Equal tiles merge!</p>

  <div data-id="over" class="overlay hidden" role="dialog" aria-modal="true">
    <div class="panel">
      <h1>No more moves!</h1>
      <div class="label">Score</div>
      <div data-id="final-score" class="final-score">0</div>
      <div data-id="new-best" class="new-best hidden">New best!</div>
      <div class="label">Best <span data-id="final-best">0</span></div>
      <button data-id="again" class="primary">Play again</button>
    </div>
  </div>

  <div data-id="won" class="overlay hidden" role="dialog" aria-modal="true">
    <div class="panel">
      <h1>You made ${WIN_VALUE}!</h1>
      <div class="label">Keep going for a higher score?</div>
      <div class="row">
        <button data-id="won-new" class="secondary">New game</button>
        <button data-id="keep" class="primary">Keep going</button>
      </div>
    </div>
  </div>

  <div data-id="confirm" class="overlay hidden" role="dialog" aria-modal="true">
    <div class="panel">
      <h1>New game?</h1>
      <div class="label">Your current game will be lost.</div>
      <div class="row">
        <button data-id="cancel" class="secondary">Cancel</button>
        <button data-id="confirm-restart" class="primary">New game</button>
      </div>
    </div>
  </div>
`;

export function mount(root: HTMLElement, { store, sound, haptics }: GameContext): GameInstance {
  root.classList.add('g2048');
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`[data-id="${id}"]`) as T;
  const boardEl = $('board');
  const tilesEl = $('tiles');
  const overEl = $('over');
  const wonEl = $('won');
  const confirmEl = $('confirm');
  const undoBtn = $<HTMLButtonElement>('undo');
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const game = new Game2048();
  const saved = store.getJSON<Saved2048>('game');
  if (saved && !game.load(saved)) store.set('game', null);

  let best = store.getNumber('best');
  /** Best score before the current game started, for the "New best!" badge. */
  let bestBefore = best;
  /** One step of undo, kept in memory only. */
  let previous: Saved2048 | null = null;
  const elements = new Map<number, HTMLElement>();

  // ---------------------------------------------------------------- render

  function place(el: HTMLElement, t: Tile) {
    el.style.setProperty('--r', String(t.row));
    el.style.setProperty('--c', String(t.col));
  }

  function createTile(t: Tile, cls?: string) {
    const el = document.createElement('div');
    el.className = `tile v${Math.min(t.value, 8192)}${cls ? ` ${cls}` : ''}`;
    el.textContent = String(t.value);
    if (t.value >= 1024) el.classList.add(t.value >= 16384 ? 'digits-5' : 'digits-4');
    place(el, t);
    tilesEl.appendChild(el);
    elements.set(t.id, el);
    return el;
  }

  /** Rebuilds every tile without animation (start, load, undo). */
  function renderAll() {
    tilesEl.innerHTML = '';
    elements.clear();
    for (const t of game.tiles) createTile(t);
  }

  function renderScore() {
    $('score').textContent = String(game.score);
    $('best').textContent = String(Math.max(best, game.score));
    undoBtn.disabled = previous === null;
  }

  function persist() {
    store.setJSON('game', game.gameOver ? null : game.save());
    if (game.score > best) {
      best = game.score;
      store.set('best', String(best));
    }
  }

  // ----------------------------------------------------------------- moves

  const overlayOpen = () =>
    [overEl, wonEl, confirmEl].some((el) => !el.classList.contains('hidden'));

  function move(dir: Direction) {
    if (overlayOpen() || game.gameOver) return;
    sound.unlock();
    const before = game.save();
    const wasWon = game.won;
    const res = game.move(dir);
    if (!res.moved) return;
    previous = before;

    // Slide surviving tiles and the ones about to be merged away.
    for (const t of game.tiles) {
      const el = elements.get(t.id);
      if (el) place(el, t);
    }
    for (const t of res.consumed) {
      const el = elements.get(t.id);
      if (!el) continue;
      elements.delete(t.id);
      place(el, t);
      later(() => el.remove(), SLIDE_MS);
    }
    // Merged and spawned tiles appear once the slide has finished.
    for (const t of game.tiles) {
      if (elements.has(t.id)) continue;
      const el = createTile(t, res.merged.includes(t.id) ? 'merged' : 'new');
      el.style.visibility = 'hidden';
      later(() => (el.style.visibility = ''), SLIDE_MS);
    }

    if (res.merged.length) {
      sound.clear(Math.min(res.merged.length, 4), Math.max(1, Math.log2(game.maxTile) - 5));
      haptics.medium();
    } else {
      sound.place();
      haptics.light();
    }
    persist();
    renderScore();
    if (res.points) {
      const plus = document.createElement('div');
      plus.className = 'plus';
      plus.textContent = `+${res.points}`;
      $('score').parentElement!.appendChild(plus);
      later(() => plus.remove(), 700);
    }

    if (game.won && !wasWon && !game.keepPlaying) {
      later(() => {
        sound.gameOver();
        wonEl.classList.remove('hidden');
      }, 400);
    } else if (game.gameOver) {
      later(showGameOver, 500);
    }
  }

  function showGameOver() {
    sound.gameOver();
    haptics.error();
    $('final-score').textContent = String(game.score);
    $('final-best').textContent = String(best);
    $('new-best').classList.toggle('hidden', !(game.score > bestBefore));
    overEl.classList.remove('hidden');
  }

  function restart() {
    [overEl, wonEl, confirmEl].forEach((el) => el.classList.add('hidden'));
    game.reset();
    bestBefore = best;
    previous = null;
    persist();
    renderAll();
    renderScore();
  }

  function undo() {
    if (!previous || overlayOpen()) return;
    game.load(previous);
    previous = null;
    persist();
    renderAll();
    renderScore();
  }

  // ----------------------------------------------------------------- input

  let start: { x: number; y: number; id: number } | null = null;
  boardEl.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    boardEl.setPointerCapture(e.pointerId);
  });
  boardEl.addEventListener('pointerup', (e) => {
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  });
  boardEl.addEventListener('pointercancel', () => (start = null));

  const KEYS: Record<string, Direction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  };
  const onKey = (e: KeyboardEvent) => {
    const dir = KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  };
  document.addEventListener('keydown', onKey);

  $('restart').addEventListener('click', () => {
    if (game.score === 0 || game.gameOver) restart();
    else confirmEl.classList.remove('hidden');
  });
  $('cancel').addEventListener('click', () => confirmEl.classList.add('hidden'));
  $('confirm-restart').addEventListener('click', restart);
  $('again').addEventListener('click', restart);
  $('won-new').addEventListener('click', restart);
  $('keep').addEventListener('click', () => {
    game.keepPlaying = true;
    wonEl.classList.add('hidden');
    persist();
  });
  undoBtn.addEventListener('click', undo);

  renderAll();
  renderScore();
  if (game.gameOver) showGameOver();
  else if (game.won && !game.keepPlaying) wonEl.classList.remove('hidden');

  return {
    save: persist,
    destroy() {
      persist();
      timers.forEach(clearTimeout);
      document.removeEventListener('keydown', onKey);
    },
  };
}
