# Preload — Context Bridge (Sandboxed)

Electron preload script in sandboxed renderer context. Exposes a typed IPC API to the renderer via `contextBridge.exposeInMainWorld`. **Security-critical boundary** — no Node.js APIs are exposed to the renderer.

## Files

| File | Role |
|------|------|
| `index.ts` | Context bridge: defines `window.api` object with all IPC methods |

## API Shape

`contextBridge.exposeInMainWorld("api", api)` exposes `window.api` with these namespaces:

| Namespace | Method | IPC Pattern |
|-----------|--------|-------------|
| `window.setHeight` | `setHeight(n)` | `ipcRenderer.send` (fire-and-forget) |
| `app.getVersion` | `getVersion()` | `ipcRenderer.invoke` |
| `app.quit` | `quit()` | `ipcRenderer.invoke` |
| `settings.get` | `get()` | `ipcRenderer.invoke` |
| `settings.set` | `set(partial)` | `ipcRenderer.invoke` |
| `settings.open` | `open()` | `ipcRenderer.invoke` |
| `session.start` | `start(durationMinutes)` | `ipcRenderer.invoke` |
| `session.cancel` | `cancel()` | `ipcRenderer.invoke` |
| `session.getStatus` | `getStatus()` | `ipcRenderer.invoke` |
| `onSettingsChanged` | `(callback) => unsubscribe()` | `ipcRenderer.on` + cleanup |
| `onWindowHide` | `(callback) => unsubscribe()` | `ipcRenderer.on` + cleanup |
| `onSessionStatusUpdate` | `(callback) => unsubscribe()` | `ipcRenderer.on` + cleanup |
| `onShortcutRegistrationFailed` | `(callback) => unsubscribe()` | `ipcRenderer.on` + cleanup |
| `autoUpdater.checkForUpdates` | `checkForUpdates()` | `ipcRenderer.invoke` |
| `autoUpdater.onStatus` | `(callback) => unsubscribe()` | `ipcRenderer.on` + cleanup |

## Push Subscription Pattern

Five push channels use the same pattern:

```typescript
onXxx: (callback: (data: T) => void) => {
  const listener = (_event: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(CHANNEL, listener);
  return () => ipcRenderer.removeListener(CHANNEL, listener);
};
```

Always return an unsubscribe function. Renderer is responsible for calling cleanup.

## Type Safety

The `Api` type is derived from the `api` object. Each method signature is parameterized by `IpcChannelMap` in `shared/types.ts` — never hand-write IPC request/response shapes.

`WiredChannels` + `_ExhaustivenessCheck` at the bottom of `index.ts` intentionally list every channel literal. Adding a channel in `shared/types.ts` without adding it here breaks the build.

## Conventions

- **No direct `require` or `import` of `electron`** in renderer code — all IPC goes through `window.api`
- **`contextBridge` is mandatory** — never disable `contextIsolation`
- **Return unsubscribe functions** from all `on*` methods
- **Typed events only** — no stringly channel names in renderer
- **Main validates senders** with `validateSender()`; preload still exposes only the narrow `window.api` surface

## Commands

Same as root: `bun run dev`, `bun run build`, `bun run test`
