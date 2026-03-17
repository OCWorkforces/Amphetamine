import { describe, it, expect, vi, beforeEach } from "vitest";

// Tray module exports
describe("tray module exports", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.mock("electron", () => ({
      Tray: vi.fn().mockImplementation(function (this: any) {
        this.setToolTip = vi.fn();
        this.setTitle = vi.fn();
        this.setImage = vi.fn();
        this.on = vi.fn();
        this.getBounds = vi
          .fn()
          .mockReturnValue({ x: 100, y: 0, width: 22, height: 22 });
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
          .mockReturnValue({ toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)) }),
        createEmpty: vi.fn().mockReturnValue({ addRepresentation: vi.fn() }),
      },
      nativeTheme: { shouldUseDarkColors: false, on: vi.fn() },
      BrowserWindow: vi.fn().mockImplementation(function (this: any) {
        this.on = vi.fn();
      }),
    }));
    vi.mock("../../src/main/settings.js", () => ({
      getSettings: vi
        .fn()
        .mockReturnValue({ launchAtLogin: false, preventSleep: false }),
      updateSettings: vi
        .fn()
        .mockReturnValue({ launchAtLogin: false, preventSleep: false }),
    }));
    vi.mock("../../src/main/power-saver.js", () => ({
      syncPreventSleep: vi.fn(),
    }));
  });

  it("exports setupTray function", async () => {
    const trayModule = await import("../../src/main/tray.js");

    expect(typeof trayModule.setupTray).toBe("function");
  });

  it("setupTray creates a Tray instance", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { Tray } = await import("electron");

    const mockWindow = {} as any;
    setupTray(mockWindow);

    expect(Tray).toHaveBeenCalled();
  });

  it("setupTray sets tooltip to 'Amphetamine'", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { Tray } = await import("electron");

    const mockWindow = {} as any;
    setupTray(mockWindow);

    const trayInstance = (Tray as ReturnType<typeof vi.fn>).mock.results[0]
      .value;
    expect(trayInstance.setToolTip).toHaveBeenCalledWith("Amphetamine");
  });

  it("setupTray registers nativeTheme.on('updated') handler", async () => {
    const { setupTray } = await import("../../src/main/tray.js");
    const { nativeTheme } = await import("electron");

    const mockWindow = {} as any;
    setupTray(mockWindow);

    expect(nativeTheme.on).toHaveBeenCalledWith(
      "updated",
      expect.any(Function),
    );
  });
});
