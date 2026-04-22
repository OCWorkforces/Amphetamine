import type { AppSettings, IpcResponse, PushChannel } from "../shared/types.js";
import { DEFAULT_SETTINGS, IPC_CHANNELS } from "../shared/types.js";
import log from "electron-log";
import { MS_PER_MINUTE, MS_PER_SECOND, SESSION_BROADCAST_INTERVAL_MS } from "./constants.js";

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

function clearExpiryTimer(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}
/** Reset session state: notify coordinator and broadcast to renderers. */
function resetSessionState(preventSleep: boolean): void {
  onSessionStateChange?.({ sessionDuration: null, preventSleep });
  broadcastSessionUpdate();
}

export function startSession(durationMinutes: number | null): SessionState {
  // Clear any existing session
  clearExpiryTimer();

  if (durationMinutes === null) {
    // Indefinite session — no timer
    sessionStartedAt = performance.now();
    sessionExpiresAt = null;
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
  const startedAt = performance.now();
  const expiresAt = startedAt + durationMinutes * MS_PER_MINUTE;
  sessionStartedAt = startedAt;
  sessionExpiresAt = expiresAt;

  onSessionStateChange?.({ sessionDuration: durationMinutes, preventSleep: true });

  expiryTimer = setTimeout(
    () => {
      try {
        expiryTimer = null;
        sessionStartedAt = null;
        sessionExpiresAt = null;
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
}

export function cancelSession(): SessionState {
  clearExpiryTimer();
  stopSessionBroadcast();
  // Coordinator will sync power-saver via settings change
  resetSessionState(false);
  sessionStartedAt = null;
  sessionExpiresAt = null;
  return {
    isRunning: false,
    startedAt: null,
    expiresAt: null,
    durationMinutes: null,
  };
}

export function getStatus(settings?: AppSettings): SessionState {
  if (!expiryTimer) {
    // If sessionDuration is set in settings but no timer, state is inconsistent
    const s = settings ?? getSettingsRef();
    if (s.sessionDuration !== null) {
      // Settings say session is active but no timer running — cancel it
      onSessionStateChange?.({ sessionDuration: null });
    }
    return {
      isRunning: false,
      startedAt: null,
      expiresAt: null,
      durationMinutes: null,
    };
  }

  // Timer is running — return full state
  const s = settings ?? getSettingsRef();
  return {
    isRunning: true,
    startedAt: sessionStartedAt,
    expiresAt: sessionExpiresAt,
    durationMinutes: s.sessionDuration,
  };
}

export function cleanup(): void {
  stopSessionBroadcast();
  clearExpiryTimer();
  sessionStartedAt = null;
  sessionExpiresAt = null;
}

/** Compute and broadcast current session status to all renderer windows. */
export function broadcastSessionUpdate(): void {
  const status = getStatus();
  const now = performance.now();
  const response: IpcResponse<typeof IPC_CHANNELS.SESSION_STATUS_UPDATE> = status.isRunning
    ? {
        isRunning: true,
        startedAt: status.startedAt,
        expiresAt: status.expiresAt,
        remainingSeconds: status.expiresAt
          ? Math.max(0, Math.round((status.expiresAt - now) / MS_PER_SECOND))
          : null,
        durationMinutes: status.durationMinutes,
      }
    : null;
  broadcastFn?.(IPC_CHANNELS.SESSION_STATUS_UPDATE, response);
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
