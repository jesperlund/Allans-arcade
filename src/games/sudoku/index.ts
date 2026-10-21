import type { GameContext, GameInstance } from '../../arcade/types';
import { type SavedSudoku, SudokuGame } from './game';
import { box, CELLS, col, type Difficulty, DIFFICULTIES, row } from './logic';
import './style.css';

export interface SudokuStats {
  solved: number;
  /** Best solve time in ms per difficulty. */
  best: Partial<Record<Difficulty, number>>;
}

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor(s / 60) % 60).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const TEMPLATE = `
  <header class="sudoku-hud">
    <button data-id="new" class="icon-btn" aria-label="New game">＋</button>
    <div class="info">
      <div data-id="difficulty" class="difficulty"></div>
      <div data-id="time" class="time">0:00</div>
    </div>
    <div class="mistakes" aria-label="Mistakes"><span>✕</span> <span data-id="mistakes">0</span></div>
  </header>
  <div class="board-wrap"><div data-id="board" class="board" role="grid"></div></div>
  <div class="tools">
    <button data-id="undo" class="tool"><span class="tool-icon">↶</span>Undo</button>
    <button data-id="erase" class="tool"><span class="tool-icon">⌫</span>Erase</button>
    <button data-id="notes" class="tool"><span class="tool-icon">✎</span>Notes<span class="badge">OFF</span></button>
    <button data-id="hint" class="tool"><span class="tool-icon">💡</span>Hint</button>
  </div>
  <div data-id="pad" class="pad"></div>

  <div data-id="picker" class="overlay hidden" role="dialog" aria-modal="true">
    <div class="panel">
      <h1>New game</h1>
      <div data-id="levels" class="levels"></div>
      <button data-id="cancel" class="secondary">Cancel</button>
    </div>
  </div>

  <div data-id="won" class="overlay hidden" role="dialog" aria-modal="true">
    <div class="panel">
      <h1>Solved!</h1>
      <div data-id="won-level" class="label"></div>
      <div data-id="won-time" class="final-score">0:00</div>
      <div data-id="won-best-badge" class="new-best hidden">New best time!</div>
      <div class="label">Best <span data-id="won-best"></span> · Mistakes <span data-id="won-mistakes"></span></div>
      <button data-id="again" class="primary">New game</button>
    </div>
  </div>
`;

