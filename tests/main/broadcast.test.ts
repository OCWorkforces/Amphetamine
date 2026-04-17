import { describe, it, expect, vi, beforeEach } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/types.js";

const { mockGetAllWindows } = vi.hoisted(() => ({
  mockGetAllWindows: vi.fn().mockReturnValue([]),
}));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

describe("broadcastToWindows", () => {
  let broadcastToWindows: <K extends import("../../src/shared/types.js").PushChannel>(
    channel: K,
    data: import("../../src/shared/types.js").IpcResponse<K>,
  ) => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetAllWindows.mockReturnValue([]);
    const mod = await import("../../src/main/utils/broadcast.js");
    broadcastToWindows = mod.broadcastToWindows;
  });

  it("does nothing when there are no windows", () => {
    mockGetAllWindows.mockReturnValue([]);
    broadcastToWindows(IPC_CHANNELS.SESSION_STATUS_UPDATE, null);
    expect(mockGetAllWindows).toHaveBeenCalledTimes(1);
  });

  it("sends to a single window", () => {
    const mockSend = vi.fn();
    mockGetAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: mockSend } },
    ]);

    broadcastToWindows(IPC_CHANNELS.SETTINGS_CHANGED, {
      launchAtLogin: false,
      preventSleep: true,
      sessionDuration: null,
    });

    expect(mockSend).toHaveBeenCalledWith("settings:changed", {
      launchAtLogin: false,
      preventSleep: true,
      sessionDuration: null,
    });
  });

  it("sends to multiple windows", () => {
    const mockSend1 = vi.fn();
    const mockSend2 = vi.fn();
    const mockSend3 = vi.fn();
    mockGetAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: mockSend1 } },
      { isDestroyed: () => false, webContents: { send: mockSend2 } },
      { isDestroyed: () => false, webContents: { send: mockSend3 } },
    ]);

    broadcastToWindows(IPC_CHANNELS.AUTO_UPDATER_STATUS, { status: "checking" });

    expect(mockSend1).toHaveBeenCalledWith("auto-updater:status", { status: "checking" });
    expect(mockSend2).toHaveBeenCalledWith("auto-updater:status", { status: "checking" });
    expect(mockSend3).toHaveBeenCalledWith("auto-updater:status", { status: "checking" });
  });

  it("skips destroyed windows", () => {
    const mockSend = vi.fn();
    mockGetAllWindows.mockReturnValue([
      { isDestroyed: () => true, webContents: { send: mockSend } },
    ]);

    broadcastToWindows(IPC_CHANNELS.AUTO_UPDATER_STATUS, { status: "error", error: "fail" });

    expect(mockSend).not.toHaveBeenCalled();
  });
});
