import { app, globalShortcut } from "electron";
import log from "electron-log";

// === Auto-Launch ===

/**
 * Get the current auto-launch (login item) status.
 * Returns true if the app is set to launch at login.
 */
export function getAutoLaunchStatus(): boolean {
  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch (error) {
    log.error("[system-integrations] Failed to get login item status:", error);
    return false;
  }
}

/**
 * Enable or disable auto-launch at login.
 * @param enabled - Whether to launch the app at login
 */
export function setAutoLaunch(enabled: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false,
    });
    log.info(`[system-integrations] ${enabled ? "Enabled" : "Disabled"} launch at login`);
  } catch (error) {
    log.error("[system-integrations] Failed to set login item:", error);
  }
}

/**
 * Sync the auto-launch setting with the system.
 * Call this when the app starts or when settings change.
 * @param enabled - Whether auto-launch should be enabled
 */
export function syncAutoLaunch(enabled: boolean): void {
  const currentStatus = getAutoLaunchStatus();
  if (currentStatus !== enabled) {
    setAutoLaunch(enabled);
  }
}

// === Global Shortcut ===

const DEFAULT_SHORTCUT = "Cmd+Shift+A";

export interface ShortcutDeps {
  getShortcut: () => string;
  getPreventSleep: () => boolean;
  togglePreventSleep: () => void;
}

export function registerGlobalShortcut(deps: ShortcutDeps): void {
  const shortcut = deps.getShortcut() || DEFAULT_SHORTCUT;

  try {
    const registered = globalShortcut.register(shortcut, () => {
      const next = !deps.getPreventSleep();
      deps.togglePreventSleep();
      // Coordinator handles syncPreventSleep via settings change
      log.info(
        `[system-integrations] Sleep prevention ${next ? "enabled" : "disabled"} via ${shortcut}`,
      );
    });

    if (!registered) {
      log.warn(`[system-integrations] Failed to register global shortcut: ${shortcut}`);
    } else {
      log.info(`[system-integrations] Registered global shortcut: ${shortcut}`);
    }
  } catch (err) {
    log.error("[system-integrations] Error registering global shortcut:", err);
  }
}

export function unregisterGlobalShortcut(): void {
  globalShortcut.unregisterAll();
  log.info("[system-integrations] Unregistered all global shortcuts");
}
