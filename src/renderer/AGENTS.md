# Renderer Process — UI Layer

Electron renderer (web context). Vanilla TypeScript UI with native macOS popover aesthetic. No framework. Two entry points: main popover and settings window.

## Files

| File | Role |
|------|------|
| `index.ts` | Main popover: session status display, timer countdown, Settings/Quit buttons |
| `index.html` | CSP-protected HTML template |
| `env.d.ts` | `Window.api` type (derived from preload Api export) |
| `css.d.ts` | CSS module declarations |
| `styles/main.css` | Native macOS styling, dark mode support |
| `settings/index.ts` | Settings form logic: 5 controls (toggles, dropdown, slider, input) |
| `settings/index.html` | Settings HTML template |
| `settings/styles.css` | Settings-specific styles (iOS-style toggles, dropdown) |
| `constants.ts` | Popover UI status strings |
| `settings/constants.ts` | Settings UI strings (shortcut placeholder, save indicator) |

## Main Popover UI

Interactive session status display. Shows prevent-sleep state, session timer countdown, Settings button, and Quit button.

- Renders on `DOMContentLoaded`, loads settings + session status
- Session updates are **push-based** via `window.api.onSessionStatusUpdate` (no polling)
- DOM refs cached after first render: `statusDotEl`, `statusTextEl`, `timerTextEl`
- `updateStatusUI()` batches DOM writes inside `requestAnimationFrame`
- Init order: `refreshSessionStatus()` runs BEFORE `render(version)` to avoid flash of stale state
- Resizes window via `window.api.window.setHeight()` after render

## Timing Architecture

- `sessionExpiresAtPerf: PerfTimestamp | null` — module-level anchor; stores `performance.now() + remainingMs` branded via `.AsType<PerfTimestamp>()`
- `updateSessionAnchors(status)` — maps main-process `expiresAt` (PerfTimestamp) to renderer clock via wall-clock delta, re-attaching brand at IPC boundary
- `computeRemainingSeconds()` — `Math.floor((sessionExpiresAtPerf - performance.now()) / 1000)` — purely renderer-side, no IPC round-trip
- `startCountdownTicker()` / `stopCountdownTicker()` — `setInterval`/`clearInterval` every 1000ms, fires `updateStatusUI()` only when anchor changes

## Settings Form

- 5 controls: launch-at-login toggle, prevent-sleep toggle, session duration dropdown, battery threshold slider, shortcut field
- Each control calls `window.api.settings.set({key: value})` immediately on change
- Listens for `window.api.onSettingsChanged` to sync cross-window updates
- `#app` uses event delegation — `click` and `change` events bubble to root

## Conventions

- **No DOM `CustomEvent`** — all cross-process communication via `window.api` push subscriptions
- **No `as EventListener`** casts — event handlers typed via `addEventListener` generics
- **Popover sizing**: `MAIN_WINDOW_WIDTH` (320px) constant; height set dynamically
- **Dark mode**: follows `nativeTheme.shouldUseDarkColors`; CSS variables swap automatically
- **UI strings**: all in `constants.ts` / `settings/constants.ts` — never hardcoded in logic
- **No inline styles** — all styling via CSS classes

## Anti-Patterns

- **Never** use `document.addEventListener` for IPC events — use `window.api.on*` subscriptions
- **Never** hardcode status strings — use constants from `constants.ts`
- **Never** read `sessionStatus.remainingSeconds` for countdown — use renderer-side `computeRemainingSeconds()`
- **Never** mutate DOM outside `requestAnimationFrame` batch
- **Never** import `electron` directly in renderer — go through `window.api`

## Commands

```bash
bun run dev        # Dev: rsbuild watches + Electron reloads
bun run build      # Build renderer → static assets
bun run test       # Vitest (jsdom env, 46 tests)
```