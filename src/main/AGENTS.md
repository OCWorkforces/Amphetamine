# Main Process — Electron Main

Electron main process (Node.js). App lifecycle, system tray, IPC, session timer, power-saver, battery monitoring, global shortcut, settings persistence, and auto-updater.

## FILES

| File                   | Role                                                     |
| ---------------------- | -------------------------------------------------------- |
| `index.ts`             | App bootstrap, BrowserWindow factory, lifecycle          |
| `tray.ts`              | System tray icon, context menu, window positioning       |
| `ipc.ts`               | IPC handlers (12 channels), settings push, validation    |
| `settings.ts`          | Persistent app settings (JSON in userData, EventEmitter) |
| `session-timer.ts`     | Session timer state machine (start/cancel/expiry)        |
| `power-saver.ts`       | powerSaveBlocker + battery monitoring (pmset)            |
| `auto-launch.ts`       | macOS login items (launch at login)                      |
| `shortcut.ts`          | Global shortcut (Cmd+Shift+A)                            |
| `settings-window.ts`   | Settings BrowserWindow singleton (shows in Dock)         |
| `auto-updater.ts`      | Auto-updater (electron-updater, semver URL validation)   |
| `utils/packageInfo.ts` | Cached package.json reader (uses electron-log)           |

## ENTRY POINT

`index.ts:49` — `createWindow()` called on `app.whenReady()`

## WINDOW CONFIG

