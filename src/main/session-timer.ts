import { getSettings, updateSettings } from "./settings.js";
import type { AppSettings, IpcResponse } from "../shared/types.js";
import { IPC_CHANNELS } from "../shared/types.js";
import log from "electron-log";
import { MS_PER_MINUTE } from "./constants.js";
import { broadcastToWindows } from "./utils/broadcast.js";

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

export function startSession(durationMinutes: number | null): SessionState {
  // Clear any existing session
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }

  if (durationMinutes === null) {
    // Indefinite session — no timer
    sessionStartedAt = performance.now();
    sessionExpiresAt = null;
    void updateSettings({ sessionDuration: null, preventSleep: true });
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

  void updateSettings({ sessionDuration: durationMinutes, preventSleep: true });

  expiryTimer = setTimeout(
    () => {
      try {
        expiryTimer = null;
        sessionStartedAt = null;
        sessionExpiresAt = null;
        stopSessionBroadcast();
        // Session expired — coordinator will sync power-saver via settings change
        void updateSettings({ sessionDuration: null, preventSleep: false });
        broadcastSessionUpdate();
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
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  stopSessionBroadcast();
  // Coordinator will sync power-saver via settings change
  void updateSettings({ sessionDuration: null, preventSleep: false });
  sessionStartedAt = null;
  sessionExpiresAt = null;
  broadcastSessionUpdate();
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
    const s = settings ?? getSettings();
    if (s.sessionDuration !== null) {
      // Settings say session is active but no timer running — cancel it
      void updateSettings({ sessionDuration: null });
    }
    return {
      isRunning: false,
      startedAt: null,
      expiresAt: null,
      durationMinutes: null,
    };
  }

  // Timer is running — return full state
  const s = settings ?? getSettings();
  return {
    isRunning: true,
    startedAt: sessionStartedAt,
    expiresAt: sessionExpiresAt,
    durationMinutes: s.sessionDuration,
  };
}

export function cleanup(): void {
  stopSessionBroadcast();
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
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
          ? Math.max(0, Math.round((status.expiresAt - now) / 1000))
          : null,
        durationMinutes: status.durationMinutes,
      }
    : null;
  broadcastToWindows(IPC_CHANNELS.SESSION_STATUS_UPDATE, response);
}

/** Start periodic session status broadcast (every 1 second). */
export function startSessionBroadcast(): void {
  stopSessionBroadcast();
  sessionBroadcastTimer = setInterval(() => {
    broadcastSessionUpdate();
  }, 1000);
}

/** Stop periodic session status broadcast. */
export function stopSessionBroadcast(): void {
  if (sessionBroadcastTimer) {
    clearInterval(sessionBroadcastTimer);
    sessionBroadcastTimer = null;
  }
}
