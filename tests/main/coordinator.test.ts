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

// Sleep-prevention mocks
const mockSyncPreventSleep = vi.hoisted(() => vi.fn());
const mockStopPreventingSleep = vi.hoisted(() => vi.fn());
const mockIsPreventingSleep = vi.hoisted(() => vi.fn());

// Battery-monitor mocks
const mockSetBatteryThresholdGetter = vi.hoisted(() => vi.fn());
const mockSetBatteryAutoStopCallback = vi.hoisted(() => vi.fn());
const mockSetSleepPreventionChecker = vi.hoisted(() => vi.fn());
const mockSetStopSleepPrevention = vi.hoisted(() => vi.fn());
const mockInitBatteryMonitoring = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCleanupBatteryMonitoring = vi.hoisted(() => vi.fn());
const mockCreateSettingsWindow = vi.hoisted(() => vi.fn());

vi.mock("electron", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    app: { isPackaged: false },
    BrowserWindow: { getAllWindows: mockGetAllWindows },
  };
});

vi.mock("electron-log", () => ({
  default: { info: mockLogInfo, error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../src/main/settings.js", () => ({
  initSettings: vi.fn().mockResolvedValue(undefined),
  getSettings: mockGetSettings,
  onSettingsChanged: mockOnSettingsChanged,
  updateSettings: mockUpdateSettings,
}));

vi.mock("../../src/main/auto-launch.js", () => ({
  syncAutoLaunch: mockSyncAutoLaunch,
}));

vi.mock("../../src/main/global-shortcut.js", () => ({
  registerGlobalShortcut: mockRegisterGlobalShortcut,
}));

vi.mock("../../src/main/sleep-prevention.js", () => ({
  syncPreventSleep: mockSyncPreventSleep,
  stopPreventingSleep: mockStopPreventingSleep,
  isPreventingSleep: mockIsPreventingSleep,
}));

vi.mock("../../src/main/battery-monitor.js", () => ({
  setBatteryThresholdGetter: mockSetBatteryThresholdGetter,
  setBatteryAutoStopCallback: mockSetBatteryAutoStopCallback,
  setSleepPreventionChecker: mockSetSleepPreventionChecker,
  setStopSleepPrevention: mockSetStopSleepPrevention,
  initBatteryMonitoring: mockInitBatteryMonitoring,
  cleanupBatteryMonitoring: mockCleanupBatteryMonitoring,
}));

vi.mock("../../src/main/session-timer.js", () => ({
  cancelSession: mockCancelSession,
  reconcileSessionState: vi.fn(),
  setOnSessionStateChange: mockSetOnSessionStateChange,
  setSettingsReader: mockSetSettingsReader,
  setBroadcastFn: vi.fn(),
}));

vi.mock("../../src/main/settings-window.js", () => ({
  createSettingsWindow: mockCreateSettingsWindow,
}));

describe("coordinator", () => {
  let initCoordinator: () => Promise<void>;
  let cleanupCoordinator: () => void;
  let settingsCallback: (_settings: Record<string, unknown>) => void;

  const defaultSettings = {
    launchAtLogin: false,
    preventSleep: false,
    sessionDuration: null as number | null,
    batteryThreshold: 0,
    shortcut: "",
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
    it("syncs auto-launch state on init", async () => { mockGetSettings.mockReturnValue({ ...defaultSettings, launchAtLogin: true });
    await initCoordinator();
    
    expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true); });

    it("syncs preventSleep state on init", async () => { mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
    await initCoordinator();
    
    expect(mockSyncPreventSleep).toHaveBeenCalledWith(true); });

    it("wires battery auto-stop callback to cancelSession", async () => { await initCoordinator();
    
    expect(mockSetBatteryAutoStopCallback).toHaveBeenCalledWith(mockCancelSession); });

    it("wires battery threshold getter", async () => { await initCoordinator();
    
    expect(mockSetBatteryThresholdGetter).toHaveBeenCalledWith(expect.any(Function)); });

    it("initializes battery monitoring", async () => { await initCoordinator();
    
    expect(mockInitBatteryMonitoring).toHaveBeenCalled(); });

    it("subscribes to settings changes", async () => { await initCoordinator();
    
    expect(mockOnSettingsChanged).toHaveBeenCalledWith(expect.any(Function)); });

    it("registers global shortcut with deps", async () => { await initCoordinator();
    
    expect(mockRegisterGlobalShortcut).toHaveBeenCalledWith(
      expect.objectContaining({
        getShortcut: expect.any(Function),
        getPreventSleep: expect.any(Function),
        togglePreventSleep: expect.any(Function),
      }),
    ); });

    it("syncs preventSleep on settings change", async () => { await initCoordinator();
    
    settingsCallback({ ...defaultSettings, preventSleep: true });
    
    expect(mockSyncPreventSleep).toHaveBeenCalledWith(true); });

    it("syncs autoLaunch on settings change", async () => { await initCoordinator();
    
    settingsCallback({ ...defaultSettings, launchAtLogin: true });
    
    expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true); });

    it("cancels session when preventSleep transitions true to false", async () => { mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
    await initCoordinator();
    
    settingsCallback({ ...defaultSettings, preventSleep: false });
    
    expect(mockCancelSession).toHaveBeenCalledTimes(1); });

    it("does not cancel session when preventSleep stays false", async () => { mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: false });
    await initCoordinator();
    
    settingsCallback({ ...defaultSettings, preventSleep: false });
    
    expect(mockCancelSession).not.toHaveBeenCalled(); });

    it("does not cancel session when preventSleep transitions false to true", async () => { mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: false });
    await initCoordinator();
    
    settingsCallback({ ...defaultSettings, preventSleep: true });
    
    expect(mockCancelSession).not.toHaveBeenCalled(); });

    it("broadcasts settings to all renderer windows", async () => { const mockSend = vi.fn();
    mockGetAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { send: mockSend } }]);
    
    await initCoordinator();
    
    const newSettings = { ...defaultSettings, preventSleep: true };
    settingsCallback(newSettings);
    
    expect(mockSend).toHaveBeenCalledWith("settings:changed", newSettings); });

    it("broadcasts to multiple windows", async () => { const mockSend1 = vi.fn();
    const mockSend2 = vi.fn();
    mockGetAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: mockSend1 } },
      { isDestroyed: () => false, webContents: { send: mockSend2 } },
    ]);
    
    await initCoordinator();
    
    const newSettings = { ...defaultSettings, preventSleep: true };
    settingsCallback(newSettings);
    
    expect(mockSend1).toHaveBeenCalledWith("settings:changed", newSettings);
    expect(mockSend2).toHaveBeenCalledWith("settings:changed", newSettings); });

    it("logs initialization", async () => { await initCoordinator();
    
    expect(mockLogInfo).toHaveBeenCalledWith("[coordinator] Initialized"); });
  });

  describe("re-entrancy guard + shallow-diff + shortcut re-register", () => {
    it("prevents nested re-invocation when subscriber re-triggers itself", async () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
      await initCoordinator();

      mockSyncPreventSleep.mockClear();
      mockCancelSession.mockClear();

      let nested = false;
      mockCancelSession.mockImplementation(() => {
        if (!nested) {
          nested = true;
          settingsCallback({ ...defaultSettings, preventSleep: false });
        }
      });

      settingsCallback({ ...defaultSettings, preventSleep: false });

      expect(mockCancelSession).toHaveBeenCalledTimes(1);
      expect(mockSyncPreventSleep).toHaveBeenCalledTimes(1);
    });

    it("skips sync + broadcast when settings are identical (shallow-equal)", async () => {
      const mockSend = vi.fn();
      mockGetAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { send: mockSend } }]);
      await initCoordinator();

      mockSyncAutoLaunch.mockClear();
      mockSyncPreventSleep.mockClear();
      mockSend.mockClear();

      settingsCallback({ ...defaultSettings });

      expect(mockSyncAutoLaunch).not.toHaveBeenCalled();
      expect(mockSyncPreventSleep).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("re-registers shortcut when shortcut setting changes", async () => {
      await initCoordinator();
      expect(mockRegisterGlobalShortcut).toHaveBeenCalledTimes(1);

      settingsCallback({ ...defaultSettings, shortcut: "Cmd+Shift+B" });

      expect(mockRegisterGlobalShortcut).toHaveBeenCalledTimes(2);
    });

    it("does not re-register shortcut when shortcut is unchanged", async () => {
      await initCoordinator();
      expect(mockRegisterGlobalShortcut).toHaveBeenCalledTimes(1);

      settingsCallback({ ...defaultSettings, preventSleep: true });

      expect(mockRegisterGlobalShortcut).toHaveBeenCalledTimes(1);
    });

    it("still processes genuine changes (syncPreventSleep called)", async () => {
      await initCoordinator();
      mockSyncPreventSleep.mockClear();

      settingsCallback({ ...defaultSettings, preventSleep: true });

      expect(mockSyncPreventSleep).toHaveBeenCalledWith(true);
    });
  });

  describe("cleanupCoordinator", () => {
    it("unsubscribes from settings changes", async () => { const mockUnsubscribe = vi.fn();
    mockOnSettingsChanged.mockReturnValue(mockUnsubscribe);
    await initCoordinator();
    
    cleanupCoordinator();
    
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1); });

    it("stops preventing sleep", async () => { mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
    await initCoordinator();
    cleanupCoordinator();
    
    expect(mockStopPreventingSleep).toHaveBeenCalledTimes(1); });

    it("logs cleanup", async () => { await initCoordinator();
    cleanupCoordinator();
    
    expect(mockLogInfo).toHaveBeenCalledWith("[coordinator] Cleaned up"); });

    it("handles cleanup when not initialized", async () => { // cleanupCoordinator without initCoordinator — should not throw
    expect(() => cleanupCoordinator()).not.toThrow(); });
  });
});
