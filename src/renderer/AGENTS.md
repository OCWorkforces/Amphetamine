# Renderer Process — UI Layer

Electron renderer (web context). Vanilla TypeScript UI with native macOS popover aesthetic. No framework.

## FILES

| File                  | Role                                         |
| --------------------- | -------------------------------------------- |
| `index.ts`            | Main popover UI (static status display)      |
| `index.html`          | CSP-protected HTML template                  |
| `env.d.ts`            | TypeScript declarations                      |
| `styles/main.css`     | Native macOS styling, dark mode support      |
| `settings/index.ts`   | Settings form logic, toggle handlers         |
| `settings/index.html` | Settings HTML template                      |
| `settings/styles.css` | Settings-specific styles (iOS-style toggles) |

## MAIN POPOVER UI

Static status display — "Amphetamine is running" with version number and description. No state machine, no refresh loop.
- Renders on `DOMContentLoaded`, measures content height, resizes window via `window.api.window.setHeight()`
- Silent fail on error — shell still renders

## SETTINGS WINDOW

Separate renderer entry at `settings/`. Two toggles: Launch at Login, Prevent Sleep.
- Uses native window chrome (`titleBarStyle: "hiddenInset"`)
- Shows in Dock when open (tray-only app otherwise)
- Singleton BrowserWindow (focus if already open)
- Auto-saves on toggle change with "✓ Saved" indicator (1.5s fade)
- `isSaving` guard prevents concurrent saves

## RENDERING PATTERN

- No virtual DOM — direct `innerHTML` assignment
- No event delegation needed (main popover has no interactive elements)
- Settings uses individual `addEventListener` per toggle

## API ACCESS

```typescript
window.api.window.setHeight(height);        // → void (ipcMain.on, fire-and-forget)
window.api.app.openExternal(url);          // → Promise<void>
window.api.app.getVersion();               // → Promise<string>
window.api.settings.get();                 // → Promise<AppSettings>
window.api.settings.set(partial);         // → Promise<AppSettings>
window.api.settings.onChanged(callback);  // → () => void (unsubscribe)
```

## CSS CONVENTIONS

- CSS variables in `:root` for theming
- Dark mode: `@media (prefers-color-scheme: dark)`
- Native fonts: `-apple-system, BlinkMacSystemFont, 'SF Pro Text'`
- Backdrop blur: `blur(20px) saturate(180%)`

## KEY CLASSES

| Class                  | Use                                |
| ---------------------- | ---------------------------------- |
| `.state-screen`        | Status display in popover           |
| `.state-icon`          | ⚡ icon                             |
| `.state-title`         | "Amphetamine is running"           |
| `.state-desc`          | Description text below title       |
| `.settings-titlebar`   | Settings window title bar           |
| `.settings-hero`       | App icon + name + description       |
| `.setting-row`         | Toggle row container                |
| `.toggle-switch`       | iOS-style toggle switch wrapper     |
| `.toggle-track`        | Toggle track element                |
| `.toggle-thumb`        | Toggle thumb (sliding circle)       |
| `.save-indicator`      | "✓ Saved" text (fades after 1.5s)  |
| `.settings-footer`     | Copyright footer                    |

## SECURITY

- CSP in `index.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`
- `escapeHtml()` available in `src/shared/utils/escape-html.ts` (not used in current UI since no user content rendered)

## TESTS

**Location**: `tests/renderer/*.test.ts`

| File                | Focus                                          |
| ------------------- | ---------------------------------------------- |
| `delegation.test.ts` | Event delegation on `#app` (4 tests)            |
| `escape-html.test.ts`| XSS protection (11 tests)                      |
