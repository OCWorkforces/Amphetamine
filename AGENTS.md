# Amphetamine — Project Knowledge Base

**Generated:** 2026-03-22
**Commit:** 765fe68
**Branch:** develop

## OVERVIEW

macOS tray-only Electron app that prevents the system from sleeping. Session timer with configurable duration, battery-aware auto-disable, and global shortcut toggle. Settings window for launch-at-login, sleep-prevention, and session duration.

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Runtime   | Bun 1.3.10+ / Node.js 24.14.0+            |
| Framework | Electron 41                               |
| Build     | Rslib (main/preload) + Rsbuild (renderer) |
| Package   | Bun                                       |
| Test      | Vitest 4 (workspace, 93 tests)            |

## STRUCTURE

```
src/
├── main/             # Electron main process (Node.js)
│   ├── index.ts      # App bootstrap, window, lifecycle
│   ├── tray.ts       # System tray icon + context menu
│   ├── ipc.ts        # IPC handlers (9 channels, typed)
│   ├── settings.ts   # Persistent app settings (JSON in userData)
│   ├── session-timer.ts # Session timer state machine
│   ├── power-saver.ts # Electron powerSaveBlocker + battery monitoring
│   ├── auto-launch.ts # macOS login items (launch at login)
│   ├── shortcut.ts   # Global shortcut (Cmd+Shift+A)
│   ├── settings-window.ts # Settings BrowserWindow singleton
│   └── utils/
│       └── packageInfo.ts # Cached package.json reader
├── renderer/         # UI (web context, vanilla TS)
│   ├── index.ts      # Main popover UI (session status + timer)
│   ├── index.html    # CSP-protected template
│   ├── env.d.ts      # Global window.api type declarations
│   ├── settings/     # Settings window (separate entry)
│   │   ├── index.ts  # Settings form logic, save indicator
│   │   ├── index.html # Settings HTML template
│   │   └── styles.css # Settings-specific styles (iOS-style toggles + dropdown)
│   └── styles/
│       └── main.css  # Native macOS styling, dark mode
├── preload/          # Context bridge (sandbox)
│   └── index.ts      # Exposes window.api to renderer
└── shared/           # Types shared across processes
    └── types.ts      # IPC_CHANNELS (9), AppSettings, IpcChannelMap
```

## WHERE TO LOOK

| Task                  | Location                               | Notes                                           |
| --------------------- | -------------------------------------- | ----------------------------------------------- |
| Add IPC channel       | `src/shared/types.ts` → `IPC_CHANNELS` | Single source of truth                          |
| Implement IPC handler | `src/main/ipc.ts`                      | Register with `typedHandle()` or `ipcMain.on()` |
| Expose to renderer    | `src/preload/index.ts`                 | Add to `api` object                             |
| Use in UI             | `src/renderer/`                        | Call via `window.api.*`                         |
| Session timer logic   | `src/main/session-timer.ts`            | start/cancel/getStatus/cleanup                  |
| Power-saver logic     | `src/main/power-saver.ts`              | start/stop/sync + battery monitoring            |
| Global shortcut       | `src/main/shortcut.ts`                 | registerGlobalShortcut/unregisterGlobalShortcut |
| Launch at login       | `src/main/auto-launch.ts`              | macOS login item management                     |
| User settings         | `src/main/settings.ts`                 | JSON in userData, validated                     |
| Settings window       | `src/main/settings-window.ts`          | Singleton, shows in Dock                        |
| Window config         | `src/main/index.ts`                    | `createWindow()`                                |
| Tray behavior         | `src/main/tray.ts`                     | Menu, positioning, theming                      |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process                       |

## CODE MAP

