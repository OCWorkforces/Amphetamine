# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts                # Global Electron API mocks
├── main/
│   ├── index.test.ts            # createWindow config, error handlers
│   ├── ipc.test.ts              # validateSender, ALLOWED_ORIGINS
│   ├── ipc-handlers.test.ts     # All 13 IPC channel handlers
│   ├── coordinator.test.ts      # Coordinator init/cleanup/settings sync
│   ├── power-saver.test.ts      # powerSaveBlocker state machine
│   ├── power-saver-edge.test.ts # Edge cases: idempotency, invalid IDs
│   ├── settings.test.ts         # File I/O, async persistence, defaults, cache
│   ├── session-timer.test.ts    # Session start/cancel/expiry/broadcast
│   ├── settings-window.test.ts  # Settings window singleton
│   ├── settings-window-edge.test.ts # Edge cases: ready-to-show, constraints, close
│   ├── tray.test.ts             # Tray icon, context menu, theme
│   ├── auto-launch.test.ts      # macOS login item management
│   ├── shortcut.test.ts         # Global shortcut registration + toggle
│   ├── auto-updater.test.ts     # Auto-updater init, events, IPC
│   ├── packageInfo.test.ts      # Cached package.json reader
│   └── preload.test.ts          # Preload context bridge API + onSessionStatusUpdate
└── renderer/
    ├── index.test.ts            # Popover UI rendering, push subscription, session display
    ├── settings.test.ts         # Settings form rendering, toggle/select
    └── delegation.test.ts       # Event delegation on #app
```

## CONFIGURATION

```typescript
// vitest.workspace.ts
projects: [
  {
    name: "main",
    environment: "node",
    include: ["tests/main/**/*.test.ts"],
    setupFiles: ["./tests/setup.main.ts"],
    coverage: { provider: "v8", include: ["src/main/**/*.ts"] },
  },
  {
    name: "renderer",
    environment: "jsdom",
    include: ["tests/renderer/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/renderer/**/*.ts"] },
  },
];
// passWithNoTests: true
```

## TEST COUNTS (189 total)

### Main Process (177 tests, 16 files)

| File                           | Tests | Focus                                          |
| ------------------------------ | ----- | ---------------------------------------------- |
| `ipc-handlers.test.ts`         | 19    | All 13 IPC channel handler registrations       |
| `power-saver-edge.test.ts`     | 18    | Edge cases: idempotency, invalid blocker IDs   |
| `session-timer.test.ts`        | 16    | Session lifecycle: start/cancel/expiry/timers  |
| `auto-launch.test.ts`          | 13    | Login item: get/set/sync, error handling       |
| `auto-updater.test.ts`         | 11    | Auto-updater: init, events, semver validation  |
| `power-saver.test.ts`          | 12    | Core: start/stop/isPreventingSleep/sync        |
| `settings.test.ts`             | 10    | File I/O, validation, defaults, cache          |
| `settings-window.test.ts`      | 9     | Singleton: create/focus/close/destroy          |
| `shortcut.test.ts`             | 8     | Shortcut: registration, toggle, error handling |
| `coordinator.test.ts`          | 8     | Coordinator: init, cleanup, settings dispatch  |
| `index.test.ts`                | 7     | createWindow: config, sandbox, preload         |
| `settings-window-edge.test.ts` | 6     | Ready-to-show, constraints, close behavior     |
| `tray.test.ts`                 | 4     | setupTray: icon update, theme, settings        |
| `packageInfo.test.ts`          | ~5    | Cached package.json reader                     |
| `preload.test.ts`              | ~5    | Context bridge API exposure                    |
| `ipc.test.ts`                  | ~5    | validateSender, allowed origins                |

### Renderer Process (12 tests, 3 files)

| File                 | Tests | Focus                                  |
| -------------------- | ----- | -------------------------------------- |
| `index.test.ts`      | ~6    | Popover UI rendering, session display  |
| `settings.test.ts`   | ~6    | Settings form rendering, toggle/select |
| `delegation.test.ts` | 3     | Event delegation on `#app`             |

## MOCK PATTERNS

### Pattern 1: `vi.hoisted()` + `vi.mock("electron", async (importOriginal) => ...)`

Preserve actual Electron exports while overriding specific ones:

```typescript
const { mockStart, mockStop, mockIsStarted } = vi.hoisted(() => ({ ... }));
vi.mock("electron", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, powerSaveBlocker: { start: mockStart, ... } };
});
```

### Pattern 2: `vi.mock("electron", () => ({ ... }))` — Direct mock

Full replacement when no preservation needed.

### Pattern 3: Internal module mocking

```typescript
vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
  onSettingsChanged: vi.fn(),
}));
```

