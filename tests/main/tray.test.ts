import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrayDeps } from "../../src/main/tray.js";

const mockTrayConstructor = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: Record<string, ReturnType<typeof vi.fn>>) {
    this.setToolTip = vi.fn();
    this.setTitle = vi.fn();
    this.setImage = vi.fn();
    this.on = vi.fn();
    this.getBounds = vi.fn().mockReturnValue({ x: 100, y: 0, width: 22, height: 22 });
    this.popUpContextMenu = vi.fn();
  }),
);
const mockNativeThemeOn = vi.hoisted(() => vi.fn());
const mockCreateFromPath = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)),
    isEmpty: vi.fn().mockReturnValue(false),
  }),
);
const mockCreateEmpty = vi.hoisted(() => vi.fn().mockReturnValue({ addRepresentation: vi.fn() }));

vi.mock("electron", () => ({
  Tray: mockTrayConstructor,
  Menu: { buildFromTemplate: vi.fn().mockReturnValue({}) },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  app: {
    quit: vi.fn(),
    showAboutPanel: vi.fn(),
    getPath: vi.fn().mockReturnValue("/tmp/test-user-data"),
  },
  nativeImage: {
    createFromPath: mockCreateFromPath,
    createEmpty: mockCreateEmpty,
  },
  nativeTheme: { shouldUseDarkColors: false, on: mockNativeThemeOn },
  BrowserWindow: vi.fn().mockImplementation(function (
    this: Record<string, ReturnType<typeof vi.fn>>,
  ) {
    this.on = vi.fn();
  }),
}));

vi.mock("electron-log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Tray module exports
describe("tray module exports", () => {
  let preventSleep: boolean;
  let settingsChangeCallbacks: Array<() => void>;

  function createTrayDeps(): TrayDeps {
    return {
      getPreventSleep: () => preventSleep,
      togglePreventSleep: () => {
        preventSleep = !preventSleep;
      },
      onSettingsChanged: (cb: () => void) => {
        settingsChangeCallbacks.push(cb);
        return () => {
          const idx = settingsChangeCallbacks.indexOf(cb);
          if (idx >= 0) settingsChangeCallbacks.splice(idx, 1);
        };
      },
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    preventSleep = false;
    settingsChangeCallbacks = [];

    // Re-apply default mock behavior after clearAllMocks
    mockTrayConstructor.mockImplementation(function (
      this: Record<string, ReturnType<typeof vi.fn>>,
    ) {
      this.setToolTip = vi.fn();
      this.setTitle = vi.fn();
      this.setImage = vi.fn();
      this.on = vi.fn();
      this.getBounds = vi.fn().mockReturnValue({ x: 100, y: 0, width: 22, height: 22 });
      this.popUpContextMenu = vi.fn();
    });
    mockCreateFromPath.mockReturnValue({
      toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)),
      isEmpty: vi.fn().mockReturnValue(false),
    });
    mockCreateEmpty.mockReturnValue({ addRepresentation: vi.fn() });
  });

  it("setupTray subscribes to settings changes via onSettingsChanged", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const deps = createTrayDeps();

    setupTray(deps);

    expect(settingsChangeCallbacks.length).toBe(1);
  });

  it("tray icon updates when settings change (preventSleep toggle)", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const deps = createTrayDeps();

    setupTray(deps);

    const trayInstance = mockTrayConstructor.mock.results[0].value;
    const setImageCalls = trayInstance.setImage.mock.calls.length;

    // Simulate settings change callback (preventSleep toggled ON)
    preventSleep = true;
    settingsChangeCallbacks[0]!();

    // setImage should have been called again after settings change
    expect(trayInstance.setImage.mock.calls.length).toBeGreaterThan(setImageCalls);
  });

  it("setupTray registers nativeTheme.on('updated') handler", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const deps = createTrayDeps();

    setupTray(deps);

    expect(mockNativeThemeOn).toHaveBeenCalledWith("updated", expect.any(Function));
  });
});
