import { powerMonitor } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import log from "electron-log";
import { BATTERY_CHECK_TIMEOUT_MS } from "./constants.js";

/** Interval (ms) between periodic battery polls while on battery and preventing sleep. */
const PERIODIC_BATTERY_CHECK_MS = 60_000;

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
  /**
   * Bridge invoked by the coordinator whenever sleep-prevention state flips.
   * Starts/stops the periodic battery polling loop based on (onBattery && active).
   */
  onPreventSleepChange: (active: boolean) => void;
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
  let onResumeListener: (() => void) | null = null;
  let batteryCheckInterval: ReturnType<typeof setInterval> | null = null;

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
  /**
   * Start the periodic battery polling loop.
   * Gated: only runs when on battery power AND sleep prevention is active.
   * Idempotent — safe to call repeatedly.
   */
  const startPeriodicBatteryChecks = (): void => {
    if (batteryCheckInterval !== null) return;
    if (!powerMonitor.isOnBatteryPower()) return;
    if (!isPreventingSleep()) return;
    batteryCheckInterval = setInterval(() => {
      if (isCheckingBattery) return;
      isCheckingBattery = true;
      checkBatteryAndStop()
        .catch((err) => log.error("[battery-monitor] Periodic battery check error:", err))
        .finally(() => {
          isCheckingBattery = false;
        });
    }, PERIODIC_BATTERY_CHECK_MS);
    // unref so the interval doesn't pin the event loop (test/cleanup safety)
    batteryCheckInterval.unref();
  };

  /** Stop the periodic battery polling loop, if running. */
  const stopPeriodicBatteryChecks = (): void => {
    if (batteryCheckInterval !== null) {
      clearInterval(batteryCheckInterval);
      batteryCheckInterval = null;
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
      // AC→battery transition: if we're already preventing sleep, begin polling
      // continuously so we re-evaluate the threshold as the battery drains.
      startPeriodicBatteryChecks();
    };
    onAcListener = () => {
      log.info("[battery-monitor] On AC power, battery monitoring reset");
      // No need to keep polling while plugged in.
      stopPeriodicBatteryChecks();
    };
    onResumeListener = () => {
      // System resumed from sleep — re-evaluate the polling loop immediately;
      // the laptop may now be on battery and our setInterval was paused.
      startPeriodicBatteryChecks();
    };
    powerMonitor.on("on-battery", onBatteryListener);
    powerMonitor.on("on-ac", onAcListener);
    powerMonitor.on("resume", onResumeListener);

    // If we're already on battery and preventing sleep at init time, kick off polling.
    startPeriodicBatteryChecks();
  };

  /** Remove power monitor listeners. For completeness in cleanup paths. */
  const cleanupBatteryMonitoring = (): void => {
    stopPeriodicBatteryChecks();
    if (onBatteryListener) {
      powerMonitor.off("on-battery", onBatteryListener);
      onBatteryListener = null;
    }
    if (onAcListener) {
      powerMonitor.off("on-ac", onAcListener);
      onAcListener = null;
    }
    if (onResumeListener) {
      powerMonitor.off("resume", onResumeListener);
      onResumeListener = null;
    }
  };

  /**
   * Bridge from coordinator: sleep-prevention state changed. Start the polling
   * loop when prevention turns on (and we're on battery); stop it when off.
   */
  const onPreventSleepChange = (active: boolean): void => {
    if (active) {
      startPeriodicBatteryChecks();
    } else {
      stopPeriodicBatteryChecks();
    }
  };

  return { initBatteryMonitoring, cleanupBatteryMonitoring, onPreventSleepChange };
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
