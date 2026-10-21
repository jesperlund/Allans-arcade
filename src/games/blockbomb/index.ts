import type { GameContext, GameInstance } from '../../arcade/types';
import { Game, type SavedGame } from './logic/game';
import './style.css';
import { GameView } from './view';

const TEMPLATE = `
  <header class="hud">
    <button data-id="restart" class="icon-btn" aria-label="Restart">⟲</button>
    <div class="scores">
      <div class="best"><span class="crown">♛</span> <span data-id="best">0</span></div>
      <div data-id="score" class="score">0</div>
    </div>
    <div class="icon-spacer"></div>
  </header>
  <canvas data-id="game"></canvas>

  <div data-id="overlay" class="overlay hidden" role="dialog" aria-modal="true">
    <div class="panel">
      <h1>No more space!</h1>
      <div class="label">Score</div>
      <div data-id="final-score" class="final-score">0</div>
      <div data-id="new-best" class="new-best hidden">New best!</div>
      <div class="label">Best <span data-id="final-best">0</span></div>
      <button data-id="again" class="primary">Play again</button>
    </div>
  </div>

  <div data-id="confirm" class="overlay hidden" role="dialog" aria-modal="true">
    <div class="panel">
      <h1>Restart?</h1>
      <div class="label">Your current game will be lost.</div>
      <div class="row">
        <button data-id="cancel" class="secondary">Cancel</button>
        <button data-id="confirm-restart" class="primary">Restart</button>
      </div>
    </div>
  </div>
`;

export function mount(root: HTMLElement, { store, sound, haptics }: GameContext): GameInstance {
  root.classList.add('blockbomb');
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`[data-id="${id}"]`) as T;

  const scoreEl = $('score');
  const bestEl = $('best');
  const overlay = $('overlay');
  const confirmEl = $('confirm');
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const game = new Game();
  const saved = store.getJSON<SavedGame>('game');
  if (saved && !game.load(saved)) store.set('game', null);

  let best = store.getNumber('best');
  /** Best score before the current game started, for the "New best!" badge. */
  let bestBefore = best;
  let shownScore = game.score;
  let scoreAnim = 0;

  function renderScore(animate: boolean) {
    cancelAnimationFrame(scoreAnim);
    bestEl.textContent = String(Math.max(best, game.score));
    if (!animate) {
      shownScore = game.score;
      scoreEl.textContent = String(shownScore);
      return;
    }
    const from = shownScore;
    const to = game.score;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 400);
      shownScore = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      scoreEl.textContent = String(shownScore);
      if (t < 1) scoreAnim = requestAnimationFrame(step);
    };
    scoreAnim = requestAnimationFrame(step);
    scoreEl.classList.add('bump');
    later(() => scoreEl.classList.remove('bump'), 150);
  }

  function persist() {
    store.setJSON('game', game.gameOver ? null : game.save());
    if (game.score > best) {
      best = game.score;
      store.set('best', String(best));
    }
  }

  function showGameOver() {
    const isBest = game.score > bestBefore;
    $('final-score').textContent = String(game.score);
    $('final-best').textContent = String(best);
    $('new-best').classList.toggle('hidden', !isBest);
    overlay.classList.remove('hidden');
  }

  function restart() {
    overlay.classList.add('hidden');
    confirmEl.classList.add('hidden');
    game.reset();
    bestBefore = best;
    view.invalidate();
    persist();
    renderScore(false);
  }

  const view = new GameView($<HTMLCanvasElement>('game'), game, {
    onPickUp() {
      sound.unlock();
      sound.pickUp();
      haptics.light();
    },
    onInvalidDrop() {
      sound.invalid();
    },
    onMove(result) {
      const lines = result.lines.rows.length + result.lines.cols.length;
      if (lines > 0) {
        sound.clear(lines, result.combo);
        if (lines >= 2) haptics.heavy();
        else haptics.medium();
      } else {
        sound.place();
        haptics.light();
      }
      persist();
      renderScore(true);
      if (result.gameOver) {
        later(() => {
          sound.gameOver();
          haptics.error();
          showGameOver();
        }, 700);
      }
    },
  });

  $('again').addEventListener('click', restart);
  $('restart').addEventListener('click', () => {
    if (game.score === 0 || game.gameOver) restart();
    else confirmEl.classList.remove('hidden');
  });
  $('cancel').addEventListener('click', () => confirmEl.classList.add('hidden'));
  $('confirm-restart').addEventListener('click', restart);

  renderScore(false);
  if (game.gameOver) showGameOver();

  return {
    save: persist,
    destroy() {
      persist();
      view.destroy();
      cancelAnimationFrame(scoreAnim);
      timers.forEach(clearTimeout);
    },
  };
}
