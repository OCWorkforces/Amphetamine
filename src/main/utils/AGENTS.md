# src/main/utils — Utility Modules

Two small, focused utilities used by main-process modules.

## broadcast.ts

### `broadcastToWindows<K extends PushChannel>(channel: K, data: IpcResponse<K>): void`

Generic, type-safe broadcast helper. Sends `data` to all open, non-destroyed `BrowserWindow` instances via `win.webContents.send()`.

**Type safety**: `channel` constrained to `PushChannel` (from `shared/types.js`). `data` type is inferred from `IpcResponse<K>` — wrong payload shape fails at compile time.

**Guard**: Iterates `BrowserWindow.getAllWindows()` and checks `win.isDestroyed()` before sending — safe to call at any time, including during teardown.

**Usage**: Called by coordinator and session-timer to push `SETTINGS_CHANGED`, `SESSION_STATUS_UPDATE`, and `auto-updater:status` to all renderer windows.

**Import pattern**: `import { broadcastToWindows } from "./utils/broadcast.js";`

---

## packageInfo.ts

### `getPackageInfo(): Readonly<PackageInfo>`

Returns cached `package.json` contents. Reads from `path.join(app.getAppPath(), "package.json")` on first call via `readFileSync`; subsequent calls return the cached value (module-level `let packageInfo: PackageInfo | null`). Returns `Object.freeze(packageInfo)` to prevent mutations.

**Throws** `Error("Invalid package.json shape")` if the parsed JSON fails the `isPackageInfo` runtime guard. This is treated as a build error, not a runtime-recoverable condition.

**Critical**: Uses `JSON.parse(pkgContent)` typed as `unknown`, then narrows via `isPackageInfo` predicate — no `as` cast. Type safety enforced at runtime.

### `PackageInfo` interface (exported)

```typescript
export interface PackageInfo {
  name: string;
  productName: string;
  version: string;
  description: string;
  repository: string;
  homepage: string;
  author: string;
  license?: string;
  main?: string;
  [key: string]: unknown; // Allow access to other fields
}
```

### `isPackageInfo(value: unknown): value is PackageInfo` (internal, NOT exported)

Validates every required field's type (`name`, `productName`, `version` must be non-empty strings; `description`, `repository`, `homepage`, `author` must be strings). Optional fields (`license`, `main`) validated only when present. Returns `false` on any mismatch — caller throws.

### Anti-Patterns

- Never use `JSON.parse(...) as PackageInfo` — use the `isPackageInfo` guard pattern
- Never call `getPackageInfo()` before `app.isReady()` — depends on `app.getAppPath()`
- Never export `isPackageInfo` — it is internal to the module
- Never mutate the returned object — it is `Object.freeze`d and typed `Readonly<PackageInfo>`
