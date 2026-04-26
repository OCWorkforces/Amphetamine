import { globalShortcut } from "electron";
import log from "electron-log";

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
        `[global-shortcut] Sleep prevention ${next ? "enabled" : "disabled"} via ${shortcut}`,
      );
    });

    if (!registered) {
      log.error(`[global-shortcut] Failed to register shortcut: ${shortcut}`);
    } else {
      log.info(`[global-shortcut] Registered global shortcut: ${shortcut}`);
    }
  } catch (err) {
    log.error("[global-shortcut] Error registering global shortcut:", err);
  }
}

export function unregisterGlobalShortcut(): void {
  globalShortcut.unregisterAll();
  log.info("[global-shortcut] Unregistered all global shortcuts");
}
