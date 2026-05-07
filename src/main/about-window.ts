import { BrowserWindow, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ABOUT_WINDOW_WIDTH, ABOUT_WINDOW_HEIGHT } from "./constants.js";
import { hardenWebContents } from "./security.js";
import { getPackageInfo } from "./utils/packageInfo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Reference to the singleton About BrowserWindow (null when not open). */
let aboutWindow: BrowserWindow | null = null;

// Same path resolution as tray icons — nativeImage.createFromPath understands asar paths
// Dev:      lib/main/ → ../../src/assets/settings-hero-icon.png
// Packaged: app.asar/lib/main/ → resolves correctly inside asar
const aboutIconImage = nativeImage.createFromPath(
  path.join(__dirname, "..", "..", "src", "assets", "settings-hero-icon.png"),
);
const ABOUT_ICON_DATA_URI = `data:image/png;base64,${aboutIconImage.toPNG().toString("base64")}`;

/**
 * Creates or focuses the About window.
 * Singleton pattern — only one About window at a time.
 * Set alwaysOnTop so it stays above other windows.
 */
export function showAbout(_mainWindow?: BrowserWindow): void {
  // Reuse existing about window if still alive
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const pkg = getPackageInfo();

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>About ${pkg.productName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 24px 24px 12px 24px;
    -webkit-app-region: drag;
    user-select: none;
    -webkit-user-select: none;
    cursor: default;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1e1e1e; color: #e0e0e0; }
    .version { color: #8e8e93; }
    .description { color: #a0a0a0; }
    button {
      border: 1px solid #48484a;
      background: #2c2c2e;
      color: #f5f5f7;
    }
    button:hover { background: #3a3a3c; }
    button:active { background: #48484a; }
  }
  @media (prefers-color-scheme: light) {
    body { background: #f0f0f0; color: #1d1d1f; }
    .version { color: #86868b; }
    .description { color: #6e6e73; }
    button {
      border: 1px solid #d2d2d7;
      background: #ffffff;
      color: #1d1d1f;
    }
    button:hover { background: #f5f5f7; }
    button:active { background: #e8e8ed; }
  }
  .app-icon {
    width: 96px;
    height: 96px;
    margin-bottom: 16px;
    border-radius: 22px;
    box-shadow: 0 8px 32px rgba(0, 122, 255, 0.18);
  }
  h1 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 6px;
    letter-spacing: -0.25px;
  }
  .version {
    font-size: 13px;
    margin-bottom: 14px;
  }
  .description {
    font-size: 13px;
    max-width: 280px;
    text-align: center;
    line-height: 1.45;
    margin-bottom: 22px;
  }
  button {
    font-family: inherit;
    font-size: 13px;
    padding: 6px 24px;
    border-radius: 6px;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
</style>
</head>
<body>
  <img class="app-icon" src="${ABOUT_ICON_DATA_URI}" alt="${pkg.productName} icon" draggable="false" />
  <h1>${pkg.productName}</h1>
  <div class="version">Version ${pkg.version}</div>
  <div class="description">${pkg.description}</div>
  <button onclick="window.close()">Close</button>
</body>
</html>`;

  const win = new BrowserWindow({
    width: ABOUT_WINDOW_WIDTH,
    height: ABOUT_WINDOW_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    visualEffectState: "active",
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  hardenWebContents(win);

  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
  });

  win.on("closed", () => {
    if (aboutWindow === win) {
      aboutWindow = null;
    }
  });

  aboutWindow = win;
}

/**
 * Closes the About window if open.
 */
export function closeAboutWindow(): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.close();
  }
  aboutWindow = null;
}
