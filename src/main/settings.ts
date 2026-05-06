import { app, dialog } from "electron";
import log from "electron-log";

import { readFile, writeFile, rename, mkdir, chmod } from "node:fs/promises";
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

/** Tracks consecutive saveSettings failures to surface a user-visible alert when persistence is broken. */
let consecutiveSaveFailures = 0;
const MAX_CONSECUTIVE_SAVE_FAILURES = 3;


export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

export const isPositiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

export const isClamped0to100 = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

export const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * Validates a macOS Electron accelerator string (e.g. "Cmd+Shift+A").
 * Requires:
 *  - non-empty string
 *  - at least one modifier (Cmd/Command/Ctrl/Control/Option/Alt/Shift/Super)
 *  - at least one non-modifier key
 *  - not a reserved system shortcut (Cmd+Q, Cmd+W, Cmd+Tab, Cmd+Space)
 */
export const isValidAccelerator = (s: unknown): s is string => {
  if (!isNonEmptyString(s)) return false;

  const MODIFIERS = ["Cmd", "Command", "Ctrl", "Control", "Option", "Alt", "Shift", "Super"];
  const modifierPattern = /(Cmd|Command|Ctrl|Control|Option|Alt|Shift|Super)/;
  if (!modifierPattern.test(s)) return false;

  const parts = s.split("+").map((p) => p.trim());
  const nonModifiers = parts.filter((p) => !MODIFIERS.includes(p));
  if (nonModifiers.length === 0) return false;

  const forbiddenCombos = [
    /^Cmd\+Q$/i,
    /^Cmd\+W$/i,
    /^Cmd\+Tab$/i,
    /^Command\+Q$/i,
    /^Command\+W$/i,
    /^Command\+Tab$/i,
    /^Cmd\+Space$/i,
    /^Command\+Space$/i,
  ];
  if (forbiddenCombos.some((r) => r.test(s))) return false;

  return true;
};

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
  shortcut: (v, f) => (isValidAccelerator(v) ? v : f),
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
): { merged: AppSettings; rejectedKeys: string[] } {
  const merged: AppSettings = { ...base };
  const rejectedKeys: string[] = [];
  for (const key of Object.keys(partial) as (keyof AppSettings)[]) {
    if (!(key in VALIDATORS)) {
      rejectedKeys.push(key);
      continue;
    }
    const incoming = partial[key];
    if (incoming === undefined) continue;
    const validated = applyValidator(key, incoming, base[key]);
    if (validated !== incoming) {
      rejectedKeys.push(key);
    }
    assignValidated(merged, key, incoming);
  }
  return { merged, rejectedKeys };
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

  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf-8");
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      settingsCache = { ...DEFAULT_SETTINGS };
      initialized = true;
      return;
    }
    log.error("[settings] Failed to read settings file:", err);
    settingsCache = { ...DEFAULT_SETTINGS };
    initialized = true;
    return;
  }

  try {
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
  await writeFile(tmpPath, raw, { encoding: "utf-8", mode: 0o600 });
  await rename(tmpPath, settingsPath);
  // Defensive: ensure final file mode is 0o600 even if rename inherited prior perms.
  await chmod(settingsPath, 0o600);
}

export function getSettings(): AppSettings {
  if (!initialized) {
    throw new Error("[settings] getSettings() called before initSettings(). Ensure initSettings() is awaited first.");
  }
  return { ...settingsCache };
}

export async function updateSettings(
  partial: Partial<AppSettings>,
): Promise<{ settings: AppSettings; rejectedKeys: string[] }> {
  const result = writeChain.then(async () => {
    const { merged, rejectedKeys } = mergeValidatedPartial(settingsCache, partial);

    const changed = (Object.keys(merged) as (keyof AppSettings)[]).some(
      (key) => merged[key] !== settingsCache[key],
    );
    if (!changed) {
      return { settings: getSettings(), rejectedKeys };
    }

    await saveSettings(merged);
    consecutiveSaveFailures = 0;
    settingsCache = { ...merged };
    const snapshot = getSettings();
    settingsEmitter.emit("change", snapshot);

    return { settings: snapshot, rejectedKeys };
  });
  // catch prevents unhandled rejection; writeChain must always resolve.
  // On save failure: log, increment failure counter, and surface a dialog after threshold.
  writeChain = result.catch((err: unknown) => {
    consecutiveSaveFailures++;
    log.error("[settings] Failed to save settings:", err);
    if (consecutiveSaveFailures >= MAX_CONSECUTIVE_SAVE_FAILURES) {
      try {
        dialog.showErrorBox(
          "Settings Cannot Be Saved",
          "Disk may be full. Changes will be lost on restart.",
        );
      } catch (dialogErr) {
        log.error("[settings] Failed to show error dialog:", dialogErr);
      }
    }
  });
  return result;
}

// --- before-quit write-chain flush (T19) ---
// Ensure queued settings writes complete before the app quits — without this,
// a queued write can be cut mid-flight when the user quits during a debounced save.
let didFlushWriteChain = false;
app.on("before-quit", (event) => {
  if (didFlushWriteChain) return;
  event.preventDefault();
  didFlushWriteChain = true;
  writeChain
    .catch(() => {
      /* errors already logged inside updateSettings */
    })
    .finally(() => {
      app.quit();
    });
});


