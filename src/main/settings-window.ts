import { app, BrowserWindow, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// Resolve icon.icns path:
//   Dev:      lib/main/ → ../../build/icon.icns
//   Packaged: app.asar/lib/main/ → build resources at process.resourcesPath
function getAppIconPath(): string {
  if (isDev) {
    return path.join(__dirname, "..", "..", "build", "icon.icns");
  }
  return path.join(process.resourcesPath, "icon.icns");
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
    width: 520,
    height: 380,
    minWidth: 520,
    minHeight: 380,
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

  // Load settings page
  if (isDev) {
    const devUrl =
      process.env["VITE_DEV_SERVER_URL"] ?? "http://localhost:5173";
    win.loadURL(`${devUrl}/settings.html`);
  } else {
    win.loadFile(path.join(__dirname, "..", "renderer", "settings.html"));
  }

  // Show window when ready
  win.once("ready-to-show", () => {
    win.show();
    // Show in Dock with app icon when settings window is open
    const icon = nativeImage.createFromPath(getAppIconPath());
    app.dock?.setIcon(icon);
    app.dock?.show();
  });

  // Clean up reference on close
  win.on("closed", () => {
    settingsWindow = null;
    // Hide from Dock when settings window closes (tray-only app)
    app.dock?.hide();
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
