# Renderer Process - UI Layer

Electron renderer web context. Vanilla TypeScript only: main popover entry plus a separate settings-window entry under `settings/`.

## Files

| File | Role |
|------|------|
| `index.ts` | Popover render, status updates, timer display, Settings/Quit buttons |
| `index.html` | CSP-protected popover shell |
| `constants.ts` | Popover status and button strings |
| `benchmark-countdown.ts` | Renderer countdown timer counters for benchmark mode |
| `env.d.ts` | `Window.api` type derived from preload `Api` |
| `css.d.ts` | CSS module declarations |
| `styles/main.css` | Transparent popover styling, CSS variables, dark mode, reduced motion |
| `settings/` | Settings-window renderer; see `settings/AGENTS.md` |

## Popover Flow

- Runs on `DOMContentLoaded`.
- Loads `settings.get()`, `session.getStatus()`, and `app.getVersion()` through `window.api`.
- Calls `refreshSessionStatus()` before first render to avoid stale state flash.
- Subscribes to `onSessionStatusUpdate`, `onSettingsChanged`, `onWindowHide`, and shortcut failure pushes.
- Resizes the BrowserWindow through `window.api.window.setHeight()` after layout changes.

## Countdown Rules

- `updateSessionAnchors(status)` maps main-process remaining seconds into renderer `performance.now()` time.
- `computeRemainingSeconds()` derives countdown locally; no per-second IPC polling.
- `startCountdownTicker()` ticks every second only while needed and updates UI through `updateStatusUI()`.
- Benchmark counters install only when `window.api.benchmark.isEnabled()` returns true.

## DOM and Styling

- Cache DOM references after render; avoid repeated global queries in hot paths.
- Batch status DOM writes inside `requestAnimationFrame` and skip unchanged timer text.
- Keep popover width aligned with main constants (`MAIN_WINDOW_WIDTH` is currently 360px).
- Use CSS classes and variables only; no inline styles.
- Dark mode follows native theme via CSS/media behavior, not renderer-side theme branching.

## IPC Boundary

- Renderer never imports `electron` or Node APIs.
- All cross-process communication goes through `window.api`.
- Push subscriptions return unsubscribe functions; retain and call them in cleanup.
- Do not use DOM `CustomEvent` or `document.addEventListener` for IPC-like events.

## Anti-Patterns

- Never read `status.remainingSeconds` directly for countdown display after anchoring.
- Never mutate DOM outside the RAF batch used by `updateStatusUI()`.
- Never hardcode UI strings in renderer logic; use `constants.ts` or settings constants.
- Never duplicate settings-window rules here; keep them in `settings/AGENTS.md`.

## Commands

```bash
bun run test -- tests/renderer
bun run build:renderer
```
