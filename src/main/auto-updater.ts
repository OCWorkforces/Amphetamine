import { autoUpdater, type UpdateInfo } from "electron-updater";
import { app, shell, ipcMain } from "electron";
import log from "electron-log";
import { IPC_CHANNELS } from "../shared/types.js";
import { INITIAL_UPDATE_CHECK_DELAY_MS, PERIODIC_UPDATE_CHECK_INTERVAL_MS } from "./constants.js";
import { broadcastToWindows } from "./utils/broadcast.js";

let checkIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the auto-updater.
 * Registers event handlers and starts periodic update checks.
 * Only runs in packaged (production) builds.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    log.info("[auto-updater] Checking for updates...");
    broadcastToWindows(IPC_CHANNELS.AUTO_UPDATER_STATUS, { status: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    log.info("[auto-updater] Update available:", info.version);
    broadcastToWindows(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
      status: "available",
      info: {
        version: info.version,
        releaseDate: info.releaseDate ?? "",
        ...(typeof info.releaseNotes === "string" ? { releaseNotes: info.releaseNotes } : {}),
      },
    });
    // Validate version is a semver-like string before constructing URL
    if (/^\d+\.\d+\.\d+/.test(info.version)) {
      void shell.openExternal(
        `https://github.com/CCWorkforce/OpenAmphetamine/releases/tag/v${info.version}`,
      );
    } else {
      log.warn("[auto-updater] Skipping release URL — invalid version format:", info.version);
    }
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    log.info("[auto-updater] No update available. Current version:", info.version);
    broadcastToWindows(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
      status: "not-available",
      info: { version: info.version, releaseDate: info.releaseDate ?? "" },
    });
  });

  autoUpdater.on(
    "download-progress",
    (progress: { percent: number; transferred: number; total: number }) => {
      log.info("[auto-updater] Download progress:", Math.round(progress.percent), "%");
      broadcastToWindows(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
        status: "downloading",
        progress: {
          percent: progress.percent,
          transferred: progress.transferred,
          total: progress.total,
        },
      });
    },
  );

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    log.info("[auto-updater] Update downloaded:", info.version);
    broadcastToWindows(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
      status: "downloaded",
      info: { version: info.version, releaseDate: info.releaseDate ?? "" },
    });
  });

  autoUpdater.on("error", (err: Error) => {
    log.error("[auto-updater] Error:", err.message);
    broadcastToWindows(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
      status: "error",
      error: err.message,
    });
  });

  // Initial check after 3-second delay (avoid startup slowdown)
  setTimeout(() => {
    log.info("[auto-updater] Running initial update check...");
    void autoUpdater.checkForUpdates();
  }, INITIAL_UPDATE_CHECK_DELAY_MS);

  // Periodic check every 4 hours
  checkIntervalId = setInterval(
    () => {
      log.info("[auto-updater] Running periodic update check...");
      void autoUpdater.checkForUpdates();
    },
    PERIODIC_UPDATE_CHECK_INTERVAL_MS,
  );
  checkIntervalId?.unref();

  log.info("[auto-updater] Auto-updater initialized (packaged build)");
}

/**
 * Stop the auto-updater.
 * Clears the periodic check interval and removes all event listeners.
 */
export function stopAutoUpdater(): void {
  if (checkIntervalId !== null) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
  autoUpdater.removeAllListeners();
  log.info("[auto-updater] Stopped");
}

/**
 * Register the auto-updater IPC handler.
 * Allows renderer to manually trigger an update check.
 */
export function registerAutoUpdaterIpc(): void {
  ipcMain.handle(IPC_CHANNELS.AUTO_UPDATER_CHECK, async () => {
    if (!app.isPackaged) {
      return null;
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo) {
        return {
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate ?? "",
        };
      }
      return null;
    } catch (err) {
      log.warn("[auto-updater] Failed to check for updates:", err);
      return null;
    }
  });
  log.info("[auto-updater] IPC handler registered");
}
