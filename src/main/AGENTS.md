# Main Process — Electron Backend

Electron main process (Bun / Node.js). App lifecycle, system tray, IPC routing, session timer, power-saver, battery monitoring, global shortcut, settings persistence, and auto-updater. Orchestrated entirely through `coordinator.ts` via DI.

## Files

| File | Role |
|------|------|
| `index.ts` | App bootstrap, BrowserWindow factory, lifecycle, `--hidden` arg |
| `coordinator.ts` | Central hub: subscribes to settings, syncs sleep/launch/shortcut/broadcast |
| `session-timer.ts` | State machine (`idle` / `timed` / `indefinite`); `performance.now()` monotonic |
| `sleep-prevention.ts` | `powerSaveBlocker` wrapper — `syncPreventSleep()` only entry point |
| `battery-monitor.ts` | pmset polling; auto-stops session below `batteryThreshold` |
| `auto-launch.ts` | macOS login items via `app.setLoginItemSettings` |
| `global-shortcut.ts` | `Cmd+Shift+A` hotkey; `ShortcutDeps` interface for DI |
| `tray.ts` | Cached Tray + Menu; SVG fallback hoisted at module scope |
| `ipc.ts` | 15 typed IPC channels; `typedHandle()` + `validateSender()` |
| `ipc-utils.ts` | `validateSender`, `validateSenderUrl`, `typedHandle` — origin allowlist via NFC-normalized `path.resolve()` |
| `settings.ts` | Async JSON persistence; `EventEmitter`; `writeChain` mutex; corrupt backup |
| `settings-window.ts` | `BrowserWindow` singleton; shows in Dock when open |
| `auto-updater.ts` | GitHub release polling; exp backoff (3s to 24h); `lastNotifiedVersion` guard |
| `auto-updater-utils.ts` | Pure utilities: `categorizeUpdaterError`, `getReleaseUrlBase` |
| `constants.ts` | Window dims, `DEV_ORIGINS`, tray colors, menu label strings |
| `security.ts` | Navigation allowlist; `hardenWebContents()` |
| `about-window.ts` | Native About panel via `app.setAboutPanelOptions` |
| `utils/broadcast.ts` | `broadcastToWindows<K>(channel, data)` — generic push helper with `isDestroyed` guard |
| `utils/packageInfo.ts` | Cached `package.json` reader + `isPackageInfo` runtime guard |

## Entry Point

`index.ts:40` — `createWindow()` called on `app.whenReady()`.

## Coordinator Pattern

`coordinator.ts` wires everything via constructor injection:

1. Calls `initSettings()`, reads initial snapshot, stores `prevSettings`.
2. Syncs system state: `syncAutoLaunch()`, `syncPreventSleep()`.
3. Constructs `createSessionTimer({onStateChange, getSettings, broadcast, onSessionActiveChange})` — **throws** on missing deps.
4. Constructs `createBatteryMonitor({getThreshold, onAutoStop, isPreventingSleep, stopPreventingSleep})`.
5. Subscribes to `onSettingsChanged` — diffs against `prevSettings`, dispatches:
   - `sessionTimer.reconcileSessionState()`
   - `recomputeSleepPrevention()` (if `preventSleep` changed)
   - `syncAutoLaunch()` (if `launchAtLogin` changed)
   - `registerGlobalShortcut()` (if `shortcut` changed)
   - `broadcastToWindows(SETTINGS_CHANGED, settings)`
6. Updates `prevSettings` after each cycle.

**Recursion guard:** `prevPreventSleep` is set before `cancelSession()`, preventing `cancelSession -> updateSettings -> subscriber -> cancelSession` loops.

## DI Interfaces

- **`SessionTimerDeps`** — `onStateChange`, `getSettings`, `broadcast`, `onSessionActiveChange?`
- **`ShortcutDeps`** — `getShortcut`, `getPreventSleep`, `togglePreventSleep`
- **`TrayDeps`** — `getPreventSleep`, `togglePreventSleep`, `onSettingsChanged`, `openSettings`
- **`IpcDeps`** — `getSettings`, `updateSettings`, `createSettingsWindow`, `sessionTimer`

## Conventions

- **ESM source -> CJS output** (`.js` extensions on all imports)
- **`performance.now()`** for all timing, branded as `PerfTimestamp` via `asPerf(n)`
- **Never `Date.now()`** for session duration — EXCEPTION: `session-timer.ts` captures a `Date.now()` wall-clock anchor for sleep-resilient expiry.
- **`typedHandle()`** wraps all IPC; validates sender origin via exact path match
- **`writeChain` mutex** serializes concurrent `updateSettings()` calls
- **Settings corruption**: backup to `settings.corrupt-{timestamp}.json`, fall back to defaults
- **`unref()`** on `setTimeout` so session timer doesn't pin the event loop
- **Tray icon**: `nativeImage.createFromPath()` only — `fs.readFileSync()` breaks asar virtual paths
- **`__dirname` polyfill**: `path.dirname(fileURLToPath(import.meta.url))`

## Anti-Patterns

- **Never** call `powerSaveBlocker.start()`/`stop()` directly — use `sleep-prevention.ts` wrappers
- **Never** bypass `validateSender()` in IPC handlers
- **Never** expose mutable `settingsCache` ref — always return `{ ...settingsCache }`
- **Never** use `Date.now()` for session timing — use `perfNow()`. EXCEPTION: wall-clock anchor in `session-timer.ts` for sleep resilience.
- **Never** use raw `as PerfTimestamp` — use `asPerf(n)`
- **Never** add per-field `if/else` to `mergeValidatedPartial` — extend `VALIDATORS` table
- **Never** hardcode UI strings — use `constants.ts` menu label constants
- **Never** mutate `DEFAULT_SETTINGS` — it is `Readonly<AppSettings>`

## Commands

```bash
bun run dev              # Dev: 3 rslib/rsbuild processes + Electron
bun run build            # Build all (main + preload -> CJS, renderer -> static)
bun run test             # Vitest (~391 tests)
bun run typecheck        # tsc -b
```

## Notes

- `prevPreventSleep` updated *before* `cancelSession()` to prevent infinite recursion
- Tray SVG fallback buffer hoisted to module scope; theme updates debounced 50ms
- Settings window `show()` adds app to Dock; `close()` removes it
- Popover hides on blur via typed `window:hide` push channel, not DOM events
- `DEV_SERVER_URL` is the renamed successor of the Vite-era `VITE_DEV_SERVER_URL`
- Runtime deps externalized: `electron-log`, `electron-updater` (not bundled)
