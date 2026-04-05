import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAllWindows } = vi.hoisted(() => ({
  mockGetAllWindows: vi.fn().mockReturnValue([]),
}));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

describe("broadcastToWindows", () => {
  let broadcastToWindows: (channel: string, data: unknown) => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetAllWindows.mockReturnValue([]);
    const mod = await import("../../src/main/utils/broadcast.js");
    broadcastToWindows = mod.broadcastToWindows;
  });

  it("does nothing when there are no windows", () => {
    mockGetAllWindows.mockReturnValue([]);
    broadcastToWindows("test-channel", { data: 123 });
    expect(mockGetAllWindows).toHaveBeenCalledTimes(1);
  });

  it("sends to a single window", () => {
    const mockSend = vi.fn();
    mockGetAllWindows.mockReturnValue([{ webContents: { send: mockSend } }]);

    broadcastToWindows("test-channel", { data: 123 });

    expect(mockSend).toHaveBeenCalledWith("test-channel", { data: 123 });
  });

  it("sends to multiple windows", () => {
    const mockSend1 = vi.fn();
    const mockSend2 = vi.fn();
    const mockSend3 = vi.fn();
    mockGetAllWindows.mockReturnValue([
      { webContents: { send: mockSend1 } },
      { webContents: { send: mockSend2 } },
      { webContents: { send: mockSend3 } },
    ]);

    broadcastToWindows("broadcast-channel", { key: "value" });

    expect(mockSend1).toHaveBeenCalledWith("broadcast-channel", { key: "value" });
    expect(mockSend2).toHaveBeenCalledWith("broadcast-channel", { key: "value" });
    expect(mockSend3).toHaveBeenCalledWith("broadcast-channel", { key: "value" });
  });

  it("passes through primitive data types", () => {
    const mockSend = vi.fn();
    mockGetAllWindows.mockReturnValue([{ webContents: { send: mockSend } }]);

    broadcastToWindows("string-channel", "hello");
    expect(mockSend).toHaveBeenCalledWith("string-channel", "hello");

    broadcastToWindows("number-channel", 42);
    expect(mockSend).toHaveBeenCalledWith("number-channel", 42);

    broadcastToWindows("null-channel", null);
    expect(mockSend).toHaveBeenCalledWith("null-channel", null);
  });
});
