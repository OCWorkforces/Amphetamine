# Amphetamine

macOS tray-only Electron app. Prevents system sleep. Session timer, battery-aware auto-disable, global shortcut (Cmd+Shift+A), auto-updater.

## Overview

| Layer    | Tech                                      |
|----------|-------------------------------------------|
| Runtime  | Bun 1.3.14+ / Node `>=26 <27`             |
| Electron | 42                                        |
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
│   ├── assets/                  # Generated tray/app PNGs consumed by tray + settings UI
│   └── shared/                  # Types shared across processes
│       ├── types.ts             # IPC_CHANNELS, IpcChannelMap, AppSettings, union types
│       └── settings-validators.ts # Pure predicates + VALIDATORS dispatch table
├── tests/                      # Vitest (~391 tests, 23 test files)
│   ├── setup.main.ts            # Global Electron API mocks (vi.hoisted)
│   ├── main/                    # 20 test files — Node env, mocked Electron
│   └── renderer/                # 3 test files — jsdom
├── scripts/
│   ├── dev.ts                   # Dev orchestration: rslib watch ×2 + rsbuild + Electron
│   ├── generate-app-icon.mjs     # macOS .icns + settings hero PNG
│   └── generate-coffee-tray-icons.mjs # 8 theme/state tray PNGs
├── build/                      # electron-builder resources: icon, entitlements, hooks, fuses
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
| Tray/settings assets | `src/assets/AGENTS.md`, `scripts/AGENTS.md` | Generated filenames are coupled to `src/main/tray.ts` lookups |
| Test mocking | `tests/setup.main.ts` | Full Electron mock via `vi.hoisted()` + `vi.mock("electron")` |
| Dev/build scripts | `scripts/AGENTS.md` | `dev.ts` waits for CJS outputs + TCP port 5173 before Electron launch |
| Packaging/signing | `build/AGENTS.md`, `electron-builder.yml`, `build-macOS-dmg.sh` | Hardened runtime off; notarize disabled; flip fuses after packaging |

## Conventions

- **ESM source → CJS output**. Always import with `.js` extension even for `.ts` source
- **Type-safe IPC**: `typedHandle()` in main, `invoke<K>` in preload. `WiredChannels` + `_ExhaustivenessCheck` in preload
- **DI via interfaces**: `ShortcutDeps`, `TrayDeps`, `SessionTimerDeps`, `IpcDeps` — no direct settings imports in modules
- **Validator dispatch table**: `mergeValidatedPartial` uses `VALIDATORS` lookup — no per-field if/else
- **Branded timestamps**: `performance.now()` values use `asPerf(n)` helper. Never raw `as PerfTimestamp`.
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
- Never use `Date.now()` for session timing — always `performance.now()` (immune to clock jumps). EXCEPTION: `session-timer.ts` captures a `Date.now()` wall-clock anchor so timed sessions survive macOS sleep.
- Never use raw `as PerfTimestamp` — use `asPerf(n)` branded helper
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
bun run test             # Run Vitest (~391 tests); add :watch or :coverage as needed
bun run build            # Build all (main + preload + renderer)
bun run package          # arm64 DMG/ZIP + flip-fuses; also :x64, :universal, :dir
bun run typecheck        # tsc -b; use typecheck:tests for tests
bun run lint             # ESLint src/ tests/; use lint:fix only for explicit fixes
bun run format           # Prettier
bun run clean            # Remove lib/dist outputs
```

## Notes

- **Coordinator fix**: `prevPreventSleep` updated before `cancelSession()` to prevent infinite recursion (cancelSession → updateSettings → subscriber → cancelSession)
- **Tray icon**: `nativeImage.createFromPath()` only — `fs.readFileSync()` breaks asar virtual paths. SVG fallback buffer hoisted module-scope
- **Timing**: Never `Date.now()` for elapsed measurement — always `performance.now()` (monotonic). EXCEPTION: wall-clock anchor in `session-timer.ts` for sleep resilience. Session expiry uses `setTimeout` + `unref()` so it doesn't pin event loop
- **Settings atomicity**: UUID temp file + rename. `writeChain` mutex serializes concurrent updates
- **Settings window**: shows in Dock when open, hides when closed (tray-only otherwise)
- **Popover hide on blur**: uses typed `window:hide` push, not DOM CustomEvent
- **Auto-updater cadence**: 3s after startup, 4h interval, exponential backoff to 24h max on failure
- **`DEV_SERVER_URL`** used in 3 files (legacy from Vite era — `VITE_DEV_SERVER_URL`)
- **Runtime deps**: only `electron-log` and `electron-updater` (externalized in rslib configs, not bundled)
- **Packaging**: electron-builder, hardened runtime disabled, Gatekeeper disabled, `LSUIElement: 1` (agent app). flip-fuses disables RunAsNode, enables cookie encryption + ASAR integrity
- **Electron pin**: `^42.0.1` in `package.json`. Do not downgrade below the CVE-2026-34780 patched line noted in `src/main/constants.ts`
- **Prod minify**: Rslib/Rsbuild use SwcJsMinimizer with `drop_console` in production builds
- **CI**: GitHub Actions uses `concurrency` with `cancel-in-progress` to dedupe in-flight runs per ref
