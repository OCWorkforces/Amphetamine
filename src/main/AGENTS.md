# Main Process — Electron Main

Electron main process (Node.js). App lifecycle, system tray, IPC, session timer, power-saver, battery monitoring, global shortcut, settings persistence, and auto-updater.

## FILES

| File                   | Role                                                     |
| ---------------------- | -------------------------------------------------------- |
| `index.ts`             | App bootstrap, BrowserWindow factory, lifecycle          |
| `coordinator.ts`       | Central orchestrator (settings→system sync hub)          |
| `tray.ts`              | System tray icon, context menu, window positioning       |
| `ipc.ts`               | IPC handlers (13 channels), settings push, validation    |
| `settings.ts`          | Persistent app settings (JSON in userData, EventEmitter) |
| `session-timer.ts`     | Session timer state machine (start/cancel/expiry)        |
| `power-saver.ts`       | powerSaveBlocker + battery monitoring (pmset)            |
| `auto-launch.ts`       | macOS login items (launch at login)                      |
| `shortcut.ts`          | Global shortcut (Cmd+Shift+A)                            |
| `settings-window.ts`   | Settings BrowserWindow singleton (shows in Dock)         |
| `auto-updater.ts`      | Auto-updater (electron-updater, semver URL validation)   |
| `constants.ts`         | Window dims, timeouts, dev URL, DEV_ORIGINS, isDev       |
| `utils/packageInfo.ts` | Cached package.json reader (uses electron-log)           |
| `utils/broadcast.ts`   | `broadcastToWindows()` utility for push IPC              |

## ENTRY POINT

`index.ts:40` — `createWindow()` called on `app.whenReady()`

## COORDINATOR PATTERN

`coordinator.ts` is the central orchestrator. On `initCoordinator()`:

1. Syncs initial state: `syncAutoLaunch()`, `syncPreventSleep()`
2. Wires battery: `setBatteryThresholdGetter()` + `setBatteryAutoStopCallback(cancelSession)`
3. Registers shortcut via `ShortcutDeps` (injected, no direct settings import)
4. Subscribes to `onSettingsChanged` → dispatches to all sync modules
5. Tracks `prevPreventSleep` — cancels session on true→false transition
6. Broadcasts settings to all windows via `broadcastToWindows()`

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

`constants.ts` extracts all magic numbers: window dimensions (360×480, 520×430), popover height bounds (220–480), timeouts (hide delay 160ms, battery check 5s, update check 3s/4h), `MS_PER_MINUTE`, `DEV_ORIGINS`, `getDevServerUrl()`, `isDev`.

## SESSION TIMER

- `startSession(durationMinutes)` — starts timer, syncs `preventSleep: true`
- `cancelSession()` — clears timer, syncs `preventSleep: false`
- `getStatus()` — returns `SessionState` (isRunning, startedAt, expiresAt, durationMinutes)
- `cleanup()` — clears timer without syncing sleep (for app teardown)
- Timer expiry auto-calls cancel logic — syncs sleep off and clears settings
- Expiry callback wrapped in try/catch with `log.error` for safety

## POWER-SAVER

- Uses `electron.powerSaveBlocker.start('prevent-display-sleep')`
- `syncPreventSleep(enabled)`: Called on startup and settings change
- `startPreventingSleep()`: Idempotent — no-op if already active
- `stopPreventingSleep()`: Called on `before-quit`
- `setBatteryAutoStopCallback(cb)`: Wires battery auto-stop to session cancel
- `initBatteryMonitoring()`: Listens to powerMonitor AC/battery events
- `getBatteryPercent()`: Parses `pmset -g batt` output (macOS-native)

## SETTINGS

- JSON file in `app.getPath('userData')/settings.json`
- Loaded on module import (`loadSettings()` at bottom of settings.ts)
- Validated: each field checked against `typeof`, falls back to `DEFAULT_SETTINGS`
- `updateSettings(partial)`: Merges → saves atomically → updates cache → notifies listeners → returns copy
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

## STALE / CLEANUP

- `utils/packageInfo.ts:52`: Fallback description mentions "Google Meet meetings" — pre-v1.0 artifact
