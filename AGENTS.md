# Amphetamine — Project Knowledge Base

**Generated:** 2026-03-31
**Commit:** bb86958
**Branch:** develop

## OVERVIEW

macOS tray-only Electron app that prevents the system from sleeping. Session timer with configurable duration, battery-aware auto-disable, global shortcut toggle, and auto-updater. Settings window for launch-at-login, sleep-prevention, and session duration.

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Runtime   | Bun 1.3.10+ / Node.js 24.14.0+            |
| Framework | Electron 41                               |
| Build     | Rslib (main/preload) + Rsbuild (renderer) |
| Package   | Bun                                       |
| Test      | Vitest 4 (workspace, 188 tests)           |

## STRUCTURE

```
src/
├── main/               # Electron main process (Node.js)
│   ├── index.ts          # App bootstrap, window, lifecycle
│   ├── coordinator.ts    # Central orchestrator (settings→system sync)
│   ├── tray.ts           # System tray icon + context menu
│   ├── ipc.ts            # IPC handlers (12 channels, typed)
│   ├── settings.ts       # Persistent app settings (JSON in userData, EventEmitter)
│   ├── session-timer.ts  # Session timer state machine
│   ├── power-saver.ts    # Electron powerSaveBlocker + battery monitoring
│   ├── auto-launch.ts    # macOS login items (launch at login)
│   ├── shortcut.ts       # Global shortcut (Cmd+Shift+A)
│   ├── settings-window.ts # Settings BrowserWindow singleton
│   ├── auto-updater.ts   # Auto-updater (electron-updater, release URL)
│   ├── constants.ts      # Window dims, timeouts, dev URL, DEV_ORIGINS
│   └── utils/
│       ├── packageInfo.ts # Cached package.json reader
│       └── broadcast.ts   # broadcastToWindows() utility
├── renderer/           # UI (web context, vanilla TS)
│   ├── index.ts          # Main popover UI (session status + timer)
│   ├── index.html        # CSP-protected template
│   ├── env.d.ts          # Global window.api type declarations
│   ├── css.d.ts          # CSS module declarations
│   ├── settings/         # Settings window (separate entry)
│   │   ├── index.ts      # Settings form logic, save indicator
│   │   ├── index.html    # Settings HTML template
│   │   └── styles.css    # Settings-specific styles (iOS-style toggles + dropdown)
│   └── styles/
│       └── main.css      # Native macOS styling, dark mode
├── preload/            # Context bridge (sandbox)
│   └── index.ts          # Exposes window.api to renderer
└── shared/             # Types shared across processes
    └── types.ts          # IPC_CHANNELS (12), AppSettings, IpcChannelMap
```

## WHERE TO LOOK

| Task                  | Location                               | Notes                                           |
| --------------------- | -------------------------------------- | ----------------------------------------------- |
| Add IPC channel       | `src/shared/types.ts` → `IPC_CHANNELS` | Single source of truth                          |
| Implement IPC handler | `src/main/ipc.ts`                      | Register with `typedHandle()` or `ipcMain.on()` |
| Expose to renderer    | `src/preload/index.ts`                 | Add to `api` object                             |
| Use in UI             | `src/renderer/`                        | Call via `window.api.*`                         |
| Orchestration logic   | `src/main/coordinator.ts`              | Settings→system sync hub                        |
| Session timer logic   | `src/main/session-timer.ts`            | start/cancel/getStatus/cleanup                  |
| Power-saver logic     | `src/main/power-saver.ts`              | start/stop/sync + battery monitoring            |
| Global shortcut       | `src/main/shortcut.ts`                 | registerGlobalShortcut/unregisterGlobalShortcut |
| Launch at login       | `src/main/auto-launch.ts`              | macOS login item management                     |
| User settings         | `src/main/settings.ts`                 | JSON in userData, validated, EventEmitter       |
| Settings window       | `src/main/settings-window.ts`          | Singleton, shows in Dock                        |
| Auto-updater logic    | `src/main/auto-updater.ts`             | init/stop/registerIpc, semver URL validation    |
| Window config         | `src/main/index.ts`                    | `createWindow()`                                |
| Tray behavior         | `src/main/tray.ts`                     | Menu, positioning, theming                      |
| Constants / dev URL   | `src/main/constants.ts`                | Dimensions, timeouts, DEV_ORIGINS, isDev        |
| Broadcast utility     | `src/main/utils/broadcast.ts`          | `broadcastToWindows(channel, data)`             |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process                       |

