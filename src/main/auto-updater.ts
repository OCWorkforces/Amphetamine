import { autoUpdater, type UpdateInfo } from "electron-updater";
import { app, shell, ipcMain } from "electron";
import log from "electron-log";
import { IPC_CHANNELS, type PushChannel, type IpcResponse } from "../shared/types.js";
import {
  INITIAL_UPDATE_CHECK_DELAY_MS,
  PERIODIC_UPDATE_CHECK_INTERVAL_MS,
  MAX_UPDATE_CHECK_INTERVAL_MS,
} from "./constants.js";

let checkIntervalId: ReturnType<typeof setInterval> | null = null;

let broadcastFn: (<K extends PushChannel>(channel: K, data: IpcResponse<K>) => void) | null = null;

let lastNotifiedVersion: string | null = null;

let consecutiveFailures = 0;

/** Inject broadcast function (called from coordinator) */
export function setBroadcastFn(fn: <K extends PushChannel>(channel: K, data: IpcResponse<K>) => void): void {
  broadcastFn = fn;
}

/** Handle "checking-for-update" event */
function onCheckingForUpdate(): void {
  log.info("[auto-updater] Checking for updates...");
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, { status: "checking" });
}

/** Handle "update-available" event */
function onUpdateAvailable(info: UpdateInfo): void {
  log.info("[auto-updater] Update available:", info.version);
  consecutiveFailures = 0;
  rescheduleCheckLoop();
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "available",
    info: {
      version: info.version,
      releaseDate: info.releaseDate ?? "",
      ...(typeof info.releaseNotes === "string" ? { releaseNotes: info.releaseNotes } : {}),
    },
  });
  // Validate version is a semver-like string before constructing URL
  if (/^\d+\.\d+\.\d+/.test(info.version)) {
    if (info.version !== lastNotifiedVersion) {
      lastNotifiedVersion = info.version;
      void shell.openExternal(
        `https://github.com/CCWorkforce/OpenAmphetamine/releases/tag/v${info.version}`,
      );
    }
  } else {
    log.warn("[auto-updater] Skipping release URL \u2014 invalid version format:", info.version);
  }
}

/** Handle "update-not-available" event */
function onUpdateNotAvailable(info: UpdateInfo): void {
  log.info("[auto-updater] No update available. Current version:", info.version);
  consecutiveFailures = 0;
  rescheduleCheckLoop();
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "not-available",
    info: { version: info.version, releaseDate: info.releaseDate ?? "" },
  });
}

/** Handle "download-progress" event */
function onDownloadProgress(progress: { percent: number; transferred: number; total: number }): void {
  log.info("[auto-updater] Download progress:", Math.round(progress.percent), "%");
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "downloading",
    progress: {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    },
  });
}

/** Handle "update-downloaded" event */
function onUpdateDownloaded(info: UpdateInfo): void {
  log.info("[auto-updater] Update downloaded:", info.version);
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "downloaded",
    info: { version: info.version, releaseDate: info.releaseDate ?? "" },
  });
}

/** Handle "error" event */
function onError(err: Error): void {
  log.error("[auto-updater] Error:", err.message);
  consecutiveFailures += 1;
  rescheduleCheckLoop();
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "error",
    error: err.message,
  });
}

/** Register all autoUpdater event handlers */
function registerUpdateEventHandlers(): void {
  autoUpdater.on("checking-for-update", onCheckingForUpdate);
  autoUpdater.on("update-available", onUpdateAvailable);
  autoUpdater.on("update-not-available", onUpdateNotAvailable);
  autoUpdater.on("download-progress", onDownloadProgress);
  autoUpdater.on("update-downloaded", onUpdateDownloaded);
  autoUpdater.on("error", onError);
}

/** Compute next interval with exponential backoff capped at MAX_UPDATE_CHECK_INTERVAL_MS */
function computeNextInterval(): number {
  return Math.min(
    PERIODIC_UPDATE_CHECK_INTERVAL_MS * Math.pow(2, consecutiveFailures),
    MAX_UPDATE_CHECK_INTERVAL_MS,
  );
}

/** Reschedule the periodic check loop with the current backoff interval */
function rescheduleCheckLoop(): void {
  if (checkIntervalId === null) {
    return;
  }
  clearInterval(checkIntervalId);
  const nextInterval = computeNextInterval();
  log.info(
    "[auto-updater] Rescheduling periodic check; failures=",
    consecutiveFailures,
    "interval(ms)=",
    nextInterval,
  );
  checkIntervalId = setInterval(() => {
    log.info("[auto-updater] Running periodic update check...");
    void autoUpdater.checkForUpdates();
  }, nextInterval);
  checkIntervalId?.unref();
}

/** Start initial delayed check and periodic update check loop */
function startUpdateCheckLoop(): void {
  // Initial check after 3-second delay (avoid startup slowdown) — not subject to backoff
  setTimeout(() => {
    log.info("[auto-updater] Running initial update check...");
    void autoUpdater.checkForUpdates();
  }, INITIAL_UPDATE_CHECK_DELAY_MS);

  // Periodic check (base 4 hours, exponential backoff on failures up to 24 hours)
  checkIntervalId = setInterval(
    () => {
      log.info("[auto-updater] Running periodic update check...");
      void autoUpdater.checkForUpdates();
    },
    PERIODIC_UPDATE_CHECK_INTERVAL_MS,
  );
  checkIntervalId?.unref();
}
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
  // SECURITY: Keep auto-download disabled. We only notify the user and open the GitHub release page.
  // Code-signature verification on macOS DMG/ZIP updates is performed by electron-updater internally
  // (delegates to macOS code signing checks via Squirrel.Mac on the staged update bundle before swap).
  // We never call autoUpdater.quitAndInstall() here, so no in-process update payload is executed.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  registerUpdateEventHandlers();
  startUpdateCheckLoop();

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
  lastNotifiedVersion = null;
  consecutiveFailures = 0;
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
