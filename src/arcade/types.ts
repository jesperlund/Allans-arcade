import type { haptics, sound } from '../shared/feedback';
import type { Store } from '../shared/storage';

/** Services the arcade hands to every game. */
export interface GameContext {
  /** Storage namespaced to this game (keys are prefixed with the game id). */
  store: Store;
  sound: typeof sound;
  haptics: typeof haptics;
}

/** A running game. Returned by `GameModule.mount`. */
export interface GameInstance {
  /** Save state now – called when the app goes to the background. */
  save?(): void;
  /** Tear down timers, listeners and animation loops. The root element is emptied by the arcade. */
  destroy(): void;
}

/** What a game's lazily loaded module exports. */
export interface GameModule {
  mount(root: HTMLElement, ctx: GameContext): GameInstance;
}

/** An entry in the arcade library. See README.md → "Adding a game". */
export interface GameDefinition {
  /** Unique, stable id. Used in the URL and as the storage namespace – never change it after release. */
  id: string;
  name: string;
  /** One short line shown on the library card. */
  tagline: string;
  /** Inline SVG markup for the card icon (viewBox 0 0 64 64 works well). */
  icon: string;
  /** Card gradient colors [top, bottom]. */
  colors: [string, string];
  /** Optional line under the tagline, e.g. "Best 1 234". */
  stat?(store: Store): string | null;
  /** Lazily load the game code, so the library starts fast however many games it holds. */
  load(): Promise<GameModule>;
}
