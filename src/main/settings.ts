import { app } from "electron";
import log from "electron-log";
import { existsSync } from "node:fs";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "path";
import { EventEmitter } from "node:events";
import { DEFAULT_SETTINGS } from "../shared/types.js";
import type { AppSettings } from "../shared/types.js";

type SettingsChangeCallback = (_settings: AppSettings) => void;

type SettingsEvents = {
  change: [AppSettings];
};

const settingsEmitter = new EventEmitter<SettingsEvents>();

export function onSettingsChanged(callback: SettingsChangeCallback): () => void {
  settingsEmitter.on("change", callback);
  return () => {
    settingsEmitter.off("change", callback);
  };
}
let initialized = false;
let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };

/** Promise chain for serializing concurrent updateSettings() calls */
let writeChain: Promise<unknown> = Promise.resolve();


export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

export const isPositiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

export const isClamped0to100 = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

export const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export const validateBoolean = (value: unknown, defaultValue: boolean): boolean =>
  isBoolean(value) ? value : defaultValue;

export const validatePositiveNumber = (
  value: unknown,
  defaultValue: number | null,
): number | null => (isPositiveNumber(value) ? value : defaultValue);

export const validateClampedNumber = (value: unknown, defaultValue: number): number =>
  isClamped0to100(value) ? value : defaultValue;

function validateNonEmptyString(value: unknown, defaultValue: string): string {
  return isNonEmptyString(value) ? value : defaultValue;
}

/**
 * Validates raw settings from disk JSON ({@link initSettings}) against expected shape.
 *
 * Uses inline per-field validation rather than the {@link VALIDATORS} dispatch table
 * ({@link mergeValidatedPartial}) because:
 * 1. validateRawSettings operates on `Record<string, unknown>` — the raw parsed JSON
 *    with arbitrary keys that must be filtered to known {@link AppSettings} fields.
 * 2. mergeValidatedPartial operates on `Partial<AppSettings>` — already-typed input
 *    from runtime callers where keys are known at compile time.
 * 3. The VALIDATORS table provides per-field type guards; validateRawSettings
 *    additionally handles unknown-key filtering and sessionDuration null special case.
 *
 * The two functions serve DIFFERENT call paths (disk load vs incremental update)
 * and must be kept manually in sync when {@link AppSettings} fields change.
 */
function validateRawSettings(raw: Record<string, unknown>): AppSettings {
  return {
    launchAtLogin: validateBoolean(raw.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin),
    preventSleep: validateBoolean(raw.preventSleep, DEFAULT_SETTINGS.preventSleep),
    sessionDuration: validatePositiveNumber(raw.sessionDuration, DEFAULT_SETTINGS.sessionDuration),
    batteryThreshold: validateClampedNumber(
      raw.batteryThreshold,
      DEFAULT_SETTINGS.batteryThreshold,
    ),
    shortcut: validateNonEmptyString(raw.shortcut, DEFAULT_SETTINGS.shortcut),
  };
}

/**
 * Validates raw JSON from disk against AppSettings shape. Filters unknown keys
 * and handles sessionDuration's null sentinel (indefinite session marker).
 * Kept separate from VALIDATORS dispatch because input type differs (Record vs Partial).
 */
type SettingsValidator<K extends keyof AppSettings> = (
  value: unknown,
  fallback: AppSettings[K],
) => AppSettings[K];

const VALIDATORS: { [K in keyof AppSettings]: SettingsValidator<K> } = {
  launchAtLogin: (v, f) => (isBoolean(v) ? v : f),
  preventSleep: (v, f) => (isBoolean(v) ? v : f),
  sessionDuration: (v, f) => {
    if (v === null) return null; // null = indefinite session marker
    return isPositiveNumber(v) ? v : f;
  },
  batteryThreshold: (v, f) => (isClamped0to100(v) ? v : f),
  shortcut: (v, f) => (isNonEmptyString(v) ? v : f),
};

function applyValidator<K extends keyof AppSettings>(
  key: K,
  value: unknown,
  fallback: AppSettings[K],
): AppSettings[K] {
  return VALIDATORS[key](value, fallback);
}

export function mergeValidatedPartial(
  base: AppSettings,
  partial: Partial<AppSettings>,
): AppSettings {
  const merged: AppSettings = { ...base };
  for (const key of Object.keys(partial) as (keyof AppSettings)[]) {
    if (!(key in VALIDATORS)) continue;
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

async function ensureUserDataDir(): Promise<void> {
  const userDataPath = app.getPath("userData");
  await mkdir(userDataPath, { recursive: true });
}
export async function initSettings(): Promise<void> {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    settingsCache = { ...DEFAULT_SETTINGS };
    initialized = true;
    return;
  }

  try {
    const raw = await readFile(settingsPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const safeParsed: Record<string, unknown> =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    settingsCache = validateRawSettings(safeParsed);
  } catch (err) {
    const backupPath =
      settingsPath + ".corrupt-" + new Date().toISOString().replace(/:/g, "-") + ".json";
    try {
      await rename(settingsPath, backupPath);
      log.error(`[settings] Corrupted settings file backed up to: ${backupPath}`, err);
    } catch (backupErr) {
      log.error("[settings] Failed to back up corrupted settings file:", backupErr);
    }
    settingsCache = { ...DEFAULT_SETTINGS };
  }

  initialized = true;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await ensureUserDataDir();
  const settingsPath = getSettingsPath();
  // Atomic write: unique tmp file (avoids concurrent rename races) + rename
  const tmpPath = settingsPath + `.tmp-${randomUUID()}`;
  const raw = JSON.stringify(settings, null, 2);
  await writeFile(tmpPath, raw, "utf-8");
  await rename(tmpPath, settingsPath);
}

export function getSettings(): AppSettings {
  if (!initialized) {
    throw new Error("[settings] getSettings() called before initSettings(). Ensure initSettings() is awaited first.");
  }
  return { ...settingsCache };
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const result = writeChain.then(async () => {
    const merged = mergeValidatedPartial(settingsCache, partial);

    const changed = (Object.keys(merged) as (keyof AppSettings)[]).some(
      (key) => merged[key] !== settingsCache[key],
    );
    if (!changed) {
      return getSettings();
    }

    settingsCache = { ...merged };
    const snapshot = getSettings();
    settingsEmitter.emit("change", snapshot);

    try {
      await saveSettings(merged);
    } catch (err) {
      log.error("[settings] Failed to save settings:", err);
    }

    return snapshot;
  });
  // catch prevents unhandled rejection; writeChain must always resolve
  writeChain = result.catch(() => {});
  return result;
}


