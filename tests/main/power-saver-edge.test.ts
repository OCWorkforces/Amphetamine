import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks - defined before vi.mock
const mockStart = vi.hoisted(() => vi.fn().mockReturnValue(42));
const mockStop = vi.hoisted(() => vi.fn());
const mockIsStarted = vi.hoisted(() => vi.fn().mockReturnValue(true));

// Mock electron with importOriginal to preserve other exports
// Also include app since settings.ts uses it at module level
vi.mock("electron", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    powerSaveBlocker: {
      start: mockStart,
      stop: mockStop,
      isStarted: mockIsStarted,
    },
    app: {
      getPath: vi.fn().mockReturnValue("/tmp/test-user-data"),
    },
  };
});

describe("power-saver edge cases", () => {
  let startPreventingSleep: () => void;
  let stopPreventingSleep: () => void;
  let isPreventingSleep: () => boolean;
  let syncPreventSleep: (enabled: boolean) => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default mock behavior
    mockStart.mockReturnValue(42);
    mockIsStarted.mockReturnValue(true);
    mockStop.mockClear();

    const mod = await import("../../src/main/power-saver.js");
    startPreventingSleep = mod.startPreventingSleep;
    stopPreventingSleep = mod.stopPreventingSleep;
    isPreventingSleep = mod.isPreventingSleep;
    syncPreventSleep = mod.syncPreventSleep;
  });

  describe("stopPreventingSleep edge cases", () => {
    it("is safe to call when no blocker was ever started", () => {
      // Never called startPreventingSleep
      // blockerId is null

      stopPreventingSleep();

      expect(mockStop).not.toHaveBeenCalled();
      expect(isPreventingSleep()).toBe(false);
    });

    it("calling stopPreventingSleep twice is idempotent (second call no-ops)", () => {
      startPreventingSleep();
      mockStop.mockClear();

      stopPreventingSleep(); // First stop
      stopPreventingSleep(); // Second stop - should be no-op

      // stop should only be called once (from first stopPreventingSleep)
      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(isPreventingSleep()).toBe(false);
    });
  });

  describe("startPreventingSleep edge cases", () => {
    it("sets blockerId to null when powerSaveBlocker.start returns invalid id (0)", () => {
      mockStart.mockReturnValue(0);

      startPreventingSleep();

      expect(mockStart).toHaveBeenCalledWith("prevent-display-sleep");
      expect(isPreventingSleep()).toBe(false);
    });

    it("sets blockerId to null when powerSaveBlocker.start returns invalid id (-1)", () => {
      mockStart.mockReturnValue(-1);

      startPreventingSleep();

      expect(mockStart).toHaveBeenCalledWith("prevent-display-sleep");
      expect(isPreventingSleep()).toBe(false);
    });

    it("isPreventingSleep returns false after failed start", () => {
      mockStart.mockReturnValue(0);

      startPreventingSleep();

      expect(isPreventingSleep()).toBe(false);
    });

    it("startPreventingSleep allows retry after failed start", () => {
      // First start fails
      mockStart.mockReturnValueOnce(0);
      startPreventingSleep();
      expect(isPreventingSleep()).toBe(false);

      // Second start succeeds
      mockStart.mockReturnValueOnce(99);
      startPreventingSleep();
      expect(isPreventingSleep()).toBe(true);
    });
  });

  describe("syncPreventSleep edge cases", () => {
    it("syncPreventSleep(false) is safe when never started", () => {
      // Never called startPreventingSleep

      syncPreventSleep(false);

      expect(mockStop).not.toHaveBeenCalled();
      expect(isPreventingSleep()).toBe(false);
    });

    it("syncPreventSleep(true) is idempotent when already preventing", () => {
      startPreventingSleep();
      mockStart.mockClear();

      syncPreventSleep(true);
      syncPreventSleep(true);

      // startPreventingSleep checks blockerId and isStarted, so it should not call start again
      expect(mockStart).not.toHaveBeenCalled();
    });

    it("syncPreventSleep(false) then syncPreventSleep(true) restarts blocker", () => {
      startPreventingSleep();
      mockStart.mockClear();

      syncPreventSleep(false);
      expect(mockStop).toHaveBeenCalledWith(42);

      mockStart.mockClear();
      syncPreventSleep(true);
      expect(mockStart).toHaveBeenCalledWith("prevent-display-sleep");
    });
  });

  describe("isPreventingSleep states", () => {
    it("returns false initially (module load state)", () => {
      // This tests the initial state after resetModules
      expect(isPreventingSleep()).toBe(false);
    });

    it("returns true after successful startPreventingSleep", () => {
      startPreventingSleep();
      expect(isPreventingSleep()).toBe(true);
    });

    it("returns false after stopPreventingSleep", () => {
      startPreventingSleep();
      stopPreventingSleep();
      expect(isPreventingSleep()).toBe(false);
    });

    it("returns false when blockerId is set but powerSaveBlocker.isStarted returns false", () => {
      startPreventingSleep();
      mockIsStarted.mockReturnValue(false);

      expect(isPreventingSleep()).toBe(false);
    });
  });
});
