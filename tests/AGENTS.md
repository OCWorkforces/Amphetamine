# Tests — Vitest Workspace

Two-project Vitest workspace for Electron app testing. Main process uses Node env with mocks; renderer uses jsdom for DOM tests.

## Structure

```
tests/
├── setup.main.ts                # Global Electron API mocks (BrowserWindow, app, ipcMain, Tray, Menu)
├── main/                        # 305 tests — Node env, mocked Electron
│   ├── index.test.ts            # createWindow config, error handlers
│   ├── ipc.test.ts              # validateSender, ALLOWED_ORIGINS, path-traversal, SESSION_START validation
│   ├── ipc-handlers.test.ts     # All 13 IPC channel handlers
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
└── renderer/                    # 46 tests — jsdom
    ├── index.test.ts            # Popover UI rendering, push subscription, session display
    ├── settings.test.ts         # Settings form rendering, toggle/select
    └── delegation.test.ts       # Event delegation on #app
```

## Fixture Data

Located under `tests/fixtures/` when present. Mock settings files use the `settings.json` pattern matching the production path.

## Conventions

- **Mock restoration**: All `vi.hoisted()` mocks are restored via `vi.resetModules()` + dynamic re-import between tests
- **No real filesystem access**: All `fs` operations go through `vi.mock("node:fs/promises")`
- **Electron fully mocked**: `vi.mock("electron")` in `setup.main.ts` — no native calls in tests
- **Assert exhaustive**: Use `expect.assert(0)` / discriminated union checks where `assertNever` is used in source
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

- Main test count: ~305 | Renderer test count: ~46 | Total: ~391
- `setup.main.ts` is the single Electron mock entry point — do not add `vi.mock("electron")` in individual test files
- Coverage excludes `src/assets.d.ts`, `src/renderer/env.d.ts`, `src/renderer/css.d.ts` (type-only files)
