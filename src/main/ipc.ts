import {
  ipcMain,
  app,
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import log from "electron-log";
import {
  IPC_CHANNELS,
  DEFAULT_SETTINGS,
  type IpcChannelMap,
  type IpcRequest,
  type IpcResponse,
} from "../shared/types.js";

import { getSettings, updateSettings } from "./settings.js";
import { syncPreventSleep } from "./power-saver.js";
import { syncAutoLaunch } from "./auto-launch.js";

/** Accepted URL origins for IPC senders (renderer served from file:// or localhost in dev) */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

/** Window dimensions for the popover */
const WINDOW_WIDTH = 360;

/** Acceptable height bounds for the popover window */
const MIN_WINDOW_HEIGHT = 220;
const MAX_WINDOW_HEIGHT = 480;

/** Returns true if the sender's origin is the app's own renderer */
export function validateSender(event: IpcMainInvokeEvent): boolean {
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
      // Accept if path contains .asar (app bundle) or is empty (main window)
      return filePath.includes(".asar") || filePath.length === 0;
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
function typedHandle<K extends keyof IpcChannelMap>(
  channel: K,
  handler: (
    event: IpcMainInvokeEvent,
    request: IpcChannelMap[K]["request"],
  ) => Promise<IpcChannelMap[K]["response"]> | IpcChannelMap[K]["response"],
): void {
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
            MIN_WINDOW_HEIGHT,
            Math.min(MAX_WINDOW_HEIGHT, Math.round(height)),
          );
          win.setSize(WINDOW_WIDTH, clampedHeight, true);
        }
      } catch (err) {
        console.error("[ipc] WINDOW_SET_HEIGHT error:", err);
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
    (
      event,
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET> => {
      if (!validateSender(event)) return getSettings();
      const updated = updateSettings(partial);

      // Sync system behaviors to match the new settings
      if (typeof partial.preventSleep === "boolean") {
        syncPreventSleep(updated.preventSleep);
      }
      if (typeof partial.launchAtLogin === "boolean") {
        syncAutoLaunch(updated.launchAtLogin);
      }

      return updated;
    },
  );
}
