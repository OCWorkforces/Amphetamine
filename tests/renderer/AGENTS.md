# Renderer Tests - jsdom UI

Renderer Vitest suites run in jsdom and assert DOM behavior around vanilla TypeScript entry points. They do not launch Electron.

## Files

| File | Role |
|------|------|
| `index.test.ts` | Popover render, status/timer display, push subscriptions, benchmark API mock |
| `settings.test.ts` | Settings form render, toggles/selects, debounced save behavior |
| `delegation.test.ts` | Event delegation on `#app` |

## Setup Pattern

- Build the DOM explicitly, usually `document.body.innerHTML = '<div id="app"></div>'`.
- Install `window.api` mock before importing renderer modules.
- Include `window.api.benchmark.isEnabled()` when importing popover code because countdown counters check it.
- Import the renderer entry after mocks, then dispatch `DOMContentLoaded`.
- Use fake timers for countdown ticks, debounced saves, RAF batches, and delayed indicators.

## Assertions

- Assert visible DOM output and user-event behavior, not private helper internals.
- Trigger events through DOM nodes so delegation paths are exercised.
- Verify push subscription callbacks and unsubscribe cleanup when behavior depends on them.
- For countdown tests, anchor behavior with mocked `performance.now()` or timer advancement; avoid real waits.

## Mocking Rules

- `window.api` should mirror preload shape closely enough for the entry under test.
- Settings tests mock `settings.get`, `settings.set`, `onSettingsChanged`, and shortcut failure callbacks as needed.
- Popover tests mock `session.getStatus`, `onSessionStatusUpdate`, `window.setHeight`, `app.getVersion`, `settings.open`, and `app.quit` as needed.

## Anti-Patterns

- Never import Electron, Node APIs, or main-process modules.
- Never call private renderer helpers by reaching into module internals.
- Never rely on jsdom layout measurements unless the test stubs them intentionally.
- Never leave global `window.api` or fake timers dirty between tests.
