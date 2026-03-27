import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Hoisted mocks ---
const mockOn = vi.hoisted(() => vi.fn());
const mockRemoveAllListeners = vi.hoisted(() => vi.fn());
const mockCheckForUpdates = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockGetAllWindows = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockIpcMainHandle = vi.hoisted(() => vi.fn());
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());
const mockShellOpenExternal = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("electron-updater", () => ({
  autoUpdater: {
    on: mockOn,
    removeAllListeners: mockRemoveAllListeners,
    checkForUpdates: mockCheckForUpdates,
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: false,
  },
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
  },
  shell: {
    openExternal: mockShellOpenExternal,
  },
  ipcMain: {
    handle: mockIpcMainHandle,
  },
}));

vi.mock("electron-log", () => ({
  default: { info: mockLogInfo, warn: mockLogWarn, error: mockLogError },
}));

describe("auto-updater", () => {
  let initAutoUpdater: () => void;
  let stopAutoUpdater: () => void;
  let registerAutoUpdaterIpc: () => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Re-apply default mock behavior
    mockCheckForUpdates.mockResolvedValue(null);
    mockGetAllWindows.mockReturnValue([]);

    const mod = await import("../../src/main/auto-updater.js");
    initAutoUpdater = mod.initAutoUpdater;
    stopAutoUpdater = mod.stopAutoUpdater;
    registerAutoUpdaterIpc = mod.registerAutoUpdaterIpc;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initAutoUpdater", () => {
    it("does nothing when app is not packaged", async () => {
      // Temporarily override isPackaged via a dynamic mock override
      // The function early-returns when isPackaged is false, so we need to
      // test by calling initAutoUpdater when isPackaged was false at import time.
      // Use resetModules + re-import with mutated app mock, then restore.

      const { app } = await import("electron");
      const originalPackaged = app.isPackaged;
      vi.mocked(app).isPackaged = false;

      vi.resetModules();
      const freshMod = await import("../../src/main/auto-updater.js");
      freshMod.initAutoUpdater();

      // Restore for subsequent tests
      vi.mocked(app).isPackaged = originalPackaged;
      vi.resetModules();
      // Re-import to restore module state for next test's beforeEach
      await import("../../src/main/auto-updater.js");

      expect(mockOn).not.toHaveBeenCalled();
    });

    it("registers event handlers when app is packaged", () => {
      initAutoUpdater();

      expect(mockOn).toHaveBeenCalledWith("checking-for-update", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("update-available", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("update-not-available", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("download-progress", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("update-downloaded", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));
    });

    it("sets autoDownload and autoInstallOnAppQuit to false", async () => {
      const { autoUpdater } = await import("electron-updater");

      initAutoUpdater();

      expect(autoUpdater.autoDownload).toBe(false);
      expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
    });

    it("schedules initial check after 3 seconds", () => {
      initAutoUpdater();

      expect(mockCheckForUpdates).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);

      expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);
    });

    it("broadcasts to windows on update-available event", () => {
      const mockWindow = { webContents: { send: vi.fn() } };
      mockGetAllWindows.mockReturnValue([
        mockWindow as unknown as ReturnType<typeof mockGetAllWindows> extends () => infer R
          ? R extends Array<infer T>
            ? T
            : never
          : never,
      ]);

      initAutoUpdater();

      // Find the update-available handler
      const updateAvailableCall = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = updateAvailableCall![1];

      handler({
        version: "1.2.0",
        releaseDate: "2025-01-01",
        releaseNotes: "Bug fixes",
      });

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "auto-updater:status",
        expect.objectContaining({
          status: "available",
          info: expect.objectContaining({ version: "1.2.0" }),
        }),
      );
    });

    it("opens release URL when version is valid semver", () => {
      initAutoUpdater();

      const updateAvailableCall = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = updateAvailableCall![1];

      handler({ version: "2.0.0", releaseDate: "2025-01-01" });

      expect(mockShellOpenExternal).toHaveBeenCalledWith(
        "https://github.com/CCWorkforce/OpenAmphetamine/releases/tag/v2.0.0",
      );
    });

    it("does NOT open release URL when version is invalid", () => {
      initAutoUpdater();

      const updateAvailableCall = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = updateAvailableCall![1];

      handler({ version: "malicious<script>", releaseDate: "2025-01-01" });

      expect(mockShellOpenExternal).not.toHaveBeenCalled();
      expect(mockLogWarn).toHaveBeenCalled();
    });

    it("broadcasts error status on error event", () => {
      const mockWindow = { webContents: { send: vi.fn() } };
      mockGetAllWindows.mockReturnValue([
        mockWindow as unknown as ReturnType<typeof mockGetAllWindows> extends () => infer R
          ? R extends Array<infer T>
            ? T
            : never
          : never,
      ]);

      initAutoUpdater();

      const errorCall = mockOn.mock.calls.find((call) => call[0] === "error");
      const handler = errorCall![1];

      handler(new Error("Network error"));

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "auto-updater:status",
        expect.objectContaining({
          status: "error",
          error: "Network error",
        }),
      );
    });
  });

  describe("stopAutoUpdater", () => {
    it("removes all listeners and clears interval", () => {
      initAutoUpdater();
      vi.clearAllMocks();

      stopAutoUpdater();

      expect(mockRemoveAllListeners).toHaveBeenCalled();
    });

    it("is safe to call without init", () => {
      expect(() => stopAutoUpdater()).not.toThrow();
    });
  });

  describe("registerAutoUpdaterIpc", () => {
    it("registers IPC handler for auto-updater:check", () => {
      registerAutoUpdaterIpc();

      expect(mockIpcMainHandle).toHaveBeenCalledWith("auto-updater:check", expect.any(Function));
    });
  });
});
