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

    // Wire broadcast function (uses real broadcastToWindows with mocked BrowserWindow.getAllWindows)
    const { broadcastToWindows } = await import("../../src/main/utils/broadcast.js");
    mod.setBroadcastFn(broadcastToWindows);
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
      const mockWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
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
      const mockWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
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

  describe("version validation (security)", () => {
    it("rejects path traversal attempts in version", () => {
      initAutoUpdater();
      const call = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = call![1];

      handler({ version: "../../../etc/passwd", releaseDate: "2025-01-01" });

      expect(mockShellOpenExternal).not.toHaveBeenCalled();
      expect(mockLogWarn).toHaveBeenCalled();
    });

    it("rejects version with embedded HTML/script", () => {
      initAutoUpdater();
      const call = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = call![1];

      handler({ version: "<img src=x onerror=alert(1)>", releaseDate: "2025-01-01" });

      expect(mockShellOpenExternal).not.toHaveBeenCalled();
    });

    it("rejects empty version string", () => {
      initAutoUpdater();
      const call = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = call![1];

      handler({ version: "", releaseDate: "2025-01-01" });

      expect(mockShellOpenExternal).not.toHaveBeenCalled();
    });

    it("accepts valid semver with pre-release tag (e.g. 1.0.0-alpha)", () => {
      initAutoUpdater();
      const call = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = call![1];

      handler({ version: "1.0.0-alpha", releaseDate: "2025-01-01" });

      // The regex /^\d+\.\d+\.\d+/ matches the leading digits
      expect(mockShellOpenExternal).toHaveBeenCalledWith(
        "https://github.com/CCWorkforce/OpenAmphetamine/releases/tag/v1.0.0-alpha",
      );
    });

    it("accepts valid semver with build metadata (e.g. 1.0.0+build.123)", () => {
      initAutoUpdater();
      const call = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = call![1];

      handler({ version: "1.0.0+build.123", releaseDate: "2025-01-01" });

      expect(mockShellOpenExternal).toHaveBeenCalledWith(
        "https://github.com/CCWorkforce/OpenAmphetamine/releases/tag/v1.0.0+build.123",
      );
    });

    it("rejects version with only alphabetic characters", () => {
      initAutoUpdater();
      const call = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = call![1];

      handler({ version: "latest", releaseDate: "2025-01-01" });

      expect(mockShellOpenExternal).not.toHaveBeenCalled();
    });
  });

  describe("event handler details", () => {
    it("broadcasts checking-for-update status", () => {
      const mockWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
      mockGetAllWindows.mockReturnValue([mockWindow as never]);

      initAutoUpdater();

      const checkingCall = mockOn.mock.calls.find((call) => call[0] === "checking-for-update");
      const handler = checkingCall![1];
      handler();

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "auto-updater:status",
        expect.objectContaining({ status: "checking" }),
      );
    });

    it("broadcasts update-not-available status", () => {
      const mockWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
      mockGetAllWindows.mockReturnValue([mockWindow as never]);

      initAutoUpdater();

      const notAvailCall = mockOn.mock.calls.find((call) => call[0] === "update-not-available");
      const handler = notAvailCall![1];
      handler({ version: "1.0.0", releaseDate: "2025-01-01" });

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "auto-updater:status",
        expect.objectContaining({
          status: "not-available",
          info: expect.objectContaining({ version: "1.0.0" }),
        }),
      );
    });

    it("broadcasts download-progress with transfer info", () => {
      const mockWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
      mockGetAllWindows.mockReturnValue([mockWindow as never]);

      initAutoUpdater();

      const progressCall = mockOn.mock.calls.find((call) => call[0] === "download-progress");
      const handler = progressCall![1];
      handler({ percent: 42.5, transferred: 1000, total: 2352 });

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "auto-updater:status",
        expect.objectContaining({
          status: "downloading",
          progress: { percent: 42.5, transferred: 1000, total: 2352 },
        }),
      );
    });

    it("broadcasts update-downloaded status", () => {
      const mockWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
      mockGetAllWindows.mockReturnValue([mockWindow as never]);

      initAutoUpdater();

      const downloadedCall = mockOn.mock.calls.find((call) => call[0] === "update-downloaded");
      const handler = downloadedCall![1];
      handler({ version: "2.0.0", releaseDate: "2025-06-01" });

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "auto-updater:status",
        expect.objectContaining({
          status: "downloaded",
          info: expect.objectContaining({ version: "2.0.0" }),
        }),
      );
    });

    it("includes releaseNotes when present as string", () => {
      const mockWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
      mockGetAllWindows.mockReturnValue([mockWindow as never]);

      initAutoUpdater();

      const call = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = call![1];
      handler({ version: "3.0.0", releaseDate: "2025-01-01", releaseNotes: "New features" });

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "auto-updater:status",
        expect.objectContaining({
          status: "available",
          info: expect.objectContaining({ releaseNotes: "New features" }),
        }),
      );
    });

    it("omits releaseNotes when not a string", () => {
      const mockWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
      mockGetAllWindows.mockReturnValue([mockWindow as never]);

      initAutoUpdater();

      const call = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = call![1];
      handler({ version: "3.0.0", releaseDate: "2025-01-01", releaseNotes: [{ note: "foo" }] });

      const sentData = mockWindow.webContents.send.mock.calls[0]![1];
      expect(sentData.info).not.toHaveProperty("releaseNotes");
    });

    it("handles missing releaseDate gracefully", () => {
      const mockWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
      mockGetAllWindows.mockReturnValue([mockWindow as never]);

      initAutoUpdater();

      const call = mockOn.mock.calls.find((call) => call[0] === "update-available");
      const handler = call![1];
      handler({ version: "1.0.0", releaseDate: undefined });

      const sentData = mockWindow.webContents.send.mock.calls[0]![1];
      expect(sentData.info.releaseDate).toBe("");
    });
  });

  describe("periodic checks", () => {
    it("schedules periodic check every 4 hours", () => {
      initAutoUpdater();

      vi.advanceTimersByTime(3000);
      expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(4 * 60 * 60 * 1000);
      expect(mockCheckForUpdates).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(4 * 60 * 60 * 1000);
      expect(mockCheckForUpdates).toHaveBeenCalledTimes(3);
    });

    it("stopAutoUpdater stops periodic checks", () => {
      initAutoUpdater();

      vi.advanceTimersByTime(3000);
      expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);

      stopAutoUpdater();

      // No further checks after stop
      vi.advanceTimersByTime(4 * 60 * 60 * 1000);
      expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);
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

    it("IPC handler returns null when app is not packaged", async () => {
      const { app } = await import("electron");
      const originalPackaged = app.isPackaged;
      vi.mocked(app).isPackaged = false;

      vi.resetModules();
      const freshMod = await import("../../src/main/auto-updater.js");
      freshMod.registerAutoUpdaterIpc();

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === "auto-updater:check",
      )![1];
      const result = await handler();

      expect(result).toBeNull();

      vi.mocked(app).isPackaged = originalPackaged;
      vi.resetModules();
      await import("../../src/main/auto-updater.js");
    });

    it("IPC handler returns version and releaseDate on successful update check", async () => {
      mockCheckForUpdates.mockResolvedValue({
        updateInfo: { version: "2.5.0", releaseDate: "2025-06-15" },
      });

      registerAutoUpdaterIpc();

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === "auto-updater:check",
      )![1];
      const result = await handler();

      expect(result).toEqual({
        version: "2.5.0",
        releaseDate: "2025-06-15",
      });
    });

    it("IPC handler returns null when checkForUpdates returns no updateInfo", async () => {
      mockCheckForUpdates.mockResolvedValue({ updateInfo: null });

      registerAutoUpdaterIpc();

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === "auto-updater:check",
      )![1];
      const result = await handler();

      expect(result).toBeNull();
    });

    it("IPC handler returns null and logs warning on error", async () => {
      mockCheckForUpdates.mockRejectedValue(new Error("Network timeout"));

      registerAutoUpdaterIpc();

      const handler = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === "auto-updater:check",
      )![1];
      const result = await handler();

      expect(result).toBeNull();
      expect(mockLogWarn).toHaveBeenCalled();
    });
  });
});
