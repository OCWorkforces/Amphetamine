import { app, BrowserWindow, dialog } from "electron";
import log from "electron-log";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupTray } from "./tray.js";
import { registerIpcHandlers } from "./ipc.js";
import { getPackageInfo } from "./utils/packageInfo.js";
import { initCoordinator, cleanupCoordinator, getTrayDeps } from "./coordinator.js";
import { unregisterGlobalShortcut } from "./global-shortcut.js";
import { closeSettingsWindow } from "./settings-window.js";
import { initAutoUpdater, stopAutoUpdater } from "./auto-updater.js";
import { broadcastToWindows } from "./utils/broadcast.js";
import { IPC_CHANNELS } from "../shared/types.js";
import {
  MAIN_WINDOW_WIDTH,
  MAIN_WINDOW_HEIGHT,
  HIDE_DELAY_MS,
  getDevServerUrl,
  isDev,
} from "./constants.js";
import { hardenWebContents } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
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

  hardenWebContents(win);
  if (isDev) {
    const devUrl = getDevServerUrl();
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }
  // Intercept close/minimize → hide to tray (unless quitting)
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });
  win.on("minimize", () => {
    if (!win.isDestroyed()) {
      broadcastToWindows(IPC_CHANNELS.WINDOW_HIDE, undefined);
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.hide();
        }
      }, HIDE_DELAY_MS);
    }
  });
  // Hide when focus lost (popover behavior)
  win.on("blur", () => {
    if (!isDev && !isQuitting) {
      if (!win.isDestroyed()) {
        broadcastToWindows(IPC_CHANNELS.WINDOW_HIDE, undefined);
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.hide();
          }
        }, HIDE_DELAY_MS);
      }
    }
  });
  return win;
}
void app.whenReady().then(async () => {
  // Register as accessory app — no Dock icon, no menu bar
  app.setActivationPolicy("accessory");
  mainWindow = createWindow();
  registerIpcHandlers(mainWindow);
  // Initialize coordinator — handles syncPreventSleep, syncAutoLaunch, session cancel, broadcast, shortcut
  await initCoordinator();
  cleanupTray = setupTray(getTrayDeps());
  initAutoUpdater();
});
app.on("window-all-closed", () => {
  // Tray-only app stays alive when all windows close
});
app.on("before-quit", () => {
  isQuitting = true;
  cleanupTray?.();
  closeSettingsWindow();
  cleanupCoordinator();
  unregisterGlobalShortcut();
  stopAutoUpdater();
  if (mainWindow) {
    mainWindow.destroy();
  }
});
