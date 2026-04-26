# Shared Types — Cross-Process Contracts

Type definitions shared across main, preload, and renderer processes. Single source of truth for IPC channels and data models.

## FILES

| File       | Role                                  |
| ---------- | ------------------------------------- |
| `types.ts` | IPC channels, interfaces, type unions |

## IPC CHANNELS

```typescript
// types.ts:2-16
export const IPC_CHANNELS = {
  WINDOW_SET_HEIGHT: "window:set-height",
  APP_GET_VERSION: "app:get-version",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SESSION_START: "session:start",
  SESSION_CANCEL: "session:cancel",
  SESSION_STATUS: "session:status",
  SESSION_STATUS_UPDATE: "session:status-update", // push from main
  SETTINGS_CHANGED: "settings:changed", // push from main
  SETTINGS_OPEN: "settings:open",
  APP_QUIT: "app:quit",
  AUTO_UPDATER_CHECK: "auto-updater:check",
  AUTO_UPDATER_STATUS: "auto-updater:status", // push from main
} as const;
```

`IpcChannelMap` maps each channel to its `request` / `response` types. Note: `SESSION_STATUS` and `SESSION_STATUS_UPDATE` always return `SessionStatusResponse` — never `null`.

## DATA MODELS

### AppSettings

```typescript
export interface AppSettings {
  launchAtLogin: boolean; // macOS login item toggle
  preventSleep: boolean; // powerSaveBlocker toggle
  sessionDuration: number | null; // null = indefinite, number = minutes
  batteryThreshold: number; // auto-disable on battery below this %. 0 = disabled
  shortcut: string; // global shortcut accelerator string. Empty = use default
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
  launchAtLogin: false,
  preventSleep: false,
  sessionDuration: null,
  batteryThreshold: 0,
  shortcut: "",
};
```

> **Note**: When adding a new field to `AppSettings`, it MUST be added to the `VALIDATORS` dispatch table in `src/main/settings.ts` — otherwise validation silently drops the field.

### SessionStatusResponse

Discriminated union with three arms (discriminated by `isRunning` + `expiresAt`):

```typescript
// types.ts — used by SESSION_STATUS and SESSION_STATUS_UPDATE
export type SessionStatusResponse =
  | {
      // Not running
      isRunning: false;
      startedAt: null;
      expiresAt: null;
      remainingSeconds: null;
      durationMinutes: null;
    }
  | {
      // Timed session
      isRunning: true;
      startedAt: number;
      expiresAt: number;
      remainingSeconds: number;
      durationMinutes: number;
    }
  | {
      // Indefinite session
      isRunning: true;
      startedAt: number;
      expiresAt: null;
      remainingSeconds: null;
      durationMinutes: null;
    };
```

> **Narrowing**: Access fields only after narrowing — first `if (status.isRunning)` to discriminate running vs not, then `if (status.expiresAt !== null)` to discriminate timed vs indefinite.

### SessionStartResponse

Discriminated union with two arms (discriminated by `ok`):

```typescript
// types.ts — used by SESSION_START
export type SessionStartResponse =
  | {
      // Success
      ok: true;
      startedAt: number;
      durationMinutes: number | null;
      expiresAt: number | null;
    }
  | {
      // Failure
      ok: false;
      reason: "invalid-duration" | "rejected";
    };
```

> **Narrowing**: Always check `resp.ok` before accessing other fields. On `ok: false`, only `reason` is available.

### Session Cancel

```typescript
// Inline in IpcChannelMap — SESSION_CANCEL response
{ cancelled: boolean }
```

## TYPE UTILITIES

```typescript
export type IpcChannel = keyof IpcChannelMap;
export type IpcRequest<K extends IpcChannel> = IpcChannelMap[K]["request"];
export type IpcResponse<K extends IpcChannel> = IpcChannelMap[K]["response"];
```

## PUSH CHANNELS

```typescript
export const PUSH_CHANNELS = [
  IPC_CHANNELS.SETTINGS_CHANGED,
  IPC_CHANNELS.SESSION_STATUS_UPDATE,
  IPC_CHANNELS.AUTO_UPDATER_STATUS,
] as const;

export type PushChannel = (typeof PUSH_CHANNELS)[number];
```

`PUSH_CHANNELS` is the single source of truth for push-style channels. `PushChannel` is derived from it — no manual union maintenance.

## USAGE PATTERN

1. **Add new channel**: Add to `IPC_CHANNELS` object + `IpcChannelMap` (both request and response)
2. **Add new data type**: Define interface/type export
3. **Use in processes**: `import { ... } from '../shared/types.js'`

## IMPORT PATHS

| Process  | Import Path             |
| -------- | ----------------------- |
| main     | `../shared/types.js`    |
| preload  | `../shared/types.js`    |
| renderer | `../../shared/types.js` |

Note: `.js` extension required for ESM resolution even though source is `.ts`.
