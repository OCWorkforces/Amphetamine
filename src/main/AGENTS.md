# Main Process — Electron Main

Electron main process (Node.js). App lifecycle, system tray, IPC, session timer, power-saver, battery monitoring, global shortcut, settings persistence, and auto-updater.

## FILES

| File                   | Role                                                     |
| ---------------------- | -------------------------------------------------------- |
| `index.ts`             | App bootstrap, BrowserWindow factory, lifecycle          |
| `coordinator.ts`       | Central orchestrator (settings→system sync hub)          |
| `sleep-prevention.ts`  | powerSaveBlocker management (start/stop/sync)            |
| `battery-monitor.ts`   | Battery drain auto-disable via pmset                      |
| `auto-launch.ts`       | macOS login item management                              |
| `global-shortcut.ts`   | Global hotkey (Cmd+Shift+A) + ShortcutDeps interface     |
| `tray.ts`              | System tray icon, context menu, window positioning       |
| `ipc.ts`               | IPC handlers (13 channels, decomposed by domain)         |
| `settings.ts`          | Persistent app settings (JSON in userData, EventEmitter) |
| `session-timer.ts`     | Session timer state machine (start/cancel/expiry)        |
| `settings-window.ts`   | Settings BrowserWindow singleton (shows in Dock)         |
| `auto-updater.ts`      | Auto-updater (decomposed event handlers + check loop + exponential backoff)   |
| `constants.ts`         | Window dims, timeouts, colors, dev URL, DEV_ORIGINS      |
| `utils/packageInfo.ts` | Cached package.json reader (uses electron-log)           |
| `utils/broadcast.ts`   | `broadcastToWindows<T>()` (generic, isDestroyed guard)   |
| `security.ts`          | Web content hardening — `hardenWebContents()`, navigation allowlist           |

## ENTRY POINT

`index.ts:40` — `createWindow()` called on `app.whenReady()`

## COORDINATOR PATTERN

`coordinator.ts` is the central orchestrator. On `initCoordinator()`:

1. Syncs initial state: `syncAutoLaunch()` (auto-launch.ts), `syncPreventSleep()` (sleep-prevention.ts)
2. Wires battery: `setBatteryThresholdGetter()` + `setBatteryAutoStopCallback(cancelSession)` (battery-monitor.ts)
3. Registers shortcut via `ShortcutDeps` (injected, no direct settings import)
4. Subscribes to `onSettingsChanged` → dispatches to all sync modules using `prevSettings` diff (only calls `syncPreventSleep`/`syncAutoLaunch`/`registerGlobalShortcut` when relevant field actually changed)
5. Tracks `prevPreventSleep` — cancels session on true→false transition. Updated BEFORE `cancelSession()` call to prevent infinite recursion
6. Tracks `prevSettings: AppSettings | null` — module-level snapshot for diff-based selective sync
7. Caches `shortcutDeps: ShortcutDeps | null` at module level so toggle closures remain valid after init
8. Broadcasts settings to all windows via `broadcastToWindows()`
9. `togglePreventSleep` uses `void updateSettings(...)` prefix for the async call

`getTrayDeps()` returns `TrayDeps` wired to settings (dependency injection for tray). The `onSettingsChanged` callback is bridged: `(cb: () => void) => onSettingsChanged((_settings) => { cb(); })` — tray uses `() => void` signature, coordinator wraps to accept and discard the `AppSettings` param.

**Key rule**: Modules do NOT import each other. All orchestration goes through coordinator.

## WINDOW CONFIG

```typescript
// index.ts
{
  width: 360, height: 480, // from constants.ts
  show: false, frame: false, resizable: false, movable: false,
  alwaysOnTop: true, skipTaskbar: true,
  vibrancy: "popover", visualEffectState: "active", titleBarStyle: "hidden",
  transparent: true, hasShadow: true, paintWhenInitiallyHidden: false,
  webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
}
```

## IPC HANDLERS

