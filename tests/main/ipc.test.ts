import { describe, it, expect, vi, beforeEach } from "vitest";
import { IPC_CHANNELS, DEFAULT_SETTINGS } from "../../src/shared/types.js";
import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";
import { validateSender } from "../../src/main/ipc.js";

describe("validateSender", () => {
  it("accepts file:// origin for app index.html (exact match)", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app.asar/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("accepts file:// origin for settings/index.html (exact match)", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app.asar/settings/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("rejects file:// origin with path prefix attack (substring bypass)", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app.asar.evil/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects file:// origin to non-allowlisted path within bundle", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app.asar/src/renderer/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("accepts http://localhost:5173 origin (dev server)", () => {
    const event = {
      senderFrame: { url: "http://localhost:5173/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("accepts http://127.0.0.1:5173 origin (dev server)", () => {
    const event = {
      senderFrame: { url: "http://127.0.0.1:5173/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("rejects file:// origin outside app bundle", () => {
    const event = {
      senderFrame: { url: "file:///tmp/malicious.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects malicious origin", () => {
    const event = {
      senderFrame: { url: "https://evil.com/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects empty sender URL", () => {
    const event = {
      senderFrame: { url: "" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects undefined sender frame", () => {
    const event = {
      senderFrame: undefined,
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects non-allowlisted port", () => {
    const event = {
      senderFrame: { url: "http://localhost:3000/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects similar but different domain", () => {
    const event = {
      senderFrame: { url: "http://localhost.com:5173/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Additional coverage: ipcMain.on sender validation, APP_QUIT, SESSION_START
// invalid duration, SESSION_STATUS while running, path-traversal injection.
// ---------------------------------------------------------------------------

const {
  mockGetSettings,
  mockUpdateSettings,
  mockOnSettingsChanged,
  mockCreateSettingsWindow,
  mockStartSession,
  mockCancelSession,
  mockGetStatus,
} = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
  mockOnSettingsChanged: vi.fn(),
  mockCreateSettingsWindow: vi.fn(),
  mockStartSession: vi.fn(),
  mockCancelSession: vi.fn(),
  mockGetStatus: vi.fn(),
}));

vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
  onSettingsChanged: mockOnSettingsChanged,
}));

vi.mock("../../src/main/settings-window.js", () => ({
  createSettingsWindow: mockCreateSettingsWindow,
}));

vi.mock("../../src/main/session-timer.js", () => ({
  startSession: mockStartSession,
  cancelSession: mockCancelSession,
  getStatus: mockGetStatus,
}));

vi.mock("../../src/main/auto-updater.js", () => ({
  registerAutoUpdaterIpc: vi.fn(),
}));

describe("ipc additional coverage", () => {
  let registerIpcHandlers: (
    _win: { setSize?: (_w: number, _h: number, _animate?: boolean) => void },
  ) => void;
  let registeredHandlers: Map<string, (..._args: unknown[]) => unknown>;
  let appQuitMock: ReturnType<typeof vi.fn>;

  const validEvent = {
    senderFrame: { url: "file:///path/to/app.asar/index.html" },
  } as unknown as IpcMainInvokeEvent;
  const invalidEvent = {
    senderFrame: { url: "https://evil.com/" },
  } as unknown as IpcMainInvokeEvent;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const electron = await import("electron");
    vi.mocked(electron.app.getAppPath).mockReturnValue("/path/to/app.asar");
    vi.mocked(electron.app.quit).mockClear();
    appQuitMock = vi.mocked(electron.app.quit) as unknown as ReturnType<typeof vi.fn>;

    mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
    mockUpdateSettings.mockImplementation((partial: Partial<typeof DEFAULT_SETTINGS>) => ({
      ...DEFAULT_SETTINGS,
      ...partial,
    }));
    mockStartSession.mockReturnValue({
      isRunning: true,
      startedAt: 1_700_000_000_000,
      expiresAt: null,
      durationMinutes: null,
    });
    mockGetStatus.mockReturnValue({
      isRunning: false,
      startedAt: null,
      expiresAt: null,
      remainingSeconds: null,
      durationMinutes: null,
    });

    registeredHandlers = new Map();
    vi.mocked(electron.ipcMain.handle).mockImplementation(
      ((channel: string, handler: (..._args: unknown[]) => unknown) => {
        registeredHandlers.set(channel, handler);
      }) as Parameters<typeof electron.ipcMain.handle>[1] extends infer _
        ? typeof electron.ipcMain.handle
        : never,
    );
    vi.mocked(electron.ipcMain.on).mockImplementation(
      ((channel: string, handler: (..._args: unknown[]) => unknown) => {
        registeredHandlers.set(channel, handler);
        return electron.ipcMain;
      }) as typeof electron.ipcMain.on,
    );

    const mod = await import("../../src/main/ipc.js");
    registerIpcHandlers = mod.registerIpcHandlers as unknown as typeof registerIpcHandlers;
  });

  describe("ipcMain.on sender validation (WINDOW_SET_HEIGHT)", () => {
    it("valid file:// origin: invokes window.setSize", () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.WINDOW_SET_HEIGHT);
      expect(handler).toBeDefined();
      handler!(validEvent, 320);
      expect(mockWindow.setSize).toHaveBeenCalledWith(360, 320, true);
    });

    it("invalid origin (https://evil.com): does NOT invoke window.setSize", () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.WINDOW_SET_HEIGHT);
      handler!(invalidEvent, 320);
      expect(mockWindow.setSize).not.toHaveBeenCalled();
    });
  });

  describe("APP_QUIT handler", () => {
    it("valid sender: app.quit() is called", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.APP_QUIT);
      expect(handler).toBeDefined();
      await handler!(validEvent);
      expect(appQuitMock).toHaveBeenCalledTimes(1);
    });

    it("invalid sender: app.quit() is NOT called", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.APP_QUIT);
      await handler!(invalidEvent);
      expect(appQuitMock).not.toHaveBeenCalled();
    });
  });

  describe("SESSION_START with invalid durationMinutes", () => {
    const emptyResponse = { startedAt: 0, durationMinutes: null, expiresAt: null };

    it("negative number: returns empty response and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: -5 });
      expect(result).toEqual(emptyResponse);
      expect(mockStartSession).not.toHaveBeenCalled();
    });

    it("NaN: returns empty response and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: NaN });
      expect(result).toEqual(emptyResponse);
      expect(mockStartSession).not.toHaveBeenCalled();
    });

    it("zero: returns empty response and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: 0 });
      expect(result).toEqual(emptyResponse);
      expect(mockStartSession).not.toHaveBeenCalled();
    });

    it("non-integer (e.g. 1.5): returns empty response and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: 1.5 });
      expect(result).toEqual(emptyResponse);
      expect(mockStartSession).not.toHaveBeenCalled();
    });
  });

  describe("SESSION_STATUS while a session is running", () => {
    it("returns running status with startedAt and remainingSeconds", async () => {
      const startedAt = 1_700_000_000_000;
      const expiresAt = startedAt + 60_000;
      mockGetStatus.mockReturnValue({
        isRunning: true,
        startedAt,
        expiresAt,
        remainingSeconds: 42,
        durationMinutes: 1,
      });
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_STATUS);
      const result = (await handler!(validEvent)) as {
        isRunning: boolean;
        startedAt: number | null;
        remainingSeconds: number | null;
      };
      expect(result.isRunning).toBe(true);
      expect(typeof result.startedAt).toBe("number");
      expect(result.startedAt).toBe(startedAt);
      expect(typeof result.remainingSeconds).toBe("number");
      expect(result.remainingSeconds).toBe(42);
    });
  });

  describe("path-traversal sender URL injection", () => {
    it("rejects file:// path with traversal segments that resolve outside allowlist", async () => {
      // file:///path/to/app.asar/../etc/index.html resolves to /path/etc/index.html — outside allowlist
      const traversalEvent = {
        senderFrame: { url: "file:///path/to/app.asar/../etc/index.html" },
      } as unknown as IpcMainEvent;
      const { validateSender } = await import("../../src/main/ipc.js");
      expect(validateSender(traversalEvent)).toBe(false);
    });

    it("rejects file:// malicious path traversal that does not resolve to allowlisted index.html", async () => {
      const traversalEvent = {
        senderFrame: { url: "file:///malicious/../index.html" },
      } as unknown as IpcMainEvent;
      const { validateSender } = await import("../../src/main/ipc.js");
      expect(validateSender(traversalEvent)).toBe(false);
    });

    it("APP_QUIT rejects path-traversal sender URL", async () => {
      const traversalEvent = {
        senderFrame: { url: "file:///path/to/app.asar/../../etc/passwd/index.html" },
      } as unknown as IpcMainEvent;
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow);
      const handler = registeredHandlers.get(IPC_CHANNELS.APP_QUIT);
      await handler!(traversalEvent);
      expect(appQuitMock).not.toHaveBeenCalled();
    });
  });
});
