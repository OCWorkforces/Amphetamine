import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks - same pattern as existing tests
const mockGetSettings = vi.hoisted(() =>
  vi.fn().mockReturnValue({ launchAtLogin: false, preventSleep: false }),
);
const mockInitCoordinator = vi.hoisted(() => vi.fn());
const mockCleanupCoordinator = vi.hoisted(() => vi.fn());
const mockGetTrayDeps = vi.hoisted(() => vi.fn().mockReturnValue({}));
const mockSetupTray = vi.hoisted(() => vi.fn().mockReturnValue(() => {}));
const mockRegisterIpcHandlers = vi.hoisted(() => vi.fn());
const mockCloseSettingsWindow = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockShowErrorBox = vi.hoisted(() => vi.fn());
const mockSetActivationPolicy = vi.hoisted(() => vi.fn());
const mockSetAboutPanelOptions = vi.hoisted(() => vi.fn());
const mockGetVersion = vi.hoisted(() => vi.fn().mockReturnValue("1.0.0"));
const mockGetAppPath = vi.hoisted(() => vi.fn().mockReturnValue("/mock/app/path"));
const mockWhenReady = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockExit = vi.hoisted(() => vi.fn());
const mockOn = vi.hoisted(() => vi.fn());
const mockProcessOn = vi.hoisted(() => vi.fn());

// Mock electron
vi.mock("electron", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    app: {
      getVersion: mockGetVersion,
      quit: vi.fn(),
      isPackaged: false,
      setAboutPanelOptions: mockSetAboutPanelOptions,
      whenReady: mockWhenReady,
      on: mockOn,
      getAppPath: mockGetAppPath,
      setActivationPolicy: mockSetActivationPolicy,
      exit: mockExit,
    },
    BrowserWindow: vi.fn().mockImplementation(function (this: Record<string, ReturnType<typeof vi.fn>>) {
      this.loadURL = vi.fn();
      this.loadFile = vi.fn();
      this.show = vi.fn();
      this.hide = vi.fn();
      this.focus = vi.fn();
      this.destroy = vi.fn();
      this.isVisible = vi.fn().mockReturnValue(false);
      this.isDestroyed = vi.fn().mockReturnValue(false);
      this.getBounds = vi.fn().mockReturnValue({ x: 0, y: 0, width: 360, height: 480 });
      this.setPosition = vi.fn();
      this.setSize = vi.fn();
      this.setAlwaysOnTop = vi.fn();
      this.on = vi.fn();
      this.removeListener = vi.fn();
      this.webContents = {
        send: vi.fn(),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
      };
    }),
    dialog: {
      showErrorBox: mockShowErrorBox,
    },
  };
});

vi.mock("electron-log", () => ({
  default: {
    error: mockLogError,
    info: mockLogInfo,
  },
}));

vi.mock("../../src/main/tray.js", () => ({
  setupTray: mockSetupTray,
}));

vi.mock("../../src/main/ipc.js", () => ({
  registerIpcHandlers: mockRegisterIpcHandlers,
}));

vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
}));


vi.mock("../../src/main/coordinator.js", () => ({
  initCoordinator: mockInitCoordinator,
  cleanupCoordinator: mockCleanupCoordinator,
  getTrayDeps: mockGetTrayDeps,
}));

vi.mock("../../src/main/settings-window.js", () => ({
  closeSettingsWindow: mockCloseSettingsWindow,
}));

vi.mock("../../src/main/shortcut.js", () => ({
  unregisterGlobalShortcut: vi.fn(),
}));
vi.mock("../../src/main/utils/packageInfo.js", () => ({
  getPackageInfo: vi.fn().mockReturnValue({ author: "Test Author", version: "1.0.0" }),
}));

// Mock process.on for uncaughtException and unhandledRejection
vi.stubGlobal("process", {
  ...process,
  on: mockProcessOn,
});

describe("main index - createWindow", () => {
  let BrowserWindow: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Get BrowserWindow reference
    const electron = await import("electron");
    BrowserWindow = electron.BrowserWindow as ReturnType<typeof vi.fn>;

    // Reset mocks
    mockGetSettings.mockReturnValue({ launchAtLogin: false, preventSleep: false });
  });

  it("creates BrowserWindow with correct width and height", async () => {
    await import("../../src/main/index.js");

    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    const callArgs = BrowserWindow.mock.calls[0][0];
    expect(callArgs.width).toBe(360);
    expect(callArgs.height).toBe(480);
  });

  it("creates BrowserWindow with alwaysOnTop true", async () => {
    await import("../../src/main/index.js");

    const callArgs = BrowserWindow.mock.calls[0][0];
    expect(callArgs.alwaysOnTop).toBe(true);
  });

  it("creates BrowserWindow with frame false and transparent true", async () => {
    await import("../../src/main/index.js");

    const callArgs = BrowserWindow.mock.calls[0][0];
    expect(callArgs.frame).toBe(false);
    expect(callArgs.transparent).toBe(true);
  });

  it("creates BrowserWindow with vibrancy popover", async () => {
    await import("../../src/main/index.js");

    const callArgs = BrowserWindow.mock.calls[0][0];
    expect(callArgs.vibrancy).toBe("popover");
  });

  it("creates BrowserWindow with sandboxed webPreferences", async () => {
    await import("../../src/main/index.js");

    const callArgs = BrowserWindow.mock.calls[0][0];
    expect(callArgs.webPreferences.sandbox).toBe(true);
    expect(callArgs.webPreferences.contextIsolation).toBe(true);
    expect(callArgs.webPreferences.nodeIntegration).toBe(false);
  });

  it("sets preload path in webPreferences", async () => {
    await import("../../src/main/index.js");

    const callArgs = BrowserWindow.mock.calls[0][0];
    expect(callArgs.webPreferences.preload).toContain("preload");
    expect(callArgs.webPreferences.preload).toContain("index.cjs");
  });
});