### Pattern 4: electron-log mock

```typescript
vi.mock("electron-log", () => ({
  default: { error: mockLogError, info: mockLogInfo, warn: vi.fn() },
}));
```

### Pattern 5: electron-updater mock

```typescript
vi.mock("electron-updater", () => ({
  autoUpdater: {
    on: mockOn,
    checkForUpdates: mockCheckForUpdates,
    removeAllListeners: mockRemoveAllListeners,
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: false,
  },
}));
```

### Pattern 6: Mutable state closure for settings

```typescript
let settingsState = { launchAtLogin: false, preventSleep: false, sessionDuration: null };
mockGetSettings.mockImplementation(() => ({ ...settingsState }));
mockUpdateSettings.mockImplementation((partial) => {
  settingsState = { ...settingsState, ...partial };
  return { ...settingsState };
});
```

### Pattern 7: Async settings mock

`updateSettings` now returns a `Promise`. Mock implementations must return promises:

```typescript
mockUpdateSettings.mockImplementation(async (partial) => {
  settingsState = { ...settingsState, ...partial };
  return { ...settingsState };
});
```

> `updateSettings` is async. Mock implementations must return promises.
> `saveSettings` is also async. Tests using real fs I/O need `await`.

## BEFORE EACH PATTERN

All main process tests follow:

```typescript
beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  // Re-apply default mock return values after clearAllMocks
  mockStart.mockReturnValue(42);
  const mod = await import("../../src/main/module.js");
  // assign exported functions
});
```

Key: `vi.resetModules()` + dynamic `import()` for fresh module state per test.

## MOCK ISOLATION PITFALL

`vi.resetModules()` does NOT re-run `vi.mock()` factories. Mocked properties (like `app.isPackaged`) persist across `resetModules` calls. If a test mutates a hoisted mock property, it MUST restore the original value before the next `beforeEach`:

```typescript
// WRONG — pollutes subsequent tests
const { app } = await import("electron");
vi.mocked(app).isPackaged = false;

// CORRECT — restore after mutation
const { app } = await import("electron");
const original = app.isPackaged;
vi.mocked(app).isPackaged = false;
// ... test ...
vi.mocked(app).isPackaged = original;
vi.resetModules();
await import("../../src/main/module.js"); // re-import to restore
```

## RENDERER TEST PATTERN

Renderer tests mock `window.api` globally via `vi.stubGlobal()`:

```typescript
const mockApi = {
  window: { setHeight: vi.fn() },
  app: { getVersion: vi.fn().mockResolvedValue("1.0.0"), quit: vi.fn() },
  settings: { get: vi.fn(), set: vi.fn(), open: vi.fn() },
  session: { start: vi.fn(), cancel: vi.fn(), getStatus: vi.fn() },
  onSettingsChanged: vi.fn(() => vi.fn()),
  onSessionStatusUpdate: vi.fn(() => vi.fn()),
  autoUpdater: { checkForUpdates: vi.fn(), onStatus: vi.fn(() => vi.fn()) },
};

beforeEach(() => {
  vi.stubGlobal("api", mockApi);
  mockApi.session.getStatus.mockResolvedValue(null);
  document.body.innerHTML = '<div id="app"></div>';
});

Polling-based session tests are removed. The renderer now uses a push subscription via `onSessionStatusUpdate`. Init trigger requires `await vi.advanceTimersByTimeAsync(0)` for async settling after `DOMContentLoaded`.

## SETUP FILE

`tests/setup.main.ts` mocks full Electron API:

| Module             | Key Methods                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `app`              | getVersion, quit, dock.{hide,show}, whenReady, on, getPath, getAppPath                    |
| `BrowserWindow`    | loadURL, show, hide, destroy, getBounds, setPosition, on, webContents.send, getAllWindows |
| `ipcMain`          | handle, on, off                                                                           |
| `Tray`             | setToolTip, setTitle, on, getBounds, popUpContextMenu                                     |
| `Menu`             | buildFromTemplate                                                                         |
| `powerSaveBlocker` | start (→1), stop, isStarted (→true)                                                       |
| `screen`           | getDisplayNearestPoint                                                                    |
| `nativeImage`      | createFromPath, createEmpty                                                               |
| `nativeTheme`      | shouldUseDarkColors, on                                                                   |
| `shell`            | openExternal                                                                              |
| `dialog`           | showErrorBox, showMessageBox                                                              |
| `Notification`     | show                                                                                      |

> Renderer tests also need `onSessionStatusUpdate` mocked on `window.api`. The preload exposes this as a subscription callback that returns an unsubscribe function.

## COMMANDS

```bash
bun run test          # Run all tests once
bun run test:watch    # Watch mode
bun run test:coverage # With v8 coverage
```