```typescript
// index.ts:50-71
{
  width: 360, height: 480,
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

**Settings push** (`ipc.ts:208`): `onSettingsChanged` broadcasts to ALL windows via `BrowserWindow.getAllWindows()`. Tracks `prevPreventSleep` — cancels session on true→false transition.

## SESSION TIMER

- `startSession(durationMinutes)` — starts timer, syncs `preventSleep: true`
- `cancelSession()` — clears timer, syncs `preventSleep: false`
- `getStatus()` — returns `SessionState` (isRunning, startedAt, expiresAt, durationMinutes)
- `cleanup()` — clears timer without syncing sleep (for app teardown)
- Timer expiry auto-calls `cancelSession()` logic — syncs sleep off and clears settings
- Inconsistent state detection: if settings say `sessionDuration` but no timer running, clears settings
- Expiry callback wrapped in try/catch with `log.error` for safety

## POWER-SAVER

- Uses `electron.powerSaveBlocker.start('prevent-display-sleep')`
- `syncPreventSleep(enabled)`: Called on startup and settings change
- `startPreventingSleep()`: Idempotent — no-op if already active
- `stopPreventingSleep()`: Called on `before-quit`
- `setBatteryAutoStopCallback(cb)`: Wires battery auto-stop to session cancel (callback pattern, not dynamic import)
- `initBatteryMonitoring()`: Listens to powerMonitor AC/battery events
- `checkBatteryAndStop()`: When on battery and below `batteryThreshold`, cancels session
- `getBatteryPercent()`: Parses `pmset -g batt` output (macOS-native)

## SETTINGS

- JSON file in `app.getPath('userData')/settings.json`
- Loaded on module import (`loadSettings()` at bottom of settings.ts)
- Validated: each field checked against `typeof`, falls back to `DEFAULT_SETTINGS`
- Fields: `launchAtLogin`, `preventSleep`, `sessionDuration`, `batteryThreshold?`, `shortcut?`
- `updateSettings(partial)`: Merges → saves atomically → updates cache → notifies listeners → returns copy
- `getSettings()`: Returns shallow copy of cache (never expose mutable ref)
- `onSettingsChanged(callback)`: Subscribe to settings changes, returns unsubscribe function
- Internal `EventEmitter` for change notification (not manual Set<callback>)

## TRAY BEHAVIOR

- Left-click → context menu (Prevent Sleep checkbox, Settings, About Amphetamine, Quit)
- Prevent Sleep checkbox toggles `preventSleep` setting directly
- Icon: `tray-icon-dark.png` / `tray-icon-light.png` + `@2x` + inactive variants from `src/assets/`
- Icon cache: `Map<string, NativeImage>` avoids re-reading from disk on every theme/settings change
- Theme-aware: updates icon on `nativeTheme.on('updated')` and `onSettingsChanged`
- Window positioned below tray icon using `screen.getDisplayNearestPoint()`

## GLOBAL SHORTCUT

- `registerGlobalShortcut()`: Reads shortcut from settings, registers with `globalShortcut`
- Toggles `preventSleep` on activation (true→false or false→true)
- `unregisterGlobalShortcut()`: Called on `before-quit`
- Default: `CommandOrControl+Shift+A`

## AUTO-UPDATER

- `initAutoUpdater()`: Only runs when `app.isPackaged` is true
- Registers 6 event handlers on `electron-updater.autoUpdater`
- Initial check after 3-second delay, periodic check every 4 hours
- `autoDownload: false`, `autoInstallOnAppQuit: false` — security defaults
- Release URL opened via `shell.openExternal()` only when version passes `/^\d+\.\d+\.\d+/` regex
- Invalid version format → logged as warning, URL NOT opened
- `stopAutoUpdater()`: Clears interval + removes all listeners
- `registerAutoUpdaterIpc()`: IPC handler for manual update check from renderer

## AUTO-LAUNCH

- `getAutoLaunchStatus()`: Reads `app.getLoginItemSettings().openAtLogin`
- `setAutoLaunch(enabled)`: Calls `app.setLoginItemSettings({ openAtLogin, openAsHidden: false })`
- `syncAutoLaunch(enabled)`: Syncs only if current state differs

## LIFECYCLE

- `close` event → `preventDefault()` + hide + dock hide
- `minimize` event → hide + dock hide
- `blur` event → hide + dock hide (dev mode exempt)
- `before-quit` → `stopPreventingSleep()` + `unregisterGlobalShortcut()` + `stopAutoUpdater()` + destroy window, allow exit
- `window-all-closed` → no-op (tray-only app stays alive)

## CODE MAP

| Symbol                       | Location                | Role                                 |
| ---------------------------- | ----------------------- | ------------------------------------ |
| `createWindow`               | `index.ts:49`           | BrowserWindow factory (tray popover) |
| `setupTray`                  | `tray.ts:31`            | System tray init + about window      |
| `showAbout`                  | `tray.ts:19`            | Native About panel (singleton)       |
| `registerIpcHandlers`        | `ipc.ts:88`             | IPC registration (12 channels)       |
| `typedHandle`                | `ipc.ts:78`             | Type-safe IPC wrapper                |
| `validateSender`             | `ipc.ts:38`             | Origin validation                    |
| `validateSenderUrl`          | `ipc.ts:43`             | file:// and dev origin check         |
| `validateOnSender`           | `ipc.ts:69`             | Event-based sender validation        |
| `startPreventingSleep`       | `power-saver.ts:15`     | Activate powerSaveBlocker            |
| `stopPreventingSleep`        | `power-saver.ts:32`     | Deactivate powerSaveBlocker          |
| `syncPreventSleep`           | `power-saver.ts:53`     | Sync with settings                   |
| `setBatteryAutoStopCallback` | `power-saver.ts:73`     | Wire battery auto-stop callback      |
| `initBatteryMonitoring`      | `power-saver.ts:81`     | Battery drain auto-disable           |
| `checkBatteryAndStop`        | `power-saver.ts:94`     | Cancel session on low battery        |
| `getBatteryPercent`          | `power-saver.ts:121`    | Parse pmset output                   |
| `startSession`               | `session-timer.ts:16`   | Start timed/indefinite session       |
| `cancelSession`              | `session-timer.ts:70`   | Cancel active session                |
| `getStatus`                  | `session-timer.ts:87`   | Get current session state            |
| `cleanup`                    | `session-timer.ts:113`  | Clear timer without syncing sleep    |
| `registerGlobalShortcut`     | `shortcut.ts:8`         | Global hotkey registration           |
| `unregisterGlobalShortcut`   | `shortcut.ts:31`        | Unregister hotkey                    |
| `createSettingsWindow`       | `settings-window.ts:35` | Settings BrowserWindow singleton     |
| `closeSettingsWindow`        | `settings-window.ts:95` | Close settings if open               |
| `getAppIconPath`             | `settings-window.ts:11` | Get app icon path for Dock           |
| `initAutoUpdater`            | `auto-updater.ts:30`    | Register electron-updater handlers   |
| `stopAutoUpdater`            | `auto-updater.ts:125`   | Stop auto-updater + clear interval   |
| `registerAutoUpdaterIpc`     | `auto-updater.ts:138`   | IPC handler for manual update check  |
| `loadSettings`               | `settings.ts:34`        | Load from userData/settings.json     |
| `saveSettings`               | `settings.ts:79`        | Persist settings to disk             |
| `updateSettings`             | `settings.ts:93`        | Merge + persist + notify listeners   |
| `getSettings`                | `settings.ts:89`        | Get cached settings copy             |
| `onSettingsChanged`          | `settings.ts:16`        | Subscribe to settings changes        |

## ANTI-PATTERNS (THIS PROCESS)

- `validateSender()` / `validateOnSender()` — never skip sender origin validation in IPC handlers
- `getSettings()` — never return mutable `settingsCache` reference, always spread copy
- `startPreventingSleep()` / `stopPreventingSleep()` — idempotent, never call raw powerSaveBlocker directly
- `nativeImage.createFromPath()` — must use for tray icons; `fs.readFileSync()` does NOT resolve asar paths
- `typedHandle()` — use for invoke-style IPC; `ipcMain.on()` only for fire-and-forget (window:set-height)
- Session start/cancel/expiry — MUST include `preventSleep` in all `updateSettings()` calls
- `onSettingsChanged` in ipc.ts — MUST track `prevPreventSleep` to cancel session on true→false
- `shell.openExternal()` — MUST validate URL/version format before opening (see auto-updater semver check)
- Battery auto-stop — use `setBatteryAutoStopCallback()` instead of dynamic `import("./session-timer.js")`

## STALE / CLEANUP

- `utils/packageInfo.ts:52`: Fallback description mentions "Google Meet meetings" — pre-v1.0 artifact
