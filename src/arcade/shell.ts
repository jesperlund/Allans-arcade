import { haptics, sound } from '../shared/feedback';
import { createStore } from '../shared/storage';
import { GAMES } from './registry';
import type { GameDefinition, GameInstance } from './types';

const settings = createStore('arcade');

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The arcade app: a library screen listing every game and a game screen
 * hosting one game at a time. The current screen lives in the URL hash
 * (`#/sudoku`) so browser/Android back returns to the library.
 */
export class Arcade {
  private title: HTMLElement;
  private backBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  private content: HTMLElement;
  private current: { game: GameDefinition; instance: GameInstance | null } | null = null;
  /** Bumped on every navigation so a slow game load can't mount over a newer screen. */
  private navId = 0;

  constructor(app: HTMLElement) {
    app.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-id="back" aria-label="Back to library">‹</button>
        <h1 data-id="title"></h1>
        <button class="icon-btn" data-id="sound" aria-label="Toggle sound">♪</button>
      </header>
      <main data-id="content" class="game-root"></main>
    `;
    const $ = <T extends HTMLElement>(id: string) => app.querySelector(`[data-id="${id}"]`) as T;
    this.title = $('title');
    this.backBtn = $('back');
    this.soundBtn = $('sound');
    this.content = $('content');

    this.backBtn.addEventListener('click', () => this.back());
    sound.enabled = settings.get('sound') !== 'off';
    this.renderSound();
    this.soundBtn.addEventListener('click', () => {
      sound.enabled = !sound.enabled;
      sound.unlock();
      settings.set('sound', sound.enabled ? 'on' : 'off');
      this.renderSound();
    });

    window.addEventListener('hashchange', () => this.route());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.current?.instance?.save?.();
    });
    this.route();
  }

  /** True when a game is open. */
  get inGame() {
    return this.current !== null;
  }

  /** Leaves the current game, back to the library. */
  back() {
    if (!this.inGame) return;
    // Pop the history entry if we pushed one, otherwise just replace the hash.
    if (history.state?.arcade) history.back();
    else location.replace('#/');
  }

  private open(id: string) {
    history.pushState({ arcade: true }, '', `#/${id}`);
    this.route();
  }

  private route() {
    const id = location.hash.replace(/^#\/?/, '');
    const game = GAMES.find((g) => g.id === id);
    if (game && game === this.current?.game) return;
    this.close();
    if (game) void this.showGame(game);
    else this.showLibrary();
  }

  private close() {
    this.navId++;
    if (this.current) {
      this.current.instance?.destroy();
      this.current = null;
    }
    this.content.className = 'game-root';
    this.content.innerHTML = '';
  }

  private renderSound() {
    this.soundBtn.classList.toggle('off', !sound.enabled);
    this.soundBtn.setAttribute('aria-pressed', String(sound.enabled));
  }

  private showLibrary() {
    this.title.textContent = "Allan's Arcade";
    this.backBtn.classList.add('hidden');
    document.title = "Allan's Arcade";
    const cards = GAMES.map((g) => {
      const stat = g.stat?.(createStore(g.id));
      return `
        <button class="card" data-game="${g.id}" style="background: linear-gradient(160deg, ${g.colors[0]}, ${g.colors[1]})">
          ${g.icon}
          <span class="name">${escape(g.name)}</span>
          <span class="tagline">${escape(g.tagline)}</span>
          ${stat ? `<span class="stat">${escape(stat)}</span>` : ''}
        </button>`;
    }).join('');
    this.content.innerHTML = `
      <div class="library">
        <p class="subtitle">${GAMES.length} games · more coming soon</p>
        <div class="cards">${cards}<div class="card soon">More games<br>coming soon</div></div>
      </div>`;
    this.content.querySelectorAll<HTMLElement>('[data-game]').forEach((el) =>
      el.addEventListener('click', () => {
        sound.unlock();
        haptics.light();
        this.open(el.dataset.game!);
      }),
    );
  }

  private async showGame(game: GameDefinition) {
    const nav = this.navId;
    this.current = { game, instance: null };
    this.title.textContent = game.name;
    this.backBtn.classList.remove('hidden');
    document.title = `${game.name} · Allan's Arcade`;
    this.content.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const module = await game.load();
      if (nav !== this.navId) return;
      this.content.innerHTML = '';
      this.current.instance = module.mount(this.content, { store: createStore(game.id), sound, haptics });
    } catch (err) {
      if (nav !== this.navId) return;
      console.error(err);
      this.content.innerHTML = '<div class="loading">Could not load this game.</div>';
    }
  }
}
