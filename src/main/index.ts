import { app, BrowserWindow, dialog } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupTray } from "./tray.js";
import { registerIpcHandlers } from "./ipc.js";
import { getPackageInfo } from "./utils/packageInfo.js";
import { getSettings } from "./settings.js";
import { syncAutoLaunch } from "./auto-launch.js";
import { syncPreventSleep, stopPreventingSleep } from "./power-saver.js";
import { closeSettingsWindow } from "./settings-window.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

// === Process-level error handlers ===
process.on("uncaughtException", (error: Error) => {
  console.error("[main] Uncaught exception:", error);
  if (!isDev) {
    dialog.showErrorBox(
      "Unexpected Error",
      error.message || "An unexpected error occurred.",
    );
    app.exit(1);
  }
});

process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    console.error("[main] Unhandled rejection at:", promise, "reason:", reason);
    // Do not exit on unhandled rejection - these are often recoverable
  },
);

const packageJson = getPackageInfo();
const platform = [os.type(), os.release(), os.arch()].join(", ");

app.setAboutPanelOptions({
  applicationName: "Amphetamine",
  applicationVersion: app.getVersion(),
  copyright: `Developed by ${packageJson.author}`,
  version: platform,
});

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    vibrancy: "popover",
    visualEffectState: "active",
    titleBarStyle: "hidden",
    transparent: true,
    hasShadow: true,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    const devUrl =
      process.env["DEV_SERVER_URL"] ?? "http://localhost:5173";
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  // Intercept close/minimize → hide to tray (unless quitting)
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });

  win.on("minimize", () => {
    win.hide();
  });

  // Hide when focus lost (popover behavior)
  win.on("blur", () => {
    if (!isDev) {
      win.hide();
    }
  });

  return win;
}

app.whenReady().then(() => {
  // Register as accessory app — no Dock icon, no menu bar
  app.setActivationPolicy("accessory");

  mainWindow = createWindow();
  registerIpcHandlers(mainWindow);
  setupTray();

  // Sync auto-launch setting on startup
  const settings = getSettings();
  syncAutoLaunch(settings.launchAtLogin);
  syncPreventSleep(settings.preventSleep);
});

app.on("window-all-closed", () => {
  // Prevent default quit — tray-only app stays alive
  // No-op: keep app running in tray
});

app.on("before-quit", () => {
  isQuitting = true;
  closeSettingsWindow();
  stopPreventingSleep();
  if (mainWindow) {
    mainWindow.destroy();
  }
});
