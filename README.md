# Allan's Arcade

A free arcade for your Android: a library of small games, all in one app.

Included games:

| Game | What |
| --- | --- |
| **BlockBomb** | Drag pieces onto an 8×8 board and clear full rows and columns ([from the BlockBomb project](https://github.com/jesperlund/BlockBomb)). |
| **Sudoku** | The classic 9×9 number puzzle with four difficulties, notes, hints, undo, a timer and best times. |
| **2048** | Swipe to slide the tiles; equal tiles merge. Reach 2048 (and keep going), with undo and a best score. |
| **Tetris** | Classic falling blocks: 7-bag pieces, SRS rotation, ghost piece, next preview, NES scoring and speed-up every 10 lines. Swipe/tap or on-screen buttons. |

Every game saves its progress on the device, so you can leave and pick up where you left off.

Built with TypeScript + Vite and packaged as a native Android app with
[Capacitor](https://capacitorjs.com).

## Project layout

| Path | What |
| --- | --- |
| `src/arcade/` | The arcade shell: game library screen, top bar, routing, and the game registry |
| `src/arcade/registry.ts` | **The list of games** in the library |
| `src/arcade/types.ts` | The contract every game implements (`GameDefinition`, `GameModule`) |
| `src/games/<id>/` | One folder per game |
| `src/shared/` | Sound effects, haptics, per-game storage and the glossy block renderer shared by all games |
| `android/` | Native Capacitor project |
| `assets/` | Source images for the app icon and splash screen |

## Adding a game

1. Create `src/games/<id>/index.ts` exporting a `mount` function:

   ```ts
   import type { GameContext, GameInstance } from '../../arcade/types';
   import './style.css';

   export function mount(root: HTMLElement, { store, sound, haptics }: GameContext): GameInstance {
     root.classList.add('my-game'); // scope your CSS under this class
     root.innerHTML = `...`;
     // Wire up the game. Use `store` to save progress (it's namespaced to this game).
     return {
       save() { /* called when the app goes to the background */ },
       destroy() { /* stop timers, animation loops and document listeners */ },
     };
   }
   ```

   `root` is the area below the top bar (which already has the back and
   sound buttons). It is a flex column, so a child with `flex: 1` fills the
   remaining space. The shared `.overlay`, `.panel`, `button.primary` and
   `button.secondary` styles in `src/style.css` give dialogs the arcade look.

2. Add an entry to `GAMES` in `src/arcade/registry.ts`:

   ```ts
   {
     id: 'my-game',            // never change after release – it's the save-data namespace
     name: 'My Game',
     tagline: 'One short line',
     colors: ['#4f8cff', '#3b4fd8'],
     icon: `<svg viewBox="0 0 64 64">…</svg>`,
     stat: (store) => …,       // optional, e.g. "Best 1 234"
     load: () => import('../games/my-game'),
   },
   ```

Games are loaded lazily, so the library stays fast no matter how many there are.
Put pure game logic in its own file with Vitest tests next to it (see
`src/games/sudoku/sudoku.test.ts`).

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev      # play in the browser at http://localhost:5173 (use phone emulation)
npm test         # game logic tests
npm run build    # type-check + production bundle in dist/
```

## Android

### Get an APK without installing anything

Every push runs the **Android build** GitHub Action, which builds a debug APK.
Open the run under the repository's **Actions** tab, download the
`allans-arcade-debug-apk` artifact, unzip it and copy `app-debug.apk` to your
phone. Open it there and allow "install unknown apps" when prompted.

### Build locally

Requires JDK 21 and Android Studio (or the Android SDK).

```bash
npm run android  # build web bundle, sync, open in Android Studio
```

Or from the command line with a device connected over USB:

```bash
npm run cap:sync
cd android && ./gradlew installDebug
```

### Publishing to Google Play

1. Create an upload keystore (keep it and its passwords safe — you need them
   for every future update):
   ```bash
   keytool -genkey -v -keystore allans-arcade-upload.keystore -alias allans-arcade \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add these repository secrets (Settings → Secrets and variables → Actions):
   - `ANDROID_KEYSTORE_BASE64` — output of `base64 -w0 allans-arcade-upload.keystore`
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
3. The next CI run also produces an `allans-arcade-release` artifact containing
   a signed `.aab` (upload this to the Play Console) and a signed `.apk`.
   `versionCode` is set from the CI run number so each upload is unique.

## App icon and splash screen

Source images live in `assets/` (rendered from `public/icon.svg`). After
changing them, regenerate the native resources:

```bash
npx @capacitor/assets generate --android \
  --iconBackgroundColor '#1f2d6a' --splashBackgroundColor '#1b2550' --splashBackgroundColorDark '#1b2550'
```

## Configuration

- App ID: `com.jesperlund.allansarcade` (`capacitor.config.ts`). Change it
  **before** the first store release — it can't be changed afterwards.
- App name: `Allan's Arcade`.