| Symbol                   | Type  | Location                       | Role                                                                           |
| ------------------------ | ----- | ------------------------------ | ------------------------------------------------------------------------------ |
| `createWindow`           | fn    | src/main/index.ts:47           | BrowserWindow factory                                                          |
| `setupTray`              | fn    | src/main/tray.ts:31            | System tray init + Prevent Sleep checkbox                                      |
| `showAbout`              | fn    | src/main/tray.ts:19            | Native About panel (singleton)                                                 |
| `registerIpcHandlers`    | fn    | src/main/ipc.ts:87             | IPC registration (9 channels)                                                  |
| `typedHandle`            | fn    | src/main/ipc.ts:77             | Type-safe IPC wrapper                                                          |
| `validateSender`         | fn    | src/main/ipc.ts:37             | Origin validation                                                              |
| `registerGlobalShortcut` | fn    | src/main/shortcut.ts:8         | Global hotkey registration                                                     |
| `startSession`           | fn    | src/main/session-timer.ts:15   | Start timed/indefinite session                                                 |
| `cancelSession`          | fn    | src/main/session-timer.ts:65   | Cancel active session                                                          |
| `getStatus`              | fn    | src/main/session-timer.ts:82   | Get current session state                                                      |
| `cleanup`                | fn    | src/main/session-timer.ts:108  | Clear timer without syncing sleep                                              |
| `syncPreventSleep`       | fn    | src/main/power-saver.ts:53     | Sync sleep blocker state                                                       |
| `initBatteryMonitoring`  | fn    | src/main/power-saver.ts:65     | Battery drain auto-disable                                                     |
| `startPreventingSleep`   | fn    | src/main/power-saver.ts:15     | Activate powerSaveBlocker                                                      |
| `stopPreventingSleep`    | fn    | src/main/power-saver.ts:32     | Deactivate powerSaveBlocker                                                    |
| `loadSettings`           | fn    | src/main/settings.ts:32        | Load from userData/settings.json                                               |
| `updateSettings`         | fn    | src/main/settings.ts:91        | Persist partial settings                                                       |
| `getSettings`            | fn    | src/main/settings.ts:87        | Get cached settings copy                                                       |
| `syncAutoLaunch`         | fn    | src/main/auto-launch.ts:40     | Sync login item with setting                                                   |
| `createSettingsWindow`   | fn    | src/main/settings-window.ts:35 | Singleton settings window                                                      |
| `closeSettingsWindow`    | fn    | src/main/settings-window.ts:95 | Close settings if open                                                         |
| `IPC_CHANNELS`           | const | src/shared/types.ts:2          | 9 channel names                                                                |
| `IpcChannelMap`          | type  | src/shared/types.ts:15         | Request/response type map                                                      |
| `AppSettings`            | iface | src/shared/types.ts:66         | { launchAtLogin, preventSleep, sessionDuration, batteryThreshold?, shortcut? } |
| `DEFAULT_SETTINGS`       | const | src/shared/types.ts:80         | Full defaults with batteryThreshold + shortcut                                 |
| `api`                    | const | src/preload/index.ts:5         | Context bridge API                                                             |

## CONVENTIONS

