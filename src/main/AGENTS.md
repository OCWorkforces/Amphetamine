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
| `auto-updater.ts`      | Auto-updater (decomposed event handlers + check loop)     |
| `constants.ts`         | Window dims, timeouts, colors, dev URL, DEV_ORIGINS      |
| `utils/packageInfo.ts` | Cached package.json reader (uses electron-log)           |
| `utils/broadcast.ts`   | `broadcastToWindows<T>()` (generic, isDestroyed guard)   |

## ENTRY POINT

`index.ts:40` — `createWindow()` called on `app.whenReady()`

## COORDINATOR PATTERN

`coordinator.ts` is the central orchestrator. On `initCoordinator()`:

1. Syncs initial state: `syncAutoLaunch()` (auto-launch.ts), `syncPreventSleep()` (sleep-prevention.ts)
2. Wires battery: `setBatteryThresholdGetter()` + `setBatteryAutoStopCallback(cancelSession)` (battery-monitor.ts)
3. Registers shortcut via `ShortcutDeps` (injected, no direct settings import)
4. Subscribes to `onSettingsChanged` → dispatches to all sync modules
5. Tracks `prevPreventSleep` — cancels session on true→false transition. Updated BEFORE `cancelSession()` call to prevent infinite recursion from re-triggering the subscriber
6. Broadcasts settings to all windows via `broadcastToWindows()`
7. `togglePreventSleep` uses `void updateSettings(...)` prefix for the async call

`getTrayDeps()` returns `TrayDeps` wired to settings (dependency injection for tray).

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

`constants.ts` extracts all magic numbers: window dimensions (360×480, 520×430), popover height bounds (220–480), timeouts (hide delay 160ms, battery check 5s, update check 3s/4h), `MS_PER_SECOND`, `MS_PER_MINUTE`, `SESSION_BROADCAST_INTERVAL_MS`, `TRAY_ICON_SIZE`, `TRAY_ICON_COLOR_ACTIVE/INACTIVE`, `DEV_ORIGINS`, `getDevServerUrl()`, `isDev`.

## SESSION TIMER

- `startSession(durationMinutes)` — starts timer with `performance.now()` (monotonic clock), syncs `preventSleep: true`, calls `broadcastSessionUpdate()` after starting, calls `startSessionBroadcast()` for timed sessions
- `cancelSession()` — clears timer, syncs `preventSleep: false`, calls `stopSessionBroadcast()` + `broadcastSessionUpdate()`
- `getStatus(settings?)` — returns `SessionState` (isRunning, startedAt, expiresAt, durationMinutes). Accepts optional `AppSettings` parameter
- `cleanup()` — clears timer and calls `stopSessionBroadcast()` without syncing sleep (for app teardown)
- `broadcastSessionUpdate()` — computes and broadcasts session status to all windows
- `startSessionBroadcast()` / `stopSessionBroadcast()` — manages interval-based push of session status
- Timer expiry calls `stopSessionBroadcast()` + `broadcastSessionUpdate()`, then syncs sleep off and clears settings
- Expiry callback wrapped in try/catch with `log.error` for safety

## SLEEP PREVENTION (sleep-prevention.ts)

- `startPreventingSleep()`: Idempotent — no-op if already active
- `stopPreventingSleep()`: Called on `before-quit`
- `syncPreventSleep(enabled)`: Called on startup and settings change
- Uses `electron.powerSaveBlocker.start('prevent-display-sleep')`

## BATTERY MONITORING (battery-monitor.ts)

- `initBatteryMonitoring()`: Listens to powerMonitor AC/battery events
- `getBatteryPercent()`: Parses `pmset -g batt` output (macOS-native)
- `checkBatteryAndStop()`: Auto-cancels session when below threshold
- `cleanupBatteryMonitoring()`: Removes powerMonitor listeners

## AUTO-LAUNCH (auto-launch.ts)

- `getAutoLaunchStatus()`: Get current macOS login item status
- `setAutoLaunch(enabled)`: Enable/disable login item
- `syncAutoLaunch(enabled)`: Sync login item with setting

## GLOBAL SHORTCUT (global-shortcut.ts)

- `registerGlobalShortcut(deps: ShortcutDeps)`: Register Cmd+Shift+A
- `unregisterGlobalShortcut()`: Unregister hotkey
- `ShortcutDeps` interface: `{ getShortcut, getPreventSleep, togglePreventSleep }` — dependency injection
## SETTINGS

- JSON file in `app.getPath('userData')/settings.json`
- Loaded on module import (`loadSettings()` at bottom of settings.ts)
- Validated: each field checked against `typeof`, falls back to `DEFAULT_SETTINGS`
- `saveSettings()`: Async — uses `writeFile`/`rename` from `node:fs/promises` + `randomUUID()` from `node:crypto` for unique temp files
- `updateSettings(partial)`: Async — has no-change dedup (skips save if nothing changed), updates cache BEFORE disk write, persists asynchronously with error logging, notifies listeners, returns copy
- `getSettings()`: Returns shallow copy of cache (never expose mutable ref)
- `onSettingsChanged(callback)`: Subscribe to settings changes, returns unsubscribe function

## LIFECYCLE

- `close` event → `preventDefault()` + hide + dock hide
- `minimize` event → hide + dock hide
- `blur` event → hide + dock hide (dev mode exempt)
- `before-quit` → `cleanupCoordinator()` (stops sleep, unregisters shortcut/shortcut, unsubscribes settings)

## ANTI-PATTERNS (THIS PROCESS)

- `validateSender()` / `validateOnSender()` — never skip sender origin validation in IPC handlers
- `getSettings()` — never return mutable `settingsCache` reference, always spread copy
- `startPreventingSleep()` / `stopPreventingSleep()` — idempotent, never call raw powerSaveBlocker directly
- `nativeImage.createFromPath()` — must use for tray icons; `fs.readFileSync()` does NOT resolve asar paths
- `typedHandle()` — use for invoke-style IPC; `ipcMain.on()` only for fire-and-forget (window:set-height)
- Session start/cancel/expiry — MUST include `preventSleep` in all `updateSettings()` calls
- Orchestration belongs in `coordinator.ts` — modules must NOT import each other directly
- `Date.now()` — never use for session timing; use `performance.now()` for monotonic clock
- `updateSettings()` is async — always use `void` prefix or `await`, never fire-and-forget silently

## STALE / CLEANUP

- `utils/packageInfo.ts:52`: Fallback description mentions "Google Meet meetings" — pre-v1.0 artifact
