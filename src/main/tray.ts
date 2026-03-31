import {
  Tray,
  nativeImage,
  nativeTheme,
  Menu,
  app,
  type MenuItemConstructorOptions,
} from "electron";
import log from "electron-log";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSettingsWindow } from "./settings-window.js";

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

export interface TrayDeps {
  getPreventSleep: () => boolean;
  togglePreventSleep: () => void;
  onSettingsChanged: (callback: () => void) => () => void;
}

export function setupTray(deps: TrayDeps): () => void {
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
    // Fall back to a programmatic icon if image files are missing or corrupted
    if (icon1x.isEmpty() || icon2x.isEmpty()) {
      log.warn("[tray] Tray icon files missing or corrupted, using fallback");
      const size = 16;
      const fallback = nativeImage.createFromBuffer(
        Buffer.from(
          `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
            `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${
              isDark ? "#007AFF" : "#FF9500"
            }"/></svg>`,
        ),
      );
      return fallback;
    }
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({ scaleFactor: 1.0, buffer: icon1x.toPNG() });
    icon.addRepresentation({ scaleFactor: 2.0, buffer: icon2x.toPNG() });

    iconCache.set(key, icon);
    return icon;
  }

  function refreshTrayIcon(): void {
    if (!tray) return;
    tray.setImage(buildIcon(nativeTheme.shouldUseDarkColors, deps.getPreventSleep()));
  }

  const initialPreventSleep = deps.getPreventSleep();
  tray = new Tray(buildIcon(nativeTheme.shouldUseDarkColors, initialPreventSleep));
  tray.setToolTip("Amphetamine");

  // Update icon whenever the system theme changes or settings change
  const onThemeUpdated = (): void => {
    refreshTrayIcon();
  };
  nativeTheme.on("updated", onThemeUpdated);

  // Store unsubscribe for cleanup robustness
  deps.onSettingsChanged(() => {
    refreshTrayIcon();
  });

  // Listener is cleaned up on process exit (app.before-quit destroys the tray).

  // Left-click → static context menu
  tray.on("click", () => {
    const preventSleep = deps.getPreventSleep();

    const template: MenuItemConstructorOptions[] = [
      {
        label: "Prevent Sleep",
        type: "checkbox",
        checked: preventSleep,
        click: () => {
          deps.togglePreventSleep();
        },
      },
      { type: "separator" },
      { label: "Settings...", click: () => createSettingsWindow() },
      { label: "About Amphetamine", click: () => showAbout() },
      { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
    ];
    tray!.popUpContextMenu(Menu.buildFromTemplate(template));
  });
  return () => {
    nativeTheme.removeListener("updated", onThemeUpdated);
    tray = null;
    iconCache.clear();
  };
}
