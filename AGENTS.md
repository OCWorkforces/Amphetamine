# Amphetamine — Project Knowledge Base

**Generated:** 2026-03-18
**Commit:** a76216a
**Branch:** develop

## OVERVIEW

macOS tray-only Electron app that prevents the system from sleeping. Settings window for launch-at-login and sleep-prevention toggles. No calendar or meeting features (removed in v1.0 refactor).

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Runtime   | Bun 1.3.10+ / Node.js 24.14.0+            |
| Framework | Electron 41                               |
| Build     | Rslib (main/preload) + Rsbuild (renderer) |
| Package   | Bun                                       |
| Test      | Vitest 4 (workspace, 35 tests)            |

## STRUCTURE

```
src/
├── main/             # Electron main process (Node.js)
│   ├── index.ts      # App bootstrap, window, lifecycle
│   ├── tray.ts       # System tray icon + menu
│   ├── ipc.ts        # IPC handlers (window, app, settings)
│   ├── settings.ts   # Persistent app settings (JSON in userData)
│   ├── auto-launch.ts # macOS login items (launch at login)
│   ├── power-saver.ts # Electron powerSaveBlocker (prevent sleep)
│   ├── settings-window.ts # Settings BrowserWindow singleton
│   └── utils/
│       └── packageInfo.ts # Cached package.json reader
├── renderer/         # UI (web context, vanilla TS)
│   ├── index.ts      # Main popover UI (static status display)
│   ├── index.html    # CSP-protected template
│   ├── env.d.ts      # Global window.api type declarations
│   ├── settings/     # Settings window (separate entry)
│   │   ├── index.ts  # Settings form logic, save indicator
│   │   ├── index.html # Settings HTML template
│   │   └── styles.css # Settings-specific styles (iOS-style toggles)
│   └── styles/
│       └── main.css  # Native macOS styling, dark mode
├── preload/          # Context bridge (sandbox)
│   └── index.ts      # Exposes window.api to renderer
└── shared/           # Types shared across processes
    └── types.ts      # IPC_CHANNELS, AppSettings, IpcChannelMap
```

## WHERE TO LOOK

| Task                  | Location                               | Notes                                           |
| --------------------- | -------------------------------------- | ----------------------------------------------- |
| Add IPC channel       | `src/shared/types.ts` → `IPC_CHANNELS` | Single source of truth                          |
| Implement IPC handler | `src/main/ipc.ts`                      | Register with `typedHandle()` or `ipcMain.on()` |
| Expose to renderer    | `src/preload/index.ts`                 | Add to `api` object                             |
| Use in UI             | `src/renderer/`                        | Call via `window.api.*`                         |
| Power-saver logic     | `src/main/power-saver.ts`              | start/stop/sync functions                       |
| Launch at login       | `src/main/auto-launch.ts`              | macOS login item management                     |
| User settings         | `src/main/settings.ts`                 | JSON in userData, validated                     |
| Settings window       | `src/main/settings-window.ts`          | Singleton, shows in Dock                        |
| UI state              | `src/renderer/index.ts`                | Static display, no state machine                |
| Window config         | `src/main/index.ts`                    | `createWindow()`                                |
| Tray behavior         | `src/main/tray.ts`                     | Menu, positioning, theming                      |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process                       |

## CODE MAP

| Symbol                 | Type  | Location                       | Role                                          |
| ---------------------- | ----- | ------------------------------ | --------------------------------------------- |
| `createWindow`         | fn    | src/main/index.ts:48           | BrowserWindow factory                         |
| `setupTray`            | fn    | src/main/tray.ts:53            | System tray init                              |
| `showAbout`            | fn    | src/main/tray.ts:21            | Native About panel (singleton)                |
| `registerIpcHandlers`  | fn    | src/main/ipc.ts:69             | IPC registration                              |
| `typedHandle`          | fn    | src/main/ipc.ts:59             | Type-safe IPC wrapper                         |
| `validateSender`       | fn    | src/main/ipc.ts:33             | Origin validation                             |
| `syncPreventSleep`     | fn    | src/main/power-saver.ts:42     | Sync sleep blocker state                      |
| `startPreventingSleep` | fn    | src/main/power-saver.ts:9      | Activate powerSaveBlocker                     |
| `stopPreventingSleep`  | fn    | src/main/power-saver.ts:21     | Deactivate powerSaveBlocker                   |
| `loadSettings`         | fn    | src/main/settings.ts:33        | Load from userData/settings.json              |
| `updateSettings`       | fn    | src/main/settings.ts:75        | Persist partial settings                      |
| `getSettings`          | fn    | src/main/settings.ts:71        | Get cached settings copy                      |
| `syncAutoLaunch`       | fn    | src/main/auto-launch.ts:40     | Sync login item with setting                  |
| `createSettingsWindow` | fn    | src/main/settings-window.ts:35 | Singleton settings window                     |
| `closeSettingsWindow`  | fn    | src/main/settings-window.ts:95 | Close settings if open                        |
| `IPC_CHANNELS`         | const | src/shared/types.ts:2          | 4 channel names                               |
| `IpcChannelMap`        | type  | src/shared/types.ts:10         | Request/response type map                     |
| `AppSettings`          | iface | src/shared/types.ts:35         | { launchAtLogin, preventSleep }               |
| `DEFAULT_SETTINGS`     | const | src/shared/types.ts:43         | { launchAtLogin: false, preventSleep: false } |
| `api`                  | const | src/preload/index.ts:5         | Context bridge API                            |

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
- **Dev env var**: `VITE_DEV_SERVER_URL` (stale name — project uses Rsbuild, not Vite)

