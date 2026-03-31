import { powerSaveBlocker, powerMonitor } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import log from "electron-log";
import { BATTERY_CHECK_TIMEOUT_MS } from "./constants.js";

const execFileAsync = promisify(execFile);

type GetBatteryThresholdFn = () => number;
let getBatteryThreshold: GetBatteryThresholdFn = () => 0;

export function setBatteryThresholdGetter(fn: GetBatteryThresholdFn): void {
  getBatteryThreshold = fn;
}

let blockerId: number | null = null;

/**
 * Start preventing system sleep.
 * No-op if already active.
 */
export function startPreventingSleep(): void {
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
    return;
  }
  const id = powerSaveBlocker.start("prevent-display-sleep");
  if (id > 0) {
    blockerId = id;
    log.info("[power-saver] Started preventing sleep (id:", blockerId, ")");
  } else {
    log.error("[power-saver] Failed to start preventing sleep (id:", id, ")");
  }
}

/**
 * Stop preventing system sleep.
 * No-op if not active.
 */
export function stopPreventingSleep(): void {
  if (blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId);
    }
    blockerId = null;
  }
  log.info("[power-saver] Stopped preventing sleep");
}

/**
 * Check if sleep prevention is currently active.
 */
export function isPreventingSleep(): boolean {
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
}

/**
 * Sync the prevent-sleep state with the desired enabled flag.
 * Called on startup and when settings change.
 */
export function syncPreventSleep(enabled: boolean): void {
  if (enabled) {
    startPreventingSleep();
  } else {
    stopPreventingSleep();
  }
}

/**
 * Callback invoked when battery drops below threshold.
 * The caller wires this to session cancellation logic.
 */
type BatteryAutoStopCallback = () => void;

let onBatteryAutoStop: BatteryAutoStopCallback | null = null;

/**
 * Set the callback for battery auto-stop events.
 * Must be called before initBatteryMonitoring().
 */
export function setBatteryAutoStopCallback(callback: BatteryAutoStopCallback): void {
  onBatteryAutoStop = callback;
}

/**
 * Initialize battery monitoring.
 * Sets up listeners for battery/ac power events.
 */
export async function initBatteryMonitoring(): Promise<void> {
  powerMonitor.on("on-battery", () => {
    void checkBatteryAndStop();
  });

  powerMonitor.on("on-ac", () => {
    log.info("[power-saver] On AC power, battery monitoring reset");
  });
}

/**
 * Check battery level and auto-stop sleep prevention if below threshold.
 */
async function checkBatteryAndStop(): Promise<void> {
  const threshold = getBatteryThreshold();

  // threshold 0 = disabled
  if (threshold <= 0) return;

  // Not preventing sleep — nothing to do
  if (!isPreventingSleep()) return;

  try {
    const percent = await getBatteryPercent();
    if (percent !== null && percent <= threshold) {
      stopPreventingSleep();
      log.info(`[power-saver] Auto-stopped: battery at ${percent}% (threshold: ${threshold}%)`);
      // Notify caller to cancel any active session
      onBatteryAutoStop?.();
    }
  } catch (err) {
    log.warn("[power-saver] Failed to check battery level:", err);
  }
}

/**
 * Get battery percentage using pmset.
 * Returns null if unable to determine.
 */
async function getBatteryPercent(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("pmset", ["-g", "batt"], {
      timeout: BATTERY_CHECK_TIMEOUT_MS,
    });
    // Parse: "Battery Power" or "AC Power", then "InternalBattery-0 (id=12345)\t123%;"
    const match = stdout.match(/(\d+)%/);
    if (match && match[1] !== undefined) {
      return parseInt(match[1], 10);
    }
    return null;
  } catch (err) {
    log.warn("[power-saver] Failed to get battery percentage:", err);
    return null;
  }
}
