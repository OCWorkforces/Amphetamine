# src/renderer/settings — Settings Window UI

Settings window renderer (vanilla TS). Five controls, 300ms debounced save, onSettingsChanged subscription to stay in sync with other windows. Displayed in Dock when open.

## Module-Level State
- `settings: AppSettings` — local settings copy (optimistic mirror of main process state)
- `runningSessionDuration: number | null` — overrides `settings.sessionDuration` in UI when a session is running. Set from `getStatus().durationMinutes` in init. Cleared when user picks a new duration. Prevents `onSettingsChanged` push from resetting the dropdown to the stored duration.
- `saveTimer` — 300ms debounce handle
- `isSaving: boolean` — concurrent-save guard
- `saveIndicatorTimers: Map` — per-indicator auto-hide timers (1500ms)
- `lastValidBatteryThreshold: number` — last valid 0-100 value; reverts on invalid input
- `isRecordingShortcut: boolean` — capture mode flag
- `shortcutKeydownHandler` — capture-phase listener, cleared on `stopRecordingShortcut`

## Five Controls
| Control | Element ID | Save trigger | AppSettings field |
|---------|-----------|-------------|------------------|
| Launch at Login | `launch-at-login-toggle` | change | `launchAtLogin` |
| Prevent Sleep | `prevent-sleep-toggle` | change | `preventSleep` |
| Activate For | `session-duration-select` | change | `sessionDuration` + starts session |
| Battery Threshold | `battery-threshold-input` | change (validated) | `batteryThreshold` |
| Keyboard Shortcut | `shortcut-input` | key capture | `shortcut` |

## Key Functions
- `formatAcceleratorForDisplay(accelerator: string): string` — Electron tokens to display symbols (e.g. `CommandOrControl+Shift+A` → `⌘⇧A`)
- `keyEventToAccelerator(e: KeyboardEvent): string | null` — KeyboardEvent to accelerator; null if no non-modifier
- `buildSettingsForm(): string` — returns full form HTML
- `attachFormListeners(): void` — all control event handlers
- `render(): void` — renders form + attaches listeners
- `updateSettingsUI(s: AppSettings): void` — syncs DOM controls; preserves focused battery input
- `saveSettings(partial, indicatorId?): Promise` — 300ms debounced save
- `showSaveIndicator(id, text): void` — shows `SAVED_INDICATOR`, auto-hides 1500ms
- `startRecordingShortcut()` / `stopRecordingShortcut()` — shortcut capture mode
- `init(): Promise` — entry point

## Init Flow
```
DOMContentLoaded → init()
  → settings.get() + session.getStatus()
  → if running: runningSessionDuration = durationMinutes
  → render()
  → onSettingsChanged subscription
```

## onSettingsChanged Handler (settings sync fix)
```typescript
window.api.onSettingsChanged((newSettings) => {
  settings = newSettings;
  if (runningSessionDuration !== null) {
    settings = { ...settings, sessionDuration: runningSessionDuration };
  }
  updateSettingsUI(settings);
});
```
`runningSessionDuration` prevents the push from resetting the Activate For dropdown while a session is active.

## Constants (src/renderer/settings/constants.ts)
- `SHORTCUT_PLACEHOLDER = "Click to record"`
- `SHORTCUT_RECORDING = "Press keys…"`
- `SAVED_INDICATOR = "✓ Saved"`

## Anti-Patterns
- Never hardcode UI strings — import from `./constants.js`
- Never send only changed field to `settings.set` — send full settings object
- Never mutate `settings.sessionDuration` in `onSettingsChanged` without checking `runningSessionDuration`
- Activate For dropdown starts a session AND sets `preventSleep: true`
