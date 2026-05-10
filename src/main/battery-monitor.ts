import { powerMonitor } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import log from "electron-log";
import { BATTERY_CHECK_TIMEOUT_MS } from "./constants.js";

/** Fallback threshold (%) used when the configured threshold is missing or non-positive. */
const DEFAULT_BATTERY_THRESHOLD = 20;

const execFileAsync = promisify(execFile);

/**
 * Dependencies for the battery monitor.
 *
 * All fields are required — there is no silent fallback. Wiring is enforced
 * at construction time by `createBatteryMonitor`.
 */
export interface BatteryDeps {
  /** Returns the configured battery threshold (%). 0 / non-positive ⇒ default. */
  getThreshold: () => number;
  /** Invoked once after the monitor auto-stops sleep prevention. */
  onAutoStop: () => void;
  /** Returns true if sleep prevention is currently active. */
  isPreventingSleep: () => boolean;
  /** Stops sleep prevention. */
  stopPreventingSleep: () => void;
}

/** Public handle returned by `createBatteryMonitor`. */
export interface BatteryMonitorHandle {
  initBatteryMonitoring: () => Promise<void>;
  cleanupBatteryMonitoring: () => void;
}

/**
 * Create a battery monitor instance bound to the given dependencies.
 *
 * Throws synchronously if any dependency is missing — there are no silent
 * fallbacks. Replaces the previous 4-setter DI pattern.
 */
export function createBatteryMonitor(deps: BatteryDeps): BatteryMonitorHandle {
  if (typeof deps.getThreshold !== "function") {
    throw new TypeError("createBatteryMonitor: deps.getThreshold must be a function");
  }
  if (typeof deps.onAutoStop !== "function") {
    throw new TypeError("createBatteryMonitor: deps.onAutoStop must be a function");
  }
  if (typeof deps.isPreventingSleep !== "function") {
    throw new TypeError("createBatteryMonitor: deps.isPreventingSleep must be a function");
  }
  if (typeof deps.stopPreventingSleep !== "function") {
    throw new TypeError("createBatteryMonitor: deps.stopPreventingSleep must be a function");
  }

  const { getThreshold, onAutoStop, isPreventingSleep, stopPreventingSleep } = deps;

  let isCheckingBattery = false;
  let onBatteryListener: (() => void) | null = null;
  let onAcListener: (() => void) | null = null;

  const checkBatteryAndStop = async (): Promise<void> => {
    const rawThreshold = getThreshold();
    const threshold =
      typeof rawThreshold === "number" && Number.isFinite(rawThreshold) && rawThreshold > 0
        ? rawThreshold
        : DEFAULT_BATTERY_THRESHOLD;
    if (!isPreventingSleep()) return;

    try {
      const percent = await getBatteryPercent();
      if (percent !== null && percent <= threshold) {
        stopPreventingSleep();
        log.info(
          `[battery-monitor] Auto-stopped: battery at ${percent}% (threshold: ${threshold}%)`,
        );
        onAutoStop();
      }
    } catch (err) {
      log.warn("[battery-monitor] Failed to check battery level:", err);
    }
  };

  /** @internal Power monitor listeners persist for app lifetime by design. */
  const initBatteryMonitoring = async (): Promise<void> => {
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
  };

  /** Remove power monitor listeners. For completeness in cleanup paths. */
  const cleanupBatteryMonitoring = (): void => {
    if (onBatteryListener) {
      powerMonitor.off("on-battery", onBatteryListener);
      onBatteryListener = null;
    }
    if (onAcListener) {
      powerMonitor.off("on-ac", onAcListener);
      onAcListener = null;
    }
  };

  return { initBatteryMonitoring, cleanupBatteryMonitoring };
}

/**
 * Parse battery percentage from `pmset -g batt` stdout.
 * Returns the integer percentage (0-100), or null if:
 * - No "InternalBattery" found in output (desktop Mac)
 * - No percentage pattern matched
 * - Output is empty or malformed
 */
const PCT_REGEX = /(\d+)%/;

export function parsePmsetOutput(stdout: string): number | null {
  if (!stdout.includes("InternalBattery")) {
    return null;
  }
  const internalLine = stdout.split("\n").find((line) => line.includes("InternalBattery"));
  if (internalLine === undefined) {
    return null;
  }
  const match = internalLine.match(PCT_REGEX);
  if (match && match[1] !== undefined) {
    const parsed = parseInt(match[1], 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export async function getBatteryPercent(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/pmset", ["-g", "batt"], {
      timeout: BATTERY_CHECK_TIMEOUT_MS,
    });
    return parsePmsetOutput(stdout);
  } catch (err) {
    log.warn("[battery-monitor] Failed to get battery percentage:", err);
    return null;
  }
}
