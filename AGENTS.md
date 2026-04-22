# Amphetamine — Project Knowledge Base

**Generated:** 2026-04-17
**Commit:** f72a93e
**Branch:** develop

## OVERVIEW

macOS tray-only Electron app that prevents the system from sleeping. Session timer with configurable duration, battery-aware auto-disable, global shortcut toggle, and auto-updater. Settings window for launch-at-login, sleep-prevention, and session duration.

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Runtime   | Bun 1.3.10+ / Node.js 24.14.0+            |
| Framework | Electron 41                               |
| Build     | Rslib (main/preload) + Rsbuild (renderer) |
| Package   | Bun                                       |
| Test      | Vitest 4 (workspace, 280 tests)           |
| Linter   | ESLint 9 flat config, @typescript-eslint/no-explicit-any: error |

## STRUCTURE

src/
├── main/               # Electron main process (Node.js)
│   ├── index.ts          # App bootstrap, window, lifecycle
│   ├── coordinator.ts    # Central orchestrator (settings→system sync)
│   ├── sleep-prevention.ts # powerSaveBlocker management
│   ├── battery-monitor.ts  # Battery drain auto-disable via pmset
│   ├── auto-launch.ts      # macOS login item management
│   ├── global-shortcut.ts   # Global hotkey (Cmd+Shift+A)
│   ├── tray.ts           # System tray icon + context menu
│   ├── ipc.ts            # IPC handlers (13 channels, typed, decomposed by domain)
│   ├── settings.ts       # Persistent app settings (async JSON, EventEmitter)
│   ├── session-timer.ts  # Session timer state machine
│   ├── settings-window.ts # Settings BrowserWindow singleton
│   ├── auto-updater.ts   # Auto-updater (decomposed event handlers)
│   ├── constants.ts      # Window dims, timeouts, colors, dev URL
│   └── utils/
│       ├── packageInfo.ts # Cached package.json reader
│       └── broadcast.ts   # broadcastToWindows<T>() (generic, isDestroyed guard)
├── renderer/           # UI (web context, vanilla TS)
│   ├── index.ts          # Main popover UI (session status + timer)
│   ├── index.html        # CSP-protected template
│   ├── env.d.ts          # Window.api type (derived from preload Api export)
│   ├── css.d.ts          # CSS module declarations
│   ├── settings/         # Settings window (separate entry)
│   │   ├── index.ts      # Settings form logic, save indicator
│   │   ├── index.html    # Settings HTML template
│   │   └── styles.css    # Settings-specific styles (iOS-style toggles + dropdown)
│   └── styles/
│       └── main.css      # Native macOS styling, dark mode
├── preload/            # Context bridge (sandbox)
│   └── index.ts          # Exposes window.api to renderer
├── shared/             # Types shared across processes
│   └── types.ts          # IPC_CHANNELS (13), IpcChannelMap, SessionStatusResponse, SessionStartResponse, AppSettings, PUSH_CHANNELS
└── assets.d.ts         # Module declarations for *.png, *.css

## WHERE TO LOOK

| Task                  | Location                               | Notes                                           |
| --------------------- | -------------------------------------- | ----------------------------------------------- |
| Add IPC channel       | `src/shared/types.ts` → `IPC_CHANNELS` | Single source of truth                          |
| Implement IPC handler | `src/main/ipc.ts`                      | Register with `typedHandle()` or `ipcMain.on()` |
| Expose to renderer    | `src/preload/index.ts`                 | Add to `api` object                             |
| Use in UI             | `src/renderer/`                        | Call via `window.api.*`                         |
| `Orchestration logic` | `src/main/coordinator.ts` | Settings→system sync hub, imports extracted modules |
| Session timer logic   | `src/main/session-timer.ts`            | start/cancel/getStatus/cleanup, resetSessionState helper |
| Sleep prevention      | `src/main/sleep-prevention.ts`         | start/stop/syncPreventSleep |
| Battery monitoring    | `src/main/battery-monitor.ts`          | initBatteryMonitoring, getBatteryPercent, checkBatteryAndStop |
| Global shortcut       | `src/main/global-shortcut.ts`          | registerGlobalShortcut/unregisterGlobalShortcut, ShortcutDeps |
| Launch at login       | `src/main/auto-launch.ts`              | getAutoLaunchStatus/setAutoLaunch/syncAutoLaunch |
| User settings         | `src/main/settings.ts`                 | JSON in userData, validated, EventEmitter       |
| Settings window       | `src/main/settings-window.ts`          | Singleton, shows in Dock                        |
| Auto-updater logic    | `src/main/auto-updater.ts`             | Decomposed: registerUpdateEventHandlers + startUpdateCheckLoop |
| Window config         | `src/main/index.ts`                    | `createWindow()`                                |
| Tray behavior         | `src/main/tray.ts`                     | Menu, positioning, theming                      |
| Constants / dev URL   | `src/main/constants.ts`                | Dimensions, timeouts, colors, DEV_ORIGINS, isDev |
| Broadcast utility     | `src/main/utils/broadcast.ts`          | `broadcastToWindows<T>(channel, data)`           |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process                       |

