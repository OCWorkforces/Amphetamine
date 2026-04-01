import { ipcMain, app, BrowserWindow, type IpcMainEvent } from "electron";
import log from "electron-log";
import {
  IPC_CHANNELS,
  DEFAULT_SETTINGS,
  type IpcChannelMap,
  type IpcRequest,
  type IpcResponse,
} from "../shared/types.js";
import { MAIN_WINDOW_WIDTH, MIN_POPOVER_HEIGHT, MAX_POPOVER_HEIGHT, DEV_ORIGINS } from "./constants.js";

import { getSettings, updateSettings } from "./settings.js";
import { createSettingsWindow } from "./settings-window.js";
import { registerAutoUpdaterIpc } from "./auto-updater.js";
import * as sessionTimer from "./session-timer.js";


const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(DEV_ORIGINS);
/** Returns true if the sender's origin is the app's own renderer */
export function validateSender(event: IpcMainEvent): boolean {
  const senderUrl = event.senderFrame?.url ?? "";
  return validateSenderUrl(senderUrl);
 }
function validateSenderUrl(senderUrl: string): boolean {
  try {
    const url = new URL(senderUrl);
    // Dev server origins - use URL origin for proper comparison
    if (url.protocol === "http:") {
      return (
        ALLOWED_ORIGINS.has(url.origin) ||
        ALLOWED_ORIGINS.has(`${url.protocol}//${url.host}`)
      );
    }
    // file:// origin check (packaged app) - validate path is within app bundle
    if (url.protocol === "file:") {
      const filePath = url.pathname;
      // Accept if path is within the app bundle, or is empty (main window)
      return filePath.startsWith(app.getAppPath()) || filePath.length === 0;
    }
    return false;
  } catch {
    log.warn("[ipc] Invalid sender URL:", senderUrl);
    return false;
  }
}
function validateOnSender(event: IpcMainEvent): boolean {
  const senderUrl = event.senderFrame?.url ?? "";
  return validateSenderUrl(senderUrl);
 }
/**
 * Type-safe IPC handler wrapper.
 * Ensures handler return type matches IpcChannelMap response type at compile time.
 */
type IpcHandler<K extends keyof IpcChannelMap> = (
  _event: IpcMainEvent,
  _request: IpcChannelMap[K]["request"],
) => Promise<IpcChannelMap[K]["response"]> | IpcChannelMap[K]["response"];

function typedHandle<K extends keyof IpcChannelMap>(channel: K, handler: IpcHandler<K>): void {
  ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1]);
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // Window (uses ipcMain.on for fire-and-forget)
  ipcMain.on(
    IPC_CHANNELS.WINDOW_SET_HEIGHT,
    (event, height: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>) => {
      if (!validateOnSender(event)) return;
      try {
        if (typeof height === "number" && height > 0) {
          // Clamp height to acceptable bounds
          const clampedHeight = Math.max(
            MIN_POPOVER_HEIGHT,
            Math.min(MAX_POPOVER_HEIGHT, Math.round(height)),
          );
          win.setSize(MAIN_WINDOW_WIDTH, clampedHeight, true);
        }
      } catch (err) {
        log.error("[ipc] WINDOW_SET_HEIGHT error:", err);
      }
    },
  );
  // App utilities
  typedHandle(
    IPC_CHANNELS.APP_GET_VERSION,
    (event): IpcResponse<typeof IPC_CHANNELS.APP_GET_VERSION> => {
      if (!validateSender(event)) return "";
      return app.getVersion();
    },
  );
  // Settings
  typedHandle(
    IPC_CHANNELS.SETTINGS_GET,
    (event): IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET> => {
      if (!validateSender(event)) return { ...DEFAULT_SETTINGS };
      return getSettings();
    },
  );
  typedHandle(
    IPC_CHANNELS.SETTINGS_SET,
    async (
      event,
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET>> => {
      if (!validateSender(event)) return getSettings();
      // Coordinator handles system sync (power-saver, auto-launch, session cancel, broadcast) via settings change
      return await updateSettings(partial);
    },
  );
  // Session timer handlers
  typedHandle(IPC_CHANNELS.SESSION_START, async (event, request) => {
    if (!validateSender(event)) {
      return { startedAt: 0, durationMinutes: null, expiresAt: null };
    }
    const result = sessionTimer.startSession(request.durationMinutes);
    // startSession always sets startedAt, but SessionState allows null for getStatus()
    const startedAt = result.startedAt ?? Date.now();
    return {
      startedAt,
      durationMinutes: result.durationMinutes,
      expiresAt: result.expiresAt,
    };
  });
  typedHandle(IPC_CHANNELS.SESSION_CANCEL, async (event) => {
    if (!validateSender(event)) return { cancelled: false };
    sessionTimer.cancelSession();
    return { cancelled: true };
  });
  typedHandle(IPC_CHANNELS.SESSION_STATUS, async (event) => {
    if (!validateSender(event)) return null;
    const result = sessionTimer.getStatus();
    if (!result.isRunning) {
      return null;
    }
    const now = performance.now();
    const remainingSeconds = result.expiresAt
      ? Math.max(0, Math.round((result.expiresAt - now) / 1000))
      : null;
    return {
      isRunning: result.isRunning,
      startedAt: result.startedAt,
      expiresAt: result.expiresAt,
      remainingSeconds,
      durationMinutes: result.durationMinutes,
    };
  });
  // Open settings window from renderer
  typedHandle(IPC_CHANNELS.SETTINGS_OPEN, async (event) => {
    if (!validateSender(event)) return;
    createSettingsWindow();
  });
  // Quit app from renderer
  typedHandle(IPC_CHANNELS.APP_QUIT, async (event) => {
    if (!validateSender(event)) return;
    app.quit();
  });
  // Auto-updater IPC (separate module, registered here for consistency)
  registerAutoUpdaterIpc();
}
