import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const mockGetSettings = vi.hoisted(() => vi.fn());
const mockOnSettingsChanged = vi.hoisted(() => vi.fn());
const mockUpdateSettings = vi.hoisted(() => vi.fn());
const mockSyncPreventSleep = vi.hoisted(() => vi.fn());
const mockSyncAutoLaunch = vi.hoisted(() => vi.fn());
const mockInitBatteryMonitoring = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockSetBatteryAutoStopCallback = vi.hoisted(() => vi.fn());
const mockStopPreventingSleep = vi.hoisted(() => vi.fn());
const mockSetBatteryThresholdGetter = vi.hoisted(() => vi.fn());
const mockCancelSession = vi.hoisted(() => vi.fn());
const mockGetAllWindows = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockRegisterGlobalShortcut = vi.hoisted(() => vi.fn());

vi.mock("electron", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BrowserWindow: { getAllWindows: mockGetAllWindows },
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

vi.mock("../../src/main/power-saver.js", () => ({
  syncPreventSleep: mockSyncPreventSleep,
  initBatteryMonitoring: mockInitBatteryMonitoring,
  setBatteryAutoStopCallback: mockSetBatteryAutoStopCallback,
  setBatteryThresholdGetter: mockSetBatteryThresholdGetter,
  stopPreventingSleep: mockStopPreventingSleep,
}));

vi.mock("../../src/main/auto-launch.js", () => ({
  syncAutoLaunch: mockSyncAutoLaunch,
}));

vi.mock("../../src/main/session-timer.js", () => ({
  cancelSession: mockCancelSession,
}));

vi.mock("../../src/main/shortcut.js", () => ({
  registerGlobalShortcut: mockRegisterGlobalShortcut,
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

      expect(mockSyncPreventSleep).toHaveBeenCalledWith(true);
    });

    it("wires battery auto-stop callback to cancelSession", () => {
      initCoordinator();

      expect(mockSetBatteryAutoStopCallback).toHaveBeenCalledWith(mockCancelSession);
    });

    it("wires battery threshold getter", () => {
      initCoordinator();

      expect(mockSetBatteryThresholdGetter).toHaveBeenCalledWith(expect.any(Function));
    });

    it("initializes battery monitoring", () => {
      initCoordinator();

      expect(mockInitBatteryMonitoring).toHaveBeenCalled();
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

      expect(mockSyncPreventSleep).toHaveBeenCalledWith(true);
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
      initCoordinator();
      cleanupCoordinator();

      expect(mockStopPreventingSleep).toHaveBeenCalledTimes(1);
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