| Channel               | Handler                  | Pattern            | Validation          |
| --------------------- | ------------------------ | ------------------ | ------------------- |
| `window:set-height`   | Clamped resize           | `ipcMain.on`       | `validateOnSender`  |
| `app:get-version`     | `app.getVersion`         | `typedHandle`      | `validateSender`    |
| `settings:get`        | `getSettings()`          | `typedHandle`      | `validateSender`    |
| `settings:set`        | `updateSettings()`       | `typedHandle`      | `validateSender`    |
| `settings:open`       | `createSettingsWindow()` | `typedHandle`      | `validateSender`    |
| `session:start`       | `startSession(duration)` | `typedHandle`      | `validateSender`    |
| `session:cancel`      | `cancelSession()`        | `typedHandle`      | `validateSender`    |
| `session:status`      | `getStatus()`            | `typedHandle`      | `validateSender`    |
| `app:quit`            | `app.quit()`             | `typedHandle`      | `validateSender`    |
| `auto-updater:check`  | Manual update check      | `typedHandle`      | N/A (packaged only) |
| `settings:changed`    | Push to all windows      | `webContents.send` | N/A (push)          |
| `auto-updater:status` | Push update status       | `webContents.send` | N/A (push)          |
| `session:status-update` | Push session status    | `webContents.send` | N/A (push)          |

## CONSTANTS

`constants.ts` extracts all magic numbers: window dimensions (360×480, 520×540), popover height bounds (220–480), timeouts (hide delay 160ms, battery check 5s, update check 3s/4h), `MS_PER_SECOND`, `MS_PER_MINUTE`, `MAX_UPDATE_CHECK_INTERVAL_MS` (24h), `TRAY_ICON_SIZE`, `TRAY_ICON_COLOR_ACTIVE/INACTIVE`, `DEV_ORIGINS`, `getDevServerUrl()`, `isDev`. Tray menu strings: `MENU_PREVENT_SLEEP` ("Prevent Sleep"), `MENU_SETTINGS` ("Settings..."), `MENU_ABOUT` ("About Amphetamine"), `MENU_QUIT` ("Quit"), `ACCELERATOR_QUIT` ("Cmd+Q").

## SESSION TIMER

- `startSession(durationMinutes)` — validates input (positive finite integer); starts timer with `performance.now()` (monotonic clock), syncs `preventSleep: true`, triggers event-driven `broadcastSessionUpdate()`. Protected by `isStarting` concurrency flag.
- `cancelSession()` — clears expiry timer, syncs `preventSleep: false`, triggers event-driven `broadcastSessionUpdate()`
- `getStatus()` — returns `SessionStatusResponse` (isRunning, startedAt, expiresAt, remainingSeconds, sessionDuration). **Pure** — no side effects. Never re-entrant.
- `reconcileSessionState()` — exported no-op safety shim (union branch logic handles reconciliation internally)
- `cleanup()` — clears expiry timer without syncing sleep (for app teardown)
- `broadcastSessionUpdate()` — push-on-state-change only; no interval timer; computes and broadcasts current status to all windows
- Internal `InternalSessionState` discriminated union (NOT exported): `{ kind: "idle" } | { kind: "indefinite"; startedAt: number } | { kind: "timed"; startedAt: number; expiresAt: number; durationMinutes: number; expiryTimer }`
- All deps injected via setters: `setOnSessionStateChange`, `setSettingsReader`, `setBroadcastFn` — no direct module imports inside session-timer
- Expiry callback wrapped in try/catch with `log.error` for safety
- Timers use `.unref()` so they don’t block process exit

## SLEEP PREVENTION (sleep-prevention.ts)

- `startPreventingSleep()`: Idempotent — no-op if already active
- `stopPreventingSleep()`: Called on `before-quit`
- `syncPreventSleep(enabled)`: Called on startup and settings change
- Uses `electron.powerSaveBlocker.start('prevent-display-sleep')`

## BATTERY MONITORING (battery-monitor.ts)

- `initBatteryMonitoring()`: Listens to powerMonitor AC/battery events. Uses `isCheckingBattery` flag to prevent concurrent checks. Per-listener `off()` refs for clean removal.
- `getBatteryPercent()`: Calls `pmset -g batt` and delegates parsing to `parsePmsetOutput`
- `parsePmsetOutput(stdout: string): number | null`: Pure fn — parses raw `pmset -g batt` stdout → battery % or null. Exported, unit-tested independently.
- `checkBatteryAndStop()`: Auto-cancels session when below threshold. Called with `.catch(log.error)` chain.
- `cleanupBatteryMonitoring()`: Removes powerMonitor listeners

## AUTO-LAUNCH (auto-launch.ts)

- `getAutoLaunchStatus()`: Get current macOS login item status
- `setAutoLaunch(enabled)`: Enable/disable login item
- `syncAutoLaunch(enabled)`: Sync login item with setting

