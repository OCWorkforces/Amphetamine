# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## Structure

```
tests/
├── setup.main.ts                # Global Electron API mocks (BrowserWindow, app, ipcMain, Tray, Menu)
├── main/                        # 20 test files — Node env, mocked Electron
│   ├── index.test.ts            # createWindow config, error handlers
│   ├── ipc.test.ts              # validateSender, ALLOWED_ORIGINS, path-traversal, SESSION_START validation
│   ├── ipc-handlers.test.ts     # Typed IPC handler registration + deps
│   ├── coordinator.test.ts      # Coordinator init/cleanup/settings sync
│   ├── sleep-prevention.test.ts # powerSaveBlocker start/stop/sync
│   ├── battery-monitor.test.ts  # Battery parsing, auto-stop, pmset
│   ├── auto-launch.test.ts      # macOS login item management
│   ├── shortcut.test.ts         # Global shortcut registration + toggle
│   ├── global-shortcut.test.ts  # Global shortcut security, forbidden combos, state guards
│   ├── settings.test.ts         # File I/O, async persistence, defaults, cache
│   ├── settings.predicates.test.ts # isBoolean/isPositiveNumber/isClamped0to100/isNonEmptyString predicates
│   ├── session-timer.test.ts    # Session start/cancel/expiry/broadcast
│   ├── settings-window.test.ts  # Settings window singleton
│   ├── settings-window-edge.test.ts # Edge cases
│   ├── tray.test.ts             # Tray icon, context menu, theme
│   ├── auto-updater.test.ts     # Auto-updater security, events, IPC
│   ├── packageInfo.test.ts      # isPackageInfo runtime guard + cached package.json reader
│   ├── constants.test.ts        # Extracted constants (window dims, timeouts, colors)
│   ├── broadcast.test.ts        # broadcastToWindows<T>() utility
│   └── preload.test.ts          # Preload context bridge API
└── renderer/                    # 3 test files — jsdom
    ├── index.test.ts            # Popover UI rendering, push subscription, session display
    ├── settings.test.ts         # Settings form rendering, toggle/select
    └── delegation.test.ts       # Event delegation on #app
```

## Fixture Data

Located under `tests/fixtures/` when present. Mock settings files use the `settings.json` pattern matching the production path.

## Conventions

- **Mock restoration**: `vi.resetModules()` + dynamic re-import is used in main and renderer tests when module state matters
- **No real filesystem access**: All `fs` operations go through `vi.mock("node:fs/promises")` or local `fs` mocks
- **Electron mocked by default**: `setup.main.ts` provides the base mock; individual main tests may re-mock `electron` for narrower BrowserWindow/app shapes
- **Log mocking**: modules importing `electron-log` mock `default.info/warn/error/debug` locally
- **Assert exhaustive**: When source adds `assertNever` branches, cover impossible/default paths with explicit discriminated-union tests
- **Prefer `vi.advanceTimersByTimeAsync`** over real waits for setTimeout-based tests (session timer, auto-updater)
- **Test filenames** match source filenames exactly (e.g., `session-timer.test.ts` for `session-timer.ts`)

## Configuration

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

## Commands

```bash
bun run test             # Run all tests
bun run test:watch       # Watch mode
bun run test:coverage    # v8 coverage report
```

## Notes

- Test files: 20 main + 3 renderer (`*.test.ts`); total test count is ~391
- `setup.main.ts` is the baseline Electron mock; local `vi.mock("electron")` overrides are allowed when a test needs a tighter API surface
- Coverage excludes `src/assets.d.ts`, `src/renderer/env.d.ts`, `src/renderer/css.d.ts` (type-only files)
