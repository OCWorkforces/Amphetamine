# Main Process — Electron Main

Electron main process (Node.js). App lifecycle, system tray, IPC, power-saver, and settings persistence.

## FILES

| File                | Role                                                |
| ------------------- | --------------------------------------------------- |
| `index.ts`          | App bootstrap, BrowserWindow factory, lifecycle      |
| `tray.ts`           | System tray icon, context menu, window positioning  |
| `ipc.ts`            | IPC handlers (window, app, settings)                |
| `settings.ts`       | Persistent app settings (JSON in userData)          |
| `auto-launch.ts`    | macOS login items (launch at login)                 |
| `power-saver.ts`    | Electron powerSaveBlocker (prevent sleep)           |
| `settings-window.ts`| Settings BrowserWindow singleton (shows in Dock)     |
| `logger.ts`         | Structured logging utility                          |
| `utils/packageInfo.ts` | Cached package.json reader (uses electron-log)   |

## ENTRY POINT

`index.ts:96` — `createWindow()` called on `app.whenReady()`

## WINDOW CONFIG

```typescript
// index.ts:42-63
{
  width: 360, height: 480,
  show: false, frame: false, resizable: false, movable: false,
  alwaysOnTop: true, skipTaskbar: true,
  vibrancy: "popover", visualEffectState: "active", titleBarStyle: "hidden",
  transparent: true, hasShadow: true,
  webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
}
```

## IPC HANDLERS

| Channel                | Handler             | Pattern        |
| ---------------------- | ------------------- | -------------- |
| `window:set-height`    | clamped resize       | `ipcMain.on`    |
| `app:open-external`    | `shell.openExternal`| `typedHandle`   |
| `app:get-version`      | `app.getVersion`    | `typedHandle`   |
| `settings:get`         | `getSettings()`     | `typedHandle`   |
| `settings:set`         | `updateSettings()`  | `typedHandle`   |

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

- Left-click → context menu (Settings, About, Quit)
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

| Symbol                  | Location               | Role                                |
| ----------------------- | ---------------------- | ----------------------------------- |
| `createWindow`          | `index.ts:42`          | BrowserWindow factory (tray popover)|
`setupTray`             | `tray.ts:47`           | System tray init + about window
| `registerIpcHandlers`   | `ipc.ts:64`            | IPC registration                    |
| `typedHandle`           | `ipc.ts:54`            | Type-safe IPC wrapper               |
| `validateSender`        | `ipc.ts:28`            | Origin validation                  |
| `validateSenderUrl`     | `ipc.ts:33`            | file:// and dev origin check        |
| `startPreventingSleep`  | `power-saver.ts:9`     | Activate powerSaveBlocker           |
| `stopPreventingSleep`   | `power-saver.ts:21`    | Deactivate powerSaveBlocker        |
| `syncPreventSleep`      | `power-saver.ts:42`    | Sync with settings                  |
| `createSettingsWindow`  | `settings-window.ts:15`| Settings BrowserWindow singleton   |
| `loadSettings`          | `settings.ts:23`       | Load from userData/settings.json    |
| `updateSettings`        | `settings.ts:65`       | Persist partial settings            |
| `getSettings`           | `settings.ts:61`       | Get cached settings copy            |
| `getAutoLaunchStatus`   | `auto-launch.ts:7`     | Read macOS login item status        |
| `setAutoLaunch`         | `auto-launch.ts:21`    | Set macOS login item                |
`syncAutoLaunch`        | `auto-launch.ts:40`    | Sync if state differs               
| `showAbout`            | `tray.ts:21`           | Native About panel (singleton)     
| `closeSettingsWindow` | `settings-window.ts:85`| Close settings if open             
| `getPackageInfo`       | `utils/packageInfo.ts:38`| Cached package.json reader       
| `createLogger`         | `logger.ts:8`          | Structured logger factory          |

## STALE / CLEANUP

- `logger.ts`: `PREFIX_MAP` still contains `scheduler` and `calendar` scopes from pre-v1.0 refactor (only `main` and `ipc` are used)
- `utils/packageInfo.ts`: Fallback description mentions "Google Meet meetings" — stale from pre-v1.0 refactor