## CODE MAP

| Symbol                       | Type  | Location                       | Role                                                                           |
| ---------------------------- | ----- | ------------------------------ | ------------------------------------------------------------------------------ |
| `createWindow`               | fn    | src/main/index.ts:40           | BrowserWindow factory                                                          |
| `setupTray`                  | fn    | src/main/tray.ts:37            | System tray init + Prevent Sleep checkbox                                      |
| `showAbout`                  | fn    | src/main/tray.ts:19            | Native About panel (singleton)                                                 |
| `initCoordinator`            | fn    | src/main/coordinator.ts:37     | Central orchestrator: settings→power/auto-launch/session/shortcut/broadcast    |
| `cleanupCoordinator`         | fn    | src/main/coordinator.ts:83     | Unsubscribe + stop sleep prevention                                            |
| `getTrayDeps`                | fn    | src/main/coordinator.ts:93     | Wires tray deps to settings                                                    |
| `registerIpcHandlers`        | fn    | src/main/ipc.ts:63             | IPC registration (12 channels)                                                 |
| `typedHandle`                | fn    | src/main/ipc.ts:59             | Type-safe IPC wrapper                                                          |
| `validateSender`             | fn    | src/main/ipc.ts:20             | Origin validation                                                              |
| `registerGlobalShortcut`     | fn    | src/main/shortcut.ts:12        | Global hotkey registration                                                     |
| `startSession`               | fn    | src/main/session-timer.ts:16   | Start timed/indefinite session                                                 |
| `cancelSession`              | fn    | src/main/session-timer.ts:67   | Cancel active session                                                          |
| `getStatus`                  | fn    | src/main/session-timer.ts:84   | Get current session state                                                      |
| `cleanup`                    | fn    | src/main/session-timer.ts:110  | Clear timer without syncing sleep                                              |
| `syncPreventSleep`           | fn    | src/main/power-saver.ts:60     | Sync sleep blocker state                                                       |
| `initBatteryMonitoring`      | fn    | src/main/power-saver.ts:88     | Battery drain auto-disable                                                     |
| `startPreventingSleep`       | fn    | src/main/power-saver.ts:22     | Activate powerSaveBlocker                                                      |
| `stopPreventingSleep`        | fn    | src/main/power-saver.ts:39     | Deactivate powerSaveBlocker                                                    |
| `setBatteryAutoStopCallback` | fn    | src/main/power-saver.ts:80     | Wire battery auto-stop to session cancel                                       |
| `loadSettings`               | fn    | src/main/settings.ts:34        | Load from userData/settings.json                                               |
| `updateSettings`             | fn    | src/main/settings.ts:93        | Merge + persist + notify (EventEmitter) + return copy                          |
| `getSettings`                | fn    | src/main/settings.ts:89        | Get cached settings copy                                                       |
| `onSettingsChanged`          | fn    | src/main/settings.ts:16        | Subscribe to changes (returns unsubscribe)                                     |
| `syncAutoLaunch`             | fn    | src/main/auto-launch.ts:41     | Sync login item with setting                                                   |
| `createSettingsWindow`       | fn    | src/main/settings-window.ts:35 | Singleton settings window                                                      |
| `closeSettingsWindow`        | fn    | src/main/settings-window.ts:95 | Close settings if open                                                         |
| `initAutoUpdater`            | fn    | src/main/auto-updater.ts:15    | Register electron-updater event handlers                                       |
| `stopAutoUpdater`            | fn    | src/main/auto-updater.ts:110   | Stop auto-updater + clear interval                                             |
| `registerAutoUpdaterIpc`     | fn    | src/main/auto-updater.ts:123   | IPC handler for manual update check                                            |
| `broadcastToWindows`         | fn    | src/main/utils/broadcast.ts:7  | Send to all BrowserWindows                                                     |
| `IPC_CHANNELS`               | const | src/shared/types.ts:2          | 12 channel names                                                               |
| `IpcChannelMap`              | type  | src/shared/types.ts:18         | Request/response type map                                                      |
| `AppSettings`                | iface | src/shared/types.ts:86         | { launchAtLogin, preventSleep, sessionDuration, batteryThreshold?, shortcut? } |
| `DEFAULT_SETTINGS`           | const | src/shared/types.ts:100        | Full defaults with batteryThreshold + shortcut                                 |
| `api`                        | const | src/preload/index.ts:5         | Context bridge API                                                             |

