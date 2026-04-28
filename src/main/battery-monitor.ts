import { powerMonitor } from "electron";
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

type BatteryAutoStopCallback = () => void;
let onBatteryAutoStop: BatteryAutoStopCallback | null = null;

export function setBatteryAutoStopCallback(callback: BatteryAutoStopCallback): void {
  onBatteryAutoStop = callback;
}

type SleepPreventionChecker = () => boolean;
let checkSleepPrevention: SleepPreventionChecker | null = null;

export function setSleepPreventionChecker(fn: SleepPreventionChecker): void {
  checkSleepPrevention = fn;
}

type StopSleepPreventionFn = () => void;
let stopSleepPrevention: StopSleepPreventionFn | null = null;

export function setStopSleepPrevention(fn: StopSleepPreventionFn): void {
  stopSleepPrevention = fn;
}

let isCheckingBattery = false;
let onBatteryListener: (() => void) | null = null;
let onAcListener: (() => void) | null = null;

/** @internal Power monitor listeners persist for app lifetime by design. */
export async function initBatteryMonitoring(): Promise<void> {
  onBatteryListener = () => {
    if (isCheckingBattery) return;
    isCheckingBattery = true;
    checkBatteryAndStop()
      .catch((err) => log.error("[battery-monitor] Battery check error:", err))
      .finally(() => {
        isCheckingBattery = false;
      });
  };
  onAcListener = () => {
    log.info("[battery-monitor] On AC power, battery monitoring reset");
  };
  powerMonitor.on("on-battery", onBatteryListener);
  powerMonitor.on("on-ac", onAcListener);
}

/** Remove power monitor listeners. For completeness in cleanup paths. */
export function cleanupBatteryMonitoring(): void {
  if (onBatteryListener) {
    powerMonitor.off?.("on-battery", onBatteryListener);
    onBatteryListener = null;
  }
  if (onAcListener) {
    powerMonitor.off?.("on-ac", onAcListener);
    onAcListener = null;
  }
}

async function checkBatteryAndStop(): Promise<void> {
  const threshold = getBatteryThreshold();
  if (threshold <= 0) return;
  if (!(checkSleepPrevention?.() ?? false)) return;

  try {
    const percent = await getBatteryPercent();
    if (percent !== null && percent <= threshold) {
      stopSleepPrevention?.();
      log.info(`[battery-monitor] Auto-stopped: battery at ${percent}% (threshold: ${threshold}%)`);
      onBatteryAutoStop?.();
    }
  } catch (err) {
    log.warn("[battery-monitor] Failed to check battery level:", err);
  }
}

/**
 * Parse battery percentage from `pmset -g batt` stdout.
 * Returns the integer percentage (0-100), or null if:
 * - No "InternalBattery" found in output (desktop Mac)
 * - No percentage pattern matched
 * - Output is empty or malformed
 */
export function parsePmsetOutput(stdout: string): number | null {
  if (!stdout.includes("InternalBattery")) {
    return null;
  }
  const match = stdout.match(/(\d+)%/);
  if (match && match[1] !== undefined) {
    return parseInt(match[1], 10);
  }
  return null;
}

export async function getBatteryPercent(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("pmset", ["-g", "batt"], {
      timeout: BATTERY_CHECK_TIMEOUT_MS,
    });
    if (!stdout.includes("InternalBattery")) {
      log.warn("[battery-monitor] No InternalBattery found in pmset output (desktop Mac?)");
      return null;
    }
    return parsePmsetOutput(stdout);
  } catch (err) {
    log.warn("[battery-monitor] Failed to get battery percentage:", err);
    return null;
  }
}
