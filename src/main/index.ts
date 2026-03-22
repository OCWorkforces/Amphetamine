import { app, BrowserWindow, dialog } from "electron";
import log from "electron-log";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupTray } from "./tray.js";
import { registerIpcHandlers } from "./ipc.js";
import { getPackageInfo } from "./utils/packageInfo.js";
import { getSettings } from "./settings.js";
import { syncAutoLaunch } from "./auto-launch.js";
import { syncPreventSleep, stopPreventingSleep, initBatteryMonitoring } from "./power-saver.js";
import { registerGlobalShortcut, unregisterGlobalShortcut } from "./shortcut.js";
import { closeSettingsWindow } from "./settings-window.js";
import { initAutoUpdater, stopAutoUpdater } from "./auto-updater.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

// === Process-level error handlers ===
process.on("uncaughtException", (error: Error) => {
  log.error("[main] Uncaught exception:", error);
  if (!isDev) {
    dialog.showErrorBox("Unexpected Error", error.message || "An unexpected error occurred.");
    app.exit(1);
  }
});

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  log.error("[main] Unhandled rejection at:", promise, "reason:", reason);
  // Do not exit on unhandled rejection - these are often recoverable
});

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
let cleanupTray: (() => void) | null = null;

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
    const devUrl = process.env["DEV_SERVER_URL"] ?? "http://localhost:5173";
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
    if (!win.isDestroyed()) {
      win.webContents.send("popover:hide");
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.hide();
        }
      }, 160);
    }
  });

  // Hide when focus lost (popover behavior)
  win.on("blur", () => {
    if (!isDev) {
      if (!win.isDestroyed()) {
        win.webContents.send("popover:hide");
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.hide();
          }
        }, 160);
      }
    }
  });

  return win;
}

app.whenReady().then(() => {
  // Register as accessory app — no Dock icon, no menu bar
  app.setActivationPolicy("accessory");

  mainWindow = createWindow();
  registerIpcHandlers(mainWindow);
  cleanupTray = setupTray();

  // Sync auto-launch setting on startup
  const settings = getSettings();
  syncAutoLaunch(settings.launchAtLogin);
  syncPreventSleep(settings.preventSleep);
  void initBatteryMonitoring();
  registerGlobalShortcut();
  initAutoUpdater();
});

app.on("window-all-closed", () => {
  // Prevent default quit — tray-only app stays alive
  // No-op: keep app running in tray
});

app.on("before-quit", () => {
  isQuitting = true;
  cleanupTray?.();
  closeSettingsWindow();
  unregisterGlobalShortcut();
  stopPreventingSleep();
  stopAutoUpdater();
  if (mainWindow) {
    mainWindow.destroy();
  }
});
