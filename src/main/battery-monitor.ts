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

/** @internal Power monitor listeners persist for app lifetime by design. */
export async function initBatteryMonitoring(): Promise<void> {
  powerMonitor.on("on-battery", () => {
    void checkBatteryAndStop();
  });

  powerMonitor.on("on-ac", () => {
    log.info("[battery-monitor] On AC power, battery monitoring reset");
  });
}

/** Remove power monitor listeners. For completeness in cleanup paths. */
export function cleanupBatteryMonitoring(): void {
  powerMonitor.removeAllListeners("on-battery");
  powerMonitor.removeAllListeners("on-ac");
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

export async function getBatteryPercent(): Promise<number | null> {
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
    log.warn("[battery-monitor] Failed to get battery percentage:", err);
    return null;
  }
}