## CONVENTIONS

- **ESM source → CJS output**: Source `.ts` with ESM, outputs `.cjs` for Electron
- **Import paths**: Always `.js` extension (`from './types.js'`) even for `.ts` source
- **IPC channels**: Define in `src/shared/types.ts` → `IpcChannelMap` for type safety
- **Type-safe IPC**: Use `typedHandle()` in main, `IpcRequest<T>`/`IpcResponse<T>` in preload
- **Coordinator pattern**: `coordinator.ts` centralizes settings→system sync (power, auto-launch, session cancel, broadcast, shortcut). Individual modules do NOT import each other.
- **Dependency injection**: `shortcut.ts` and `tray.ts` receive deps via `ShortcutDeps`/`TrayDeps` interfaces — no direct settings imports
- **No UI framework**: Vanilla TS with `innerHTML` string templates
- **macOS only**: Dock hiding, entitlements — no cross-platform
- **Settings persistence**: JSON file in Electron userData directory
- **Settings change notification**: Internal `EventEmitter` in settings.ts, `onSettingsChanged()` returns unsubscribe
- **Settings window**: Shows in Dock when open, hides when closed (tray-only otherwise)
- **Strict TS**: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`
- **`__dirname` polyfill**: ESM main process uses `path.dirname(fileURLToPath(import.meta.url))`
- **Double quotes, semicolons, 2-space indent**: Enforced by Prettier + ESLint
- **Formatting**: Prettier (printWidth: 100, trailingComma: all, semi: true)
- **Linting**: ESLint flat config with `@typescript-eslint/no-explicit-any: error`
- **Constants**: All magic numbers extracted to `src/main/constants.ts`

## ANTI-PATTERNS (THIS PROJECT)

```
// rslib.config.preload.ts:48
// CRITICAL: electron must never be bundled in preload
```

```
// src/main/tray.ts:41
// IMPORTANT: use nativeImage.createFromPath() — it understands asar virtual paths.
// fs.readFileSync() does NOT resolve asar paths in the main process and will throw.
```

- Electron module MUST be external in preload builds (handled in rspack config)
- Never suppress type errors (`as any`, `@ts-ignore`) — except in test mocks
- Never bypass `validateSender()` in IPC handlers
- Never expose mutable settings ref — always return `{ ...settingsCache }` copy
- Never call raw `powerSaveBlocker.start/stop` directly — use `startPreventingSleep()`/`stopPreventingSleep()`
- Never mutate hoisted mock properties across tests — always restore after `vi.resetModules()`
- Session start/cancel/expiry MUST sync `preventSleep` in `updateSettings` calls
- Session handlers MUST have `validateSender()` — no exceptions
- Orchestration logic belongs in `coordinator.ts` — modules should NOT import each other directly

## COMMANDS

```bash
bun run dev            # Start dev (watch + electron)
bun run build          # Build all (main + preload + renderer)
bun run package        # Build + DMG/ZIP + flip fuses (macOS arm64)
bun run package:x64    # Build + DMG/ZIP + flip fuses (macOS x64)
bun run typecheck      # TypeScript check (tsc -b)
bun run test           # Run Vitest tests (188 tests, 19 files)
bun run test:watch     # Watch mode
bun run test:coverage  # Run with v8 coverage
bun run clean          # Remove lib/ dist/
bun run lint           # ESLint check (src/ tests/)
bun run format         # Prettier format
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

