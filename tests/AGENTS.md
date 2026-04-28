# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts                # Global Electron API mocks (BrowserWindow, app, ipcMain, Tray, Menu)
├── main/
│   ├── index.test.ts            # createWindow config, error handlers
│   ├── ipc.test.ts              # validateSender, ALLOWED_ORIGINS, path-traversal, SESSION_START validation
│   ├── ipc-handlers.test.ts     # All 13 IPC channel handlers
│   ├── coordinator.test.ts      # Coordinator init/cleanup/settings sync (delegation to extracted modules)
│   ├── sleep-prevention.test.ts # powerSaveBlocker start/stop/sync
│   ├── battery-monitor.test.ts  # Battery parsing, auto-stop, pmset
│   ├── auto-launch.test.ts      # macOS login item management
│   ├── shortcut.test.ts         # Global shortcut registration + toggle
│   ├── settings.test.ts         # File I/O, async persistence, defaults, cache
│   ├── settings.predicates.test.ts # isBoolean/isPositiveNumber/isClamped0to100/isNonEmptyString predicate unit tests
│   ├── session-timer.test.ts    # Session start/cancel/expiry/broadcast
│   ├── settings-window.test.ts  # Settings window singleton
│   ├── settings-window-edge.test.ts # Edge cases
│   ├── tray.test.ts             # Tray icon, context menu, theme
│   ├── auto-updater.test.ts     # Auto-updater security, events, IPC
│   ├── packageInfo.test.ts      # isPackageInfo runtime guard + cached package.json reader
│   ├── constants.test.ts        # Extracted constants (window dims, timeouts, colors)
│   ├── broadcast.test.ts        # broadcastToWindows<T>() utility
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

## TEST COUNTS (350 total, 22 files)

### Main Process (304 tests, 19 files)

| File                              | Tests | Focus                                          |
| --------------------------------- | ----- | ---------------------------------------------- |
| `auto-updater.test.ts`            | 34    | Security: semver/URL validation, dedup by version (lastNotifiedVersion guard), exponential backoff, IPC   |
| `session-timer.test.ts`           | 30    | Lifecycle, event-driven broadcasts, `broadcastSessionUpdate`, discriminated union state, concurrent start guard |
| `ipc.test.ts`                     | 27    | validateSender, path-traversal injection, APP_QUIT, SESSION_START validation  |
| `tray.test.ts`                    | 22    | Menu, icon, theme, settings sync, about panel  |
| `sleep-prevention.test.ts`        | 21    | start/stop/sync, idempotency, powerSaveBlocker returns -1 handled             |
| `packageInfo.test.ts`             | 20    | isPackageInfo runtime guard + cached package.json reader                      |
| `coordinator.test.ts`             | 19    | Coordinator: init, cleanup, settings dispatch, error boundary                 |
| `battery-monitor.test.ts`         | 24    | pmset parsing (`parsePmsetOutput` pure fn), auto-stop, threshold boundaries, `isCheckingBattery` guard    |
| `constants.test.ts`               | 16    | Extracted constants: window dims, timeouts, colors, accelerators              |
| `preload.test.ts`                 | 15    | Context bridge API exposure, exhaustiveness                                   |
| `settings.test.ts`                | 14    | File I/O, validation, NaN/Infinity rejected, no-change dedup, concurrent saves|
| `ipc-handlers.test.ts`            | 12    | All 13 IPC channel handler registrations       |
| `settings.predicates.test.ts`     | 11    | isBoolean/isPositiveNumber/isClamped0to100/isNonEmptyString predicate units   |
| `auto-launch.test.ts`             | 9     | Login item: get/set/sync, error handling       |
| `shortcut.test.ts`                | 8     | Shortcut: registration, toggle, error handling |
| `settings-window.test.ts`         | 6     | Singleton: create/focus/close/destroy, fake timers                            |
| `settings-window-edge.test.ts`    | 6     | Ready-to-show, constraints, close behavior     |
| `index.test.ts`                   | 6     | createWindow: config, sandbox, preload         |
| `broadcast.test.ts`               | 4     | broadcastToWindows<T>() generic + isDestroyed guard                           |

### Renderer Process (46 tests, 3 files)

| File                 | Tests | Focus                                  |
| -------------------- | ----- | -------------------------------------- |
| `settings.test.ts`   | 23    | Form, toggle/select, save indicator, error resilience, partial failure paths  |
| `index.test.ts`      | 20    | Session display, push, countdown, blur |
| `delegation.test.ts` | 3     | Event delegation on `#app`             |
**Coverage config** (vitest.workspace.ts): `provider: "v8"`, `include: ["src/**/*.ts"]`, thresholds (`lines: 80`, `functions: 80`, `branches: 70`), reporters `["text", "html", "lcov"]`.

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

## SETTINGS FIXTURE PATTERN (CRITICAL)

`AppSettings` has no optional fields — all properties are required. Always spread `DEFAULT_SETTINGS` when constructing test fixtures:

```typescript
import { DEFAULT_SETTINGS } from "../../src/shared/types.js";

// CORRECT — spread defaults, override only what the test needs
const settings = { ...DEFAULT_SETTINGS, preventSleep: true };

// WRONG — partial object, TS error (missing required fields)
const settings = { preventSleep: true };
```

> `DEFAULT_SETTINGS` is `Readonly<AppSettings>` — NEVER mutate it. Always clone via spread. Mutating the frozen default leaks state across tests and will break at runtime.

## DISCRIMINATED UNION FIXTURES

### `SessionStatusResponse` — 3-arm discriminated union

Test fixtures MUST match exactly one arm. Mixing arms (e.g. `isRunning: false` with non-null `startedAt`) fails type narrowing.

```typescript
// Arm 1: not-running — all fields null + isRunning: false
const notRunning: SessionStatusResponse = {
  isRunning: false,
  startedAt: null,
  expiresAt: null,
  sessionDuration: null,
};

// Arm 2: timed — all fields number + isRunning: true
const timed: SessionStatusResponse = {
  isRunning: true,
  startedAt: 1000,
  expiresAt: 61000,
  sessionDuration: 60,
};

// Arm 3: indefinite — isRunning: true, startedAt: number, rest null
const indefinite: SessionStatusResponse = {
  isRunning: true,
  startedAt: 1000,
  expiresAt: null,
  sessionDuration: null,
};
```

### `SessionStartResponse` — ok/fail discriminated union

```typescript
// Success
const ok: SessionStartResponse = {
  ok: true,
  startedAt: 1000,
  durationMinutes: 60,
  expiresAt: 61000,
};

// Failure — reason is one of: "invalid-duration" | "rejected"
const fail: SessionStartResponse = { ok: false, reason: "invalid-duration" };
const rejected: SessionStartResponse = { ok: false, reason: "rejected" };
```

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
