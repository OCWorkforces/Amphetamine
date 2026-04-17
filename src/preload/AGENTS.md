# Preload — Context Bridge (Sandboxed)

Electron preload script running in sandboxed renderer context. Exposes typed IPC API to renderer via `contextBridge.exposeInMainWorld`. **Security-critical boundary**.

## FILES

| File            | Role                                           |
| --------------- | ---------------------------------------------- |
| `index.ts`      | Context bridge API definition (103 lines)      |
| `tsconfig.json` | Node + DOM types, `nodenext` module resolution |

## CONTEXT BRIDGE API

`contextBridge.exposeInMainWorld("api", api)` exposes `window.api` to renderer with these namespaces:

| Namespace                     | Methods                  | IPC Pattern                             |
| ----------------------------- | ------------------------ | --------------------------------------- |
| `window.setHeight`            | `setHeight(n)`           | `ipcRenderer.send` (fire-and-forget)    |
| `app.getVersion`              | `getVersion()`           | `ipcRenderer.invoke` (request/response) |
| `quit`                        | `quit()`                 | `ipcRenderer.invoke`                    |
| `settings.get`                | `get()`                  | `ipcRenderer.invoke`                    |
| `settings.set`                | `set(partial)`           | `ipcRenderer.invoke`                    |
| `settings.open`               | `open()`                 | `ipcRenderer.invoke`                    |
| `session.start`               | `start(durationMinutes)` | `ipcRenderer.invoke`                    |
| `session.cancel`              | `cancel()`               | `ipcRenderer.invoke`                    |
| `session.getStatus`           | `getStatus()`            | `ipcRenderer.invoke`                    |
| `onSettingsChanged`           | Push subscription        | `ipcRenderer.on` + cleanup function     |
| `onSessionStatusUpdate`       | Push subscription        | `ipcRenderer.on` + cleanup function     |
| `autoUpdater.checkForUpdates` | `checkForUpdates()`      | `ipcRenderer.invoke`                    |
| `autoUpdater.onStatus`        | Push subscription        | `ipcRenderer.on` + cleanup function     |

## PUSH SUBSCRIPTIONS

Three push channels use the same pattern:

```typescript
onXxx: (callback: (data: T) => void) => {
  const listener = (_event: unknown, data: T) => callback(data);
  ipcRenderer.on(CHANNEL, listener);
  return () => ipcRenderer.removeListener(CHANNEL, listener); // cleanup
};
```

Always return unsubscribe function. Renderer is responsible for calling cleanup.

## TYPE SAFETY

All methods use `IpcRequest<K>` and `IpcResponse<K>` from `src/shared/types.ts`. Channel names from `IPC_CHANNELS` const. The `Api` type is exported for renderer type checking.

## BUILD CONFIG

- Target: `electron-preload` (rslib)
- Output: `lib/preload/index.cjs` (ESM source → CJS output)
- **CRITICAL**: `electron` must be external in preload build — never bundled
- tsconfig: `lib: ["ES2024", "DOM"]`, `types: ["node"]`, `moduleResolution: "nodenext"`

## ANTI-PATTERNS

- **NEVER bundle `electron` module** — must remain external (handled in `rslib.config.preload.ts:48`)
- Never access Node.js APIs directly — sandbox mode restricts to `ipcRenderer` and `contextBridge`
- Never expose raw `ipcRenderer` to renderer — always wrap through typed methods
- Import paths use `.js` extension: `"../shared/types.js"`
