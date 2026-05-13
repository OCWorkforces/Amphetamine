# Amphetamine

macOS tray-only Electron app. Prevents system sleep. Session timer, battery-aware auto-disable, global shortcut (Cmd+Shift+A), auto-updater.

## Overview

| Layer    | Tech                                      |
|----------|-------------------------------------------|
| Runtime  | Bun 1.3.10+ / Node 24.14.0+               |
| Electron | 41                                        |
| Build    | Rslib (main/preload) + Rsbuild (renderer) |
| Test     | Vitest 4 workspace, ~391 tests            |
| Lint     | ESLint 10 flat: `no-explicit-any`, `no-floating-promises`, `strict-boolean-expressions`, `consistent-type-imports` (all `error`) |

macOS only. No cross-platform code. No UI framework — vanilla TS in renderer.

## Structure

```
Amphetamine/
├── src/
│   ├── main/                    # Electron main process (Node ESM → CJS output)
│   │   ├── index.ts             # App bootstrap, window creation, lifecycle
│   │   ├── coordinator.ts       # Central settings→system sync hub
│   │   ├── session-timer.ts     # State machine (idle/timed/indefinite), performance.now()
│   │   ├── sleep-prevention.ts  # powerSaveBlocker wrapper
│   │   ├── battery-monitor.ts   # pmset polling, auto-disable on low battery
│   │   ├── global-shortcut.ts   # Cmd+Shift+A toggle registration
│   │   ├── auto-launch.ts       # macOS login item management
│   │   ├── auto-updater.ts      # GitHub release polling, exponential backoff
│   │   ├── auto-updater-utils.ts# Pure backoff utilities (extracted)
│   │   ├── tray.ts              # System tray icon + cached context menu
│   │   ├── ipc.ts               # 15 typed IPC channels, domain-decomposed
│   │   ├── ipc-utils.ts         # validateSender, typedHandle, origin allowlist
│   │   ├── settings.ts          # Async JSON persistence, EventEmitter, write mutex
│   │   ├── settings-window.ts   # BrowserWindow singleton (shows in Dock when open)
│   │   ├── security.ts          # Web content hardening, navigation allowlist
│   │   ├── about-window.ts      # Native About panel
│   │   ├── constants.ts         # Window dims, timeouts, colors, DEV_ORIGINS
│   │   └── utils/
│   │       ├── broadcast.ts     # broadcastToWindows<T>() — generic push helper
│   │       └── packageInfo.ts   # Cached package.json + isPackageInfo runtime guard
│   ├── renderer/                # UI — vanilla TS, two entry points
│   │   ├── index.ts             # Main popover: session status + timer display
│   │   ├── index.html           # CSP-protected template
│   │   ├── env.d.ts             # Window.api type (from preload)
│   │   ├── css.d.ts             # CSS module declarations
│   │   ├── styles/main.css      # Native macOS styling, dark mode
│   │   └── settings/            # Settings window (separate entry point)
│   │       ├── index.ts         # Settings form logic (toggles, dropdown)
│   │       ├── index.html       # Settings HTML template
│   │       ├── styles.css       # iOS-style toggles + dropdown
│   │       └── constants.ts     # UI string constants
│   ├── preload/                 # Context bridge (sandboxed)
│   │   └── index.ts             # Exposes typed window.api to renderer
│   └── shared/                  # Types shared across processes
│       ├── types.ts             # IPC_CHANNELS, IpcChannelMap, AppSettings, union types
│       └── settings-validators.ts # Pure predicates + VALIDATORS dispatch table
├── tests/                      # Vitest (391 tests, 22 files)
│   ├── setup.main.ts            # Global Electron API mocks (vi.hoisted)
│   ├── main/                    # 305 tests — Node env, mocked Electron
│   └── renderer/                # 46 tests — jsdom
├── scripts/
│   ├── dev.ts                   # Dev orchestration: rslib watch ×2 + rsbuild + Electron
│   └── generate-app-icon.mjs
├── build/                      # electron-builder, notarize, flip-fuses
├── rslib.config.ts             # Main process build
├── rslib.config.preload.ts     # Preload build (electron externalized)
├── rsbuild.config.ts           # Renderer build (two envs: main + settings)
└── vitest.workspace.ts
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add IPC channel | `src/shared/types.ts` → `IPC_CHANNELS` + `IpcChannelMap`; wire in `preload/index.ts` `api` | Also add to `PUSH_CHANNELS` if push-only |
| Implement IPC handler | `src/main/ipc.ts` via `typedHandle()` | Never raw `ipcMain.on()` without `validateSender()` |
| Add settings field | `src/shared/types.ts` `AppSettings` + `DEFAULT_SETTINGS`; `src/shared/settings-validators.ts` → `VALIDATORS` table | No per-field if/else |
| Settings→system sync | `src/main/coordinator.ts` (only place) | Subscribes to `onSettingsChanged`, diffs `prevSettings` |
| Session logic | `src/main/session-timer.ts` | Discriminated `InternalSessionState` union; `assertNever` exhaustiveness |
| Tray menu changes | `src/main/tray.ts` | `cachedMenu` rebuilt on settings change; theme debounced 50ms |
| Sleep prevention | `src/main/sleep-prevention.ts` | `syncPreventSleep()` only — never call `powerSaveBlocker` directly |
| Renderer push events | `src/renderer/index.ts` | Subscribe via `window.api.onXxx()` — no DOM CustomEvent |
| Test mocking | `tests/setup.main.ts` | Full Electron mock via `vi.hoisted()` + `vi.mock("electron")` |

## Conventions

- **ESM source → CJS output**. Always import with `.js` extension even for `.ts` source
- **Type-safe IPC**: `typedHandle()` in main, `invoke<K>` in preload. `WiredChannels` + `_ExhaustivenessCheck` in preload
- **DI via interfaces**: `ShortcutDeps`, `TrayDeps`, `SessionTimerDeps`, `IpcDeps` — no direct settings imports in modules
- **Validator dispatch table**: `mergeValidatedPartial` uses `VALIDATORS` lookup — no per-field if/else
- **Branded timestamps**: `performance.now() as PerfTimestamp`. Never raw `as` for IPC payloads. Use `.AsType<PerfTimestamp>()`
- **Discriminated unions**: `SessionStatusResponse` (3-arm), `SessionStartResponse` (ok/fail). `assertNever` for exhaustiveness
- **Settings**: async init via `initSettings()` before first `getSettings()`. Atomic writes with UUID temp + rename. Corrupt JSON → backup, fall back to defaults
- **Push broadcasts**: `broadcastToWindows<T>(channel, data)` from `utils/broadcast.ts`. Subscribers via `window.api.on*`
- **No UI framework**: Vanilla TS with `innerHTML` string templates. UI strings in constants files only
- **Double quotes, semicolons, 2-space indent**, Prettier `printWidth: 100`
- **TS strict**: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`

