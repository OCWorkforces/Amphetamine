import { app } from "electron";
import log from "electron-log";
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import { join } from "path";
import { EventEmitter } from "node:events";
import { DEFAULT_SETTINGS } from "../shared/types.js";
import type { AppSettings } from "../shared/types.js";

/** Callback invoked when settings change (partial or full update) */
type SettingsChangeCallback = (_settings: AppSettings) => void;

/** Internal event emitter for settings changes */
const settingsEmitter = new EventEmitter();

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChanged(callback: SettingsChangeCallback): () => void {
  settingsEmitter.on("change", callback);
  return () => {
    settingsEmitter.off("change", callback);
  };
}
let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };

function getSettingsPath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, "settings.json");
}

function ensureUserDataDir(): void {
  const userDataPath = app.getPath("userData");
  mkdirSync(userDataPath, { recursive: true });
}

export function loadSettings(): AppSettings {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    settingsCache = { ...DEFAULT_SETTINGS };
    return settingsCache;
  }

  try {
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw);

    // Validate and construct settings object
    settingsCache = {
      launchAtLogin:
        typeof parsed.launchAtLogin === "boolean"
          ? parsed.launchAtLogin
          : DEFAULT_SETTINGS.launchAtLogin,
      preventSleep:
        typeof parsed.preventSleep === "boolean"
          ? parsed.preventSleep
          : DEFAULT_SETTINGS.preventSleep,
      sessionDuration:
        typeof parsed.sessionDuration === "number" && parsed.sessionDuration > 0
          ? parsed.sessionDuration
          : DEFAULT_SETTINGS.sessionDuration,
      batteryThreshold:
        typeof parsed.batteryThreshold === "number" &&
        parsed.batteryThreshold >= 0 &&
        parsed.batteryThreshold <= 100
          ? parsed.batteryThreshold
          : DEFAULT_SETTINGS.batteryThreshold,
      shortcut:
        typeof parsed.shortcut === "string" && parsed.shortcut.length > 0
          ? parsed.shortcut
          : DEFAULT_SETTINGS.shortcut,
    };
    return settingsCache;
  } catch {
    log.warn("[settings] Corrupted settings file, using defaults");
    settingsCache = { ...DEFAULT_SETTINGS };
    return settingsCache;
  }
}

export function saveSettings(settings: AppSettings): void {
  ensureUserDataDir();
  const settingsPath = getSettingsPath();
  const tmpPath = settingsPath + ".tmp";
  const raw = JSON.stringify(settings, null, 2);
  // Write to temp file first, then atomically rename
  writeFileSync(tmpPath, raw, "utf-8");
  renameSync(tmpPath, settingsPath);
}

export function getSettings(): AppSettings {
  return { ...settingsCache };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  // Merge with current cache
  const merged: AppSettings = {
    ...settingsCache,
  };

  if (typeof partial.launchAtLogin === "boolean") {
    merged.launchAtLogin = partial.launchAtLogin;
  }

  if (typeof partial.preventSleep === "boolean") {
    merged.preventSleep = partial.preventSleep;
  }

  if (typeof partial.batteryThreshold === "number") {
    const val = partial.batteryThreshold;
    if (val >= 0 && val <= 100) {
      merged.batteryThreshold = val;
    }
  }

  if (typeof partial.shortcut === "string" && partial.shortcut.length > 0) {
    merged.shortcut = partial.shortcut;
  }

  // Save and update cache
  saveSettings(merged);
  settingsCache = { ...merged };

  // Notify settings change listeners via EventEmitter
  const snapshot = getSettings();
  settingsEmitter.emit("change", snapshot);

  return snapshot;
}

// Initialize on module load
loadSettings();
