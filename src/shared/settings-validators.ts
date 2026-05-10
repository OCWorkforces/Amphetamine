import { DEFAULT_SETTINGS } from "./types.js";
import type { AppSettings } from "./types.js";

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

export function validateNonEmptyString(value: unknown, defaultValue: string): string {
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
export function validateRawSettings(raw: Record<string, unknown>): AppSettings {
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

export const VALIDATORS: { [K in keyof AppSettings]: SettingsValidator<K> } = {
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
