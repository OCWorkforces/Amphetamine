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
const mockNativeThemeRemoveListener = vi.hoisted(() => vi.fn());
const mockCreateFromPath = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)),
    isEmpty: vi.fn().mockReturnValue(false),
  }),
);
const mockCreateEmpty = vi.hoisted(() => vi.fn().mockReturnValue({ addRepresentation: vi.fn() }));
const mockBuildFromTemplate = vi.hoisted(() => vi.fn().mockReturnValue({}));
const mockAppQuit = vi.hoisted(() => vi.fn());
const mockShowAboutPanel = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  Tray: mockTrayConstructor,
  Menu: { buildFromTemplate: mockBuildFromTemplate },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  app: {
    quit: mockAppQuit,
    showAboutPanel: mockShowAboutPanel,
    getPath: vi.fn().mockReturnValue("/tmp/test-user-data"),
  },
  nativeImage: {
    createFromPath: mockCreateFromPath,
    createEmpty: mockCreateEmpty,
    createFromBuffer: vi.fn().mockReturnValue({ toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)) }),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: mockNativeThemeOn,
    removeListener: mockNativeThemeRemoveListener,
  },
  BrowserWindow: vi.fn().mockImplementation(function (
    this: Record<string, ReturnType<typeof vi.fn>>,
  ) {
    this.on = vi.fn();
  }),
}));

vi.mock("electron-log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("tray", () => {
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

  describe("setupTray", () => {
    it("subscribes to settings changes via onSettingsChanged", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      expect(settingsChangeCallbacks.length).toBe(1);
    });

    it("creates a Tray instance", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      expect(mockTrayConstructor).toHaveBeenCalledTimes(1);
    });

    it("sets tooltip to Amphetamine", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const trayInstance = mockTrayConstructor.mock.results[0]!.value;
      expect(trayInstance.setToolTip).toHaveBeenCalledWith("Amphetamine");
    });

    it("registers click handler on tray", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const trayInstance = mockTrayConstructor.mock.results[0]!.value;
      expect(trayInstance.on).toHaveBeenCalledWith("click", expect.any(Function));
    });

    it("registers nativeTheme.on('updated') handler", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      expect(mockNativeThemeOn).toHaveBeenCalledWith("updated", expect.any(Function));
    });

    it("returns a cleanup function", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      const cleanup = setupTray(createTrayDeps());

      expect(typeof cleanup).toBe("function");
    });
  });

  describe("icon", () => {
    it("icon updates when settings change (preventSleep toggle)", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const trayInstance = mockTrayConstructor.mock.results[0]!.value;
      const setImageCalls = trayInstance.setImage.mock.calls.length;

      preventSleep = true;
      settingsChangeCallbacks[0]!();

      expect(trayInstance.setImage.mock.calls.length).toBeGreaterThan(setImageCalls);
    });

    it("icon updates when nativeTheme changes", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const trayInstance = mockTrayConstructor.mock.results[0]!.value;
      const setImageCalls = trayInstance.setImage.mock.calls.length;

      // Get the nativeTheme updated handler and call it
      const themeHandler = mockNativeThemeOn.mock.calls.find(
        (call) => call[0] === "updated",
      )![1];
      themeHandler();

      expect(trayInstance.setImage.mock.calls.length).toBeGreaterThan(setImageCalls);
    });

    it("uses fallback SVG when image files are empty", async () => {
      mockCreateFromPath.mockReturnValue({
        toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)),
        isEmpty: vi.fn().mockReturnValue(true),
      });

      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      // Tray should still be created (fallback icon used)
      expect(mockTrayConstructor).toHaveBeenCalledTimes(1);
    });

    it("caches icons — second build with same params returns cached", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const initialCreateFromPathCalls = mockCreateFromPath.mock.calls.length;

      // Trigger icon rebuild with same theme/state
      settingsChangeCallbacks[0]!();

      // createFromPath should NOT be called again (cached)
      expect(mockCreateFromPath.mock.calls.length).toBe(initialCreateFromPathCalls);
    });
  });

  describe("menu", () => {
    it("builds menu from template", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      expect(mockBuildFromTemplate).toHaveBeenCalled();
    });

    it("menu contains Prevent Sleep checkbox", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const template = mockBuildFromTemplate.mock.calls[0]![0];
      const preventSleepItem = template.find(
        (item: { label?: string }) => item.label === "Prevent Sleep",
      );
      expect(preventSleepItem).toBeDefined();
      expect(preventSleepItem.type).toBe("checkbox");
    });

    it("Prevent Sleep checkbox reflects current state (off by default)", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const template = mockBuildFromTemplate.mock.calls[0]![0];
      const preventSleepItem = template.find(
        (item: { label?: string }) => item.label === "Prevent Sleep",
      );
      expect(preventSleepItem.checked).toBe(false);
    });

    it("Prevent Sleep checkbox reflects active state", async () => {
      preventSleep = true;
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const template = mockBuildFromTemplate.mock.calls[0]![0];
      const preventSleepItem = template.find(
        (item: { label?: string }) => item.label === "Prevent Sleep",
      );
      expect(preventSleepItem.checked).toBe(true);
    });

    it("menu contains Settings, About, and Quit items", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const template = mockBuildFromTemplate.mock.calls[0]![0];
      const labels = template.map((item: { label?: string }) => item.label).filter(Boolean);

      expect(labels).toContain("Settings...");
      expect(labels).toContain("About Amphetamine");
      expect(labels).toContain("Quit");
    });

    it("Quit menu item has Cmd+Q accelerator", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const template = mockBuildFromTemplate.mock.calls[0]![0];
      const quitItem = template.find(
        (item: { label?: string }) => item.label === "Quit",
      );
      expect(quitItem.accelerator).toBe("Cmd+Q");
    });

    it("menu is rebuilt when settings change", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const callsBefore = mockBuildFromTemplate.mock.calls.length;

      // Trigger settings change
      settingsChangeCallbacks[0]!();

      expect(mockBuildFromTemplate.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it("click on tray pops up context menu", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      setupTray(createTrayDeps());

      const trayInstance = mockTrayConstructor.mock.results[0]!.value;
      const clickCall = trayInstance.on.mock.calls.find(
        (call: [string, ...unknown[]]) => call[0] === "click",
      );
      expect(clickCall).toBeDefined();

      // Simulate click
      const clickHandler = clickCall![1] as () => void;
      clickHandler();

      expect(trayInstance.popUpContextMenu).toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("unsubscribes from settings changes", async () => {
      const { setupTray } = await import("../../src/main/tray.js");
      const cleanup = setupTray(createTrayDeps());

      expect(settingsChangeCallbacks.length).toBe(1);

      cleanup();

      expect(settingsChangeCallbacks.length).toBe(0);
    });

    it("removes nativeTheme listener", async () => {
      const { nativeTheme } = await import("electron");
      const { setupTray } = await import("../../src/main/tray.js");
      const cleanup = setupTray(createTrayDeps());

      cleanup();

      expect(nativeTheme.removeListener).toHaveBeenCalledWith("updated", expect.any(Function));
    });
  });
});
