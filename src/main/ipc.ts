import { ipcMain, app, type BrowserWindow } from "electron";
import log from "electron-log";
import {
  IPC_CHANNELS,
  DEFAULT_SETTINGS,
  type IpcRequest,
  type IpcResponse,
} from "../shared/types.js";
import { MAIN_WINDOW_WIDTH, MIN_POPOVER_HEIGHT, MAX_POPOVER_HEIGHT } from "./constants.js";

import { getSettings, updateSettings } from "./settings.js";
import { createSettingsWindow } from "./settings-window.js";
import { registerAutoUpdaterIpc } from "./auto-updater.js";
import * as sessionTimer from "./session-timer.js";

import { validateSender, typedHandle } from "./ipc-utils.js";
export { validateSender } from "./ipc-utils.js";

/** Window IPC handlers (fire-and-forget) */
function registerWindowIpc(win: BrowserWindow): void {
  let pendingResizeTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingResizeHeight = 0;

  ipcMain.on(
    IPC_CHANNELS.WINDOW_SET_HEIGHT,
    (event, height: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>) => {
      if (!validateSender(event)) return;
      try {
        if (typeof height === "number" && height > 0 && Number.isInteger(height)) {
          pendingResizeHeight = height;
          if (pendingResizeTimer === null) {
            pendingResizeTimer = setTimeout(() => {
              pendingResizeTimer = null;
              const clampedHeight = Math.max(
                MIN_POPOVER_HEIGHT,
                Math.min(MAX_POPOVER_HEIGHT, Math.round(pendingResizeHeight)),
              );
              win.setSize(MAIN_WINDOW_WIDTH, clampedHeight, false);
            }, 16);
          }
        }
      } catch (err) {
        log.error("[ipc] WINDOW_SET_HEIGHT error:", err);
      }
    },
  );
}

/** App utility IPC handlers */
function registerAppIpc(): void {
  typedHandle(
    IPC_CHANNELS.APP_GET_VERSION,
    (event): IpcResponse<typeof IPC_CHANNELS.APP_GET_VERSION> => {
      if (!validateSender(event)) return "";
      return app.getVersion();
    },
  );
  typedHandle(IPC_CHANNELS.APP_QUIT, (event) => {
    if (!validateSender(event)) return;
    app.quit();
  });
}

/** Settings IPC handlers */
function registerSettingsIpc(): void {
  typedHandle(IPC_CHANNELS.SETTINGS_GET, (event): IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET> => {
    if (!validateSender(event)) return { ...DEFAULT_SETTINGS };
    return getSettings();
  });
  typedHandle(
    IPC_CHANNELS.SETTINGS_SET,
    async (
      event,
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET>> => {
      if (!validateSender(event)) return { settings: getSettings(), rejectedKeys: [] };
      // Coordinator handles system sync (power-saver, auto-launch, session cancel, broadcast) via settings change
      return await updateSettings(partial);
    },
  );
  typedHandle(IPC_CHANNELS.SETTINGS_OPEN, async (event) => {
    if (!validateSender(event)) return;
    createSettingsWindow();
  });
}

/** Session timer IPC handlers */
function registerSessionIpc(): void {
  typedHandle(IPC_CHANNELS.SESSION_START, async (event, request) => {
    if (!validateSender(event)) {
      return { ok: false, reason: "rejected" };
    }
    if (request.durationMinutes !== null && request.durationMinutes !== undefined) {
      if (
        !Number.isFinite(request.durationMinutes) ||
        request.durationMinutes <= 0 ||
        !Number.isInteger(request.durationMinutes)
      ) {
        log.warn("[ipc] SESSION_START rejected invalid durationMinutes:", request.durationMinutes);
        return { ok: false, reason: "invalid-duration" };
      }
    }
    if (request.durationMinutes !== null && request.durationMinutes !== undefined && request.durationMinutes > 1440) {
      log.warn("[ipc] SESSION_START rejected: duration exceeds 24h:", request.durationMinutes);
      return { ok: false, reason: "Duration cannot exceed 24 hours" };
    }
    const result = sessionTimer.startSession(request.durationMinutes);
    // startSession() guarantees non-null startedAt; SessionState type is widened for getStatus() reuse.
    if (result.startedAt === null) {
      log.error("[ipc] SESSION_START: startSession returned null startedAt (invariant violation)");
      return { ok: false, reason: "rejected" };
    }
    return {
      ok: true,
      startedAt: result.startedAt,
      durationMinutes: result.durationMinutes,
      expiresAt: result.expiresAt,
    };
  });
  typedHandle(IPC_CHANNELS.SESSION_CANCEL, async (event) => {
    if (!validateSender(event)) return { cancelled: false };
    sessionTimer.cancelSession();
    return { cancelled: true };
  });
  typedHandle(IPC_CHANNELS.SESSION_STATUS, (event) => {
    if (!validateSender(event)) {
      return {
        isRunning: false,
        startedAt: null,
        expiresAt: null,
        remainingSeconds: null,
        durationMinutes: null,
      };
    }
    return sessionTimer.getStatus();
  });
}

/** Register all IPC handlers (orchestrator) */
export function registerIpcHandlers(win: BrowserWindow): void {
  registerWindowIpc(win);
  registerAppIpc();
  registerSettingsIpc();
  registerSessionIpc();
  registerAutoUpdaterIpc();
}
