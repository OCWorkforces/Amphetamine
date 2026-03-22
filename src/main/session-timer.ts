import { getSettings, updateSettings } from "./settings.js";
import { syncPreventSleep } from "./power-saver.js";

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
    syncPreventSleep(true);
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
  const expiresAt = startedAt + durationMinutes * 60 * 1000;
  sessionStartedAt = startedAt;
  sessionExpiresAt = expiresAt;

  syncPreventSleep(true);
    updateSettings({ sessionDuration: durationMinutes, preventSleep: true });

  expiryTimer = setTimeout(
    () => {
      expiryTimer = null;
      sessionStartedAt = null;
      sessionExpiresAt = null;
      // Session expired — stop preventing sleep
      syncPreventSleep(false);
      updateSettings({ sessionDuration: null, preventSleep: false });
    },
    durationMinutes * 60 * 1000,
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
  syncPreventSleep(false);
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