- **ESM source → CJS output**: Source `.ts` with ESM, outputs `.cjs` for Electron
- **Import paths**: Always `.js` extension (`from './types.js'`) even for `.ts` source
- **IPC channels**: Define in `src/shared/types.ts` → `IpcChannelMap` for type safety
- **Type-safe IPC**: Use `typedHandle()` in main, `IpcRequest<T>`/`IpcResponse<T>` in preload
- **No UI framework**: Vanilla TS with `innerHTML` string templates
- **macOS only**: Dock hiding, entitlements — no cross-platform
- **Settings persistence**: JSON file in Electron userData directory
- **Settings window**: Shows in Dock when open, hides when closed (tray-only otherwise)
- **Strict TS**: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`
- **`__dirname` polyfill**: ESM main process uses `path.dirname(fileURLToPath(import.meta.url))`
- **Double quotes, semicolons, 2-space indent**: Enforced by Prettier + ESLint
- **Formatting**: Prettier (printWidth: 100, trailingComma: all, semi: true)
- **Linting**: ESLint flat config with `@typescript-eslint/no-explicit-any: error`
- **Dev env var**: `VITE_DEV_SERVER_URL` (stale name — project uses Rsbuild, not Vite)

## ANTI-PATTERNS (THIS PROJECT)

```
// rslib.config.preload.ts:48
// CRITICAL: electron must never be bundled in preload
```

```
// src/main/tray.ts:35
// IMPORTANT: use nativeImage.createFromPath() — it understands asar virtual paths.
// fs.readFileSync() does NOT resolve asar paths in the main process and will throw.
```

- Electron module MUST be external in preload builds (handled in rspack config)
- Never suppress type errors (`as any`, `@ts-ignore`) — except in test mocks
- Never bypass `validateSender()` in IPC handlers
- Never expose mutable settings ref — always return `{ ...settingsCache }` copy
- Never call raw `powerSaveBlocker.start/stop` directly — use `startPreventingSleep()`/`stopPreventingSleep()`
- Session start/cancel/expiry MUST sync `preventSleep` in `updateSettings` calls
- Session handlers must track `prevPreventSleep` to cancel session on true→false transition

## COMMANDS

```bash
bun run dev          # Start dev (watch + electron)
bun run build        # Build all (main + preload + renderer)
bun run package      # Build + create DMG/ZIP (macOS arm64)
bun run typecheck    # TypeScript check (tsc -b)
bun run test         # Run Vitest tests (93 tests, 2 workspaces)
bun run test:watch   # Watch mode
bun run test:coverage # Run with v8 coverage
bun run clean        # Remove lib/ dist/
bun run lint         # ESLint check (src/ tests/)
bun run format       # Prettier format
```

## BUILD SYSTEM

Three-process build:

1. **Main** (`rslib.config.ts`): `electron-main` target → `lib/main/index.cjs`
2. **Preload** (`rslib.config.preload.ts`): `electron-preload` target → `lib/preload/index.cjs`
3. **Renderer** (`rsbuild.config.ts`): `electron-renderer` target → `lib/renderer/` (two envs: main + settings)

Dev orchestration: `scripts/dev.ts` spawns 3 processes (2x rslib watch + rsbuild dev), waits for TCP health check on port 5173, then Electron with `--disable-gpu-sandbox`.

All builds use SWC minification with `drop_console: true`. Console logs stripped in production.

Rsbuild HMR workaround: `globalObject: 'globalThis'` patches electron-renderer target's incompatible webpack global.

## PACKAGING

- `electron-builder` for macOS arm64 only (DMG + ZIP)
- Hardened runtime disabled, Gatekeeper disabled, notarization disabled
- Notarization script exists in `build/notarize.cjs` (disconnected — not wired into build pipeline)
- Entitlements in `build/entitlements.mac*.plist` (JIT + unsigned executable memory)
- `LSUIElement: true` — app runs as agent (no Dock icon by default)
- `afterPack` hook (`build/after-pack.cjs`): strips debug symbols, removes non-English locales
- Custom DMG script: `build-macOS-dmg.sh` with Developer ID auto-detection and ad-hoc signing fallback
- Ad-hoc signed builds require deep re-signing without hardened runtime to avoid dyld Team ID errors

## TESTS

| Project  | Env   | Tests | Focus                                                                  |
| -------- | ----- | ----- | ---------------------------------------------------------------------- |
| main     | node  | 90    | Session timer, IPC, power-saver, settings, tray, shortcut, auto-launch |
| renderer | jsdom | 3     | Event delegation                                                       |

**Setup**: `tests/setup.main.ts` mocks full Electron API (app, BrowserWindow, ipcMain, Tray, Menu, etc.)

**Mock pattern**: `vi.hoisted()` + `vi.mock("electron")`, `vi.resetModules()` + dynamic import for fresh state per test.

**Commands**: `bun run test` | `bun run test:watch` | `bun run test:coverage`

## NOTES

- **Session timer**: State machine in `session-timer.ts` — start/cancel/expiry all sync `preventSleep` via `updateSettings`
- **Battery monitoring**: `power-saver.ts` monitors battery level, auto-cancels session when below threshold
- **Global shortcut**: `Cmd+Shift+A` toggles preventSleep (configurable in settings)
- **Popover UI**: Read-only status display with session timer, polling every second when session active
- **Settings UI**: Three controls — Launch at Login (toggle), Prevent Sleep (toggle), Activate For (dropdown with durations)
- **Settings push**: Changes broadcast to all windows via `BrowserWindow.getAllWindows()`
- **No calendar/meeting features**: Removed in v1.0 refactor
- **Power-saver**: Uses `electron.powerSaveBlocker.start('prevent-display-sleep')`. No macOS permission required
- **Launch at login**: Uses `app.setLoginItemSettings()`
- **Window hide on blur**: Popover behavior — hides when focus lost (dev mode exempt)
- **No CI**: No GitHub workflows configured
- **Dependencies**: Only runtime dep is `electron-log`

## STALE / CLEANUP

- `src/main/utils/packageInfo.ts:52`: Fallback description mentions "Google Meet meetings" — pre-v1.0 artifact
- `build/notarize.cjs` + `@electron/notarize` devDep: Entire notarization pipeline is disconnected
- `src/shared/utils/`: Empty directory (escape-html.ts deleted but folder remains)
- `VITE_DEV_SERVER_URL`: Used in 3 files — stale Vite naming for Rsbuild project
- `src/main/utils/packageInfo.ts`: Uses single-quote imports while entire codebase uses double quotes
- `.github/workflows/`: Empty directory (no CI configured)