## GLOBAL SHORTCUT (global-shortcut.ts)

- `registerGlobalShortcut(deps: ShortcutDeps)`: Register Cmd+Shift+A. Logs `log.error` if `globalShortcut.register()` returns false.
- `unregisterGlobalShortcut()`: Unregister hotkey
- `ShortcutDeps` interface: `{ getShortcut, getPreventSleep, togglePreventSleep }` — dependency injection

## SETTINGS

- JSON file in `app.getPath('userData')/settings.json`
- Loaded on module import (`loadSettings()` at bottom of settings.ts)
- Validated via type-guard predicates (exported): `isBoolean`, `isPositiveNumber` (finite > 0), `isClamped0to100` (0 ≤ n ≤ 100), `isNonEmptyString`. Wrapper validators: `validateBoolean`, `validatePositiveNumber`, `validateClampedNumber` — exported from settings.ts for reuse in IPC handlers and tests.
- `VALIDATORS: { [K in keyof AppSettings]: SettingsValidator<K> }` — per-field dispatch table consumed by `mergeValidatedPartial`. Mapped type ensures every AppSettings field has an entry (compile error if missing). Add new fields here — no per-field if/else. `mergeValidatedPartial` accepts `Partial<AppSettings>` (tightened input type).
- `saveSettings()`: Async — uses `writeFile`/`rename` from `node:fs/promises` + `randomUUID()` for unique temp files. On JSON parse error during `loadSettings()`, backs up corrupt file to `settings.corrupt-{ISO-timestamp}.json` via `renameSync` + `log.error`, then falls back to `DEFAULT_SETTINGS`.
- `updateSettings(partial)`: Async — has no-change dedup, updates cache BEFORE disk write, serialized via `writeChain` promise mutex (prevents concurrent write races), notifies listeners, returns copy.
- `getSettings()`: Returns shallow copy of cache (never expose mutable ref)
- `onSettingsChanged(callback)`: Subscribe to settings changes, returns unsubscribe function
- `writeChain: Promise<unknown>` — module-level mutex; every `updateSettings()` call chains `.then()` onto it to serialize concurrent writes atomically

## LIFECYCLE

- `close` event → `preventDefault()` + hide + dock hide
- `minimize` event → hide + dock hide
- `blur` event → hide + dock hide (dev mode exempt, `isQuitting` guard prevents hide during quit)
- `before-quit` → `cleanupCoordinator()` (stops sleep, unregisters shortcut/shortcut, unsubscribes settings)

## ANTI-PATTERNS (THIS PROCESS)

- `validateSender()` / `validateOnSender()` — never skip; uses exact path allowlist via `path.resolve()` (not `startsWith` — path-traversal attack)
- `getSettings()` — never return mutable `settingsCache` reference, always spread copy
- `startPreventingSleep()` / `stopPreventingSleep()` — idempotent, never call raw powerSaveBlocker directly
- `nativeImage.createFromPath()` — must use for tray icons; `fs.readFileSync()` does NOT resolve asar paths
- `typedHandle()` — use for invoke-style IPC; `ipcMain.on()` only for fire-and-forget (window:set-height)
- Session start/cancel/expiry — MUST include `preventSleep` in all `updateSettings()` calls
- Orchestration belongs in `coordinator.ts` — modules must NOT import each other directly
- `Date.now()` — never use for session timing; use `performance.now()` for monotonic clock
- `updateSettings()` is async — always use `void` prefix or `await`, never fire-and-forget silently
- Validator dispatch table: `VALIDATORS` lookup in settings.ts; add new AppSettings fields to `VALIDATORS` — no per-field if/else in `mergeValidatedPartial`
- UI string constants: tray menu labels must be imported from `constants.ts` (`MENU_*`, `ACCELERATOR_*`); never hardcode in `tray.ts`
- `utils/packageInfo.ts`: never use `JSON.parse(...) as PackageInfo` cast — uses internal `isPackageInfo(v: unknown): v is PackageInfo` runtime guard; throws `"Invalid package.json shape"` on failure (`isPackageInfo` is NOT exported)

## STALE / CLEANUP

- `build/notarize.cjs`: Wired via `afterSign` but `@electron/notarize` not installed — non-functional

- `utils/packageInfo.ts:52`: Fallback description mentions "Google Meet meetings" — pre-v1.0 artifact
