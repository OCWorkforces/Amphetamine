import { describe, it, expect, vi, beforeEach } from "vitest";
import { IPC_CHANNELS, DEFAULT_SETTINGS } from "../../src/shared/types.js";

// Mock electron first - must be done before importing ipc
const mockGetVersion = vi.fn().mockReturnValue("1.0.0");
const mockGetAppPath = vi.fn().mockReturnValue("/mock/app");
const mockIpcMainHandle = vi.fn();
const mockIpcMainOn = vi.fn();
const mockBrowserWindowGetAllWindows = vi.fn().mockReturnValue([]);

vi.mock("electron", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    app: {
      getVersion: mockGetVersion,
      getAppPath: mockGetAppPath,
    },
    ipcMain: {
      handle: mockIpcMainHandle,
      on: mockIpcMainOn,
    },
    BrowserWindow: {
      getAllWindows: vi.fn().mockReturnValue(mockBrowserWindowGetAllWindows()),
    },
  };
});

// Mock dependencies
const mockGetSettings = vi.fn().mockReturnValue({ ...DEFAULT_SETTINGS });
const mockUpdateSettings = vi.fn().mockImplementation((partial: any) => ({
  ...DEFAULT_SETTINGS,
  ...partial,
}));
const mockOnSettingsChanged = vi.fn();
const mockSyncPreventSleep = vi.fn();
const mockSyncAutoLaunch = vi.fn();
const mockCreateSettingsWindow = vi.fn();
const mockStartSession = vi.fn().mockReturnValue({
  isRunning: true,
  startedAt: Date.now(),
  expiresAt: null,
  durationMinutes: null,
});
const mockCancelSession = vi.fn().mockReturnValue({
  isRunning: false,
  startedAt: null,
  expiresAt: null,
  durationMinutes: null,
});
const mockGetStatus = vi.fn().mockReturnValue({
  isRunning: false,
  startedAt: null,
  expiresAt: null,
  durationMinutes: null,
});

vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
  onSettingsChanged: mockOnSettingsChanged,
}));

vi.mock("../../src/main/power-saver.js", () => ({
  syncPreventSleep: mockSyncPreventSleep,
}));

vi.mock("../../src/main/auto-launch.js", () => ({
  syncAutoLaunch: mockSyncAutoLaunch,
}));

vi.mock("../../src/main/settings-window.js", () => ({
  createSettingsWindow: mockCreateSettingsWindow,
}));

vi.mock("../../src/main/session-timer.js", () => ({
  startSession: mockStartSession,
  cancelSession: mockCancelSession,
  getStatus: mockGetStatus,
}));

