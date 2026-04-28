# Preload — Context Bridge (Sandboxed)

Electron preload script running in sandboxed renderer context. Exposes typed IPC API to renderer via `contextBridge.exposeInMainWorld`. **Security-critical boundary**.

## FILES

| File            | Role                                           |
| --------------- | ---------------------------------------------- |
| `index.ts`      | Context bridge API definition (144 lines)      |
| `tsconfig.json` | Node + DOM types, `nodenext` module resolution |

## CONTEXT BRIDGE API

`contextBridge.exposeInMainWorld("api", api)` exposes `window.api` to renderer with these namespaces:

| Namespace                     | Methods                  | IPC Pattern                             |
| ----------------------------- | ------------------------ | --------------------------------------- |
| `window.setHeight`            | `setHeight(n)`           | `ipcRenderer.send` (fire-and-forget)    |
| `app.getVersion`              | `getVersion()`           | `ipcRenderer.invoke` (request/response) |
| `app.quit`                    | `quit()`                 | `ipcRenderer.invoke`                    |
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
import type { IpcRendererEvent } from "electron";

onXxx: (callback: (data: T) => void) => {
  const listener = (_event: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(CHANNEL, listener);
  return () => ipcRenderer.removeListener(CHANNEL, listener); // cleanup
};
```

Always return unsubscribe function. Renderer is responsible for calling cleanup.

## TYPED INVOKE HELPER

All `invoke`-based methods route through a single type-safe wrapper:

```typescript
function invoke<K extends IpcChannel>(
  channel: K,
  ...args: IpcChannelMap[K]["request"] extends void | undefined
    ? []
    : [IpcChannelMap[K]["request"]]
): Promise<IpcChannelMap[K]["response"]> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcChannelMap[K]["response"]>;
}
```

- Channels whose request type is `void`/`undefined` accept **zero** args; all others require exactly one payload of the channel-specific request type.
- Conditional rest-tuple (`extends void | undefined ? [] : [...]`) enforces arity at compile time.
- The single `as Promise<...>` cast inside the helper is the **only** unsafe cast in this file — Electron's `ipcRenderer.invoke` returns `Promise<unknown>` and we narrow at the boundary.
- All previous per-call `undefined as IpcRequest<T>` casts (6 total) have been **removed**; call sites are now fully type-safe.

## EXHAUSTIVENESS CHECK

Compile-time guarantee that every `IpcChannel` is wired through `window.api`:

```typescript
type WiredChannels =
  | typeof IPC_CHANNELS.WINDOW_SET_HEIGHT
  | typeof IPC_CHANNELS.APP_GET_VERSION
  // ...all 13 channel literals
  | typeof IPC_CHANNELS.AUTO_UPDATER_STATUS;

type _UnwiredChannels = Exclude<IpcChannel, WiredChannels>;
type _ExhaustivenessCheck = [_UnwiredChannels] extends [never]
  ? true
  : ["unwired channels:", _UnwiredChannels];
const _check: _ExhaustivenessCheck = true; // fails compile if any channel is unwired
```

- `WiredChannels` is a union of all **13** wired channel literals — single source of truth for what the preload exposes.
- **Why manual union, not derived**: `IpcRequest<K>`/`IpcResponse<K>` evaluate eagerly, erasing channel literal types. A derived union (e.g. `keyof IpcChannelMap`) would collapse to `string`, defeating the exhaustiveness check. The manual union of `typeof IPC_CHANNELS.X` literals is intentional and must stay manual. NOTE: auto-derivation from `typeof api` is not feasible either — the channel literal `K` does not survive in the resolved structural type.
- `[_UnwiredChannels] extends [never]` tuple-wrap suppresses distributive conditionals over union members.
- If a new channel is added to `IPC_CHANNELS` but not to `WiredChannels`, `_check = true` fails to typecheck (assigned a tuple instead of `true`), breaking the build.

## TYPE SAFETY

All methods use `IpcRequest<K>` and `IpcResponse<K>` from `src/shared/types.ts`. Channel names from `IPC_CHANNELS` const. The `Api` type is exported (`export type Api = typeof api`) for renderer type checking. Renderer's `env.d.ts` derives `Window.api` from this export — single source of truth.

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
- **Never add a new IPC channel without adding it to the `WiredChannels` union** in `preload/index.ts` — `_ExhaustivenessCheck` will fail compile, but only if the union is updated
- **Never bypass `invoke<K>()` helper with raw `ipcRenderer.invoke`** — loses type safety; the boundary cast lives inside `invoke()` and nowhere else
