# Shared Types — Cross-Process Contracts

Type definitions shared across main, preload, and renderer processes. Single source of truth for IPC channels and data models. Zero dependencies.

## Files

| File | Role |
|------|------|
| `types.ts` | IPC channels, interfaces, discriminated unions, branded types |
| `settings-validators.ts` | Pure predicates + `VALIDATORS` dispatch table — reusable across processes |

## IPC Channels

15 channels total. 5 are one-way push channels (main-to-renderer).

| Channel | Direction | Request | Response |
|---------|-----------|---------|----------|
| `WINDOW_SET_HEIGHT` | req/res | `number` | `void` |
| `WINDOW_HIDE` | push | — | — |
| `APP_GET_VERSION` | req/res | `void` | `string` |
| `SETTINGS_GET` | req/res | `void` | `AppSettings` |
| `SETTINGS_SET` | req/res | `Partial<AppSettings>` | `{ settings, rejectedKeys }` |
| `SESSION_START` | req/res | `{ durationMinutes }` | `SessionStartResponse` |
| `SESSION_CANCEL` | req/res | `undefined` | `{ cancelled }` |
| `SESSION_STATUS` | req/res | `undefined` | `SessionStatusResponse` |
| `SESSION_STATUS_UPDATE` | push | — | `SessionStatusResponse` |
| `SETTINGS_CHANGED` | push | — | `AppSettings` |
| `SETTINGS_OPEN` | req/res | `undefined` | `void` |
| `APP_QUIT` | req/res | `undefined` | `void` |
| `AUTO_UPDATER_CHECK` | req/res | `undefined` | `{ version, releaseDate } \| null` |
| `AUTO_UPDATER_STATUS` | push | — | `AutoUpdaterStatus` |
| `SHORTCUT_REGISTRATION_FAILED` | push | — | `{ accelerator }` |

Push channels: `WINDOW_HIDE`, `SESSION_STATUS_UPDATE`, `SETTINGS_CHANGED`, `AUTO_UPDATER_STATUS`, `SHORTCUT_REGISTRATION_FAILED`.

## Data Models

### AppSettings

```typescript
interface AppSettings {
  launchAtLogin: boolean;        // macOS login item toggle
  preventSleep: boolean;         // powerSaveBlocker enable/disable (user intent)
  sessionDuration: number | null; // null = indefinite, number = minutes
  batteryThreshold: number;      // auto-disable on battery below this %. 0 = disabled
  shortcut: string;              // global shortcut accelerator string. Empty = use default
}
```

`DEFAULT_SETTINGS` is defined in `types.ts` and is `Readonly<AppSettings>` — always clone via spread.

### SessionStatusResponse (3-arm discriminated union)

- **Not running:** `isRunning: false`, all fields `null`
- **Timed session:** `isRunning: true`, all fields populated (`expiresAt`, `remainingSeconds`, `durationMinutes`)
- **Indefinite session:** `isRunning: true`, `startedAt` only, rest `null`

### SessionStartResponse (ok/fail discriminated union)

- **Ok:** `{ ok: true, startedAt, durationMinutes, expiresAt }`
- **Fail:** `{ ok: false, reason: "invalid-duration" | "rejected" | "Duration cannot exceed 24 hours" }`

### AutoUpdaterStatus (5-arm discriminated union)

- `checking`
- `available` + `UpdateMeta`
- `not-available` + `UpdateMeta`
- `downloaded` + `UpdateMeta`
- `downloading` + progress info
- `check-error` | `download-error` | `error` + error `category`

### PerfTimestamp (Branded type)

`number & { readonly __brand: unique symbol }` — compile-time branding for `performance.now()` values. Use `asPerf(n)` to cast, never raw `as PerfTimestamp`.

### Validation

`IPC_CHANNELS`, `PUSH_CHANNELS`, `IpcChannelMap`, `AppSettings`, and `DEFAULT_SETTINGS` all live in `types.ts`.

`settings-validators.ts` uses a `VALIDATORS` dispatch table — one entry per `AppSettings` key. Adding a new settings field requires adding a validator entry. `validateRawSettings()` is the only allowed inline per-field validator because disk JSON starts as `Record<string, unknown>`.
