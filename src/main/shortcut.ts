import { globalShortcut } from "electron";
import log from "electron-log";
import { getSettings, updateSettings } from "./settings.js";
import { syncPreventSleep } from "./power-saver.js";

const DEFAULT_SHORTCUT = "Cmd+Shift+A";

export function registerGlobalShortcut(): void {
  const settings = getSettings();
  const shortcut = settings.shortcut || DEFAULT_SHORTCUT;

  try {
    const registered = globalShortcut.register(shortcut, () => {
      const current = getSettings();
      const next = !current.preventSleep;
      const updated = updateSettings({ preventSleep: next });
      syncPreventSleep(updated.preventSleep);
      log.info(`[shortcut] Sleep prevention ${next ? "enabled" : "disabled"} via ${shortcut}`);
    });

    if (!registered) {
      log.warn(`[shortcut] Failed to register global shortcut: ${shortcut}`);
    } else {
      log.info(`[shortcut] Registered global shortcut: ${shortcut}`);
    }
  } catch (err) {
    log.error("[shortcut] Error registering global shortcut:", err);
  }
}

export function unregisterGlobalShortcut(): void {
  globalShortcut.unregisterAll();
  log.info("[shortcut] Unregistered all global shortcuts");
}
