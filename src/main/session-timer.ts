import { getSettings, updateSettings } from "./settings.js";
import log from "electron-log";
import { MS_PER_MINUTE } from "./constants.js";

export interface SessionState {
  isRunning: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  durationMinutes: number | null;
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
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
    sessionStartedAt = Date.now();
    sessionExpiresAt = null;
    updateSettings({ sessionDuration: null, preventSleep: true });
    return {
      isRunning: true,
      startedAt: sessionStartedAt,
      expiresAt: null,
      durationMinutes: null,
    };
  }

  // Timed session
  const startedAt = Date.now();
  const expiresAt = startedAt + durationMinutes * MS_PER_MINUTE;
  sessionStartedAt = startedAt;
  sessionExpiresAt = expiresAt;

  updateSettings({ sessionDuration: durationMinutes, preventSleep: true });

  expiryTimer = setTimeout(
    () => {
      try {
        expiryTimer = null;
        sessionStartedAt = null;
        sessionExpiresAt = null;
        // Session expired — coordinator will sync power-saver via settings change
        updateSettings({ sessionDuration: null, preventSleep: false });
      } catch (err) {
        log.error("[session-timer] Error in session expiry callback:", err);
      }
    },
    durationMinutes * MS_PER_MINUTE,
  );

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
  // Coordinator will sync power-saver via settings change
  updateSettings({ sessionDuration: null, preventSleep: false });
  sessionStartedAt = null;
  sessionExpiresAt = null;
  return {
    isRunning: false,
    startedAt: null,
    expiresAt: null,
    durationMinutes: null,
  };
}

export function getStatus(): SessionState {
  if (!expiryTimer) {
    // If sessionDuration is set in settings but no timer, state is inconsistent
    const settings = getSettings();
    if (settings.sessionDuration !== null) {
      // Settings say session is active but no timer running — cancel it
      updateSettings({ sessionDuration: null });
    }
    return {
      isRunning: false,
      startedAt: null,
      expiresAt: null,
      durationMinutes: null,
    };
  }

  // Timer is running — return full state
  const settings = getSettings();
  return {
    isRunning: true,
    startedAt: sessionStartedAt,
    expiresAt: sessionExpiresAt,
    durationMinutes: settings.sessionDuration,
  };
}

export function cleanup(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  sessionStartedAt = null;
  sessionExpiresAt = null;
}
