# Amphetamine — Project Knowledge Base

**Generated:** 2026-03-18
**Commit:** c70048c2
**Branch:** develop

## OVERVIEW

macOS tray-only Electron app that prevents the system from sleeping. Settings window for launch-at-login and sleep-prevention toggles. No calendar or meeting features (removed in v1.0 refactor).

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Runtime   | Bun 1.3.10+ / Node.js 24.14.0+            |
| Framework | Electron 41                               |
| Build     | Rslib (main/preload) + Rsbuild (renderer) |
| Package   | Bun                                       |
| Test      | Vitest 4 (workspace, 47 tests)            |

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
│   ├── logger.ts     # Structured logging utility
│   └── utils/
│       └── packageInfo.ts # Cached package.json reader
├── renderer/         # UI (web context, vanilla TS)
│   ├── index.ts      # Main popover UI (static status display)
│   ├── index.html    # CSP-protected template
│   ├── settings/     # Settings window (separate entry)
│   │   ├── index.ts  # Settings form logic, save indicator
│   │   ├── index.html # Settings HTML template
│   │   └── styles.css # Settings-specific styles (iOS-style toggles)
│   └── styles/
│       └── main.css  # Native macOS styling, dark mode
├── preload/          # Context bridge (sandbox)
│   └── index.ts      # Exposes window.api to renderer
└── shared/           # Types shared across processes
    ├── types.ts      # IPC_CHANNELS, AppSettings
    └── utils/
        └── escape-html.ts # XSS protection
```

## WHERE TO LOOK

| Task                  | Location                               | Notes                      |
| --------------------- | -------------------------------------- | -------------------------- |
| Add IPC channel       | `src/shared/types.ts` → `IPC_CHANNELS` | Single source of truth     |
| Implement IPC handler | `src/main/ipc.ts`                      | Register with `ipcMain.handle()` |
| Expose to renderer    | `src/preload/index.ts`                 | Add to `api` object         |
| Use in UI             | `src/renderer/`                       | Call via `window.api.*`     |
| Power-saver logic     | `src/main/power-saver.ts`              | start/stop/sync functions   |
| Launch at login       | `src/main/auto-launch.ts`              | macOS login item management |
| User settings         | `src/main/settings.ts`                 | JSON in userData, validated |
| Settings window       | `src/main/settings-window.ts`          | Singleton, shows in Dock    |
| UI state              | `src/renderer/index.ts`                | Static display, no state machine |
| Window config         | `src/main/index.ts`                    | `createWindow()`             |
| Tray behavior         | `src/main/tray.ts`                     | Menu, positioning, theming  |
| Build config          | `rslib.config.ts`, `rsbuild.config.ts` | Separate for each process   |

## CODE MAP

| Symbol | Type | Location | Role |
| ------ | ---- | -------- | ---- |
| `createWindow` | fn | src/main/index.ts:42 | BrowserWindow factory |
| `setupTray` | fn | src/main/tray.ts:46 | System tray init |
| `registerIpcHandlers` | fn | src/main/ipc.ts:64 | IPC registration |
| `typedHandle` | fn | src/main/ipc.ts:54 | Type-safe IPC wrapper |
| `validateSender` | fn | src/main/ipc.ts:28 | Origin validation |
| `syncPreventSleep` | fn | src/main/power-saver.ts:42 | Sync sleep blocker state |
| `startPreventingSleep` | fn | src/main/power-saver.ts:9 | Activate powerSaveBlocker |
| `stopPreventingSleep` | fn | src/main/power-saver.ts:21 | Deactivate powerSaveBlocker |
| `loadSettings` | fn | src/main/settings.ts:23 | Load from userData/settings.json |
| `updateSettings` | fn | src/main/settings.ts:65 | Persist partial settings |
| `getSettings` | fn | src/main/settings.ts:61 | Get cached settings copy |
| `syncAutoLaunch` | fn | src/main/auto-launch.ts:40 | Sync login item with setting |
| `createSettingsWindow` | fn | src/main/settings-window.ts:15 | Singleton settings window |
| `IPC_CHANNELS` | const | src/shared/types.ts:2 | 6 channel names |
| `IpcChannelMap` | type | src/shared/types.ts:12 | Request/response type map |
| `AppSettings` | iface | src/shared/types.ts:41 | { launchAtLogin, preventSleep } |
| `DEFAULT_SETTINGS` | const | src/shared/types.ts:49 | { launchAtLogin: false, preventSleep: false } |
| `api` | const | src/preload/index.ts:5 | Context bridge API |

## CONVENTIONS

- **ESM source → CJS output**: Source `.ts` with ESM, outputs `.cjs` for Electron
- **Import paths**: Always `.js` extension (`from './types.js'`) even for `.ts` source
- **IPC channels**: Define in `src/shared/types.ts` → `IpcChannelMap` for type safety
- **Type-safe IPC**: Use `typedHandle()` in main, `IpcResponse<T>` in preload
- **No UI framework**: Vanilla TS with `innerHTML` string templates
- **macOS only**: Dock hiding, entitlements — no cross-platform
- **Settings persistence**: JSON file in Electron userData directory
- **Settings window**: Shows in Dock when open, hides when closed (tray-only otherwise)
- **Strict TS**: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`

