# Shared Types — Cross-Process Contracts

Type definitions shared across main, preload, and renderer processes. Single source of truth for IPC channels and data models.

## FILES

| File       | Role                                  |
| ---------- | ------------------------------------- |
| `types.ts` | IPC channels, interfaces, type unions |

## IPC CHANNELS

```typescript
// types.ts:2-7
export const IPC_CHANNELS = {
  WINDOW_SET_HEIGHT: "window:set-height",
  APP_GET_VERSION: "app:get-version",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
} as const;
```

`IpcChannelMap` (types.ts:10) maps each channel to its `request` / `response` types.

## DATA MODELS

### AppSettings

```typescript
// types.ts:35-40
export interface AppSettings {
  launchAtLogin: boolean; // macOS login item toggle
  preventSleep: boolean; // powerSaveBlocker toggle
}

// types.ts:43-46
export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  preventSleep: false,
};
```

## TYPE UTILITIES

```typescript
// types.ts:30-32
export type IpcChannel = keyof IpcChannelMap;
export type IpcRequest<K extends IpcChannel> = IpcChannelMap[K]["request"];
export type IpcResponse<K extends IpcChannel> = IpcChannelMap[K]["response"];
```

## USAGE PATTERN

1. **Add new channel**: Add to `IPC_CHANNELS` object + `IpcChannelMap`
2. **Add new data type**: Define interface/type export
3. **Use in processes**: `import { ... } from '../shared/types.js'`

## IMPORT PATHS

| Process  | Import Path             |
| -------- | ----------------------- |
| main     | `../shared/types.js`    |
| preload  | `../shared/types.js`    |
| renderer | `../../shared/types.js` |

Note: `.js` extension required for ESM resolution even though source is `.ts`.
