# Scripts — Local Tooling

Developer-only Bun/Node scripts. No application runtime code imports from here. Keep scripts deterministic, macOS-aware, and explicit about generated outputs.

## Files

| File | Role |
|------|------|
| `dev.ts` | Starts rslib watch for main + preload, starts rsbuild dev server, waits for outputs and TCP port 5173, then launches Electron |
| `generate-app-icon.mjs` | Generates `build/icon.icns` and `src/assets/settings-hero-icon.png` via `sharp` + macOS `iconutil` |
| `generate-coffee-tray-icons.mjs` | Generates 8 tray PNGs for active/inactive × light/dark × 1x/2x |

## Dev Orchestration

`dev.ts` flow:

1. `bun x rslib build --watch -c rslib.config.ts` (`NODE_ENV=development`)
2. `bun x rslib build --watch -c rslib.config.preload.ts`
3. `bun x rsbuild dev --port 5173`
4. Wait for `lib/main/index.cjs` and `lib/preload/index.cjs` (30s max, 500ms poll)
5. TCP-connect to `localhost:5173` before launching Electron
6. Launch `bun x electron . --disable-gpu-sandbox --log-level=3` with `DEV_SERVER_URL=http://localhost:5173`
7. On Electron exit/SIGINT/SIGTERM, kill spawned children

## Conventions

- Use `#!/usr/bin/env bun` for TypeScript dev scripts.
- `Date.now()` is OK here for process wait timeouts; session timing rules apply only to app session logic.
- Use raw TCP readiness checks for rsbuild dev server — do not revert to fixed sleeps.
- Icon scripts use ESM `fileURLToPath(import.meta.url)` for `__dirname`.
- Generated icon assets are checked-in source/build resources; keep filenames stable.

## Anti-Patterns

- Never launch Electron before both CJS build outputs exist.
- Never replace TCP readiness with arbitrary timeout-only startup.
- Never add runtime app dependencies on files under `scripts/`.
- Never change tray icon filenames without updating `src/main/tray.ts` asset lookups.

## Commands

```bash
bun run dev
bun scripts/generate-app-icon.mjs
bun scripts/generate-coffee-tray-icons.mjs
```