describe("ipc-handlers", () => {
  let registerIpcHandlers: (win: any) => void;
  let registeredHandlers: Map<string, any>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset mock return values
    mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
    mockUpdateSettings.mockImplementation((partial: any) => ({
      ...DEFAULT_SETTINGS,
      ...partial,
    }));
    mockGetStatus.mockReturnValue({
      isRunning: false,
      startedAt: null,
      expiresAt: null,
      durationMinutes: null,
    });
    mockBrowserWindowGetAllWindows.mockReturnValue([]);
    mockSyncPreventSleep.mockClear();
    mockSyncAutoLaunch.mockClear();

    // Clear and setup handler registry
    registeredHandlers = new Map();
    mockIpcMainHandle.mockImplementation((channel: string, handler: any) => {
      registeredHandlers.set(channel, handler);
    });
    mockIpcMainOn.mockImplementation((channel: string, handler: any) => {
      registeredHandlers.set(channel, handler);
    });

    // Import the module
    const mod = await import("../../src/main/ipc.js");
    registerIpcHandlers = mod.registerIpcHandlers;
  });

  describe("WINDOW_SET_HEIGHT handler", () => {
    it("clamps height to MIN_WINDOW_HEIGHT if too small", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.WINDOW_SET_HEIGHT);
      expect(handler).toBeDefined();

      const mockEvent = {
        senderFrame: { url: "file:///mock/app/src/renderer/index.html" },
      };

      // Height below minimum (220)
      handler(mockEvent, 100);

      expect(mockWindow.setSize).toHaveBeenCalledWith(360, 220, true);
    });

    it("clamps height to MAX_WINDOW_HEIGHT if too large", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.WINDOW_SET_HEIGHT);
      const mockEvent = {
        senderFrame: { url: "file:///mock/app/src/renderer/index.html" },
      };

      // Height above maximum (480)
      handler(mockEvent, 1000);

      expect(mockWindow.setSize).toHaveBeenCalledWith(360, 480, true);
    });

    it("accepts valid height within bounds", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.WINDOW_SET_HEIGHT);
      const mockEvent = {
        senderFrame: { url: "file:///mock/app/src/renderer/index.html" },
      };

      handler(mockEvent, 350);

      expect(mockWindow.setSize).toHaveBeenCalledWith(360, 350, true);
    });

    it("ignores non-positive height values", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.WINDOW_SET_HEIGHT);
      const mockEvent = {
        senderFrame: { url: "file:///mock/app/src/renderer/index.html" },
      };

      handler(mockEvent, -50);
      handler(mockEvent, 0);

      expect(mockWindow.setSize).not.toHaveBeenCalled();
    });
  });

  describe("APP_GET_VERSION handler", () => {
    it("returns app version for valid sender", async () => {
      const mockWindow = {};
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.APP_GET_VERSION);
      expect(handler).toBeDefined();

      const mockEvent = {
        senderFrame: { url: "file:///mock/app/src/renderer/index.html" },
      };

      const result = await handler(mockEvent);
      expect(result).toBe("1.0.0");
    });
  });

  describe("SETTINGS_GET handler", () => {
    it("returns settings for valid sender", async () => {
      const mockSettings = { ...DEFAULT_SETTINGS, preventSleep: true };
      mockGetSettings.mockReturnValue(mockSettings);

      const mockWindow = {};
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_GET);
      const mockEvent = {
        senderFrame: { url: "file:///mock/app/src/renderer/index.html" },
      };

      const result = await handler(mockEvent);
      expect(result).toEqual(mockSettings);
    });
  });

  describe("SETTINGS_SET handler", () => {
    it("syncs preventSleep when it changes", async () => {
      const mockWindow = {};
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_SET);
      const mockEvent = {
        senderFrame: { url: "file:///mock/app/src/renderer/index.html" },
      };

      mockUpdateSettings.mockReturnValue({ ...DEFAULT_SETTINGS, preventSleep: true });

      await handler(mockEvent, { preventSleep: true });

      expect(mockSyncPreventSleep).toHaveBeenCalledWith(true);
    });

    it("syncs launchAtLogin when it changes", async () => {
      const mockWindow = {};
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_SET);
      const mockEvent = {
        senderFrame: { url: "file:///mock/app/src/renderer/index.html" },
      };

      mockUpdateSettings.mockReturnValue({ ...DEFAULT_SETTINGS, launchAtLogin: true });

      await handler(mockEvent, { launchAtLogin: true });

      expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true);
    });
  });

  describe("SETTINGS_OPEN handler", () => {
    it("calls createSettingsWindow for valid sender", async () => {
      const mockWindow = {};
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.SETTINGS_OPEN);
      const mockEvent = {
        senderFrame: { url: "file:///mock/app/src/renderer/index.html" },
      };

      await handler(mockEvent);

      expect(mockCreateSettingsWindow).toHaveBeenCalledTimes(1);
    });
  });

  describe("session handlers", () => {
    it("SESSION_START calls startSession", async () => {
      const mockWindow = {};
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const mockEvent = {};

      await handler(mockEvent, { durationMinutes: null });

      expect(mockStartSession).toHaveBeenCalledWith(null);
    });

    it("SESSION_CANCEL calls cancelSession", async () => {
      const mockWindow = {};
      registerIpcHandlers(mockWindow);

      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_CANCEL);
      const mockEvent = {};

      await handler(mockEvent);

      expect(mockCancelSession).toHaveBeenCalledTimes(1);
    });

    it("SESSION_STATUS returns null when no session running", async () => {
      const mockWindow = {};
      registerIpcHandlers(mockWindow);

      mockGetStatus.mockReturnValue({
        isRunning: false,
        startedAt: null,
        expiresAt: null,
        durationMinutes: null,
      });

      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_STATUS);
      const mockEvent = {};

      const result = await handler(mockEvent);
      expect(result).toBeNull();
    });
  });
});
