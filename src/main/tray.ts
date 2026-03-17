import {
  Tray,
  BrowserWindow,
  nativeImage,
  nativeTheme,
  Menu,
  app,
  type MenuItemConstructorOptions,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSettingsWindow } from "./settings-window.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

let aboutOpen = false;

function showAbout(mainWindow: BrowserWindow): void {
  if (aboutOpen) {
    // Focus the existing about window
    const existing = BrowserWindow.getAllWindows().find(
      (w) => w !== mainWindow,
    );
    existing?.focus();
    return;
  }
  aboutOpen = true;
  app.showAboutPanel();
  setImmediate(() => {
    const aboutWindow = BrowserWindow.getAllWindows().find(
      (w) => w !== mainWindow,
    );
    if (aboutWindow) {
      aboutWindow.setAlwaysOnTop(true, "floating");
      aboutWindow.once("closed", () => {
        aboutOpen = false;
      });
    } else {
      aboutOpen = false;
    }
  });
}

export function setupTray(mainWindow: BrowserWindow): void {
  // In dev:      __dirname = lib/main/   → ../../src/assets
  // In packaged: __dirname = app.asar/lib/main/ → ../../src/assets (inside asar)
  //
  // IMPORTANT: use nativeImage.createFromPath() — it understands asar virtual paths.
  // fs.readFileSync() does NOT resolve asar paths in the main process and will throw,
  // which silently prevents the tray from ever being created.
  const assetsDir = path.join(__dirname, "..", "..", "src", "assets");

  function buildIcon(isDark: boolean): Electron.NativeImage {
    const suffix = isDark ? "dark" : "light";
    const icon1x = nativeImage.createFromPath(
      path.join(assetsDir, `tray-icon-${suffix}.png`),
    );
    const icon2x = nativeImage.createFromPath(
      path.join(assetsDir, `tray-icon-${suffix}@2x.png`),
    );
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({ scaleFactor: 1.0, buffer: icon1x.toPNG() });
    icon.addRepresentation({ scaleFactor: 2.0, buffer: icon2x.toPNG() });
    return icon;
  }

  tray = new Tray(buildIcon(nativeTheme.shouldUseDarkColors));
  tray.setToolTip("Amphetamine");

  // Update icon whenever the system theme changes
  const onThemeUpdated = (): void => {
    tray?.setImage(buildIcon(nativeTheme.shouldUseDarkColors));
  };
  nativeTheme.on("updated", onThemeUpdated);

  // Listener is cleaned up on process exit (app.before-quit destroys the tray).

  // Left-click → static context menu
  tray.on("click", () => {
    const template: MenuItemConstructorOptions[] = [
      { type: "separator" },
      { label: "Settings...", click: () => createSettingsWindow() },
      { label: "About", click: () => showAbout(mainWindow) },
      { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
    ];
    tray!.popUpContextMenu(Menu.buildFromTemplate(template));
  });
}
