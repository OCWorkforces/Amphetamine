import { app } from "electron";
import log from "electron-log";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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

/** Validate a boolean field, returning the default if invalid */
function validateBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

/** Validate a positive number field, returning the default if invalid */
function validatePositiveNumber(value: unknown, defaultValue: number | null): number | null {
  return typeof value === "number" && value > 0 ? value : defaultValue;
}

/** Validate a clamped number field (0-100), returning the default if invalid */
function validateClampedNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && value >= 0 && value <= 100 ? value : defaultValue;
}

/** Validate a non-empty string field, returning the default if invalid */
function validateNonEmptyString(value: unknown, defaultValue: string): string {
  return typeof value === "string" && value.length > 0 ? value : defaultValue;
}

/** Validate all fields of a raw parsed object into a complete AppSettings */
function validateRawSettings(raw: Record<string, unknown>): AppSettings {
  return {
    launchAtLogin: validateBoolean(raw.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin),
    preventSleep: validateBoolean(raw.preventSleep, DEFAULT_SETTINGS.preventSleep),
    sessionDuration: validatePositiveNumber(raw.sessionDuration, DEFAULT_SETTINGS.sessionDuration),
    batteryThreshold: validateClampedNumber(raw.batteryThreshold, DEFAULT_SETTINGS.batteryThreshold ?? 0),
    shortcut: validateNonEmptyString(raw.shortcut, DEFAULT_SETTINGS.shortcut ?? ""),
  };
}

/** Merge validated partial settings into a base settings object */
function mergeValidatedPartial(base: AppSettings, partial: Partial<AppSettings>): AppSettings {
  const merged = { ...base };
  if (typeof partial.launchAtLogin === "boolean") {
    merged.launchAtLogin = partial.launchAtLogin;
  }
  if (typeof partial.preventSleep === "boolean") {
    merged.preventSleep = partial.preventSleep;
  }
  if (typeof partial.sessionDuration === "number" && partial.sessionDuration > 0) {
    merged.sessionDuration = partial.sessionDuration;
  } else if (partial.sessionDuration === null) {
    merged.sessionDuration = null;
  }
  if (typeof partial.batteryThreshold === "number" && partial.batteryThreshold >= 0 && partial.batteryThreshold <= 100) {
    merged.batteryThreshold = partial.batteryThreshold;
  }
  if (typeof partial.shortcut === "string" && partial.shortcut.length > 0) {
    merged.shortcut = partial.shortcut;
  }
  return merged;
}

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
    settingsCache = validateRawSettings(parsed);
    return settingsCache;
  } catch (err) {
    log.warn("[settings] Corrupted settings file, using defaults:", err);
    settingsCache = { ...DEFAULT_SETTINGS };
    return settingsCache;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  ensureUserDataDir();
  const settingsPath = getSettingsPath();
  // Use unique tmp file per write to avoid concurrent rename races
  const tmpPath = settingsPath + `.tmp-${randomUUID()}`;
  const raw = JSON.stringify(settings, null, 2);
  // Write to temp file first, then atomically rename
  await writeFile(tmpPath, raw, "utf-8");
  await rename(tmpPath, settingsPath);
}

export function getSettings(): AppSettings {
  return { ...settingsCache };
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const merged = mergeValidatedPartial(settingsCache, partial);

  // Skip if nothing actually changed — prevents unnecessary cascade of events
  const changed = (Object.keys(merged) as (keyof AppSettings)[]).some(
    (key) => merged[key] !== settingsCache[key],
  );
  if (!changed) {
    return getSettings();
  }

  // Update cache and notify BEFORE disk write
  settingsCache = { ...merged };
  const snapshot = getSettings();
  settingsEmitter.emit("change", snapshot);

  // Persist to disk asynchronously
  try {
    await saveSettings(merged);
  } catch (err) {
    log.error("[settings] Failed to save settings:", err);
  }

  return snapshot;
}

// Initialize on module load
loadSettings();
