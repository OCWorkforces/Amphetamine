import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const mockRegister = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockUnregisterAll = vi.hoisted(() => vi.fn());
const mockGetSettings = vi.hoisted(() =>
  vi.fn().mockReturnValue({ preventSleep: false, shortcut: "" }),
);
const mockUpdateSettings = vi.hoisted(() =>
  vi.fn().mockReturnValue({ preventSleep: true, shortcut: "" }),
);
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

// Track the callback passed to globalShortcut.register
let registeredCallback: (() => void) | null = null;

vi.mock("electron", () => ({
  globalShortcut: {
    register: (...args: unknown[]) => {
      // Delegate to the mock which stores the callback
      return mockRegister(...args);
    },
    unregisterAll: mockUnregisterAll,
  },
}));

vi.mock("electron-log", () => ({
  default: { info: mockLogInfo, warn: mockLogWarn, error: mockLogError },
}));

vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
}));


describe("shortcut", () => {
  let registerGlobalShortcut: () => void;
  let unregisterGlobalShortcut: () => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    registeredCallback = null;

    // Re-apply default mock behavior — mockImplementation replaces the factory
    mockRegister.mockImplementation((_accelerator: string, callback: () => void) => {
      registeredCallback = callback;
      return true;
    });
    mockGetSettings.mockReturnValue({ preventSleep: false, shortcut: "" });
    mockUpdateSettings.mockReturnValue({ preventSleep: true, shortcut: "" });

    const mod = await import("../../src/main/shortcut.js");
    registerGlobalShortcut = mod.registerGlobalShortcut;
    unregisterGlobalShortcut = mod.unregisterGlobalShortcut;
  });

  describe("registerGlobalShortcut", () => {
    it("registers globalShortcut with default Cmd+Shift+A when shortcut is empty", () => {
      mockGetSettings.mockReturnValue({ preventSleep: false, shortcut: "" });
      registerGlobalShortcut();

      expect(mockRegister).toHaveBeenCalledWith("Cmd+Shift+A", expect.any(Function));
    });

    it("registers globalShortcut with custom shortcut from settings", () => {
      mockGetSettings.mockReturnValue({ preventSleep: false, shortcut: "Cmd+Shift+K" });
      registerGlobalShortcut();

      expect(mockRegister).toHaveBeenCalledWith("Cmd+Shift+K", expect.any(Function));
    });

    it("shortcut callback toggles preventSleep from false to true", () => {
      mockGetSettings.mockReturnValue({ preventSleep: false, shortcut: "" });
      mockUpdateSettings.mockReturnValue({ preventSleep: true, shortcut: "" });

      registerGlobalShortcut();
      registeredCallback!();

      expect(mockUpdateSettings).toHaveBeenCalledWith({ preventSleep: true });
    });

    it("shortcut callback toggles preventSleep from true to false", () => {
      mockGetSettings.mockReturnValue({ preventSleep: true, shortcut: "" });
      mockUpdateSettings.mockReturnValue({ preventSleep: false, shortcut: "" });

      registerGlobalShortcut();
      registeredCallback!();

      expect(mockUpdateSettings).toHaveBeenCalledWith({ preventSleep: false });
    });

    it("logs warning when shortcut registration fails", () => {
      mockRegister.mockImplementation(() => {
        registeredCallback = null;
        return false;
      });
      registerGlobalShortcut();

      expect(mockLogWarn).toHaveBeenCalled();
    });

    it("logs error when shortcut registration throws", () => {
      mockRegister.mockImplementation(() => {
        registeredCallback = null;
        throw new Error("Duplicate");
      });
      registerGlobalShortcut();

      expect(mockLogError).toHaveBeenCalled();
    });
  });

  describe("unregisterGlobalShortcut", () => {
    it("calls globalShortcut.unregisterAll", () => {
      unregisterGlobalShortcut();

      expect(mockUnregisterAll).toHaveBeenCalled();
    });

    it("logs info on unregister", () => {
      unregisterGlobalShortcut();

      expect(mockLogInfo).toHaveBeenCalled();
    });
  });
});