export function mount(root: HTMLElement, { store, sound, haptics }: GameContext): GameInstance {
  root.classList.add('sudoku');
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`[data-id="${id}"]`) as T;
  const boardEl = $('board');
  const padEl = $('pad');
  const picker = $('picker');
  const won = $('won');

  const stats: SudokuStats = { solved: 0, best: {}, ...store.getJSON<SudokuStats>('stats') };
  const game = new SudokuGame();
  const saved = store.getJSON<SavedSudoku>('game');
  const resumed = !!saved && game.load(saved) && !game.solved;
  if (!resumed) game.newGame((store.get('difficulty') as Difficulty) || 'easy');

  let selected: number | null = game.values.findIndex((v) => v === 0);
  let notesMode = false;
  let flash = new Set<number>();
  let flashTimer = 0;
  let wonTimer = 0;

  // ---------------------------------------------------------------- build

  // Cells live inside 3×3 box containers so the box borders can be thicker.
  const boxes = Array.from({ length: 9 }, () => boardEl.appendChild(document.createElement('div')));
  boxes.forEach((el) => (el.className = 'box'));
  const cells = Array.from({ length: CELLS }, (_, i) => {
    const el = document.createElement('button');
    el.className = 'cell';
    el.setAttribute('role', 'gridcell');
    el.addEventListener('click', () => {
      selected = i;
      sound.unlock();
      render();
    });
    boxes[box(i)].appendChild(el);
    return el;
  });

  const padButtons = Array.from({ length: 9 }, (_, k) => {
    const digit = k + 1;
    const el = document.createElement('button');
    el.className = 'pad-btn';
    el.innerHTML = `<span class="digit">${digit}</span><span class="left"></span>`;
    el.addEventListener('click', () => input(digit));
    padEl.appendChild(el);
    return el;
  });

  for (const d of DIFFICULTIES) {
    const el = document.createElement('button');
    el.className = 'secondary level';
    el.textContent = d.name;
    el.addEventListener('click', () => startNew(d.id));
    $('levels').appendChild(el);
  }

  // ---------------------------------------------------------------- timer

  let tickFrom = performance.now();
  let running = false;
  const timer = setInterval(() => {
    tick();
    renderTime();
  }, 500);

  function tick() {
    const now = performance.now();
    if (running) game.elapsed += now - tickFrom;
    tickFrom = now;
  }

  function updateRunning() {
    tick();
    running = !document.hidden && !game.solved && picker.classList.contains('hidden');
  }

  function renderTime() {
    $('time').textContent = formatTime(game.elapsed);
  }

  const onVisibility = () => {
    updateRunning();
    if (document.hidden) persist();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ---------------------------------------------------------------- state

  function persist() {
    tick();
    store.setJSON('game', game.solved ? null : game.save());
  }

  function startNew(difficulty: Difficulty) {
    store.set('difficulty', difficulty);
    game.newGame(difficulty);
    selected = game.values.findIndex((v) => v === 0);
    picker.classList.add('hidden');
    won.classList.add('hidden');
    updateRunning();
    persist();
    render();
  }

  function onSolved() {
    updateRunning();
    const level = DIFFICULTIES.find((d) => d.id === game.difficulty)!;
    const prev = stats.best[game.difficulty];
    const isBest = game.hints === 0 && (prev === undefined || game.elapsed < prev);
    stats.solved++;
    if (isBest) stats.best[game.difficulty] = game.elapsed;
    store.setJSON('stats', stats);
    persist();
    $('won-level').textContent = level.name + (game.hints ? ` · ${game.hints} hint${game.hints > 1 ? 's' : ''}` : '');
    $('won-time').textContent = formatTime(game.elapsed);
    const best = stats.best[game.difficulty];
    $('won-best').textContent = best === undefined ? '–' : formatTime(best);
    $('won-mistakes').textContent = String(game.mistakes);
    $('won-best-badge').classList.toggle('hidden', !isBest);
    wonTimer = window.setTimeout(() => {
      sound.gameOver();
      won.classList.remove('hidden');
    }, 600);
  }

  /** Cells of every row, column and box through `cell` that are now complete. */
  function completedUnits(cell: number) {
    const done = new Set<number>();
    const units = [
      (i: number) => row(i) === row(cell),
      (i: number) => col(i) === col(cell),
      (i: number) => box(i) === box(cell),
    ];
    for (const inUnit of units) {
      const members = [...Array(CELLS).keys()].filter(inUnit);
      if (members.every((i) => game.values[i] === game.solution[i])) members.forEach((i) => done.add(i));
    }
    return done;
  }

  function afterPlace(cell: number, outcome: string) {
    if (outcome === 'mistake') {
      sound.invalid();
      haptics.error();
    } else if (outcome === 'placed' || outcome === 'solved') {
      const done = completedUnits(cell);
      if (done.size) {
        sound.clear(done.size / 9, 1);
        haptics.medium();
        flash = done;
        clearTimeout(flashTimer);
        flashTimer = window.setTimeout(() => {
          flash = new Set();
          render();
        }, 600);
      } else {
        sound.place();
        haptics.light();
      }
    }
    if (outcome === 'solved') onSolved();
    persist();
    render();
  }

  function input(digit: number) {
    sound.unlock();
    if (selected === null || game.solved) return;
    if (notesMode) {
      if (game.values[selected]) return;
      game.toggleNote(selected, digit);
      sound.pickUp();
      persist();
      render();
      return;
    }
    afterPlace(selected, game.setValue(selected, digit));
  }

  // ---------------------------------------------------------------- tools

  $('undo').addEventListener('click', () => {
    const cell = game.undo();
    if (cell !== null) selected = cell;
    persist();
    render();
  });
  $('erase').addEventListener('click', () => {
    if (selected === null) return;
    game.erase(selected);
    persist();
    render();
  });
  $('notes').addEventListener('click', () => {
    notesMode = !notesMode;
    render();
  });
  $('hint').addEventListener('click', () => {
    sound.unlock();
    const cell = game.hint(selected);
    if (cell === null) return;
    selected = cell;
    afterPlace(cell, game.solved ? 'solved' : 'placed');
  });
  $('new').addEventListener('click', () => {
    picker.classList.remove('hidden');
    updateRunning();
  });
  $('cancel').addEventListener('click', () => {
    picker.classList.add('hidden');
    updateRunning();
  });
  $('again').addEventListener('click', () => {
    won.classList.add('hidden');
    picker.classList.remove('hidden');
  });

  const onKey = (e: KeyboardEvent) => {
    if (!picker.classList.contains('hidden') || !won.classList.contains('hidden')) return;
    if (/^[1-9]$/.test(e.key)) input(Number(e.key));
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') $('erase').click();
    else if (e.key === 'n') $('notes').click();
    else if (e.key.startsWith('Arrow')) {
      const cur = selected ?? 40;
      const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key] ?? [0, 0];
      selected = ((row(cur) + dr + 9) % 9) * 9 + ((col(cur) + dc + 9) % 9);
      render();
    } else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- render

  function render() {
    const sel = selected;
    const selValue = sel === null ? 0 : game.values[sel];
    cells.forEach((el, i) => {
      const v = game.values[i];
      const related = sel !== null && i !== sel && (row(i) === row(sel) || col(i) === col(sel) || box(i) === box(sel));
      el.classList.toggle('given', game.isGiven(i));
      el.classList.toggle('wrong', game.isWrong(i));
      el.classList.toggle('selected', i === sel);
      el.classList.toggle('related', related);
      el.classList.toggle('same', !!selValue && v === selValue && i !== sel);
      el.classList.toggle('conflict', !!selValue && related && v === selValue && game.isWrong(sel!));
      el.classList.toggle('flash', flash.has(i));
      if (v) {
        el.textContent = String(v);
      } else if (game.notes[i]) {
        let html = '<span class="notes">';
        for (let d = 1; d <= 9; d++) {
          const on = game.notes[i] & (1 << d);
          html += `<span class="${on && d === selValue ? 'hl' : ''}">${on ? d : ''}</span>`;
        }
        el.innerHTML = html + '</span>';
      } else {
        el.textContent = '';
      }
      el.setAttribute('aria-label', `Row ${row(i) + 1}, column ${col(i) + 1}, ${v || 'empty'}`);
    });
    padButtons.forEach((el, k) => {
      const left = 9 - game.placedCount(k + 1);
      (el.lastElementChild as HTMLElement).textContent = String(left);
      el.classList.toggle('done', left === 0);
    });
    const level = DIFFICULTIES.find((d) => d.id === game.difficulty)!;
    $('difficulty').textContent = level.name;
    $('mistakes').textContent = String(game.mistakes);
    $('notes').classList.toggle('on', notesMode);
    $('notes').querySelector('.badge')!.textContent = notesMode ? 'ON' : 'OFF';
    padEl.classList.toggle('notes-mode', notesMode);
    ($('undo') as HTMLButtonElement).disabled = !game.canUndo;
    renderTime();
  }

  render();
  if (!resumed && !store.get('difficulty')) picker.classList.remove('hidden');
  updateRunning();

  return {
    save: persist,
    destroy() {
      persist();
      clearInterval(timer);
      clearTimeout(flashTimer);
      clearTimeout(wonTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('keydown', onKey);
    },
  };
}
