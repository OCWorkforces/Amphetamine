# Renderer Process — UI Layer

Electron renderer (web context). Vanilla TypeScript UI with native macOS popover aesthetic. No framework.

## FILES

| File                  | Role                                          |
| --------------------- | --------------------------------------------- |
| `index.ts`            | Main popover UI (session status + timer)      |
| `index.html`          | CSP-protected HTML template                   |
| `env.d.ts`            | Window.api type (derived from preload Api export — 9 lines) |
| `css.d.ts`            | CSS module declarations                       |
| `styles/main.css`     | Native macOS styling, dark mode support       |
| `settings/index.ts`   | Settings form logic, toggle + dropdown        |
| `settings/index.html` | Settings HTML template                        |
| `settings/styles.css` | Settings-specific styles (toggles + dropdown) |

## MAIN POPOVER UI

Interactive session status display. Shows prevent-sleep state, session timer countdown, Settings button, and Quit button.

- Renders on `DOMContentLoaded`, loads settings + session status
- Session updates are push-based via `window.api.onSessionStatusUpdate` (no polling)
- `unsubscribeSessionStatus` variable holds the cleanup function for the push subscription
- DOM refs cached after first render: `statusDotEl`, `statusTextEl`, `timerTextEl`
- `updateStatusUI()` batches DOM writes inside `requestAnimationFrame`
- Timer formatting: `formatTimerLabel()` uses `performance.now()` for precision
- Init order: `refreshSessionStatus()` runs BEFORE `render(version)` to avoid flash of stale state
- Resizes window via `window.api.window.setHeight()` after render
- Popover visibility tracked via `isPopoverVisible` flag + `visible` CSS class

## SETTINGS WINDOW

Separate renderer entry at `settings/`. **Five controls**: Launch at Login (toggle), Prevent Sleep (toggle), Activate For (dropdown), Battery Threshold (number input, 0-100), Keyboard Shortcut (recorder).

- Uses native window chrome (`titleBarStyle: "hiddenInset"`)
- Shows in Dock when open (tray-only app otherwise)
- Singleton BrowserWindow (focus if already open)
- Auto-saves on change with "✓ Saved" indicator (1.5s fade). On save failure, shows inline error message without DOM re-render (preserves local state).
- `isSaving` guard prevents concurrent saves
- Per-indicator save timers (Map<string, timeout>) for independent fade timing
- `errorMessage` module var holds inline error text (set via `setErrorMessage()`)
- `isFocused()` guard prevents battery input sync from overwriting mid-edit
- Per-indicator save timers (Map<string, timeout>) for independent fade timing
- Dropdown options: Indefinitely, 15min, 30min, 1h, 2h, 4h
- Dropdown change starts session AND sets `preventSleep: true`
- Keyboard Shortcut: click-to-record button, keyboard capture via `keydown` (capture phase), `keyEventToAccelerator()` converts to Electron accelerator string, `formatAcceleratorForDisplay()` for display (e.g. ⌘⇧A), Escape cancels recording
- Battery Threshold: `<input type="number" min=0 max=100>` + `%` suffix label, validated before save

## RENDERING PATTERN

- No virtual DOM, direct `innerHTML` assignment
- DOM element refs (`statusDotEl`, `statusTextEl`, `timerTextEl`) cached after first `render()`, not re-queried on each update
- `updateStatusUI()` wraps DOM writes in `requestAnimationFrame` for batched updates
- `renderLoading()` shows 3-dot animation while `loadInitialData()` resolves (`isLoading` flag). `@media (prefers-reduced-motion)` disables animation.
- Session status arrives via push subscription, no polling
- Individual `addEventListener` per button/toggle/dropdown
- `render()` function rebuilds entire DOM on each call
- `resizeToContent()` measures `#app` height and sets window height
- Error state: `statusError` flag + `statusErrorEl` ref shows "Status unavailable" text on `refreshSessionStatus()` failure

- No virtual DOM, direct `innerHTML` assignment
- DOM element refs (`statusDotEl`, `statusTextEl`, `timerTextEl`) cached after first `render()`, not re-queried on each update
- `updateStatusUI()` wraps DOM writes in `requestAnimationFrame` for batched updates
- Session status arrives via push subscription, no polling
- Individual `addEventListener` per button/toggle/dropdown
- `render()` function rebuilds entire DOM on each call
- `resizeToContent()` measures `#app` height and sets window height

## API ACCESS

// Shared across both renderer entries
// env.d.ts derives Window.api type from preload's exported Api type
// Single source of truth — if preload changes, renderer type-check catches drift
window.api.window.setHeight(height); // → void (fire-and-forget)
window.api.app.getVersion(); // → Promise<string>
window.api.app.quit(); // → Promise<void>  (under app namespace)
window.api.settings.get(); // → Promise<AppSettings>
window.api.settings.set(partial); // → Promise<AppSettings>
window.api.settings.open(); // → Promise<void>
window.api.session.start(durationMinutes); // → Promise<SessionStartResponse>
window.api.session.cancel(); // → Promise<{ cancelled: boolean }>
window.api.session.getStatus(); // → Promise<SessionStatusResponse | null>
window.api.onSettingsChanged(callback); // → () => void (unsubscribe)
window.api.autoUpdater.checkForUpdates(); // → Promise<...>
window.api.autoUpdater.onStatus(callback); // → () => void (unsubscribe)
window.api.onSessionStatusUpdate(callback); // → () => void (unsubscribe)
```

## CSS CONVENTIONS

- CSS variables in `:root` for theming: `--bg`, `--surface`, `--border`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent: #007aff`, `--accent-hover`, `--danger`, `--success: #34c759`, `--radius`, `--shadow`
- Dark mode: `@media (prefers-color-scheme: dark)` redefines all variables
- Settings adds: `--surface-elevated`, `--border-subtle`, `--accent-bg`, `--success-bg`, `--toggle-shadow-on`, `--toggle-thumb-shadow`, `--toggle-thumb-shadow-active`, `--radius-sm`, `--shadow-sm`
- Native fonts: `-apple-system, BlinkMacSystemFont, 'SF Pro Text'`
- Backdrop blur: `blur(20px) saturate(180%)`
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables transitions and loading animation
- `.visually-hidden`: position:absolute, 1×1px, overflow:hidden (for accessible SVG icon labels)
- `:focus-visible` outlines on all interactive elements (`outline: 2px solid var(--accent); outline-offset: 2px`)

- CSS variables in `:root` for theming
- Dark mode: `@media (prefers-color-scheme: dark)`
- Native fonts: `-apple-system, BlinkMacSystemFont, 'SF Pro Text'`
- Backdrop blur: `blur(20px) saturate(180%)`
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables transitions

## SECURITY

- CSP in both HTML files: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`
- Settings error messages set via `textContent` (prevents XSS)

## TESTS

**Location**: `tests/renderer/*.test.ts`

| File                 | Focus                                  |
| -------------------- | -------------------------------------- |
| `index.test.ts`      | Popover UI rendering, session display  |
| `settings.test.ts`   | Settings form rendering, toggle/select |
| `delegation.test.ts` | Event delegation on `#app`             |
