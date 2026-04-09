import { BrowserWindow } from "electron";

/**
 * Broadcast a message to all renderer windows.
 * Shared utility used by coordinator and auto-updater.
 */
export function broadcastToWindows(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}
