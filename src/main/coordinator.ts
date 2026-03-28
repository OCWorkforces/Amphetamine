/**
 * App Coordinator — Central orchestrator for settings-driven sync.
 *
 * Subscribes to settings changes and automatically synchronizes:
 * - Power-saver state (preventSleep)
 * - Auto-launch state (launchAtLogin)
 * - Session cancellation (preventSleep true→false transition)
 * - Settings broadcast to all renderer windows
 *
 * This decouples session-timer, shortcut, and ipc from power-saver/auto-launch,
 * reducing cross-module import edges and centralizing orchestration logic.
 */
import { BrowserWindow } from "electron";
import log from "electron-log";
import { IPC_CHANNELS } from "../shared/types.js";
import type { AppSettings } from "../shared/types.js";
import { getSettings, onSettingsChanged } from "./settings.js";
import {
  syncPreventSleep,
  initBatteryMonitoring,
  setBatteryAutoStopCallback,
  stopPreventingSleep,
} from "./power-saver.js";
import { syncAutoLaunch } from "./auto-launch.js";
import { cancelSession } from "./session-timer.js";

let prevPreventSleep: boolean;
let unsubscribeSettings: (() => void) | null = null;

/**
 * Initialize the coordinator.
 * Syncs system state on startup and subscribes to settings changes.
 */
export function initCoordinator(): void {
  const settings = getSettings();
  prevPreventSleep = settings.preventSleep;

  // Sync system state with current settings
  syncAutoLaunch(settings.launchAtLogin);
  syncPreventSleep(settings.preventSleep);

  // Wire battery auto-stop to session cancellation
  setBatteryAutoStopCallback(cancelSession);
  void initBatteryMonitoring();

  // Subscribe to settings changes for automatic system sync
  unsubscribeSettings = onSettingsChanged((settings: AppSettings) => {
    // Sync power-saver state with settings
    syncPreventSleep(settings.preventSleep);

    // Sync auto-launch state with settings
    syncAutoLaunch(settings.launchAtLogin);

    // Cancel active session when preventSleep transitions true → false
    if (prevPreventSleep && !settings.preventSleep) {
      cancelSession();
    }
    prevPreventSleep = settings.preventSleep;

    // Broadcast settings to all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, settings);
    }
  });

  log.info("[coordinator] Initialized");
}

/**
 * Cleanup the coordinator.
 * Unsubscribes from settings changes and stops preventing sleep.
 */
export function cleanupCoordinator(): void {
  unsubscribeSettings?.();
  unsubscribeSettings = null;
  stopPreventingSleep();
  log.info("[coordinator] Cleaned up");
}
