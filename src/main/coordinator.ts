/**
 * App Coordinator — Central orchestrator for settings-driven sync.
 *
 * Subscribes to settings changes and automatically synchronizes:
 * - Power-saver state (preventSleep) + battery monitoring
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
import { initSettings, getSettings, onSettingsChanged, updateSettings } from "./settings.js";
import { syncAutoLaunch } from "./auto-launch.js";
import { registerGlobalShortcut, type ShortcutDeps } from "./global-shortcut.js";
import { isPreventingSleep, syncPreventSleep, stopPreventingSleep } from "./sleep-prevention.js";
import {
  setBatteryThresholdGetter,
  setBatteryAutoStopCallback,
  setSleepPreventionChecker,
  setStopSleepPrevention,
  initBatteryMonitoring,
  cleanupBatteryMonitoring,
} from "./battery-monitor.js";
import {
  cancelSession,
  reconcileSessionState,
  setOnSessionStateChange,
  setSettingsReader,
  setBroadcastFn as setSessionBroadcastFn,
} from "./session-timer.js";
import { setBroadcastFn as setUpdaterBroadcastFn } from "./auto-updater.js";
import type { TrayDeps } from "./tray.js";
import { createSettingsWindow } from "./settings-window.js";

let prevPreventSleep = false;
let prevSettings: AppSettings | null = null;
let shortcutDeps: ShortcutDeps | null = null;
let unsubscribeSettings: (() => void) | null = null;

function togglePreventSleep(): void {
  updateSettings({ preventSleep: !getSettings().preventSleep }).catch((err) =>
    log.error("[coordinator] togglePreventSleep failed:", err),
  );
}
/**
 * Initialize the coordinator.
 * Syncs system state on startup and subscribes to settings changes.
 */
export async function initCoordinator(): Promise<void> {
  await initSettings();
  const settings = getSettings();
  prevPreventSleep = settings.preventSleep;
  prevSettings = { ...settings };

  // Sync system state with current settings
  syncAutoLaunch(settings.launchAtLogin);
  syncPreventSleep(settings.preventSleep);

  // Wire battery threshold getter and auto-stop callback
  setBatteryThresholdGetter(() => getSettings().batteryThreshold);
  setBatteryAutoStopCallback(cancelSession);
  setSleepPreventionChecker(isPreventingSleep);
  setStopSleepPrevention(stopPreventingSleep);
  void initBatteryMonitoring().catch((err) => log.error("[coordinator] Battery init failed:", err));

  // Wire session state change callback (replaces direct updateSettings in session-timer)
  setOnSessionStateChange((updates) => {
    updateSettings(updates).catch((err) =>
      log.error("[coordinator] Session state update failed:", err),
    );
  });

  // Wire settings reader (replaces direct getSettings import in session-timer)
  setSettingsReader(getSettings);

  // Wire broadcast function (replaces direct broadcastToWindows import in session-timer)
  setSessionBroadcastFn(broadcastToWindows);

  // Wire broadcast function (replaces direct broadcastToWindows import in auto-updater)
  setUpdaterBroadcastFn(broadcastToWindows);

  // Register global shortcut with injected deps
  shortcutDeps = {
    getShortcut: () => getSettings().shortcut,
    getPreventSleep: () => getSettings().preventSleep,
    togglePreventSleep,
  };
  registerGlobalShortcut(shortcutDeps);

  // Subscribe to settings changes for automatic system sync
  unsubscribeSettings = onSettingsChanged((settings: AppSettings) => {
    try {
      // Reconcile in-memory session state against settings (replaces the side
      // effect formerly hidden inside getStatus()).
      reconcileSessionState();

      // Sync only what changed
      if (!prevSettings || settings.preventSleep !== prevSettings.preventSleep) {
        syncPreventSleep(settings.preventSleep);
      }
      if (!prevSettings || settings.launchAtLogin !== prevSettings.launchAtLogin) {
        syncAutoLaunch(settings.launchAtLogin);
      }

      // Update prevPreventSleep BEFORE cancelSession() to prevent infinite recursion.
      // cancelSession() calls updateSettings() which re-triggers this subscriber synchronously.
      const wasPreventingSleep = prevPreventSleep;
      prevPreventSleep = settings.preventSleep;
      prevSettings = { ...settings };

      // Cancel active session when preventSleep transitions true → false
      if (wasPreventingSleep && !settings.preventSleep) {
        cancelSession();
      }

      // Broadcast settings to all renderer windows
      broadcastToWindows(IPC_CHANNELS.SETTINGS_CHANGED, settings);
    } catch (err) {
      log.error("[coordinator] Settings subscriber error:", err);
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
  cleanupBatteryMonitoring();
  stopPreventingSleep();
  log.info("[coordinator] Cleaned up");
}

/**
 * Get tray dependencies wired to settings.
 */
export function getTrayDeps(): TrayDeps {
  return {
    getPreventSleep: () => getSettings().preventSleep,
    togglePreventSleep,
    onSettingsChanged: (cb: () => void) =>
      onSettingsChanged((_settings) => {
        cb();
      }),
    openSettings: () => createSettingsWindow(),
  };
}