## CODE MAP

| Symbol                       | Type  | Location                        | Role                                                                           |
| ---------------------------- | ----- | ------------------------------- | ------------------------------------------------------------------------------ |
| `createWindow`               | fn    | src/main/index.ts:40            | BrowserWindow factory                                                          |
| `setupTray`                  | fn    | src/main/tray.ts:38             | System tray init + cached menu + Prevent Sleep checkbox                        |
| `showAbout`                  | fn    | src/main/tray.ts:20             | Native About panel (singleton)                                                 |
| `initCoordinator`            | fn    | src/main/coordinator.ts:37      | Central orchestrator: settings→power/auto-launch/session/shortcut/broadcast    |
| `cleanupCoordinator`         | fn    | src/main/coordinator.ts:87      | Unsubscribe + stop sleep prevention                                            |
| `getTrayDeps`                | fn    | src/main/coordinator.ts:97      | Wires tray deps to settings                                                    |
| `registerIpcHandlers`        | fn    | src/main/ipc.ts:63              | IPC registration (13 channels)                                                 |
| `typedHandle`                | fn    | src/main/ipc.ts:59              | Type-safe IPC wrapper                                                          |
| `validateSender`             | fn    | src/main/ipc.ts:20              | Origin validation                                                              |
| `validateOnSender`           | fn    | src/main/ipc.ts:46              | Origin validation for ipcMain.on                                               |
| `validateSenderUrl`          | fn    | src/main/ipc.ts:24              | Shared URL validation logic                                                    |
| `registerGlobalShortcut`     | fn    | src/main/global-shortcut.ts      | Global hotkey registration             |
| `unregisterGlobalShortcut`   | fn    | src/main/global-shortcut.ts      | Global hotkey unregistration           |
| `ShortcutDeps`               | iface | src/main/global-shortcut.ts      | Deps for shortcut (getShortcut, getPreventSleep, togglePreventSleep) |
| `SessionState`               | iface | src/main/session-timer.ts:8     | Session state shape                             |
| `startSession`               | fn    | src/main/session-timer.ts       | Start timed/indefinite session (performance.now()) |
| `cancelSession`              | fn    | src/main/session-timer.ts       | Cancel active session                                                          |
| `resetSessionState`          | fn    | src/main/session-timer.ts:40    | Helper: onSessionStateChange + broadcastSessionUpdate                          |
| `syncPreventSleep`           | fn    | src/main/sleep-prevention.ts    | Sync sleep blocker from settings                                               |
| `startPreventingSleep`       | fn    | src/main/sleep-prevention.ts    | Activate powerSaveBlocker                                                      |
| `stopPreventingSleep`        | fn    | src/main/sleep-prevention.ts    | Deactivate powerSaveBlocker                                                    |
| `initBatteryMonitoring`      | fn    | src/main/battery-monitor.ts     | Battery drain auto-disable (powerMonitor)                                      |
| `getBatteryPercent`          | fn    | src/main/battery-monitor.ts     | Parse `pmset -g batt` output                                                   |
| `cleanupBatteryMonitoring`   | fn    | src/main/battery-monitor.ts     | Remove powerMonitor listeners                                                  |
| `syncAutoLaunch`             | fn    | src/main/auto-launch.ts         | Sync login item with setting                                                   |
| `getAutoLaunchStatus`        | fn    | src/main/auto-launch.ts         | Get current auto-launch status                                                 |
| `setAutoLaunch`              | fn    | src/main/auto-launch.ts         | Enable/disable auto-launch                                                     |
| `initAutoUpdater`            | fn    | src/main/auto-updater.ts        | Orchestrator: registerUpdateEventHandlers + startUpdateCheckLoop                |
| `stopAutoUpdater`            | fn    | src/main/auto-updater.ts        | Stop auto-updater + clear interval                                             |
| `broadcastToWindows`         | fn    | src/main/utils/broadcast.ts     | Generic send to all non-destroyed BrowserWindows                                |
| `IPC_CHANNELS`               | const | src/shared/types.ts:2           | 13 channel names                                                               |
| `IpcChannelMap`              | type  | src/shared/types.ts:18          | Request/response type map                                                      |
| `AppSettings`                | iface | src/shared/types.ts:110         | Settings interface (all fields required, no optionals)                    |
| `DEFAULT_SETTINGS`           | const | src/shared/types.ts:124         | Full defaults                                                                  |
| `SessionStatusResponse`      | iface | src/shared/types.ts:19          | Session status shape (used by SESSION_STATUS + SESSION_STATUS_UPDATE)          |
| `SessionStartResponse`       | iface | src/shared/types.ts:28          | Session start response shape                                                    |
| `PUSH_CHANNELS`              | const | src/shared/types.ts:101         | Push channel names tuple (single source of truth)                              |
| `PushChannel`                | type  | src/shared/types.ts:107         | Derived from PUSH_CHANNELS tuple                                                |

