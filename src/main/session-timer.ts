import type {
  AppSettings,
  IpcResponse,
  PushChannel,
  SessionStatusResponse,
} from "../shared/types.js";
import { DEFAULT_SETTINGS, IPC_CHANNELS } from "../shared/types.js";
import log from "electron-log";
import { MS_PER_MINUTE } from "./constants.js";

let onSessionStateChange: ((updates: Partial<AppSettings>) => void) | null = null;
let getSettingsRef: () => AppSettings = () => ({ ...DEFAULT_SETTINGS });

/**
 * Inject a callback that handles session state changes.
 * Called by coordinator on init. Replaces direct updateSettings() calls.
 */
export function setOnSessionStateChange(cb: (updates: Partial<AppSettings>) => void): void {
  onSessionStateChange = cb;
}

/**
 * Inject a settings reader for getStatus() consistency checks.
 * Called by coordinator on init. Replaces direct getSettings() import.
 */
export function setSettingsReader(getSettings: () => AppSettings): void {
  getSettingsRef = getSettings;
}

let broadcastFn: (<K extends PushChannel>(channel: K, data: IpcResponse<K>) => void) | null = null;

/**
 * Inject a broadcast function for session status updates.
 * Called by coordinator on init. Replaces direct broadcastToWindows() import.
 */
export function setBroadcastFn(
  fn: <K extends PushChannel>(channel: K, data: IpcResponse<K>) => void,
): void {
  broadcastFn = fn;
}

export interface SessionState {
  isRunning: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  durationMinutes: number | null;
}

/** Internal discriminated union — single source of truth for session state. */
type InternalSessionState =
  | { kind: "idle" }
  | { kind: "indefinite"; startedAt: number }
  | {
      kind: "timed";
      startedAt: number;
      expiresAt: number;
      durationMinutes: number;
      expiryTimer: ReturnType<typeof setTimeout>;
    };

let state: InternalSessionState = { kind: "idle" };

function clearTimedExpiryTimer(): void {
  if (state.kind === "timed") {
    clearTimeout(state.expiryTimer);
  }
}

/**
 * Reconcile in-memory session state against settings.
 *
 * The discriminated-union state is now authoritative — settings drift is no
 * longer possible because state transitions always notify the coordinator.
 * Kept exported as a no-op safety shim: if settings somehow report no session
 * but module state still holds one, clear it to match.
 */
export function reconcileSessionState(): void {
  if (state.kind !== "idle" && getSettingsRef().sessionDuration === null) {
    clearTimedExpiryTimer();
    state = { kind: "idle" };
  }
}

export function startSession(durationMinutes: number | null): SessionState {
  // Clear any existing session — discriminated union allows clean replacement.
  clearTimedExpiryTimer();

  if (durationMinutes === null) {
    // Indefinite session — no timer
    // performance.now() used for monotonic timing — immune to system clock changes
    const startedAt = performance.now();
    state = { kind: "indefinite", startedAt };
    onSessionStateChange?.({ sessionDuration: null, preventSleep: true });
    broadcastSessionUpdate();
    return {
      isRunning: true,
      startedAt,
      expiresAt: null,
      durationMinutes: null,
    };
  }

  // Timed session
  // performance.now() used for monotonic timing — immune to system clock changes
  const startedAt = performance.now();
  const expiresAt = startedAt + durationMinutes * MS_PER_MINUTE;

  const expiryTimer = setTimeout(() => {
    try {
      state = { kind: "idle" };
      // Session expired — coordinator will sync power-saver via settings change
      onSessionStateChange?.({ sessionDuration: null, preventSleep: false });
      broadcastSessionUpdate();
    } catch (err) {
      log.error("[session-timer] Error in session expiry callback:", err);
    }
  }, durationMinutes * MS_PER_MINUTE);
  // Don't pin the event loop — node timer ref guard for tests/cleanup safety
  if (typeof expiryTimer === "object" && expiryTimer !== null && "unref" in expiryTimer) {
    (expiryTimer as { unref: () => void }).unref();
  }

  state = { kind: "timed", startedAt, expiresAt, durationMinutes, expiryTimer };

  onSessionStateChange?.({ sessionDuration: durationMinutes, preventSleep: true });
  broadcastSessionUpdate();

  return {
    isRunning: true,
    startedAt,
    expiresAt,
    durationMinutes,
  };
}

export function cancelSession(): SessionState {
  clearTimedExpiryTimer();
  state = { kind: "idle" };
  // Coordinator will sync power-saver via settings change
  onSessionStateChange?.({ sessionDuration: null, preventSleep: false });
  broadcastSessionUpdate();
  return {
    isRunning: false,
    startedAt: null,
    expiresAt: null,
    durationMinutes: null,
  };
}

/**
 * Pure status reader — no side effects, never returns null.
 * Maps the internal discriminated union to the public SessionStatusResponse shape.
 */
export function getStatus(): SessionStatusResponse {
  if (state.kind === "idle") {
    return {
      isRunning: false,
      startedAt: null,
      expiresAt: null,
      remainingSeconds: null,
      durationMinutes: null,
    };
  }

  if (state.kind === "indefinite") {
    return {
      isRunning: true,
      startedAt: state.startedAt,
      expiresAt: null,
      remainingSeconds: null,
      durationMinutes: null,
    };
  }

  // Timed session — compute remaining from monotonic clock
  const remainingMs = Math.max(0, state.expiresAt - performance.now());
  const remainingSeconds = Math.floor(remainingMs / 1000);
  return {
    isRunning: true,
    startedAt: state.startedAt,
    expiresAt: state.expiresAt,
    remainingSeconds,
    durationMinutes: state.durationMinutes,
  };
}

export function cleanup(): void {
  clearTimedExpiryTimer();
  state = { kind: "idle" };
}

/** Compute and broadcast current session status to all renderer windows. Never broadcasts null. */
export function broadcastSessionUpdate(): void {
  broadcastFn?.(IPC_CHANNELS.SESSION_STATUS_UPDATE, getStatus());
}
