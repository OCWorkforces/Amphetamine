# Main Process - Electron Backend

Electron main process for lifecycle, tray, IPC, settings persistence, sleep prevention, sessions, battery policy, global shortcut, auto-updater, and benchmark mode. `coordinator.ts` owns settings-to-system synchronization.

## Files

| File | Role |
|------|------|
| `index.ts` | App bootstrap, window creation, security hooks, benchmark entry |
| `coordinator.ts` | Central hub: settings diffing, sleep/session/tray/shortcut/battery sync |
| `session-timer.ts` | Idle/timed/indefinite state machine; monotonic timing |
| `sleep-prevention.ts` | Only `powerSaveBlocker` wrapper |
| `battery-monitor.ts` | `pmset` polling; pure threshold detector |
| `tray.ts` | Tray icon/menu cache, theme debounce, benchmark menu proxy |
| `ipc.ts` | Typed IPC handler registration via `typedHandle()` |
| `ipc-utils.ts` | Sender allowlist and typed handler utilities |
| `settings.ts` | Async JSON settings, EventEmitter, write mutex, corrupt backup |
| `settings-window.ts` | BrowserWindow singleton; Dock visibility while open |
| `auto-updater.ts` | GitHub release polling, backoff, one-open-per-version guard |
| `auto-updater-utils.ts` | Pure updater helpers |
| `benchmark.ts` | Benchmark-mode measurement flow and stdout result artifact |
| `benchmark-env.ts` | Benchmark env names and mode guard |
| `benchmark-metrics.ts` | Pure benchmark artifact summaries |
| `global-shortcut.ts` | Accelerator registration and toggle behavior |
| `auto-launch.ts` | macOS login item integration |
| `security.ts` | WebContents hardening and navigation allowlist |
| `about-window.ts` | Native About panel options |
| `utils/broadcast.ts` | Generic typed push helper |
| `utils/packageInfo.ts` | Cached package metadata with runtime guard |

## Coordinator Rules

- Initialize settings before reading them; `getSettings()` throws before `initSettings()`.
- Effective sleep prevention is `settings.preventSleep || sessionActiveCache`.
- Low-battery auto-stop persists `preventSleep: false` and cancels any active session.
- Battery monitor detects only; coordinator owns policy and side effects.
- Session active changes recompute sleep prevention and tray state without clobbering user intent.
- Settings changes diff previous values before touching launch item, shortcut, session, tray, or renderer broadcasts.

## IPC and Security

- Use `typedHandle()` for invoke channels. It validates senders before calling handlers.
- Raw `ipcMain.on()` is acceptable only for fire-and-forget channels with explicit `validateSender()`.
- Packaged sender URLs exact-match normalized renderer HTML paths; dev senders must match `DEV_ORIGINS`.
- Renderer-facing updates use `broadcastToWindows<K>()`; skip destroyed windows.
- Never expose Node APIs outside preload.

## Timing and State

- Session elapsed timing uses `performance.now()` branded with `asPerf(n)`.
- `Date.now()` is allowed only for the wall-clock expiry anchor in `session-timer.ts`.
- Timer and polling handles should call `.unref()` so they do not pin the event loop.
- `createSessionTimer()` and module-level delegators fail fast if deps/active handle are missing.
- Auto-updater waits 3s after startup, repeats every 4h, and backs off failures to 24h max.

## Benchmark Mode

- `index.ts` calls `configureBenchmarkEnvironment()` and `installBenchmarkTimerCounters()` at module startup.
- Benchmark mode skips auto-updater, samples popover/tray/settings responsiveness, then prints `AMPHETAMINE_BENCHMARK_RESULT:` JSON and quits.
- `benchmark.ts` may dynamically import tray/settings modules for measurement; do not move those helpers into renderer code.

## Anti-Patterns

- Never call `powerSaveBlocker.start/stop` outside `sleep-prevention.ts`.
- Never bypass sender validation for IPC.
- Never expose mutable `settingsCache`; return `{ ...settingsCache }`.
- Never add settings validation branches in main; extend shared `VALIDATORS`.
- Never load tray icons with `fs.readFileSync()`; use `nativeImage.createFromPath()` for asar compatibility.
- Never hardcode tray/menu UI strings outside `constants.ts`.

## Commands

```bash
bun run test -- tests/main
bun run typecheck
bun run benchmark:performance  # after bun run build
```
