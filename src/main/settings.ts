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

/** Type-guard predicates — single source of truth for validity semantics */

export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

export const isPositiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

export const isClamped0to100 = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

/** Validate a boolean field, returning the default if invalid */
export const validateBoolean = (value: unknown, defaultValue: boolean): boolean =>
  isBoolean(value) ? value : defaultValue;

/** Validate a positive number field (null is preserved as a valid sentinel value) */
export const validatePositiveNumber = (
  value: unknown,
  defaultValue: number | null,
): number | null => (isPositiveNumber(value) ? value : defaultValue);

/** Validate a clamped number field (0-100), returning the default if invalid */
export const validateClampedNumber = (value: unknown, defaultValue: number): number =>
  isClamped0to100(value) ? value : defaultValue;

/** Validate a non-empty string field, returning the default if invalid */
function validateNonEmptyString(value: unknown, defaultValue: string): string {
  return isNonEmptyString(value) ? value : defaultValue;
}

/** Validate all fields of a raw parsed object into a complete AppSettings */
function validateRawSettings(raw: Record<string, unknown>): AppSettings {
  return {
    launchAtLogin: validateBoolean(raw.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin),
    preventSleep: validateBoolean(raw.preventSleep, DEFAULT_SETTINGS.preventSleep),
    sessionDuration: validatePositiveNumber(raw.sessionDuration, DEFAULT_SETTINGS.sessionDuration),
    batteryThreshold: validateClampedNumber(raw.batteryThreshold, DEFAULT_SETTINGS.batteryThreshold),
    shortcut: validateNonEmptyString(raw.shortcut, DEFAULT_SETTINGS.shortcut),
  };
}

/**
 * Per-field validator dispatch. Mapped type ensures every AppSettings
 * field has an entry — adding a field without updating VALIDATORS is a compile error.
 */
type SettingsValidator<K extends keyof AppSettings> = (
  value: unknown,
  fallback: AppSettings[K],
) => AppSettings[K];

const VALIDATORS: { [K in keyof AppSettings]: SettingsValidator<K> } = {
  launchAtLogin: (v, f) => (isBoolean(v) ? v : f),
  preventSleep: (v, f) => (isBoolean(v) ? v : f),
  sessionDuration: (v, f) => {
    // SPECIAL CASE: null is a valid value (indefinite session marker)
    if (v === null) return null;
    return isPositiveNumber(v) ? v : f;
  },
  batteryThreshold: (v, f) => (isClamped0to100(v) ? v : f),
  shortcut: (v, f) => (isNonEmptyString(v) ? v : f),
};

/** Apply a single validator with full type-safety (encapsulates the unavoidable cast). */
function applyValidator<K extends keyof AppSettings>(
  key: K,
  value: unknown,
  fallback: AppSettings[K],
): AppSettings[K] {
  return VALIDATORS[key](value, fallback);
}

/** Merge validated partial settings into a base settings object — dispatches via VALIDATORS */
export function mergeValidatedPartial(
  base: AppSettings,
  partial: Partial<Record<keyof AppSettings, unknown>>,
): AppSettings {
  const merged: AppSettings = { ...base };
  for (const key of Object.keys(partial) as (keyof AppSettings)[]) {
    if (!(key in VALIDATORS)) continue;
    // Per-key generic dispatch — `K` is inferred per iteration via helper.
    assignValidated(merged, key, partial[key]);
  }
  return merged;
}

function assignValidated<K extends keyof AppSettings>(
  target: AppSettings,
  key: K,
  incoming: unknown,
): void {
  target[key] = applyValidator(key, incoming, target[key]);
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
