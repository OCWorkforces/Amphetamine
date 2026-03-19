import {
  Tray,
  nativeImage,
  nativeTheme,
  Menu,
  app,
  type MenuItemConstructorOptions,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSettingsWindow } from "./settings-window.js";
import { getSettings, onSettingsChanged } from "./settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

function showAbout(): void {
  // app.showAboutPanel() is a native macOS dialog, managed by the OS as a singleton.
  // No need for manual window tracking.
  app.showAboutPanel();
}

/**
 * Cached tray icons — only 4 variants (dark/light × active/inactive).
 * Avoids rebuilding from disk on every theme/settings change.
 */
const iconCache = new Map<string, Electron.NativeImage>();

export function setupTray(): void {
  // In dev:      __dirname = lib/main/   → ../../src/assets
  // In packaged: __dirname = app.asar/lib/main/ → ../../src/assets (inside asar)
  //
  // IMPORTANT: use nativeImage.createFromPath() — it understands asar virtual paths.
  // fs.readFileSync() does NOT resolve asar paths in the main process and will throw,
  // which silently prevents the tray from ever being created.
  const assetsDir = path.join(__dirname, "..", "..", "src", "assets");

  function buildIcon(isDark: boolean, isActive: boolean): Electron.NativeImage {
    const key = `${isDark}-${isActive}`;
    const cached = iconCache.get(key);
    if (cached) return cached;

    const suffix = isDark ? "dark" : "light";
    const statePrefix = isActive ? "" : "inactive-";
    const icon1x = nativeImage.createFromPath(
      path.join(assetsDir, `tray-icon-${statePrefix}${suffix}.png`),
    );
    const icon2x = nativeImage.createFromPath(
      path.join(assetsDir, `tray-icon-${statePrefix}${suffix}@2x.png`),
    );
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({ scaleFactor: 1.0, buffer: icon1x.toPNG() });
    icon.addRepresentation({ scaleFactor: 2.0, buffer: icon2x.toPNG() });

    iconCache.set(key, icon);
    return icon;
  }

  function refreshTrayIcon(): void {
    if (!tray) return;
    tray.setImage(
      buildIcon(nativeTheme.shouldUseDarkColors, getSettings().preventSleep),
    );
  }

  const initialSettings = getSettings();
  tray = new Tray(
    buildIcon(nativeTheme.shouldUseDarkColors, initialSettings.preventSleep),
  );
  tray.setToolTip("Amphetamine");

  // Update icon whenever the system theme changes or settings change
  const onThemeUpdated = (): void => {
    refreshTrayIcon();
  };
  nativeTheme.on("updated", onThemeUpdated);

  // Store unsubscribe for cleanup robustness
  onSettingsChanged(() => {
    refreshTrayIcon();
  });

  // Listener is cleaned up on process exit (app.before-quit destroys the tray).

  // Left-click → static context menu
  tray.on("click", () => {
    const template: MenuItemConstructorOptions[] = [
      { type: "separator" },
      { label: "Settings...", click: () => createSettingsWindow() },
      { label: "About Amphetamine", click: () => showAbout() },
      { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
    ];
    tray!.popUpContextMenu(Menu.buildFromTemplate(template));
  });
}
