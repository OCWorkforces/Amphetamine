import { describe, it, expect, vi, beforeEach } from "vitest";

// Tray module exports
describe("tray module exports", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.mock("electron", () => ({
      Tray: vi.fn().mockImplementation(function (this: Record<string, ReturnType<typeof vi.fn>>) {
        this.setToolTip = vi.fn();
        this.setTitle = vi.fn();
        this.setImage = vi.fn();
        this.on = vi.fn();
        this.getBounds = vi.fn().mockReturnValue({ x: 100, y: 0, width: 22, height: 22 });
        this.popUpContextMenu = vi.fn();
      }),
      Menu: { buildFromTemplate: vi.fn().mockReturnValue({}) },
      shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
      app: {
        quit: vi.fn(),
        showAboutPanel: vi.fn(),
        getPath: vi.fn().mockReturnValue("/tmp/test-user-data"),
      },
      nativeImage: {
        createFromPath: vi
          .fn()
          .mockReturnValue({ toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)), isEmpty: vi.fn().mockReturnValue(false) }),
        createEmpty: vi.fn().mockReturnValue({ addRepresentation: vi.fn() }),
      },
      nativeTheme: { shouldUseDarkColors: false, on: vi.fn() },
      BrowserWindow: vi.fn().mockImplementation(function (this: Record<string, ReturnType<typeof vi.fn>>) {
        this.on = vi.fn();
      }),
    }));
    vi.mock("../../src/main/settings.js", () => {
      const settingsChangeCallbacks: Array<(_s: import("../../src/shared/types.js").AppSettings) => void> = [];
      return {
        getSettings: vi
          .fn()
          .mockReturnValue({ launchAtLogin: false, preventSleep: false }),
        updateSettings: vi
          .fn()
          .mockReturnValue({ launchAtLogin: false, preventSleep: false }),
        onSettingsChanged: vi.fn().mockImplementation((cb: (_s: import("../../src/shared/types.js").AppSettings) => void) => {
          settingsChangeCallbacks.push(cb);
          return () => {
            const idx = settingsChangeCallbacks.indexOf(cb);
            if (idx >= 0) settingsChangeCallbacks.splice(idx, 1);
          };
        }),
        __settingsChangeCallbacks: settingsChangeCallbacks,
      };
    });
    vi.mock("../../src/main/power-saver.js", () => ({
      syncPreventSleep: vi.fn(),
    }));
  });

  it("setupTray subscribes to settings changes via onSettingsChanged", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const settingsMod = (await import("../../src/main/settings.js")) as unknown as Record<string, ReturnType<typeof vi.fn>>;

    const mockWindow = {} as unknown as Parameters<typeof import("../../src/main/tray.js").setupTray>[0];
    setupTray(mockWindow);

    expect(settingsMod.onSettingsChanged).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it("tray icon updates when settings change (preventSleep toggle)", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { Tray } = await import("electron");
    const settingsMod = (await import("../../src/main/settings.js")) as unknown as Record<string, ReturnType<typeof vi.fn>>;

    const mockWindow = {} as unknown as Parameters<typeof import("../../src/main/tray.js").setupTray>[0];
    setupTray(mockWindow);

    const trayInstance = (Tray as ReturnType<typeof vi.fn>).mock.results[0]
      .value;
    const setImageCalls = trayInstance.setImage.mock.calls.length;

    // Simulate settings change callback (preventSleep toggled ON)
    const onSettingsChangedCb = settingsMod.onSettingsChanged.mock.calls[0][0];
    settingsMod.getSettings.mockReturnValue({
      launchAtLogin: false,
      preventSleep: true,
    });
    onSettingsChangedCb(settingsMod.getSettings());

    // setImage should have been called again after settings change
    expect(trayInstance.setImage.mock.calls.length).toBeGreaterThan(setImageCalls);
  });
  it("setupTray registers nativeTheme.on('updated') handler", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { nativeTheme } = await import("electron");

    const mockWindow = {} as unknown as Parameters<typeof import("../../src/main/tray.js").setupTray>[0];
    setupTray(mockWindow);

    expect(nativeTheme.on).toHaveBeenCalledWith(
      "updated",
      expect.any(Function),
    );
  });
});
