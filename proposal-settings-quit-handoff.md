### Proposal 2: Flush Pending Settings Before Quit

#### Coding Prompt

Guarantee that unsent Settings changes reach the main process before quit destroys the warm-cached Settings renderer. Add a typed, settings-specific main-to-renderer flush request and renderer-to-main acknowledgement through the shared IPC and preload contract. `AppShell.cleanup()` must request and await the renderer drain before `flushSettingsWriteChain()`, then continue with tray, composition, and window teardown.

Keep normal saves debounced at 300 ms. When a flush request arrives, cancel the timer and drain pending and in-flight updates through `window.api.settings.set`. Acknowledge only after the live renderer settles. Use one 2,000 ms quit budget so a missing, destroyed, hung, or failed renderer cannot stall shutdown, and remove every temporary listener. Hidden warm-cache Settings windows must participate, while absent windows return immediately.

Authenticate the acknowledgement with `validateSender()` and the exact Settings `webContents`. Do not rely on asynchronous unload work, `executeJavaScript`, DOM events, sleeps, utility-dialog transport, or a second settings subscriber. Add focused renderer, preload, IPC, `WindowGraph`, `AppShell`, and settings-store tests for ordering, coalescing, failure handling, and deadline behavior.

#### How I Would Use This Codebase

I would use Amphetamine's Settings window as a warm, low-friction control panel where a user can change several options and quit immediately without losing the last edit. The same handoff would give future utility settings a clear persistence boundary without making every input write to disk synchronously.

#### Why This Is Challenging

The unsaved state sits behind a renderer timer, while main owns durable writes and process teardown. Quit has to coordinate two asynchronous queues across IPC without trusting unload or waiting forever. Sender validation, hidden-window behavior, late acknowledgements, save rejection, and last-write-wins merging mean a local `beforeunload` patch will not cover the full flow.

#### Evaluation Rubric

1. Normal edits remain debounced for 300 ms, while a flush request cancels the old timer and drains pending plus in-flight updates through the existing settings API. Newer partials preserve last-write-wins merging, no update is sent twice, save errors remain visible, and acknowledgement occurs only after the live renderer has settled.
2. The request and acknowledgement are typed consistently through `src/shared/types.ts`, `src/preload/index.ts`, renderer declarations, main IPC wiring, and the enforced public-channel budget. Main registers acknowledgement before sending, validates the top-frame origin with `validateSender()`, binds the response to the exact Settings `webContents`, and rejects wrong origins, child frames, stale responses, and other windows without reusing utility-dialog transport.
3. `AppShell.cleanup()` orders renderer handoff before `flushSettingsWriteChain()`, then tray cleanup, composition cleanup, and `destroyAllWindows()`, all within one 2,000 ms deadline. Hidden warm-cache windows participate, absent windows complete immediately, and timeout, destruction, failed persistence, or late acknowledgement cannot hang cleanup or leak listeners; repeated cleanup stays idempotent.
4. Focused tests cover `tests/renderer/settings.test.ts`, `tests/main/preload.test.ts`, `tests/main/ipc.test.ts`, `tests/main/ipc-handlers.test.ts`, `tests/main/app-shell.test.ts`, `tests/main/window-graph.test.ts`, and `tests/main/settings.test.ts`, including a flush at 299 ms and an unresponsive renderer. The change passes `bun run test -- tests/renderer/settings.test.ts tests/main/preload.test.ts tests/main/ipc.test.ts tests/main/ipc-handlers.test.ts tests/main/app-shell.test.ts tests/main/window-graph.test.ts tests/main/settings.test.ts`, `bun run typecheck`, `bun run typecheck:tests`, `bun run typecheck:sticky`, `bun run typecheck:layers`, `bun run lint`, `bun run build`, and `bun run test:coverage` with the configured 90% line, function, and branch thresholds.
