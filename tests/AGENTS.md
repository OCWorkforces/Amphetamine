# Tests - Vitest Workspace

Two Vitest projects: main-process tests in Node with mocked Electron, renderer tests in jsdom. Keep process-specific test rules in child docs.

## Structure

```text
tests/
  setup.main.ts        baseline Electron mock for main tests
  main/                20 Node-environment tests; see main/AGENTS.md
  renderer/            3 jsdom tests; see renderer/AGENTS.md
```

## Vitest Workspace

| Project | Environment | Includes | Coverage Include |
|---------|-------------|----------|------------------|
| `main` | `node` | `tests/main/**/*.test.ts` | `src/main/**/*.ts` |
| `renderer` | `jsdom` | `tests/renderer/**/*.test.ts` | `src/renderer/**/*.ts` |

- Coverage provider is v8.
- Root thresholds: lines 80, functions 80, branches 70.
- `passWithNoTests: true` is intentional for project filtering.
- `typecheck:tests` uses `tsconfig.tests.json`; it relaxes only unused locals/params.

## Shared Conventions

- Test filenames mirror source filenames where practical.
- Use `vi.resetModules()` plus dynamic import when module singleton state matters.
- Prefer `vi.advanceTimersByTimeAsync()` over real sleeps.
- Cover exhaustive/default branches when source uses discriminated unions or `assertNever`.
- Mock `electron-log` locally for modules that import it.
- Do not add real filesystem, real Electron, network, or OS side effects to unit tests.

## Commands

```bash
bun run test
bun run test -- tests/main
bun run test -- tests/renderer
bun run test:coverage
bun run typecheck:tests
```

## Notes

- Existing inventory: 20 main tests + 3 renderer tests; total count in docs is approximate.
- `tests/setup.main.ts` is the shared Electron mock surface; child tests may override it for narrower shapes.
- Coverage excludes type-only renderer/preload declaration files.
