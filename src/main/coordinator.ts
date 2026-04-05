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
import { powerSaveBlocker, powerMonitor } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import log from "electron-log";
import { IPC_CHANNELS } from "../shared/types.js";
import { broadcastToWindows } from "./utils/broadcast.js";
import type { AppSettings } from "../shared/types.js";
import { getSettings, onSettingsChanged, updateSettings } from "./settings.js";
import { BATTERY_CHECK_TIMEOUT_MS } from "./constants.js";
import { syncAutoLaunch, registerGlobalShortcut, type ShortcutDeps } from "./system-integrations.js";
import { cancelSession, setOnSessionStateChange, setSettingsReader } from "./session-timer.js";
import type { TrayDeps } from "./tray.js";

// === Power-Saver (merged from power-saver.ts) ===

const execFileAsync = promisify(execFile);

type GetBatteryThresholdFn = () => number;
let getBatteryThreshold: GetBatteryThresholdFn = () => 0;

export function setBatteryThresholdGetter(fn: GetBatteryThresholdFn): void {
  getBatteryThreshold = fn;
}

let blockerId: number | null = null;

export function startPreventingSleep(): void {
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
    return;
  }
  const id = powerSaveBlocker.start("prevent-display-sleep");
  if (id >= 0) {
    blockerId = id;
    log.info("[coordinator] Started preventing sleep (id:", blockerId, ")");
  } else {
    log.error("[coordinator] Failed to start preventing sleep (id:", id, ")");
  }
}

export function stopPreventingSleep(): void {
  if (blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId);
    }
    blockerId = null;
    log.info("[coordinator] Stopped preventing sleep");
  }
}

export function isPreventingSleep(): boolean {
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
}

export function syncPreventSleep(enabled: boolean): void {
  if (enabled) {
    startPreventingSleep();
  } else {
    stopPreventingSleep();
  }
}

type BatteryAutoStopCallback = () => void;
let onBatteryAutoStop: BatteryAutoStopCallback | null = null;

export function setBatteryAutoStopCallback(callback: BatteryAutoStopCallback): void {
  onBatteryAutoStop = callback;
}

export async function initBatteryMonitoring(): Promise<void> {
  powerMonitor.on("on-battery", () => {
    void checkBatteryAndStop();
  });

  powerMonitor.on("on-ac", () => {
    log.info("[coordinator] On AC power, battery monitoring reset");
  });
}

async function checkBatteryAndStop(): Promise<void> {
  const threshold = getBatteryThreshold();
  if (threshold <= 0) return;
  if (!isPreventingSleep()) return;

  try {
    const percent = await getBatteryPercent();
    if (percent !== null && percent <= threshold) {
      stopPreventingSleep();
      log.info(`[coordinator] Auto-stopped: battery at ${percent}% (threshold: ${threshold}%)`);
      onBatteryAutoStop?.();
    }
  } catch (err) {
    log.warn("[coordinator] Failed to check battery level:", err);
  }
}

async function getBatteryPercent(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("pmset", ["-g", "batt"], {
      timeout: BATTERY_CHECK_TIMEOUT_MS,
    });
    const match = stdout.match(/(\d+)%/);
    if (match && match[1] !== undefined) {
      return parseInt(match[1], 10);
    }
    return null;
  } catch (err) {
    log.warn("[coordinator] Failed to get battery percentage:", err);
    return null;
  }
}

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

  // Wire session state change callback (replaces direct updateSettings in session-timer)
  setOnSessionStateChange((updates) => {
    void updateSettings(updates);
  });

  // Wire settings reader (replaces direct getSettings import in session-timer)
  setSettingsReader(getSettings);

  // Register global shortcut with injected deps
  const shortcutDeps: ShortcutDeps = {
    getShortcut: () => getSettings().shortcut ?? "",
    getPreventSleep: () => getSettings().preventSleep,
    togglePreventSleep: () => void updateSettings({ preventSleep: !getSettings().preventSleep }),
  };
  registerGlobalShortcut(shortcutDeps);

  // Subscribe to settings changes for automatic system sync
  unsubscribeSettings = onSettingsChanged((settings: AppSettings) => {
    // Sync power-saver state with settings
    syncPreventSleep(settings.preventSleep);

    // Sync auto-launch state with settings
    syncAutoLaunch(settings.launchAtLogin);

    // Update prevPreventSleep BEFORE cancelSession() to prevent infinite recursion.
    // cancelSession() calls updateSettings() which re-triggers this subscriber synchronously.
    const wasPreventingSleep = prevPreventSleep;
    prevPreventSleep = settings.preventSleep;

    // Cancel active session when preventSleep transitions true → false
    if (wasPreventingSleep && !settings.preventSleep) {
      cancelSession();
    }

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
    togglePreventSleep: () => void updateSettings({ preventSleep: !getSettings().preventSleep }),
    onSettingsChanged: (cb: () => void) => onSettingsChanged(cb),
  };
}