## ANTI-PATTERNS (THIS PROJECT)

```
// rslib.config.preload.ts:48
// CRITICAL: electron must never be bundled in preload
```

```
// src/main/tray.ts:57-58
// IMPORTANT: use nativeImage.createFromPath() — it understands asar virtual paths.
// fs.readFileSync() does NOT resolve asar paths in the main process and will throw.
```

- Electron module MUST be external in preload builds (handled in rspack config)
- Never suppress type errors (`as any`, `@ts-ignore`) — except in test mocks
- Never bypass `validateSender()` in IPC handlers
- Never expose mutable settings ref — always return `{ ...settingsCache }` copy

## COMMANDS

```bash
bun run dev          # Start dev (watch + electron)
bun run build        # Build all (main + preload + renderer)
bun run package      # Build + create DMG/ZIP (macOS arm64)
bun run typecheck    # TypeScript check (tsc -b)
bun run test         # Run Vitest tests (main + renderer workspaces)
bun run test:watch   # Watch mode
bun run test:coverage # Run with v8 coverage
bun run clean        # Remove lib/ dist/
```

## BUILD SYSTEM

Three-process build:

1. **Main** (`rslib.config.ts`): `electron-main` target → `lib/main/index.cjs`
2. **Preload** (`rslib.config.preload.ts`): `electron-preload` target → `lib/preload/index.cjs`
3. **Renderer** (`rsbuild.config.ts`): `electron-renderer` target → `lib/renderer/` (two envs: main + settings)

Dev orchestration: `scripts/dev.ts` spawns 3 processes (2x rslib watch + rsbuild dev), waits for TCP health check on port 5173, then Electron with `--disable-gpu-sandbox`.

All builds use SWC minification with `drop_console: true`. Console logs stripped in production.

## PACKAGING

- `electron-builder` for macOS arm64 only (DMG + ZIP)
- Hardened runtime disabled, Gatekeeper disabled, notarization disabled
- Notarization script exists in `build/notarize.cjs` (disconnected — not wired into build pipeline)
- Entitlements in `build/entitlements.mac*.plist` (JIT + unsigned executable memory)
- `LSUIElement: true` — app runs as agent (no Dock icon by default)
- `afterPack` hook (`build/after-pack.cjs`): strips debug symbols, removes non-English locales
- Custom DMG script: `build-macOS-dmg.sh` with Developer ID auto-detection and ad-hoc signing fallback

## TESTS

| Project  | Env   | Focus                            |
| -------- | ----- | -------------------------------- |
| main     | node  | Power-saver, settings, IPC, tray |
| renderer | jsdom | Event delegation                 |

**Setup**: `tests/setup.main.ts` mocks full Electron API (app, BrowserWindow, ipcMain, Tray, Menu, etc.)

**Mock pattern**: `vi.hoisted()` + `vi.mock("electron")`, `vi.resetModules()` + dynamic import for fresh state per test.

**Commands**: `bun run test` | `bun run test:watch` | `bun run test:coverage`

## NOTES

- **No calendar/meeting features**: Removed in v1.0 refactor. App is now a sleep-prevention tray utility
- **Power-saver**: Uses `electron.powerSaveBlocker.start('prevent-app-suspension')`, synced with settings. No macOS permission required — IOKit assertion API needs no user consent
- **Launch at login**: Uses `app.setLoginItemSettings()` to enable/disable auto-start on macOS login
- **Window hide on blur**: Popover behavior — hides when focus lost (dev mode exempt)
- **Window hide on minimize**: Also hides (not minimize to Dock)
- **No CI**: No GitHub workflows configured
- **Dependencies**: Only runtime dep is `electron-log`
- **No ESLint/Prettier configs**: Dev deps installed but no config files exist

## STALE / CLEANUP

- `src/main/utils/packageInfo.ts:52`: Fallback description mentions "Google Meet meetings" — pre-v1.0 artifact
- `build/notarize.cjs` + `@electron/notarize` devDep: Entire notarization pipeline is disconnected (script not wired, notarize disabled in yml)
- `src/shared/utils/`: Empty directory (escape-html.ts deleted but folder remains)
- `VITE_DEV_SERVER_URL`: Used in 3 files (`index.ts`, `settings-window.ts`, `dev.ts`) — stale Vite naming for Rsbuild project
- `src/main/utils/packageInfo.ts`: Uses single-quote imports while entire codebase uses double quotes
- `.github/workflows/`: Empty directory (no CI configured)