## ANTI-PATTERNS (THIS PROJECT)

```
// rslib.config.preload.ts:45
// electron must never be bundled in preload
```

- Electron module MUST be external in preload builds (handled in rspack config)
- Never suppress type errors (`as any`, `@ts-ignore`) — except in test mocks
- Never bypass `validateSender()` in IPC handlers

## COMMANDS

```bash
bun run dev          # Start dev (watch + electron)
bun run build        # Build all (main + preload + renderer)
bun run package      # Build + create DMG/ZIP (macOS arm64)
bun run typecheck    # TypeScript check
bun run test         # Run Vitest tests (main + renderer workspaces)
bun run test:coverage # Run with coverage
bun run clean        # Remove lib/ dist/
```

## BUILD SYSTEM

Three-process build:

1. **Main** (`rslib.config.ts`): `electron-main` target → `lib/main/index.cjs`
2. **Preload** (`rslib.config.preload.ts`): `electron-preload` target → `lib/preload/index.cjs`
3. **Renderer** (`rsbuild.config.ts`): `electron-renderer` target → `lib/renderer/` (two envs: main + settings)

Dev orchestration: `scripts/dev.ts` spawns 3 processes (2x rslib watch + rsbuild dev), then Electron.

All builds use SWC minification with `drop_console: true`. Console logs stripped in production.

## PACKAGING

- `electron-builder` for macOS arm64 only (DMG + ZIP)
- Hardened runtime disabled, Gatekeeper disabled, notarization disabled
- Notarization script exists in `build/notarize.cjs` (requires env vars when re-enabled)
- Entitlements in `build/entitlements.mac*.plist`
- `LSUIElement: true` — app runs as agent (no Dock icon by default)
- `asarUnpack` references `googlemeet-events.swift` in electron-builder.yml (stale — Swift file removed in v1.0 refactor)
- `NSCalendarsFullAccessUsageDescription` and `NSAppleEventsUsageDescription` in electron-builder.yml extendInfo (stale — calendar features removed in v1.0)

## NOTES

- **No calendar/meeting features**: Removed in v1.0 refactor. App is now a sleep-prevention tray utility
- **Power-saver**: Uses `electron.powerSaveBlocker.start('prevent-app-suspension')`, synced with settings. No macOS permission required — IOKit assertion API needs no user consent
- **Launch at login**: Uses `app.setLoginItemSettings()` to enable/disable auto-start on macOS login
- **Window hide on blur**: Popover behavior — hides when focus lost (dev mode exempt)
- **Window hide on minimize**: Also hides (not minimize to Dock)
- **Tests exist**: 47 tests covering power-saver, settings, IPC, auto-launch, tray, event delegation, and XSS
- **No CI**: No GitHub workflows configured
- **Dependencies**: Only runtime dep is `electron-log`

## TESTS

| Project  | Env   | Focus                                        |
| -------- | ----- | -------------------------------------------- |
| main     | node  | Power-saver, settings, IPC, auto-launch, tray  |
| renderer | jsdom | Event delegation, XSS protection              |

**Setup**: `tests/setup.main.ts` mocks full Electron API (app, BrowserWindow, ipcMain, Tray, Menu, etc.)

**Commands**: `bun run test` | `bun run test:watch` | `bun run test:coverage`
