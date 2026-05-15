import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const mockGetSettings = vi.hoisted(() => vi.fn());
const mockOnSettingsChanged = vi.hoisted(() => vi.fn());
const mockUpdateSettings = vi.hoisted(() => vi.fn());
const mockSyncAutoLaunch = vi.hoisted(() => vi.fn());
const mockGetAllWindows = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockRegisterGlobalShortcut = vi.hoisted(() => vi.fn());

// Sleep-prevention mocks
const mockSyncPreventSleep = vi.hoisted(() => vi.fn());
const mockStopPreventingSleep = vi.hoisted(() => vi.fn());
const mockIsPreventingSleep = vi.hoisted(() => vi.fn());

// Battery-monitor factory mocks
const mockBatteryInit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBatteryCleanup = vi.hoisted(() => vi.fn());
const mockBatteryOnPreventSleepChange = vi.hoisted(() => vi.fn());
const mockCreateBatteryMonitor = vi.hoisted(() =>
  vi.fn(() => ({
    initBatteryMonitoring: mockBatteryInit,
    cleanupBatteryMonitoring: mockBatteryCleanup,
    onPreventSleepChange: mockBatteryOnPreventSleepChange,
  })),
);

// Session-timer factory mocks
const mockSessionStart = vi.hoisted(() => vi.fn());
const mockSessionCancel = vi.hoisted(() => vi.fn());
const mockSessionGetStatus = vi.hoisted(() => vi.fn());
const mockSessionCleanup = vi.hoisted(() => vi.fn());
const mockSessionReconcile = vi.hoisted(() => vi.fn());
const mockSessionBroadcast = vi.hoisted(() => vi.fn());
const mockCreateSessionTimer = vi.hoisted(() =>
  vi.fn(() => ({
    startSession: mockSessionStart,
    cancelSession: mockSessionCancel,
    getStatus: mockSessionGetStatus,
    cleanup: mockSessionCleanup,
    reconcileSessionState: mockSessionReconcile,
    broadcastSessionUpdate: mockSessionBroadcast,
  })),
);
const mockSetActiveSessionTimer = vi.hoisted(() => vi.fn());

const mockCreateSettingsWindow = vi.hoisted(() => vi.fn());

vi.mock("electron", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    app: { isPackaged: false },
    BrowserWindow: { getAllWindows: mockGetAllWindows },
    powerMonitor: {
      on: vi.fn(),
      off: vi.fn(),
      isOnBatteryPower: vi.fn().mockReturnValue(false),
    },
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
  unregisterGlobalShortcut: vi.fn(),
}));

vi.mock("../../src/main/sleep-prevention.js", () => ({
  syncPreventSleep: mockSyncPreventSleep,
  stopPreventingSleep: mockStopPreventingSleep,
  isPreventingSleep: mockIsPreventingSleep,
}));

vi.mock("../../src/main/battery-monitor.js", () => ({
  createBatteryMonitor: mockCreateBatteryMonitor,
}));

vi.mock("../../src/main/session-timer.js", () => ({
  createSessionTimer: mockCreateSessionTimer,
  setActiveSessionTimer: mockSetActiveSessionTimer,
}));

vi.mock("../../src/main/auto-updater.js", () => ({
  setBroadcastFn: vi.fn(),
  stopAutoUpdater: vi.fn(),
}));

vi.mock("../../src/main/settings-window.js", () => ({
  createSettingsWindow: mockCreateSettingsWindow,
  closeSettingsWindow: vi.fn(),
}));