- `electron-builder` for macOS arm64 + x64 (DMG + ZIP)
- Hardened runtime disabled, Gatekeeper disabled, notarization disabled
- Notarization wired via `afterSign: build/notarize.cjs` (`@electron/notarize` not installed — non-functional)
- Entitlements in `build/entitlements.mac*.plist` (JIT + unsigned executable memory)
- `LSUIElement: true` — app runs as agent (no Dock icon by default)
- `afterPack` hook (`build/after-pack.cjs`): strips debug symbols, removes non-English locales
- `flip-fuses.cjs`: Flips Electron fuses post-build (RunAsNode disabled, cookie encryption, ASAR integrity)
- Custom DMG script: `build-macOS-dmg.sh` with Developer ID auto-detection and ad-hoc signing fallback

## TESTS

| Project  | Env   | Tests | Focus                                                                               |
| -------- | ----- | ----- | ----------------------------------------------------------------------------------- |
| main     | node  | 176   | Coordinator, session timer, IPC, power-saver, settings, tray, shortcut, auto-launch |
| renderer | jsdom | 12    | Popover UI, settings UI, event delegation                                           |

**Setup**: `tests/setup.main.ts` mocks full Electron API (app, BrowserWindow, ipcMain, Tray, Menu, etc.)

**Mock pattern**: `vi.hoisted()` + `vi.mock("electron")`, `vi.resetModules()` + dynamic import for fresh state per test.

**Commands**: `bun run test` | `bun run test:watch` | `bun run test:coverage`

## NOTES

- **Coordinator**: `coordinator.ts` centralizes all settings→system sync. Subscribes to `onSettingsChanged` and dispatches to power-saver, auto-launch, session cancel, broadcast, and shortcut modules.
- **Session timer**: State machine in `session-timer.ts` — start/cancel/expiry all sync `preventSleep` via `updateSettings`
- **Battery monitoring**: `power-saver.ts` monitors battery level, auto-cancels session via callback when below threshold
- **Global shortcut**: `Cmd+Shift+A` toggles preventSleep (configurable in settings)
- **Popover UI**: Read-only status display with session timer, polling every second when session active
- **Settings UI**: Three controls — Launch at Login (toggle), Prevent Sleep (toggle), Activate For (dropdown with durations)
- **Settings push**: Changes broadcast to all windows via `broadcastToWindows()` utility
- **Auto-updater**: Checks for updates 3s after startup, every 4 hours. Opens GitHub release URL on semver-validated version.
- **Power-saver**: Uses `electron.powerSaveBlocker.start('prevent-display-sleep')`. No macOS permission required
- **Launch at login**: Uses `app.setLoginItemSettings()`
- **Window hide on blur**: Popover behavior — hides when focus lost (dev mode exempt)
- **CI**: GitHub Actions (ci.yml: lint+test+build, cd.yml: tag+release from CI artifacts)
- **Dependencies**: Runtime deps are `electron-log` and `electron-updater`

## STALE / CLEANUP

- `build/notarize.cjs`: Wired via `afterSign` but `@electron/notarize` not installed — non-functional
- `build/flip-fuses.cjs`: Flips Electron fuses (EnableCookieEncryption, EnableFuses) post-build
- `DEV_SERVER_URL`: Used in 3 files — correct name (previously VITE_DEV_SERVER_URL from Vite era)
- `utils/packageInfo.ts:52`: Fallback description mentions "Google Meet meetings" — pre-v1.0 artifact
