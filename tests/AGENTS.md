# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## STRUCTURE

```
tests/
├── setup.main.ts     # Electron API mocks
├── main/
│   ├── power-saver.test.ts  # powerSaveBlocker state machine
│   ├── settings.test.ts     # file I/O, validation, defaults
│   ├── tray.test.ts         # tray module, about window
│   └── ipc.test.ts          # validateSender, origin check
└── renderer/
    └── delegation.test.ts   # event delegation on #app
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
  },
  {
    name: "renderer",
    environment: "jsdom",
    include: ["tests/renderer/**/*.test.ts"],
  },
];
```

## MAIN PROCESS TESTS (32 tests)

**Mock Pattern**:

```typescript
vi.hoisted(() => { const mockX = vi.fn(); return { mockX }; });
vi.mock("electron", () => ({ shell, Notification, powerSaveBlocker, ... }));
// beforeEach: vi.resetModules() + vi.clearAllMocks() + re-apply mock defaults
// dynamic import: const mod = await import("../../src/main/foo.js");
```

| File                | Tests | Focus                                          |
| ------------------- | ----- | ---------------------------------------------- |
| power-saver.test.ts | 12    | powerSaveBlocker: start/stop/isPreventingSleep |
| settings.test.ts    | 9     | File I/O, validation, defaults, cache behavior |
| tray.test.ts        | 3     | Tray icon, context menu, about window          |
| ipc.test.ts         | 8     | validateSender, ALLOWED_ORIGINS                |

**Key Test Patterns**:

- `vi.hoisted()` + `vi.mock()` for Electron API mocking
- `vi.resetModules()` + `await import(...)` for fresh module state per test
- `vi.clearAllMocks()` in `beforeEach` with mock behavior re-applied after clear
- `as any` type assertion allowed in test mocks only

## RENDERER TESTS (3 tests)

| File               | Tests | Focus                    |
| ------------------ | ----- | ------------------------ |
| delegation.test.ts | 3     | Event delegation on #app |

## COMMANDS

```bash
bun run test          # Run all tests once
bun run test:watch    # Watch mode
bun run test:coverage # With v8 coverage
```

## SETUP FILE

Mocked Electron APIs in `tests/setup.main.ts`:

- `app`: getVersion, quit, dock, isPackaged, whenReady, on, getPath
- `BrowserWindow`: loadURL, show, hide, destroy, getBounds, setPosition, webContents, getAllWindows
- `ipcMain`: handle, on, off
- `Tray`: setToolTip, setTitle, on, getBounds, popUpContextMenu
- `Menu`, `screen`, `nativeImage`, `shell`, `dialog`, `nativeTheme`, `Notification`, `powerSaveBlocker`
