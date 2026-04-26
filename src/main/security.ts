import { app, type BrowserWindow } from "electron";
import log from "electron-log";
import { DEV_ORIGINS } from "./constants.js";

/**
 * Apply navigation + window-open hardening to a BrowserWindow.
 * - Blocks navigation to any origin outside DEV_ORIGINS and the packaged file:// app path.
 * - Denies all window.open() requests (no popups, no external new windows).
 * Applied to every BrowserWindow we create (popover + settings).
 */
export function hardenWebContents(win: BrowserWindow): void {
  const allowedOrigins: readonly string[] = [...DEV_ORIGINS, `file://${app.getAppPath()}`];
  win.webContents.on("will-navigate", (event, url) => {
    if (!allowedOrigins.some((o) => url.startsWith(o))) {
      event.preventDefault();
      log.warn("[security] Blocked navigation to:", url);
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
