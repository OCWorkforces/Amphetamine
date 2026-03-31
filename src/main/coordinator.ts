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
import log from "electron-log";
import { IPC_CHANNELS } from "../shared/types.js";
import { broadcastToWindows } from "./utils/broadcast.js";
import type { AppSettings } from "../shared/types.js";
import { getSettings, onSettingsChanged, updateSettings } from "./settings.js";
import {
  syncPreventSleep,
  initBatteryMonitoring,
  setBatteryAutoStopCallback,
  setBatteryThresholdGetter,
  stopPreventingSleep,
} from "./power-saver.js";
import { syncAutoLaunch } from "./auto-launch.js";
import { cancelSession } from "./session-timer.js";
import { registerGlobalShortcut, type ShortcutDeps } from "./shortcut.js";
import type { TrayDeps } from "./tray.js";

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

  // Wire battery threshold getter and auto-stop callback
  setBatteryThresholdGetter(() => getSettings().batteryThreshold ?? 0);
  setBatteryAutoStopCallback(cancelSession);
  void initBatteryMonitoring();

  // Register global shortcut with injected deps
  const shortcutDeps: ShortcutDeps = {
    getShortcut: () => getSettings().shortcut ?? "",
    getPreventSleep: () => getSettings().preventSleep,
    togglePreventSleep: () => updateSettings({ preventSleep: !getSettings().preventSleep }),
  };
  registerGlobalShortcut(shortcutDeps);

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
    broadcastToWindows(IPC_CHANNELS.SETTINGS_CHANGED, settings);
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

/**
 * Get tray dependencies wired to settings.
 */
export function getTrayDeps(): TrayDeps {
  return {
    getPreventSleep: () => getSettings().preventSleep,
    togglePreventSleep: () => updateSettings({ preventSleep: !getSettings().preventSleep }),
    onSettingsChanged: (cb: () => void) => onSettingsChanged(cb),
  };
}