## Anti-Patterns

- Never call `powerSaveBlocker.start/stop` directly — use `startPreventingSleep()`/`stopPreventingSleep()` wrappers
- Never bypass `validateSender()` in IPC handlers — origin uses exact path match via `path.resolve()` + NFC normalization
- Never expose mutable settings ref — always return `{ ...settingsCache }`
- Never use `Date.now()` for session timing — always `performance.now()` (immune to clock jumps)
- Never use raw `as PerfTimestamp` — use `.AsType<PerfTimestamp>()` branded casting
- Never add per-field if/else to `mergeValidatedPartial` — add to `VALIDATORS` table
- Never use `JSON.parse(...) as T` — use runtime guards (`isPackageInfo` pattern)
- Never hardcode UI strings in renderer/tray — use constants files
- Never mutate `DEFAULT_SETTINGS` (it is `Readonly`) — always clone via spread
- Never mutate hoisted mock properties across tests — restore after `vi.resetModules()` + dynamic import
- Never use `as any`, `@ts-ignore`, `@ts-expect-error`
- Session start/cancel/expiry MUST sync `preventSleep` in `updateSettings` calls
- `prevPreventSleep` must update before `cancelSession()` to prevent recursion
- Auto-updater: open release URL at most once per version (`lastNotifiedVersion` guard)

## Commands

```bash
bun run dev              # Dev: 3 processes + Electron (--disable-gpu-sandbox)
bun run test             # Run Vitest (391 tests)
bun run test:watch       # Watch mode
bun run test:coverage    # v8 coverage
bun run build            # Build all (main + preload + renderer)
bun run package          # arm64 DMG/ZIP + flip-fuses
bun run package:x64      # x64 variant
bun run typecheck        # tsc -b
bun run lint             # ESLint src/ tests/
bun run format           # Prettier
```

## Notes

- **Coordinator fix**: `prevPreventSleep` updated before `cancelSession()` to prevent infinite recursion (cancelSession → updateSettings → subscriber → cancelSession)
- **Tray icon**: `nativeImage.createFromPath()` only — `fs.readFileSync()` breaks asar virtual paths. SVG fallback buffer hoisted module-scope
- **Timing**: Never `Date.now()` — always `performance.now()` (monotonic). Session expiry uses `setTimeout` + `unref()` so it doesn't pin event loop
- **Settings atomicity**: UUID temp file + rename. `writeChain` mutex serializes concurrent updates
- **Settings window**: shows in Dock when open, hides when closed (tray-only otherwise)
- **Popover hide on blur**: uses typed `window:hide` push, not DOM CustomEvent
- **Auto-updater cadence**: 3s after startup, 4h interval, exponential backoff to 24h max on failure
- **`DEV_SERVER_URL`** used in 3 files (legacy from Vite era — `VITE_DEV_SERVER_URL`)
- **Runtime deps**: only `electron-log` and `electron-updater` (externalized in rslib configs, not bundled)
- **Packaging**: electron-builder, hardened runtime disabled, Gatekeeper disabled, `LSUIElement: 1` (agent app). flip-fuses disables RunAsNode, enables cookie encryption + ASAR integrity
- **Electron pin**: `^41.3.0` for CVE-2026-34780 (see `src/main/constants.ts`). Do not downgrade
- **Prod minify**: Rslib/Rsbuild use SwcJsMinimizer with `drop_console` in production builds
- **CI**: GitHub Actions uses `concurrency` with `cancel-in-progress` to dedupe in-flight runs per ref