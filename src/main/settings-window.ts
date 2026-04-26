import { app, BrowserWindow, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT, getDevServerUrl, isDev } from "./constants.js";
import { hardenWebContents } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve icon.icns path:
//   Dev:      lib/main/ → ../../build/icon.icns
//   Packaged: app.asar/lib/main/ → build resources at process.resourcesPath
function getAppIconPath(): string {
  if (isDev) {
    return path.join(__dirname, "..", "..", "build", "icon.icns");
  }
  return path.join(process.resourcesPath, "icon.icns");
}

/** Cached dock icon to avoid re-reading from disk on every settings open */
let cachedDockIcon: Electron.NativeImage | null = null;

function getDockIcon(): Electron.NativeImage {
  if (!cachedDockIcon) {
    cachedDockIcon = nativeImage.createFromPath(getAppIconPath());
  }
  return cachedDockIcon;
}

let settingsWindow: BrowserWindow | null = null;

/**
 * Creates or focuses the settings window.
 * Singleton pattern - only one settings window at a time.
 * Shows in Dock when open, closes normally (not hide-on-close).
 */
export function createSettingsWindow(): BrowserWindow {
  // Return existing window if already open and focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const win = new BrowserWindow({
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    minWidth: SETTINGS_WINDOW_WIDTH,
    minHeight: SETTINGS_WINDOW_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    visualEffectState: "active",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  hardenWebContents(win);

  // Load settings page
  if (isDev) {
    const devUrl = getDevServerUrl();
    void win.loadURL(`${devUrl}/settings.html`);
  } else {
    void win.loadFile(path.join(__dirname, "..", "renderer", "settings.html"));
  }

  // Show window when ready
  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
    // Switch to regular app so Dock icon appears with settings window
    app.setActivationPolicy("regular");
    app.dock?.setIcon(getDockIcon());
  });

  // Clean up reference on close
  win.on("closed", () => {
    settingsWindow = null;
    // Return to accessory mode when settings window closes (tray-only app)
    app.setActivationPolicy("accessory");
  });

  settingsWindow = win;
  return win;
}

/**
 * Closes the settings window if open.
 * Called from app quit handler.
 */
export function closeSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
  settingsWindow = null;
}
