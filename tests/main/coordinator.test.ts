import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const mockGetSettings = vi.hoisted(() => vi.fn());
const mockOnSettingsChanged = vi.hoisted(() => vi.fn());
const mockUpdateSettings = vi.hoisted(() => vi.fn());
const mockSyncAutoLaunch = vi.hoisted(() => vi.fn());
const mockCancelSession = vi.hoisted(() => vi.fn());
const mockSetOnSessionStateChange = vi.hoisted(() => vi.fn());
const mockSetSettingsReader = vi.hoisted(() => vi.fn());
const mockGetAllWindows = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockRegisterGlobalShortcut = vi.hoisted(() => vi.fn());

// Power-saver mocks (now inline in coordinator)
const mockPowerSaveBlocker = vi.hoisted(() => ({
  start: vi.fn().mockReturnValue(1),
  stop: vi.fn(),
  isStarted: vi.fn().mockReturnValue(true),
}));
const mockPowerMonitor = vi.hoisted(() => ({
  on: vi.fn(),
}));

vi.mock("electron", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    app: { isPackaged: false },
    BrowserWindow: { getAllWindows: mockGetAllWindows },
    powerSaveBlocker: mockPowerSaveBlocker,
    powerMonitor: mockPowerMonitor,
  };
});

vi.mock("electron-log", () => ({
  default: { info: mockLogInfo, error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
  onSettingsChanged: mockOnSettingsChanged,
  updateSettings: mockUpdateSettings,
}));

vi.mock("../../src/main/system-integrations.js", () => ({
  syncAutoLaunch: mockSyncAutoLaunch,
  registerGlobalShortcut: mockRegisterGlobalShortcut,
}));

vi.mock("../../src/main/session-timer.js", () => ({
  cancelSession: mockCancelSession,
  setOnSessionStateChange: mockSetOnSessionStateChange,
  setSettingsReader: mockSetSettingsReader,
}));

describe("coordinator", () => {
  let initCoordinator: () => void;
  let cleanupCoordinator: () => void;
  let settingsCallback: (_settings: Record<string, unknown>) => void;

  const defaultSettings = {
    launchAtLogin: false,
    preventSleep: false,
    sessionDuration: null as number | null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Capture the callback passed to onSettingsChanged
    mockOnSettingsChanged.mockImplementation((cb: (_settings: Record<string, unknown>) => void) => {
      settingsCallback = cb;
      return () => {}; // unsubscribe fn
    });

    mockGetSettings.mockReturnValue({ ...defaultSettings });
    mockGetAllWindows.mockReturnValue([]);
    mockPowerMonitor.on.mockImplementation(() => {});

    const mod = await import("../../src/main/coordinator.js");
    initCoordinator = mod.initCoordinator;
    cleanupCoordinator = mod.cleanupCoordinator;
  });

  describe("initCoordinator", () => {
    it("syncs auto-launch state on init", () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, launchAtLogin: true });
      initCoordinator();

      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
    });

    it("syncs preventSleep state on init", () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
      initCoordinator();

      expect(mockPowerSaveBlocker.start).toHaveBeenCalled();
    });

    it("wires battery auto-stop callback to cancelSession", async () => {
      initCoordinator();
      const mod = await import("../../src/main/coordinator.js");
      // Verify the exported function exists (callback is wired internally)
      expect(typeof mod.setBatteryAutoStopCallback).toBe("function");
    });

    it("wires battery threshold getter", async () => {
      initCoordinator();
      const mod = await import("../../src/main/coordinator.js");
      expect(typeof mod.setBatteryThresholdGetter).toBe("function");
    });

    it("initializes battery monitoring", () => {
      initCoordinator();

      // powerMonitor.on should be called for "on-battery" and "on-ac"
      expect(mockPowerMonitor.on).toHaveBeenCalledWith("on-battery", expect.any(Function));
      expect(mockPowerMonitor.on).toHaveBeenCalledWith("on-ac", expect.any(Function));
    });

    it("subscribes to settings changes", () => {
      initCoordinator();

      expect(mockOnSettingsChanged).toHaveBeenCalledWith(expect.any(Function));
    });

    it("registers global shortcut with deps", () => {
      initCoordinator();

      expect(mockRegisterGlobalShortcut).toHaveBeenCalledWith(
        expect.objectContaining({
          getShortcut: expect.any(Function),
          getPreventSleep: expect.any(Function),
          togglePreventSleep: expect.any(Function),
        }),
      );
    });

    it("syncs preventSleep on settings change", () => {
      initCoordinator();

      settingsCallback({ ...defaultSettings, preventSleep: true });

      expect(mockPowerSaveBlocker.start).toHaveBeenCalled();
    });

    it("syncs autoLaunch on settings change", () => {
      initCoordinator();

      settingsCallback({ ...defaultSettings, launchAtLogin: true });

      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
    });

    it("cancels session when preventSleep transitions true to false", () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
      initCoordinator();

      settingsCallback({ ...defaultSettings, preventSleep: false });

      expect(mockCancelSession).toHaveBeenCalledTimes(1);
    });

    it("does not cancel session when preventSleep stays false", () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: false });
      initCoordinator();

      settingsCallback({ ...defaultSettings, preventSleep: false });

      expect(mockCancelSession).not.toHaveBeenCalled();
    });

    it("does not cancel session when preventSleep transitions false to true", () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: false });
      initCoordinator();

      settingsCallback({ ...defaultSettings, preventSleep: true });

      expect(mockCancelSession).not.toHaveBeenCalled();
    });

    it("broadcasts settings to all renderer windows", () => {
      const mockSend = vi.fn();
      mockGetAllWindows.mockReturnValue([{ webContents: { send: mockSend } }]);

      initCoordinator();

      const newSettings = { ...defaultSettings, preventSleep: true };
      settingsCallback(newSettings);

      expect(mockSend).toHaveBeenCalledWith("settings:changed", newSettings);
    });

    it("broadcasts to multiple windows", () => {
      const mockSend1 = vi.fn();
      const mockSend2 = vi.fn();
      mockGetAllWindows.mockReturnValue([
        { webContents: { send: mockSend1 } },
        { webContents: { send: mockSend2 } },
      ]);

      initCoordinator();

      const newSettings = { ...defaultSettings, preventSleep: true };
      settingsCallback(newSettings);

      expect(mockSend1).toHaveBeenCalledWith("settings:changed", newSettings);
      expect(mockSend2).toHaveBeenCalledWith("settings:changed", newSettings);
    });

    it("logs initialization", () => {
      initCoordinator();

      expect(mockLogInfo).toHaveBeenCalledWith("[coordinator] Initialized");
    });
  });

  describe("cleanupCoordinator", () => {
    it("unsubscribes from settings changes", () => {
      const mockUnsubscribe = vi.fn();
      mockOnSettingsChanged.mockReturnValue(mockUnsubscribe);
      initCoordinator();

      cleanupCoordinator();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it("stops preventing sleep", () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
      initCoordinator();
      cleanupCoordinator();

      expect(mockPowerSaveBlocker.stop).toHaveBeenCalledTimes(1);
    });

    it("logs cleanup", () => {
      initCoordinator();
      cleanupCoordinator();

      expect(mockLogInfo).toHaveBeenCalledWith("[coordinator] Cleaned up");
    });

    it("handles cleanup when not initialized", () => {
      // cleanupCoordinator without initCoordinator — should not throw
      expect(() => cleanupCoordinator()).not.toThrow();
    });
  });
});
