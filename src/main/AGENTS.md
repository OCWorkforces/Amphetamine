# Main Process — Electron Main

Electron main process (Node.js). App lifecycle, system tray, IPC, power-saver, and settings persistence.

## FILES

| File                   | Role                                               |
| ---------------------- | -------------------------------------------------- |
| `index.ts`             | App bootstrap, BrowserWindow factory, lifecycle    |
| `tray.ts`              | System tray icon, context menu, window positioning |
| `ipc.ts`               | IPC handlers (window, app, settings)               |
| `settings.ts`          | Persistent app settings (JSON in userData)         |
| `auto-launch.ts`       | macOS login items (launch at login)                |
| `power-saver.ts`       | Electron powerSaveBlocker (prevent sleep)          |
| `settings-window.ts`   | Settings BrowserWindow singleton (shows in Dock)   |
| `utils/packageInfo.ts` | Cached package.json reader (uses electron-log)     |

## ENTRY POINT

`index.ts:100` — `createWindow()` called on `app.whenReady()`

## WINDOW CONFIG

```typescript
// index.ts:48-70
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

| Channel             | Handler            | Pattern       |
| ------------------- | ------------------ | ------------- |
| `window:set-height` | clamped resize     | `ipcMain.on`  |
| `app:get-version`   | `app.getVersion`   | `typedHandle` |
| `settings:get`      | `getSettings()`    | `typedHandle` |
| `settings:set`      | `updateSettings()` | `typedHandle` |

All handlers validate sender via `validateSender()` / `validateOnSender()` against `ALLOWED_ORIGINS`.

## POWER-SAVER

- Uses `electron.powerSaveBlocker.start('prevent-app-suspension')`
- `syncPreventSleep(enabled)`: Called on startup and settings change
- `startPreventingSleep()`: Idempotent — no-op if already active
- `stopPreventingSleep()`: Called on `before-quit`
- `isPreventingSleep()`: Check current state
- Module-level `blockerId` tracks the active blocker

## SETTINGS

- JSON file in `app.getPath('userData')/settings.json`
- Loaded on module import (`loadSettings()` at bottom of settings.ts)
- Validated: each field checked against `typeof`, falls back to `DEFAULT_SETTINGS`
- `updateSettings(partial)`: Merges → saves → updates cache → returns copy
- `getSettings()`: Returns shallow copy of cache (never expose mutable ref)

## TRAY BEHAVIOR

- Left-click → context menu (Settings, About Amphetamine, Quit)
- Icon: `tray-icon-dark.png` / `tray-icon-light.png` + `@2x` variants from `src/assets/`
- Theme-aware: updates icon on `nativeTheme.on('updated')`
- Window positioned below tray icon

## AUTO-LAUNCH

- `getAutoLaunchStatus()`: Reads `app.getLoginItemSettings().openAtLogin`
- `setAutoLaunch(enabled)`: Calls `app.setLoginItemSettings({ openAtLogin, openAsHidden: false })`
- `syncAutoLaunch(enabled)`: Syncs only if current state differs
- Called on app ready and when settings change

## LIFECYCLE

- `close` event → `preventDefault()` + hide + dock hide
- `minimize` event → hide + dock hide
- `blur` event → hide + dock hide (dev mode exempt)
- `before-quit` → `stopPreventingSleep()` + destroy window, allow exit
- `window-all-closed` → no-op (tray-only app stays alive)

## ERROR HANDLING

- `uncaughtException` → `dialog.showErrorBox()` + `app.exit(1)` (prod only)
- `unhandledRejection` → log only (no exit — often recoverable)

## CODE MAP

| Symbol                 | Location                | Role                                 |
| ---------------------- | ----------------------- | ------------------------------------ |
| `createWindow`         | `index.ts:48`           | BrowserWindow factory (tray popover) |
| `setupTray`            | `tray.ts:53`            | System tray init + about window      |
| `showAbout`            | `tray.ts:21`            | Native About panel (singleton)       |
| `registerIpcHandlers`  | `ipc.ts:69`             | IPC registration                     |
| `typedHandle`          | `ipc.ts:59`             | Type-safe IPC wrapper                |
| `validateSender`       | `ipc.ts:33`             | Origin validation                    |
| `validateSenderUrl`    | `ipc.ts:38`             | file:// and dev origin check         |
| `validateOnSender`     | `ipc.ts:50`             | Event-based sender validation        |
| `startPreventingSleep` | `power-saver.ts:9`      | Activate powerSaveBlocker            |
| `stopPreventingSleep`  | `power-saver.ts:21`     | Deactivate powerSaveBlocker          |
| `syncPreventSleep`     | `power-saver.ts:42`     | Sync with settings                   |
| `createSettingsWindow` | `settings-window.ts:35` | Settings BrowserWindow singleton     |
| `closeSettingsWindow`  | `settings-window.ts:95` | Close settings if open               |
| `getAppIconPath`       | `settings-window.ts:11` | Get app icon path for Dock           |
| `getDockIcon`          | `settings-window.ts:21` | Get or create cached Dock icon       |
| `loadSettings`         | `settings.ts:33`        | Load from userData/settings.json     |
| `saveSettings`         | `settings.ts:64`        | Persist settings to disk             |
| `updateSettings`       | `settings.ts:75`        | Merge + persist + notify listeners   |
| `getSettings`          | `settings.ts:71`        | Get cached settings copy             |
| `getSettingsPath`      | `settings.ts:23`        | Resolve settings file path           |
| `onSettingsChanged`    | `settings.ts:15`        | Subscribe to settings changes        |
| `ensureUserDataDir`    | `settings.ts:28`        | Create userData dir if missing       |
| `getAutoLaunchStatus`  | `auto-launch.ts:7`      | Read macOS login item status         |
| `setAutoLaunch`        | `auto-launch.ts:21`     | Set macOS login item                 |
| `syncAutoLaunch`       | `auto-launch.ts:40`     | Sync if state differs                |
| `getPackageInfo`       | `utils/packageInfo.ts`  | Cached package.json reader           |

## ANTI-PATTERNS (THIS PROCESS)

- `validateSender()` / `validateOnSender()` — never skip sender origin validation in IPC handlers
- `getSettings()` — never return mutable `settingsCache` reference, always spread copy
- `startPreventingSleep()` / `stopPreventingSleep()` — idempotent, never call raw powerSaveBlocker directly
- `nativeImage.createFromPath()` — must use for tray icons; `fs.readFileSync()` does NOT resolve asar paths
- `typedHandle()` — use for invoke-style IPC; `ipcMain.on()` only for fire-and-forget (window:set-height)

## STALE / CLEANUP

- `utils/packageInfo.ts:52`: Fallback description mentions "Google Meet meetings" — pre-v1.0 artifact
- `utils/packageInfo.ts`: Uses single-quote imports while entire codebase uses double quotes
