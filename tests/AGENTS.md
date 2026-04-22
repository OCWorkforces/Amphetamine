# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts                # Global Electron API mocks (BrowserWindow, app, ipcMain, Tray, Menu)
├── main/
│   ├── index.test.ts            # createWindow config, error handlers
│   ├── ipc.test.ts              # validateSender, ALLOWED_ORIGINS
│   ├── ipc-handlers.test.ts     # All 13 IPC channel handlers
│   ├── coordinator.test.ts      # Coordinator init/cleanup/settings sync (delegation to extracted modules)
│   ├── sleep-prevention.test.ts # powerSaveBlocker start/stop/sync (12→18 tests)
│   ├── battery-monitor.test.ts  # Battery parsing, auto-stop, pmset (8→18 tests)
│   ├── auto-launch.test.ts      # macOS login item management (13 tests)
│   ├── shortcut.test.ts         # Global shortcut registration + toggle
│   ├── settings.test.ts         # File I/O, async persistence, defaults, cache
│   ├── session-timer.test.ts    # Session start/cancel/expiry/broadcast (16→23 tests)
│   ├── settings-window.test.ts  # Settings window singleton
│   ├── settings-window-edge.test.ts # Edge cases
│   ├── tray.test.ts             # Tray icon, context menu, theme (3→20 tests)
│   ├── auto-updater.test.ts     # Auto-updater security, events, IPC (11→30 tests)
│   ├── packageInfo.test.ts      # Cached package.json reader
│   └── preload.test.ts          # Preload context bridge API
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

### TypeScript Checking

`tsconfig.tests.json` extends base tsconfig with `rootDir: "."`, includes `tests/**/*`, relaxes `noUnusedLocals` and `noUnusedParameters`. Run via `bun run typecheck:tests`.
```

## TEST COUNTS (280 total)

### Main Process (242 tests, 18 files)

| File                           | Tests | Focus                                          |
| ------------------------------ | ----- | ---------------------------------------------- |
| `auto-updater.test.ts`         | 30    | Security: semver/URL validation, events, IPC   |
| `tray.test.ts`                 | 20    | Menu, icon, theme, settings sync, about panel  |
| `session-timer.test.ts`        | 23    | Lifecycle, concurrent starts, edge cases       |
| `sleep-prevention.test.ts`     | 18    | start/stop/sync, idempotency, restart cycle    |
| `battery-monitor.test.ts`      | 18    | pmset parsing, auto-stop, threshold boundaries |
| `ipc-handlers.test.ts`         | 19    | All 13 IPC channel handler registrations       |
| `auto-launch.test.ts`          | 13    | Login item: get/set/sync, error handling       |
| `settings-window.test.ts`      | 9     | Singleton: create/focus/close/destroy          |
| `settings.test.ts`             | 10    | File I/O, validation, defaults, cache          |
| `coordinator.test.ts`          | 8     | Coordinator: init, cleanup, settings dispatch  |
| `shortcut.test.ts`             | 8     | Shortcut: registration, toggle, error handling |
| `index.test.ts`                | 7     | createWindow: config, sandbox, preload         |
| `settings-window-edge.test.ts` | 6     | Ready-to-show, constraints, close behavior     |
| `ipc.test.ts`                  | ~5    | validateSender, allowed origins                |
| `packageInfo.test.ts`          | ~5    | Cached package.json reader                     |
| `preload.test.ts`              | ~5    | Context bridge API exposure                    |

### Renderer Process (38 tests, 3 files)

| File                 | Tests | Focus                                  |
| -------------------- | ----- | -------------------------------------- |
| `index.test.ts`      | 20    | Session display, push, countdown, blur |
| `settings.test.ts`   | 18    | Form, toggle/select, save indicator    |
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
  app: { getVersion: vi.fn().mockResolvedValue("1.0.0") },
  quit: vi.fn(),  // top-level, NOT under app namespace
  settings: { get: vi.fn(), set: vi.fn(), open: vi.fn() },
  session: { start: vi.fn(), cancel: vi.fn(), getStatus: vi.fn() },
  onSettingsChanged: vi.fn(() => vi.fn()),
  onSessionStatusUpdate: vi.fn(() => vi.fn()),
  autoUpdater: { checkForUpdates: vi.fn(), onStatus: vi.fn(() => vi.fn()) },
};
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

`tests/setup.main.ts` defines a typed `MockElectronAPI` interface covering all Electron API surfaces used in tests. All `vi.fn()` calls use explicit generic parameters (e.g. `vi.fn<() => number>()`). The setup file exports typed mock instances for use across test files.

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
bun run test             # Run all tests once
bun run test:watch      # Watch mode
bun run test:coverage   # With v8 coverage
bun run typecheck:tests # TypeScript check for tests (tsconfig.tests.json)
```
