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

`IpcChannelMap` (types.ts:35) maps each channel to its `request` / `response` types.

## DATA MODELS

### AppSettings

```typescript
// types.ts:110-121
export interface AppSettings {
  launchAtLogin: boolean; // macOS login item toggle
  preventSleep: boolean; // powerSaveBlocker toggle
  sessionDuration: number | null; // null = indefinite, number = minutes
  batteryThreshold: number; // auto-disable on battery below this %. 0 = disabled
  shortcut: string; // global shortcut accelerator string. Empty = use default
}

// types.ts:124-130
export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  preventSleep: false,
  sessionDuration: null,
  batteryThreshold: 0,
  shortcut: "",
};
```

### SessionStatusResponse

```typescript
// types.ts:19-25 — used by SESSION_STATUS and SESSION_STATUS_UPDATE
export interface SessionStatusResponse {
  isRunning: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  remainingSeconds: number | null;
  durationMinutes: number | null;
}
```

### SessionStartResponse

```typescript
// types.ts:28-32 — used by SESSION_START
export interface SessionStartResponse {
  startedAt: number;
  durationMinutes: number | null;
  expiresAt: number | null;
}
```

### Session Cancel

```typescript
// Inline in IpcChannelMap — SESSION_CANCEL response
{ cancelled: boolean }
```

## TYPE UTILITIES

```typescript
// types.ts:96-98
export type IpcChannel = keyof IpcChannelMap;
export type IpcRequest<K extends IpcChannel> = IpcChannelMap[K]["request"];
export type IpcResponse<K extends IpcChannel> = IpcChannelMap[K]["response"];
```

## PUSH CHANNELS

```typescript
// types.ts:101-107
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
