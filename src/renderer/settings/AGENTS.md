# Settings Renderer - Window UI

Separate Rsbuild renderer entry for the settings BrowserWindow. Vanilla TypeScript form logic, no framework, no direct Electron imports.

## Files

| File | Role |
|------|------|
| `index.ts` | Settings form render, event delegation, debounced saves, shortcut recording |
| `index.html` | CSP-protected settings window shell |
| `constants.ts` | Settings labels, shortcut placeholder, save indicator strings |
| `styles.css` | iOS/macOS-style controls, dropdowns, sliders, responsive layout |

## Form Flow

- Render into `#app` and use event delegation for click/change/input handling.
- Load settings through `window.api.settings.get()`; save through `window.api.settings.set(partial)`.
- Subscribe to `window.api.onSettingsChanged()` for cross-window synchronization.
- Keep active running session duration visible; settings pushes contain stored disk duration and must not overwrite live session display.

## Save Rules

- Saves are debounced.
- If a save is in flight, queue the latest snapshot and flush it after the current save resolves.
- Never drop user changes silently when multiple controls change quickly.
- Display save state with constants, not hardcoded text.

## Shortcut Recorder

- Recording state is local UI state; persisted value still goes through `settings.set({ shortcut })`.
- Respect shared shortcut validation rules for reserved Cmd aliases.
- Shortcut registration failures arrive via preload push and should not require DOM custom events.

## Styling

- Keep settings-specific styles in `styles.css`; do not move popover styles here.
- Preserve native macOS/iOS control feel and dark-mode compatibility.
- No inline styles from TypeScript.

## Anti-Patterns

- Never import Electron or Node APIs.
- Never attach per-control global listeners when `#app` event delegation covers the interaction.
- Never hardcode settings UI strings in `index.ts`.
- Never duplicate shared settings validation in renderer logic; rely on shared/main validation through IPC.
