import type { AppSettings, IpcResponse, PushChannel, SessionStatusResponse } from "../shared/types.js";
import { DEFAULT_SETTINGS, IPC_CHANNELS } from "../shared/types.js";
import log from "electron-log";
import { MS_PER_MINUTE, SESSION_BROADCAST_INTERVAL_MS } from "./constants.js";

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
export function setBroadcastFn(fn: <K extends PushChannel>(channel: K, data: IpcResponse<K>) => void): void {
  broadcastFn = fn;
}


export interface SessionState {
  isRunning: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  durationMinutes: number | null;
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let sessionBroadcastTimer: ReturnType<typeof setInterval> | null = null;
let sessionStartedAt: number | null = null;
let sessionExpiresAt: number | null = null;
let sessionDuration: number | null = null;
let isStarting = false;

function clearExpiryTimer(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}
/** Reset session state: notify coordinator and broadcast to renderers. */
function resetSessionState(preventSleep: boolean): void {
  isStarting = false;
  onSessionStateChange?.({ sessionDuration: null, preventSleep });
  broadcastSessionUpdate();
}

/**
 * Reconcile in-memory session state against settings.
 * If settings say no session is active but module state still holds one,
 * clear the in-memory state. Called by coordinator on settings change.
 */
export function reconcileSessionState(): void {
  if (sessionStartedAt !== null && getSettingsRef().sessionDuration === null) {
    sessionStartedAt = null;
    sessionExpiresAt = null;
    sessionDuration = null;
  }
}

export function startSession(durationMinutes: number | null): SessionState {
  // Concurrency guard: if a start is already in progress (re-entrant call from
  // event loop / settings subscriber), cancel the existing session first and
  // allow this call to replace it.
  if (isStarting) {
    cancelSession();
  }
  isStarting = true;
  try {
    // Clear any existing session
    clearExpiryTimer();

    if (durationMinutes === null) {
      // Indefinite session — no timer
      // performance.now() used for monotonic timing — immune to system clock changes
      sessionStartedAt = performance.now();
      sessionExpiresAt = null;
      sessionDuration = null;
      onSessionStateChange?.({ sessionDuration: null, preventSleep: true });
      broadcastSessionUpdate();
      return {
        isRunning: true,
        startedAt: sessionStartedAt,
        expiresAt: null,
        durationMinutes: null,
      };
    }

    // Timed session
    // performance.now() used for monotonic timing — immune to system clock changes
    const startedAt = performance.now();
    const expiresAt = startedAt + durationMinutes * MS_PER_MINUTE;
    sessionStartedAt = startedAt;
    sessionExpiresAt = expiresAt;
    sessionDuration = durationMinutes;

    onSessionStateChange?.({ sessionDuration: durationMinutes, preventSleep: true });

    expiryTimer = setTimeout(
      () => {
        try {
          expiryTimer = null;
          sessionStartedAt = null;
          sessionExpiresAt = null;
          sessionDuration = null;
          stopSessionBroadcast();
          // Session expired — coordinator will sync power-saver via settings change
          resetSessionState(false);
        } catch (err) {
          log.error("[session-timer] Error in session expiry callback:", err);
        }
      },
      durationMinutes * MS_PER_MINUTE,
    );

    broadcastSessionUpdate();
    startSessionBroadcast();

    return {
      isRunning: true,
      startedAt: sessionStartedAt,
      expiresAt: sessionExpiresAt,
      durationMinutes,
    };
  } finally {
    isStarting = false;
  }
}

export function cancelSession(): SessionState {
  clearExpiryTimer();
  stopSessionBroadcast();
  // Coordinator will sync power-saver via settings change
  resetSessionState(false);
  sessionStartedAt = null;
  sessionExpiresAt = null;
  sessionDuration = null;
  return {
    isRunning: false,
    startedAt: null,
    expiresAt: null,
    durationMinutes: null,
  };
}

/**
 * Pure status reader — no side effects, never returns null.
 * Uses module-level `sessionStartedAt` as discriminant for `isRunning`.
 */
export function getStatus(): SessionStatusResponse {
  if (sessionStartedAt === null) {
    return {
      isRunning: false,
      startedAt: null,
      expiresAt: null,
      remainingSeconds: null,
      durationMinutes: null,
    };
  }

  // Indefinite session: no expiry, no remaining countdown, no duration.
  if (sessionExpiresAt === null || sessionDuration === null) {
    return {
      isRunning: true,
      startedAt: sessionStartedAt,
      expiresAt: null,
      remainingSeconds: null,
      durationMinutes: null,
    };
  }

  // Timed session: all numeric fields are non-null.
  const remainingMs = Math.max(0, sessionExpiresAt - performance.now());
  const remainingSeconds = Math.floor(remainingMs / 1000);
  return {
    isRunning: true,
    startedAt: sessionStartedAt,
    expiresAt: sessionExpiresAt,
    remainingSeconds,
    durationMinutes: sessionDuration,
  };
}

export function cleanup(): void {
  stopSessionBroadcast();
  clearExpiryTimer();
  sessionStartedAt = null;
  sessionExpiresAt = null;
  sessionDuration = null;
}

/** Compute and broadcast current session status to all renderer windows. Never broadcasts null. */
export function broadcastSessionUpdate(): void {
  broadcastFn?.(IPC_CHANNELS.SESSION_STATUS_UPDATE, getStatus());
}

/** Start periodic session status broadcast (every 1 second). */
export function startSessionBroadcast(): void {
  stopSessionBroadcast();
  sessionBroadcastTimer = setInterval(() => {
    broadcastSessionUpdate();
  }, SESSION_BROADCAST_INTERVAL_MS);
}

/** Stop periodic session status broadcast. */
export function stopSessionBroadcast(): void {
  if (sessionBroadcastTimer) {
    clearInterval(sessionBroadcastTimer);
    sessionBroadcastTimer = null;
  }
}
