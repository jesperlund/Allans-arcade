import type { GameDefinition } from './types';

/**
 * The arcade library. To add a game, create `src/games/<id>/index.ts`
 * exporting `mount` (see `GameModule` in ./types) and add an entry here.
 */
export const GAMES: GameDefinition[] = [
  {
    id: 'blockbomb',
    name: 'BlockBomb',
    tagline: 'Fit the blocks, blast the lines',
    colors: ['#ff8a3d', '#e2453c'],
    icon: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <g stroke="rgba(0,0,0,.25)" stroke-width="2">
        <rect x="6" y="6" width="24" height="24" rx="5" fill="#ffd23f"/>
        <rect x="34" y="6" width="24" height="24" rx="5" fill="#3ccf6e"/>
        <rect x="6" y="34" width="24" height="24" rx="5" fill="#3d7bff"/>
        <rect x="34" y="34" width="24" height="24" rx="5" fill="#a259ff"/>
      </g>
    </svg>`,
    stat: (store) => {
      const best = store.getNumber('best');
      return best ? `Best ${best.toLocaleString()}` : null;
    },
    load: () => import('../games/blockbomb'),
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    tagline: 'The classic 9×9 number puzzle',
    colors: ['#4f8cff', '#3b4fd8'],
    icon: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="8" fill="#fff"/>
      <path d="M22.7 4v56M41.3 4v56M4 22.7h56M4 41.3h56" stroke="#1d2a5e" stroke-width="2.5"/>
      <g font-family="system-ui,sans-serif" font-weight="800" font-size="14" text-anchor="middle" fill="#1d2a5e">
        <text x="13.4" y="18.5">5</text><text x="50.6" y="18.5">3</text>
        <text x="32" y="37">7</text><text x="13.4" y="55.5" fill="#3d6bff">9</text><text x="50.6" y="55.5">1</text>
      </g>
    </svg>`,
    stat: (store) => {
      const solved = store.getJSON<{ solved?: number }>('stats')?.solved;
      return solved ? `Solved ${solved}` : null;
    },
    load: () => import('../games/sudoku'),
  },
  {
    id: '2048',
    name: '2048',
    tagline: 'Slide and merge to reach 2048',
    colors: ['#ffc23f', '#f08a1c'],
    icon: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="10" fill="#2a3b85"/>
      <g font-family="system-ui,sans-serif" font-weight="800" text-anchor="middle">
        <rect x="9" y="9" width="21" height="21" rx="4" fill="#e8ecff"/><text x="19.5" y="25" font-size="14" fill="#2a3b85">2</text>
        <rect x="34" y="9" width="21" height="21" rx="4" fill="#3d7bff"/><text x="44.5" y="25" font-size="13" fill="#fff">16</text>
        <rect x="9" y="34" width="21" height="21" rx="4" fill="#ef4b4b"/><text x="19.5" y="49" font-size="9.5" fill="#fff">128</text>
        <rect x="34" y="34" width="21" height="21" rx="4" fill="#ffd23f"/><text x="44.5" y="48.5" font-size="7.5" fill="#2a3b85">2048</text>
      </g>
    </svg>`,
    stat: (store) => {
      const best = store.getNumber('best');
      return best ? `Best ${best.toLocaleString()}` : null;
    },
    load: () => import('../games/2048'),
  },
];
