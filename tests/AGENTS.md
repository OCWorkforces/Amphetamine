# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts              # Global Electron API mocks
├── main/
│   ├── index.test.ts          # createWindow config, error handlers
│   ├── ipc.test.ts            # validateSender, ALLOWED_ORIGINS
│   ├── ipc-handlers.test.ts   # All 9 IPC channel handlers
│   ├── power-saver.test.ts    # powerSaveBlocker state machine
│   ├── power-saver-edge.test.ts # Edge cases: idempotency, invalid IDs
│   ├── settings.test.ts       # File I/O, validation, defaults, cache
│   ├── session-timer.test.ts  # Session start/cancel/expiry with timers
│   ├── settings-window.test.ts # Settings window singleton
│   ├── tray.test.ts           # Tray icon, context menu, theme
│   └── auto-launch.test.ts    # macOS login item management
└── renderer/
    └── delegation.test.ts     # Event delegation on #app
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

## MAIN PROCESS TESTS (90 tests)

| File                       | Tests | Focus                                         |
| -------------------------- | ----- | --------------------------------------------- |
| `ipc-handlers.test.ts`     | 19    | All 9 IPC channel handler registrations       |
| `power-saver-edge.test.ts` | 18    | Edge cases: idempotency, invalid blocker IDs  |
| `session-timer.test.ts`    | 16    | Session lifecycle: start/cancel/expiry/timers |
| `auto-launch.test.ts`      | 13    | Login item: get/set/sync, error handling      |
| `power-saver.test.ts`      | 12    | Core: start/stop/isPreventingSleep/sync       |
| `settings.test.ts`         | 10    | File I/O, validation, defaults, cache         |
| `settings-window.test.ts`  | 9     | Singleton: create/focus/close/destroy         |
| `index.test.ts`            | 7     | createWindow: config, sandbox, preload        |
| `ipc.test.ts`              | 8     | validateSender: origins, rejection cases      |
| `tray.test.ts`             | 4     | setupTray: icon update, theme, settings       |

## RENDERER TESTS (3 tests)

| File                 | Tests | Focus                      |
| -------------------- | ----- | -------------------------- |
| `delegation.test.ts` | 3     | Event delegation on `#app` |

**Total: 93 tests across 11 files**

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

### Pattern 5: Mutable state closure for settings

```typescript
let settingsState = { launchAtLogin: false, preventSleep: false, sessionDuration: null };
mockGetSettings.mockImplementation(() => ({ ...settingsState }));
mockUpdateSettings.mockImplementation((partial) => {
  settingsState = { ...settingsState, ...partial };
  return { ...settingsState };
});
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

## COMMANDS

```bash
bun run test          # Run all tests once
bun run test:watch    # Watch mode
bun run test:coverage # With v8 coverage
```