## CONVENTIONS
- **Coordinator pattern**: `coordinator.ts` centralizes settings→system sync (sleep-prevention, battery-monitor, auto-launch, session cancel, broadcast, shortcut). Individual modules do NOT import each other.
- **ESM source → CJS output**: Source `.ts` with ESM, outputs `.cjs` for Electron
- **Import paths**: Always `.js` extension (`from './types.js'`) even for `.ts` source
- **IPC channels**: Define in `src/shared/types.ts` → `IpcChannelMap` for type safety
- **Type-safe IPC**: Use `typedHandle()` in main, `IpcRequest<T>`/`IpcResponse<T>` in preload
- **Dependency injection**: `system-integrations.ts` and `tray.ts` receive deps via `ShortcutDeps`/`TrayDeps` interfaces — no direct settings imports
- **No UI framework**: Vanilla TS with `innerHTML` string templates
- **macOS only**: Dock hiding, entitlements — no cross-platform
- **Settings persistence**: JSON file in Electron userData directory
- **Settings change notification**: Internal `EventEmitter` in settings.ts, `onSettingsChanged()` returns unsubscribe
- **Settings window**: Shows in Dock when open, hides when closed (tray-only otherwise)
- **Strict TS**: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`
- **`__dirname` polyfill**: ESM main process uses `path.dirname(fileURLToPath(import.meta.url))`
- **Double quotes, semicolons, 2-space indent**: Enforced by Prettier + ESLint
- **Formatting**: Prettier (printWidth: 100, trailingComma: all, semi: true)
- **Linting**: ESLint flat config with `@typescript-eslint/no-explicit-any: error`
- **Constants**: All magic numbers extracted to `src/main/constants.ts`
- **Monotonic timing**: Use `performance.now()` for session timing, not `Date.now()` (immune to system clock changes)

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
- Never call raw `powerSaveBlocker.start/stop` directly — use `startPreventingSleep()`/`stopPreventingSleep()` from `sleep-prevention.ts`
- Never bypass `validateSender()` in IPC handlers
- Never expose mutable settings ref — always return `{ ...settingsCache }` copy
- Never mutate hoisted mock properties across tests — always restore after `vi.resetModules()`
- Session start/cancel/expiry MUST sync `preventSleep` in `updateSettings` calls
- Session handlers MUST have `validateSender()` — no exceptions
- Orchestration logic belongs in `coordinator.ts` — modules should NOT import each other directly
- Never use `Date.now()` for session timing — use `performance.now()` for monotonic clock

## COMMANDS

```bash
bun run test           # Run Vitest tests (280 tests, 21 files)
bun run build          # Build all (main + preload + renderer)
bun run package        # Build + DMG/ZIP + flip fuses (macOS arm64)
bun run package:x64    # Build + DMG/ZIP + flip fuses (macOS x64)
bun run typecheck      # TypeScript check (tsc -b)
bun run typecheck:tests # TypeScript check for tests (tsconfig.tests.json)
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

Runtime deps (`electron-log`, `electron-updater`) are externalized in rslib configs — not bundled into main/preload output.


## PACKAGING

