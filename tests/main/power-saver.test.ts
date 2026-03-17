import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockStart, mockStop, mockIsStarted } = vi.hoisted(() => ({
  mockStart: vi.fn().mockReturnValue(42),
  mockStop: vi.fn(),
  mockIsStarted: vi.fn().mockReturnValue(true),
}));

vi.mock("electron", () => ({
  powerSaveBlocker: {
    start: mockStart,
    stop: mockStop,
    isStarted: mockIsStarted,
  },
}));

describe("power-saver", () => {
  let startPreventingSleep: () => void;
  let stopPreventingSleep: () => void;
  let isPreventingSleep: () => boolean;
  let syncPreventSleep: (enabled: boolean) => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Re-apply default mock behavior after clearAllMocks
    mockStart.mockReturnValue(42);
    mockIsStarted.mockReturnValue(true);

    const mod = await import("../../src/main/power-saver.js");
    startPreventingSleep = mod.startPreventingSleep;
    stopPreventingSleep = mod.stopPreventingSleep;
    isPreventingSleep = mod.isPreventingSleep;
    syncPreventSleep = mod.syncPreventSleep;
  });

  describe("startPreventingSleep", () => {
    it("calls powerSaveBlocker.start with prevent-app-suspension", () => {
      startPreventingSleep();
      expect(mockStart).toHaveBeenCalledWith("prevent-app-suspension");
    });

    it("is idempotent — does not start a new blocker if already active", () => {
      startPreventingSleep();
      startPreventingSleep();
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it("starts a new blocker if previous one was stopped externally", () => {
      startPreventingSleep();
      mockIsStarted.mockReturnValue(false);
      startPreventingSleep();
      expect(mockStart).toHaveBeenCalledTimes(2);
    });
  });

  describe("stopPreventingSleep", () => {
    it("calls powerSaveBlocker.stop with the blocker id when active", () => {
      startPreventingSleep();
      stopPreventingSleep();
      expect(mockStop).toHaveBeenCalledWith(42);
    });

    it("is safe to call when no blocker is active", () => {
      stopPreventingSleep();
      expect(mockStop).not.toHaveBeenCalled();
    });

    it("sets internal state to null after stopping", () => {
      startPreventingSleep();
      stopPreventingSleep();
      expect(isPreventingSleep()).toBe(false);
    });
  });

  describe("isPreventingSleep", () => {
    it("returns false when not started", () => {
      expect(isPreventingSleep()).toBe(false);
    });

    it("returns true after startPreventingSleep", () => {
      startPreventingSleep();
      expect(isPreventingSleep()).toBe(true);
    });

    it("returns false after stopPreventingSleep", () => {
      startPreventingSleep();
      stopPreventingSleep();
      expect(isPreventingSleep()).toBe(false);
    });
  });

  describe("syncPreventSleep", () => {
    it("calls startPreventingSleep when enabled=true", () => {
      syncPreventSleep(true);
      expect(mockStart).toHaveBeenCalledWith("prevent-app-suspension");
      expect(mockStop).not.toHaveBeenCalled();
    });

    it("calls stopPreventingSleep when enabled=false", () => {
      startPreventingSleep();
      syncPreventSleep(false);
      expect(mockStop).toHaveBeenCalledWith(42);
    });

    it("is idempotent — calling with same state twice is safe", () => {
      syncPreventSleep(true);
      syncPreventSleep(true);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });
  });
});
