# Amphetamine

macOS tray-only Electron app. Prevents system sleep through user intent or timed sessions. Battery-aware auto-disable, global shortcut, settings window, auto-updater, and benchmark harness.

## Overview

| Layer | Tech |
|------|------|
| Runtime | Bun 1.3.14+ / Node `>=26 <27` |
| Electron | `^43.0.0` |
| Build | Rslib main/preload to CJS + Rsbuild renderer |
| Test | Vitest 4 workspace: main Node + renderer jsdom |
| Lint | ESLint 10 flat, strict TS rules as errors |

macOS only. No cross-platform code. Renderer is vanilla TypeScript; no UI framework.

## Source Map

```text
src/main/                 Electron main process, tray, IPC, settings, timers, updater
  index.ts                bootstrap, window lifecycle, benchmark entry
  coordinator.ts          settings -> system sync hub
  benchmark*.ts           production benchmark mode and metrics
  utils/                  broadcastToWindows, packageInfo guard
src/renderer/             popover UI, CSS, benchmark countdown counters
  settings/               separate settings-window entry; see local AGENTS.md
src/preload/              sandboxed contextBridge API
src/shared/               IPC/settings/session/benchmark contracts
src/assets/               checked-in generated PNGs consumed at runtime
scripts/                  Bun tooling, icon generation, dev orchestration, benchmarks
build/                    electron-builder resources, entitlements, fuses
.github/workflows/        CI/CD release automation; see local AGENTS.md
lib/, dist/, artifacts/   generated outputs; do not add AGENTS.md here
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add IPC channel | `src/shared/types.ts`, `src/preload/index.ts`, `src/main/ipc.ts` | Keep `IPC_CHANNELS`, `IpcChannelMap`, preload wiring, and handlers in sync |
| Add settings field | `src/shared/types.ts`, `src/shared/settings-validators.ts` | Extend `AppSettings`, `DEFAULT_SETTINGS`, and `VALIDATORS` |
| Settings -> system sync | `src/main/coordinator.ts` | Only coordinator maps settings into system side effects |
| Session logic | `src/main/session-timer.ts` | Discriminated state union, `performance.now()`, `asPerf()` |
| Sleep prevention | `src/main/sleep-prevention.ts` | Wrapper around `powerSaveBlocker`; never call Electron API elsewhere |
| Tray/menu changes | `src/main/tray.ts`, `src/assets/AGENTS.md` | Tray filenames are generated contracts |
| Renderer popover | `src/renderer/index.ts` | Push subscriptions, local countdown anchor, RAF-batched DOM writes |
| Settings UI | `src/renderer/settings/AGENTS.md` | Debounced queued saves and shortcut recorder rules |
| Benchmark mode | `src/main/benchmark.ts`, `src/renderer/benchmark-countdown.ts`, `scripts/benchmark-performance.ts` | Requires built `lib/` output |
| Test mocking | `tests/AGENTS.md`, `tests/main/AGENTS.md`, `tests/renderer/AGENTS.md` | Main uses mocked Electron; renderer uses jsdom |
| Dev/build scripts | `scripts/AGENTS.md` | Dev waits for CJS outputs and TCP port 5173 |
| Packaging/signing | `build/AGENTS.md`, `electron-builder.yml`, `build-macOS-dmg.sh` | Fuses and signing decisions are non-default |
| CI/CD | `.github/workflows/AGENTS.md` | CI builds artifacts; CD releases successful main CI artifacts |

## Conventions

- Source is ESM TypeScript; main/preload output is CJS. Use `.js` extensions in TS imports.
- Type-safe IPC: `typedHandle()` in main, typed `invoke<K>()` in preload, exhaustive `WiredChannels` check.
- DI interfaces isolate side effects: `SessionTimerDeps`, `ShortcutDeps`, `TrayDeps`, `IpcDeps`.
- Settings validation uses `VALIDATORS`; no per-field `mergeValidatedPartial` branches.
- `PerfTimestamp` values come from `asPerf(n)`. Do not raw-cast timestamps.
- `SessionStatusResponse`, `SessionStartResponse`, updater status, and benchmark guards are discriminated/runtime-checked contracts.
- Settings init is async; writes use UUID temp file + rename and a `writeChain` mutex.
- Push broadcasts use `broadcastToWindows<K>()`; renderer subscribes with `window.api.on*()` and cleanup functions.
- UI strings live in constants files. Styling lives in CSS. No inline renderer styles.
- Format: double quotes, semicolons, 2-space indent, Prettier print width 100.
- Strict TS: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`.

## Anti-Patterns

- Never call `powerSaveBlocker.start/stop` outside `sleep-prevention.ts`.
- Never bypass `validateSender()` for IPC. `ipcMain.on()` is allowed only with explicit sender validation.
- Never expose mutable settings state; return cloned settings snapshots.
- Never use `Date.now()` for elapsed session timing. Exception: `session-timer.ts` wall-clock anchor for macOS sleep-resilient expiry.
- Never use `JSON.parse(...) as T`; parse to `unknown` and guard.
- Never mutate `DEFAULT_SETTINGS`.
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Never hardcode renderer/tray UI strings in logic.
- Never import Electron in renderer code; all Electron access goes through preload.
- Never make runtime code import from `scripts/`.
- Never add or edit source docs under generated `lib/`, `dist/`, `artifacts/`, coverage, or tool-state directories.
- Never distribute packaged output before the intended fuse/signing path has run.

## Commands

```bash
bun run dev                    # rslib watch x2 + rsbuild dev + Electron
bun run test                   # Vitest workspace
bun run test:coverage          # v8 coverage
bun run build                  # main + preload + renderer builds
bun run benchmark:performance  # requires bun run build first
bun run package                # arm64 DMG/ZIP + flip-fuses; also :x64, :universal, :dir
bun run typecheck              # tsc -b; use typecheck:tests for tests
bun run lint                   # ESLint src/ tests/
bun run format                 # Prettier src/tests targets
bun run clean                  # remove lib/dist outputs
```

## Notes

- Effective sleep prevention is user `preventSleep` intent OR active session state. Low-battery auto-stop disables both.
- Tray icon reflects effective active state; tray menu checkbox reflects user intent only.
- Settings window temporarily shows the Dock icon; tray-only mode returns on close.
- Popover hide on blur uses typed `window:hide`, not DOM `CustomEvent`.
- Auto-updater is notification-only: opens the GitHub release page at most once per version; no auto-install.
- Electron pin is `^43.0.0`; do not downgrade below the patched line referenced by security comments.
- Runtime deps are only `electron-log` and `electron-updater`; they are externalized in Rslib.
- Production Rslib/Rsbuild builds drop console output.
