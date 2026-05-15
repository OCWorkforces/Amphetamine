import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BatteryMonitorHandle } from "../../src/main/battery-monitor.js";

const mockPowerMonitor = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  isOnBatteryPower: vi.fn().mockReturnValue(false),
}));
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  app: { isPackaged: false },
  powerMonitor: mockPowerMonitor,
}));

vi.mock("electron-log", () => ({
  default: { info: mockLogInfo, warn: mockLogWarn, error: vi.fn() },
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

describe("battery-monitor", () => {
  let handle: BatteryMonitorHandle;
  let getBatteryPercent: () => Promise<number | null>;
  let mockGetThreshold: ReturnType<typeof vi.fn<() => number>>;
  let mockOnAutoStop: ReturnType<typeof vi.fn<() => void>>;
  let mockIsActive: ReturnType<typeof vi.fn<() => boolean>>;
  let mockStopSleep: ReturnType<typeof vi.fn<() => void>>;

  /** Build a fresh battery-monitor handle wired to the current mocks. */
  async function buildHandle(): Promise<BatteryMonitorHandle> {
    const mod = await import("../../src/main/battery-monitor.js");
    return mod.createBatteryMonitor({
      getThreshold: () => mockGetThreshold(),
      onAutoStop: () => mockOnAutoStop(),
      isPreventingSleep: () => mockIsActive(),
      stopPreventingSleep: () => mockStopSleep(),
    });
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();

    mockPowerMonitor.on.mockImplementation(() => {});
    mockGetThreshold = vi.fn<() => number>().mockReturnValue(0);
    mockOnAutoStop = vi.fn<() => void>();
    mockIsActive = vi.fn<() => boolean>().mockReturnValue(false);
    mockStopSleep = vi.fn<() => void>();

    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        cb: (_err: Error | null, _result: { stdout: string }) => void,
      ) => {
        cb(null, {
          stdout:
            "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t75%; discharging",
        });
      },
    );

    handle = await buildHandle();
    const mod = await import("../../src/main/battery-monitor.js");
    getBatteryPercent = mod.getBatteryPercent;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initBatteryMonitoring", () => {
    it("registers on-battery listener", async () => {
      await handle.initBatteryMonitoring();

      expect(mockPowerMonitor.on).toHaveBeenCalledWith("on-battery", expect.any(Function));
    });

    it("registers on-ac listener", async () => {
      await handle.initBatteryMonitoring();

      expect(mockPowerMonitor.on).toHaveBeenCalledWith("on-ac", expect.any(Function));
    });
  });

  describe("getBatteryPercent", () => {
    it("parses battery percentage from pmset output", async () => {
      const percent = await getBatteryPercent();

      expect(percent).toBe(75);
    });

    it("returns null when pmset output has no percentage", async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(null, { stdout: "No battery found" });
        },
      );

      vi.resetModules();
      const mod = await import("../../src/main/battery-monitor.js");
      const percent = await mod.getBatteryPercent();

      expect(percent).toBe(null);
    });

    it("returns null on error", async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(new Error("Command failed"), { stdout: "" });
        },
      );

      vi.resetModules();
      const mod = await import("../../src/main/battery-monitor.js");
      const percent = await mod.getBatteryPercent();

      expect(percent).toBe(null);
    });
  });

  describe("createBatteryMonitor enforces required deps (no silent fallbacks)", () => {
    it("throws when getThreshold is missing", async () => {
      const mod = await import("../../src/main/battery-monitor.js");
      expect(() =>
        mod.createBatteryMonitor({
          // @ts-expect-error - intentionally missing required dep
          getThreshold: undefined,
          onAutoStop: () => {},
          isPreventingSleep: () => false,
          stopPreventingSleep: () => {},
        }),
      ).toThrow(/getThreshold/);
    });

    it("throws when onAutoStop is missing", async () => {
      const mod = await import("../../src/main/battery-monitor.js");
      expect(() =>
        mod.createBatteryMonitor({
          getThreshold: () => 0,
          // @ts-expect-error - intentionally missing required dep
          onAutoStop: undefined,
          isPreventingSleep: () => false,
          stopPreventingSleep: () => {},
        }),
      ).toThrow(/onAutoStop/);
    });

    it("throws when isPreventingSleep is missing", async () => {
      const mod = await import("../../src/main/battery-monitor.js");
      expect(() =>
        mod.createBatteryMonitor({
          getThreshold: () => 0,
          onAutoStop: () => {},
          // @ts-expect-error - intentionally missing required dep
          isPreventingSleep: undefined,
          stopPreventingSleep: () => {},
        }),
      ).toThrow(/isPreventingSleep/);
    });

    it("throws when stopPreventingSleep is missing", async () => {
      const mod = await import("../../src/main/battery-monitor.js");
      expect(() =>
        mod.createBatteryMonitor({
          getThreshold: () => 0,
          onAutoStop: () => {},
          isPreventingSleep: () => false,
          // @ts-expect-error - intentionally missing required dep
          stopPreventingSleep: undefined,
        }),
      ).toThrow(/stopPreventingSleep/);
    });
  });

  describe("on-battery event", () => {
    it("checks battery when on-battery fires and threshold is set", async () => {
      mockIsActive.mockReturnValue(true);
      mockGetThreshold.mockReturnValue(80);

      await handle.initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      expect(onBatteryCall).toBeDefined();

      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);
    });

    it("calls auto-stop callback when battery below threshold", async () => {
      mockIsActive.mockReturnValue(true);
      mockGetThreshold.mockReturnValue(80);

      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(null, {
            stdout:
              "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t75%; discharging",
          });
        },
      );

      await handle.initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).toHaveBeenCalled();
      expect(mockOnAutoStop).toHaveBeenCalled();
    });

    it("treats threshold 0 as the default (20%) and DOES auto-stop below default", async () => {
      mockIsActive.mockReturnValue(true);
      mockGetThreshold.mockReturnValue(0);

      // Battery at 15% < default 20% → should auto-stop.
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(null, {
            stdout:
              "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t15%; discharging",
          });
        },
      );

      await handle.initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).toHaveBeenCalled();
      expect(mockOnAutoStop).toHaveBeenCalled();
    });

    it("treats threshold 0 as the default (20%) and does NOT auto-stop above default", async () => {
      mockIsActive.mockReturnValue(true);
      mockGetThreshold.mockReturnValue(0);

      // Battery at 75% > default 20% → should NOT auto-stop.
      await handle.initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).not.toHaveBeenCalled();
      expect(mockOnAutoStop).not.toHaveBeenCalled();
    });

    it("does NOT auto-stop when not preventing sleep", async () => {
      mockIsActive.mockReturnValue(false);
      mockGetThreshold.mockReturnValue(80);

      await handle.initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).not.toHaveBeenCalled();
      expect(mockOnAutoStop).not.toHaveBeenCalled();
    });

    it("does NOT auto-stop when battery above threshold", async () => {
      mockIsActive.mockReturnValue(true);
      mockGetThreshold.mockReturnValue(20);

      await handle.initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).not.toHaveBeenCalled();
      expect(mockOnAutoStop).not.toHaveBeenCalled();
    });
  });

  describe("getBatteryPercent edge cases", () => {
    it("parses 0% battery", async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(null, {
            stdout:
              "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t0%; discharging",
          });
        },
      );

      vi.resetModules();
      const mod = await import("../../src/main/battery-monitor.js");
      const percent = await mod.getBatteryPercent();

      expect(percent).toBe(0);
    });

    it("parses 100% battery", async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(null, {
            stdout:
              "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234)\t100%; charged",
          });
        },
      );

      vi.resetModules();
      const mod = await import("../../src/main/battery-monitor.js");
      const percent = await mod.getBatteryPercent();

      expect(percent).toBe(100);
    });

    it("returns null for malformed pmset output", async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(null, { stdout: "garbage output with no percentage" });
        },
      );

      vi.resetModules();
      const mod = await import("../../src/main/battery-monitor.js");
      const percent = await mod.getBatteryPercent();

      expect(percent).toBe(null);
    });

    it("returns null for empty pmset output", async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(null, { stdout: "" });
        },
      );

      vi.resetModules();
      const mod = await import("../../src/main/battery-monitor.js");
      const percent = await mod.getBatteryPercent();

      expect(percent).toBe(null);
    });
  });

  describe("on-ac event", () => {
    it("registers on-ac listener and logs info", async () => {
      await handle.initBatteryMonitoring();

      const onAcCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-ac",
      );
      expect(onAcCall).toBeDefined();

      const onAcCallback = onAcCall![1] as () => void;
      onAcCallback();

      expect(mockLogInfo).toHaveBeenCalled();
    });
  });

  describe("parsePmsetOutput", () => {
    let parsePmsetOutput: (stdout: string) => number | null;

    beforeEach(async () => {
      const mod = await import("../../src/main/battery-monitor.js");
      parsePmsetOutput = mod.parsePmsetOutput;
    });

    it("parses normal output with 75%", () => {
      const stdout =
        "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t75%; discharging";
      expect(parsePmsetOutput(stdout)).toBe(75);
    });

    it("parses 0% battery", () => {
      const stdout =
        "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t0%; discharging";
      expect(parsePmsetOutput(stdout)).toBe(0);
    });

    it("parses 100% battery", () => {
      const stdout =
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234)\t100%; charged";
      expect(parsePmsetOutput(stdout)).toBe(100);
    });

    it("returns null when no InternalBattery (desktop Mac)", () => {
      expect(parsePmsetOutput("Now drawing from 'AC Power'\n")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parsePmsetOutput("")).toBeNull();
    });

    it("returns null for malformed output with no %", () => {
      expect(parsePmsetOutput("garbage output")).toBeNull();
    });

    it("returns null for missing battery format", () => {
      expect(parsePmsetOutput("Now drawing from 'AC Power'\n -SomethingElse-0 75%")).toBeNull();
    });
  });

  describe("periodic battery checks (FIX 1)", () => {
    it("starts setInterval when on battery power and preventing sleep", async () => {
      mockPowerMonitor.isOnBatteryPower.mockReturnValue(true);
      mockIsActive.mockReturnValue(true);
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      await handle.initBatteryMonitoring();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
      setIntervalSpy.mockRestore();
    });

    it("does NOT start setInterval when not on battery power", async () => {
      mockPowerMonitor.isOnBatteryPower.mockReturnValue(false);
      mockIsActive.mockReturnValue(true);
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      await handle.initBatteryMonitoring();

      expect(setIntervalSpy).not.toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });

    it("does NOT start setInterval when not preventing sleep", async () => {
      mockPowerMonitor.isOnBatteryPower.mockReturnValue(true);
      mockIsActive.mockReturnValue(false);
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      await handle.initBatteryMonitoring();

      expect(setIntervalSpy).not.toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });

    it("calls .unref() on the interval", async () => {
      mockPowerMonitor.isOnBatteryPower.mockReturnValue(true);
      mockIsActive.mockReturnValue(true);
      const fakeInterval = { unref: vi.fn() } as unknown as ReturnType<typeof setInterval>;
      const setIntervalSpy = vi
        .spyOn(globalThis, "setInterval")
        .mockReturnValue(fakeInterval);

      await handle.initBatteryMonitoring();

      expect(fakeInterval.unref).toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });

    it("registers a resume listener that re-starts polling", async () => {
      await handle.initBatteryMonitoring();

      const resumeCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "resume",
      );
      expect(resumeCall).toBeDefined();

      mockPowerMonitor.isOnBatteryPower.mockReturnValue(true);
      mockIsActive.mockReturnValue(true);
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      const resumeCallback = resumeCall![1] as () => void;
      resumeCallback();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
      setIntervalSpy.mockRestore();
    });

    it("clears interval when on-ac fires", async () => {
      mockPowerMonitor.isOnBatteryPower.mockReturnValue(true);
      mockIsActive.mockReturnValue(true);
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

      await handle.initBatteryMonitoring();

      const onAcCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-ac",
      );
      const onAcCallback = onAcCall![1] as () => void;
      onAcCallback();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it("onPreventSleepChange(true) starts polling when on battery", () => {
      mockPowerMonitor.isOnBatteryPower.mockReturnValue(true);
      mockIsActive.mockReturnValue(true);
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      handle.onPreventSleepChange(true);

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
      setIntervalSpy.mockRestore();
    });

    it("onPreventSleepChange(false) clears the interval", async () => {
      mockPowerMonitor.isOnBatteryPower.mockReturnValue(true);
      mockIsActive.mockReturnValue(true);
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

      await handle.initBatteryMonitoring();
      handle.onPreventSleepChange(false);

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it("cleanup removes resume listener and clears interval", async () => {
      mockPowerMonitor.isOnBatteryPower.mockReturnValue(true);
      mockIsActive.mockReturnValue(true);
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

      await handle.initBatteryMonitoring();
      handle.cleanupBatteryMonitoring();

      expect(mockPowerMonitor.off).toHaveBeenCalledWith("resume", expect.any(Function));
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });
});
