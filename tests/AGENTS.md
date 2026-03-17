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
    ├── delegation.test.ts  # event delegation on #app
    └── escape-html.test.ts  # XSS protection
```

## CONFIGURATION

```typescript
// vitest.workspace.ts
projects: [
  { name: "main", environment: "node", include: ["tests/main/**/*.test.ts"], setupFiles: ["./tests/setup.main.ts"] },
  { name: "renderer", environment: "jsdom", include: ["tests/renderer/**/*.test.ts"] },
];
```

## MAIN PROCESS TESTS (48 tests total)

**Mock Pattern**:

```typescript
vi.mock("electron", () => ({ shell, Notification, powerSaveBlocker, ... }));
vi.resetModules() + dynamic import for fresh module state
```

| File              | Focus                                          |
| ----------------- | ---------------------------------------------- |
| power-saver.test.ts| powerSaveBlocker: start/stop/isPreventingSleep   |
| settings.test.ts  | File I/O, validation, defaults, cache behavior   |
| tray.test.ts      | Tray icon, context menu, about window            |
| ipc.test.ts       | validateSender, ALLOWED_ORIGINS                  |

**Key Test Patterns**:

- `vi.hoisted()` + `vi.mock()` for Electron API mocking
- `vi.resetModules()` + `await import(...)` for fresh module state per test
- `vi.clearAllMocks()` in `beforeEach` with mock behavior re-applied after clear
- `as any` type assertion allowed in test mocks only (3 instances in tray.test.ts)

## RENDERER TESTS (15 tests)

| File                | Focus                    |
| ------------------- | ------------------------ |
| delegation.test.ts  | Event delegation on #app  |
| escape-html.test.ts | XSS protection           |

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
- `Menu`, `screen`, `nativeImage`