vi.mock("../../src/main/about-window.js", () => ({
  closeAboutWindow: vi.fn(),
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

    // Re-wire factories that return handles after clearAllMocks reset return values
    mockCreateBatteryMonitor.mockReturnValue({
      initBatteryMonitoring: mockBatteryInit,
      cleanupBatteryMonitoring: mockBatteryCleanup,
      onPreventSleepChange: mockBatteryOnPreventSleepChange,
    });
    mockCreateSessionTimer.mockReturnValue({
      startSession: mockSessionStart,
      cancelSession: mockSessionCancel,
      getStatus: mockSessionGetStatus,
      cleanup: mockSessionCleanup,
      reconcileSessionState: mockSessionReconcile,
      broadcastSessionUpdate: mockSessionBroadcast,
    });
    mockBatteryInit.mockResolvedValue(undefined);

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
    it("syncs auto-launch state on init", async () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, launchAtLogin: true });
      await initCoordinator();

      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
    });

    it("syncs preventSleep state on init", async () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
      await initCoordinator();

      expect(mockSyncPreventSleep).toHaveBeenCalledWith(true);
    });

    it("constructs the session timer with explicit deps", async () => {
      await initCoordinator();

      expect(mockCreateSessionTimer).toHaveBeenCalledTimes(1);
      const deps = mockCreateSessionTimer.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(typeof deps.onStateChange).toBe("function");
      expect(typeof deps.getSettings).toBe("function");
      expect(typeof deps.broadcast).toBe("function");
    });

    it("registers the session-timer handle as the module-level active handle", async () => {
      await initCoordinator();

      expect(mockSetActiveSessionTimer).toHaveBeenCalledWith(
        expect.objectContaining({
          startSession: mockSessionStart,
          cancelSession: mockSessionCancel,
        }),
      );
    });

    it("constructs the battery monitor with explicit deps", async () => {
      await initCoordinator();

      expect(mockCreateBatteryMonitor).toHaveBeenCalledTimes(1);
      const deps = mockCreateBatteryMonitor.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(typeof deps.getThreshold).toBe("function");
      expect(typeof deps.onAutoStop).toBe("function");
      expect(typeof deps.isPreventingSleep).toBe("function");
      expect(typeof deps.stopPreventingSleep).toBe("function");
    });

    it("battery onAutoStop is wired to session cancel", async () => {
      await initCoordinator();

      const deps = mockCreateBatteryMonitor.mock.calls[0]?.[0] as { onAutoStop: () => void };
      mockSessionCancel.mockClear();
      deps.onAutoStop();

      expect(mockSessionCancel).toHaveBeenCalledTimes(1);
    });

    it("battery getThreshold reads current settings", async () => {
      await initCoordinator();

      const deps = mockCreateBatteryMonitor.mock.calls[0]?.[0] as {
        getThreshold: () => number;
      };
      mockGetSettings.mockReturnValue({ ...defaultSettings, batteryThreshold: 42 });
      expect(deps.getThreshold()).toBe(42);
    });

    it("initializes battery monitoring", async () => {
      await initCoordinator();

      expect(mockBatteryInit).toHaveBeenCalled();
    });

    it("subscribes to settings changes", async () => {
      await initCoordinator();

      expect(mockOnSettingsChanged).toHaveBeenCalledWith(expect.any(Function));
    });

    it("registers global shortcut with deps", async () => {
      await initCoordinator();

      expect(mockRegisterGlobalShortcut).toHaveBeenCalledWith(
        expect.objectContaining({
          getShortcut: expect.any(Function),
          getPreventSleep: expect.any(Function),
          togglePreventSleep: expect.any(Function),
        }),
      );
    });

    it("syncs preventSleep on settings change", async () => {
      await initCoordinator();

      settingsCallback({ ...defaultSettings, preventSleep: true });

      expect(mockSyncPreventSleep).toHaveBeenCalledWith(true);
    });

    it("syncs autoLaunch on settings change", async () => {
      await initCoordinator();

      settingsCallback({ ...defaultSettings, launchAtLogin: true });

      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
    });

    it("does NOT cancel session when preventSleep transitions true to false (preference is orthogonal)", async () => {
      // FIX: settings.preventSleep is now the user's standing preference,
      // NOT "a session is active". Toggling it off must NOT cancel the session.
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
      await initCoordinator();
      mockSessionCancel.mockClear();
      mockSyncPreventSleep.mockClear();

      settingsCallback({ ...defaultSettings, preventSleep: false });

      expect(mockSessionCancel).not.toHaveBeenCalled();
      // sleep prevention recomputed: userIntent=false, sessionActive=false (no session in test) → false
      expect(mockSyncPreventSleep).toHaveBeenCalledWith(false);
    });

    it("does not cancel session when preventSleep stays false", async () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: false });
      await initCoordinator();
      mockSessionCancel.mockClear();

      settingsCallback({ ...defaultSettings, preventSleep: false });

      expect(mockSessionCancel).not.toHaveBeenCalled();
    });

    it("does not cancel session when preventSleep transitions false to true", async () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: false });
      await initCoordinator();
      mockSessionCancel.mockClear();

      settingsCallback({ ...defaultSettings, preventSleep: true });

      expect(mockSessionCancel).not.toHaveBeenCalled();
    });

    it("broadcasts settings to all renderer windows", async () => {
      const mockSend = vi.fn();
      mockGetAllWindows.mockReturnValue([
        { isDestroyed: () => false, webContents: { send: mockSend } },
      ]);

      await initCoordinator();

      const newSettings = { ...defaultSettings, preventSleep: true };
      settingsCallback(newSettings);

      expect(mockSend).toHaveBeenCalledWith("settings:changed", newSettings);
    });

    it("broadcasts to multiple windows", async () => {
      const mockSend1 = vi.fn();
      const mockSend2 = vi.fn();
      mockGetAllWindows.mockReturnValue([
        { isDestroyed: () => false, webContents: { send: mockSend1 } },
        { isDestroyed: () => false, webContents: { send: mockSend2 } },
      ]);

      await initCoordinator();

      const newSettings = { ...defaultSettings, preventSleep: true };
      settingsCallback(newSettings);

      expect(mockSend1).toHaveBeenCalledWith("settings:changed", newSettings);
      expect(mockSend2).toHaveBeenCalledWith("settings:changed", newSettings);
    });

    it("logs initialization", async () => {
      await initCoordinator();

      expect(mockLogInfo).toHaveBeenCalledWith("[coordinator] Initialized");
    });
  });

  describe("shallow-diff + shortcut re-register + sleep recomputation", () => {
    it("recursion is structurally impossible: settings.preventSleep no longer triggers cancelSession", async () => {
      // Previously cancelSession() wrote preventSleep:false to settings, which
      // re-triggered the subscriber, requiring an inSubscriber guard. Now
      // cancelSession() does not touch settings, so the recursion vector is gone.
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
      await initCoordinator();

      mockSyncPreventSleep.mockClear();
      mockSessionCancel.mockClear();

      settingsCallback({ ...defaultSettings, preventSleep: false });

      // No session cancellation — the user simply disabled their standing preference.
      expect(mockSessionCancel).not.toHaveBeenCalled();
      // Sleep recomputed exactly once.
      expect(mockSyncPreventSleep).toHaveBeenCalledTimes(1);
      expect(mockSyncPreventSleep).toHaveBeenCalledWith(false);
    });

    it("skips sync + broadcast when settings are identical (shallow-equal)", async () => {
      const mockSend = vi.fn();
      mockGetAllWindows.mockReturnValue([
        { isDestroyed: () => false, webContents: { send: mockSend } },
      ]);
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
    it("unsubscribes from settings changes", async () => {
      const mockUnsubscribe = vi.fn();
      mockOnSettingsChanged.mockReturnValue(mockUnsubscribe);
      await initCoordinator();

      cleanupCoordinator();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it("stops preventing sleep", async () => {
      mockGetSettings.mockReturnValue({ ...defaultSettings, preventSleep: true });
      await initCoordinator();
      cleanupCoordinator();

      expect(mockStopPreventingSleep).toHaveBeenCalledTimes(1);
    });

    it("cleans up battery monitoring", async () => {
      await initCoordinator();
      cleanupCoordinator();

      expect(mockBatteryCleanup).toHaveBeenCalledTimes(1);
    });

    it("clears the active session-timer handle", async () => {
      await initCoordinator();
      mockSetActiveSessionTimer.mockClear();
      cleanupCoordinator();

      expect(mockSetActiveSessionTimer).toHaveBeenCalledWith(null);
    });

    it("logs cleanup", async () => {
      await initCoordinator();
      cleanupCoordinator();

      expect(mockLogInfo).toHaveBeenCalledWith("[coordinator] Cleaned up");
    });

    it("handles cleanup when not initialized", async () => {
      // cleanupCoordinator without initCoordinator — should not throw
      expect(() => cleanupCoordinator()).not.toThrow();
    });
  });
});
