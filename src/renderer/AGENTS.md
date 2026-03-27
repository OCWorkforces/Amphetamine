# Renderer Process — UI Layer

Electron renderer (web context). Vanilla TypeScript UI with native macOS popover aesthetic. No framework.

## FILES

| File                  | Role                                          |
| --------------------- | --------------------------------------------- |
| `index.ts`            | Main popover UI (session status + timer)      |
| `index.html`          | CSP-protected HTML template                   |
| `env.d.ts`            | TypeScript declarations for `window.api`      |
| `css.d.ts`            | CSS module declarations                       |
| `styles/main.css`     | Native macOS styling, dark mode support       |
| `settings/index.ts`   | Settings form logic, toggle + dropdown        |
| `settings/index.html` | Settings HTML template                        |
| `settings/styles.css` | Settings-specific styles (toggles + dropdown) |

## MAIN POPOVER UI

Interactive session status display. Shows prevent-sleep state, session timer countdown, Settings button, and Quit button.

- Renders on `DOMContentLoaded`, loads settings + session status
- Session polling: 1-second interval when session is active, stops when idle
- `shouldPollSession()` — returns true only when popover visible + preventSleep on
- Timer formatting: `formatTimerLabel()` handles hours/minutes/seconds display
- Binds click events via `addEventListener` per button (settings + quit)
- Resizes window via `window.api.window.setHeight()` after render
- Hides popover on visibility change (document hidden) and beforeunload
- Popover visibility tracked via `isPopoverVisible` flag + `visible` CSS class

## SETTINGS WINDOW

Separate renderer entry at `settings/`. Three controls: Launch at Login (toggle), Prevent Sleep (toggle), Activate For (dropdown).

- Uses native window chrome (`titleBarStyle: "hiddenInset"`)
- Shows in Dock when open (tray-only app otherwise)
- Singleton BrowserWindow (focus if already open)
- Auto-saves on change with "✓ Saved" indicator (1.5s fade)
- `isSaving` guard prevents concurrent saves
- Per-indicator save timers (Map<string, timeout>) for independent fade timing
- Dropdown options: Indefinitely, 15min, 30min, 1h, 2h, 4h
- Dropdown change starts session AND sets `preventSleep: true`
- `session.start(duration)` called from dropdown, not from popover

## RENDERING PATTERN

- No virtual DOM — direct `innerHTML` assignment
- Popover uses individual `addEventListener` per button
- Settings uses individual `addEventListener` per toggle/dropdown
- `render()` function rebuilds entire DOM on each call
- `resizeToContent()` measures `#app` height and sets window height

## API ACCESS

```typescript
// Shared across both renderer entries
window.api.window.setHeight(height); // → void (fire-and-forget)
window.api.app.getVersion(); // → Promise<string>
window.api.app.quit(); // → Promise<void>
window.api.settings.get(); // → Promise<AppSettings>
window.api.settings.set(partial); // → Promise<AppSettings>
window.api.settings.open(); // → Promise<void>
window.api.session.start(durationMinutes); // → Promise<SessionStartResponse>
window.api.session.cancel(); // → Promise<{ cancelled: boolean }>
window.api.session.getStatus(); // → Promise<SessionStatusResponse | null>
window.api.onSettingsChanged(callback); // → () => void (unsubscribe)
window.api.autoUpdater.checkForUpdates(); // → Promise<...>
window.api.autoUpdater.onStatus(callback); // → () => void (unsubscribe)
```

## CSS CONVENTIONS

- CSS variables in `:root` for theming
- Dark mode: `@media (prefers-color-scheme: dark)`
- Native fonts: `-apple-system, BlinkMacSystemFont, 'SF Pro Text'`
- Backdrop blur: `blur(20px) saturate(180%)`
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables transitions

## KEY CLASSES

| Class                | Use                               |
| -------------------- | --------------------------------- |
| `.popover`           | Main popover container            |
| `.popover-header`    | App title + version               |
| `.popover-status`    | Status indicator section          |
| `.status-dot`        | Green/gray status indicator dot   |
| `.popover-timer`     | Session countdown display         |
| `.popover-footer`    | Settings + Quit buttons           |
| `.popover-divider`   | Horizontal divider                |
| `.settings-titlebar` | Settings window title bar         |
| `.settings-hero`     | App icon + name + description     |
| `.setting-row`       | Control row container             |
| `.setting-label`     | Control label text                |
| `.toggle-switch`     | iOS-style toggle switch wrapper   |
| `.toggle-track`      | Toggle track element              |
| `.toggle-thumb`      | Toggle thumb (sliding circle)     |
| `.setting-select`    | Duration dropdown select          |
| `.save-indicator`    | "✓ Saved" text (fades after 1.5s) |
| `.settings-footer`   | Copyright footer                  |

## SECURITY

- CSP in `index.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`
- Identical CSP in `settings/index.html`
- Settings error messages set via `textContent` (prevents XSS)

## TESTS

**Location**: `tests/renderer/*.test.ts`

| File                 | Focus                                |
| -------------------- | ------------------------------------ |
| `delegation.test.ts` | Event delegation on `#app` (3 tests) |
