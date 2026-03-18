import { app } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  DEFAULT_SETTINGS,
} from "../shared/types.js";
import type { AppSettings } from "../shared/types.js";

/** Callback invoked when settings change (partial or full update) */
type SettingsChangeCallback = (settings: AppSettings) => void;

const settingsListeners = new Set<SettingsChangeCallback>();

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChanged(callback: SettingsChangeCallback): () => void {
  settingsListeners.add(callback);
  return () => {
    settingsListeners.delete(callback);
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
    };
    return settingsCache;
  } catch {
    // Corrupted JSON or other error - return defaults
    settingsCache = { ...DEFAULT_SETTINGS };
    return settingsCache;
  }
}

export function saveSettings(settings: AppSettings): void {
  ensureUserDataDir();
  const settingsPath = getSettingsPath();
  const raw = JSON.stringify(settings, null, 2);
  writeFileSync(settingsPath, raw, "utf-8");
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
  // Save and update cache
  saveSettings(merged);
  settingsCache = { ...merged };

  // Notify settings change listeners
  const snapshot = getSettings();
  for (const listener of settingsListeners) {
    listener(snapshot);
  }


  return snapshot;
}


// Initialize on module load
loadSettings();