- `electron-builder` for macOS arm64 + x64 (DMG + ZIP)
- Hardened runtime disabled, Gatekeeper disabled, notarization disabled
- Notarization wired via `afterSign: build/notarize.cjs` (`@electron/notarize` not installed — non-functional)
- Entitlements in `build/entitlements.mac*.plist` (JIT + unsigned executable memory)
- `LSUIElement: true` — app runs as agent (no Dock icon by default)
- `afterPack` hook (`build/after-pack.cjs`): strips debug symbols, removes non-English locales
- `flip-fuses.cjs`: Flips Electron fuses post-build (RunAsNode disabled, cookie encryption, ASAR integrity)
- Custom DMG script: `build-macOS-dmg.sh` with Developer ID auto-detection and ad-hoc signing fallback

| Project  | Env   | Tests | Focus                                                                                           |
| -------- | ----- | ----- | ----------------------------------------------------------------------------------------------- |
| main     | node  | 242   | Coordinator, session timer, IPC, power-saver, battery-monitor, settings, tray, shortcut, auto-launch, auto-updater |
| renderer | jsdom | 38    | Popover UI, settings UI, event delegation, push subscriptions                                  |

**Setup**: `tests/setup.main.ts` mocks full Electron API (app, BrowserWindow, ipcMain, Tray, Menu, etc.)

**Mock pattern**: `vi.hoisted()` + `vi.mock("electron")`, `vi.resetModules()` + dynamic import for fresh state per test.

**Commands**: `bun run test` | `bun run test:watch` | `bun run test:coverage`

## NOTES

- **Coordinator**: `coordinator.ts` centralizes all settings→system sync. Subscribes to `onSettingsChanged` and dispatches to sleep-prevention, battery-monitor, auto-launch, session cancel, broadcast, and shortcut modules.
- **Session timer**: State machine in `session-timer.ts` — uses `performance.now()` monotonic clock. `resetSessionState()` helper. Broadcasts push every 1s.
- **Sleep prevention**: `sleep-prevention.ts` manages `powerSaveBlocker`. `syncPreventSleep()` starts/stops based on settings.
- **Battery monitoring**: `battery-monitor.ts` monitors via `pmset`, auto-cancels session below threshold.
- **Global shortcut**: `Cmd+Shift+A` toggles preventSleep. `global-shortcut.ts` receives deps via `ShortcutDeps`.
- **Auto-launch**: `auto-launch.ts` manages macOS login items via `app.setLoginItemSettings()`.
- **Popover UI**: Read-only status display with session timer. Receives push updates via `SESSION_STATUS_UPDATE` (no polling).
- **Settings UI**: Three controls — Launch at Login (toggle), Prevent Sleep (toggle), Activate For (dropdown with durations)
- **Settings push**: Changes broadcast to all windows via `broadcastToWindows()` utility
- **Auto-updater**: Checks for updates 3s after startup, every 4 hours. Opens GitHub release URL on semver-validated version.
- **Power-saver**: Uses `electron.powerSaveBlocker.start('prevent-display-sleep')`. No macOS permission required
- **Launch at login**: Uses `app.setLoginItemSettings()`
- **Window hide on blur**: Popover behavior — hides when focus lost (dev mode exempt)
- **CI**: GitHub Actions (ci.yml: lint+test+build, cd.yml: tag+release from CI artifacts)
- **Dependencies**: Runtime deps are `electron-log` and `electron-updater`
- **Settings persistence**: Async atomic writes with `randomUUID()` temp files. No-change dedup skips disk write + event cascade when nothing changed.
- **Coordinator fix**: `prevPreventSleep` updated before `cancelSession()` call to prevent infinite recursion (cancelSession → updateSettings → subscriber → cancelSession).
- **Tray menu**: Cached in `cachedMenu` variable, rebuilt only on settings change. `setupTray()` returns cleanup function (unsubscribe + clear cache).

## STALE / CLEANUP

- `build/notarize.cjs`: Wired via `afterSign` but `@electron/notarize` not installed — non-functional
- `build/flip-fuses.cjs`: Flips Electron fuses (RunAsNode disabled, EnableCookieEncryption, EnableFuses, OnlyLoadAppFromAsar)
- `DEV_SERVER_URL`: Used in 3 files — correct name (previously VITE_DEV_SERVER_URL from Vite era)
- `utils/packageInfo.ts:52`: Fallback description mentions "Google Meet meetings" — pre-v1.0 artifact

## SCRIPTS

| Script | Purpose |
| ------ | ------- |
| `scripts/dev.ts` | Dev orchestration: spawns rslib watch + rsbuild dev + Electron |
| `scripts/generate-app-icon.mjs` | App icon generator |
| `scripts/generate-coffee-tray-icons.mjs` | Tray icon variants generator |
