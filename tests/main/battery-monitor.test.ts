import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockPowerMonitor = vi.hoisted(() => ({
  on: vi.fn(),
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
  let initBatteryMonitoring: () => Promise<void>;
  let setBatteryThresholdGetter: (_fn: () => number) => void;
  let setBatteryAutoStopCallback: (_cb: () => void) => void;
  let setSleepPreventionChecker: (_fn: () => boolean) => void;
  let setStopSleepPrevention: (_fn: () => void) => void;
  let getBatteryPercent: () => Promise<number | null>;
  let mockIsActive: ReturnType<typeof vi.fn<() => boolean>>;
  let mockStopSleep: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();

    mockPowerMonitor.on.mockImplementation(() => {});
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

    const mod = await import("../../src/main/battery-monitor.js");
    initBatteryMonitoring = mod.initBatteryMonitoring;
    setBatteryThresholdGetter = mod.setBatteryThresholdGetter;
    setBatteryAutoStopCallback = mod.setBatteryAutoStopCallback;
    setSleepPreventionChecker = mod.setSleepPreventionChecker;
    setStopSleepPrevention = mod.setStopSleepPrevention;
    getBatteryPercent = mod.getBatteryPercent;
    setSleepPreventionChecker(() => mockIsActive());
    setStopSleepPrevention(() => mockStopSleep());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initBatteryMonitoring", () => {
    it("registers on-battery listener", async () => {
      await initBatteryMonitoring();

      expect(mockPowerMonitor.on).toHaveBeenCalledWith("on-battery", expect.any(Function));
    });

    it("registers on-ac listener", async () => {
      await initBatteryMonitoring();

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

  describe("setBatteryThresholdGetter", () => {
    it("accepts a threshold getter function", () => {
      expect(() => setBatteryThresholdGetter(() => 20)).not.toThrow();
    });
  });

  describe("setBatteryAutoStopCallback", () => {
    it("accepts a callback function", () => {
      expect(() => setBatteryAutoStopCallback(() => {})).not.toThrow();
    });
  });

  describe("on-battery event", () => {
    it("checks battery when on-battery fires and threshold is set", async () => {
      mockIsActive.mockReturnValue(true);
      setBatteryThresholdGetter(() => 80);
      setBatteryAutoStopCallback(vi.fn());

      await initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      expect(onBatteryCall).toBeDefined();

      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);
    });

    it("calls auto-stop callback when battery below threshold", async () => {
      const mockAutoStopCb = vi.fn();
      mockIsActive.mockReturnValue(true);
      setBatteryThresholdGetter(() => 80);
      setBatteryAutoStopCallback(mockAutoStopCb);

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

      await initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).toHaveBeenCalled();
      expect(mockAutoStopCb).toHaveBeenCalled();
    });

    it("treats threshold 0 as the default (20%) and DOES auto-stop below default", async () => {
      const mockAutoStopCb = vi.fn();
      mockIsActive.mockReturnValue(true);
      setBatteryThresholdGetter(() => 0);
      setBatteryAutoStopCallback(mockAutoStopCb);

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

      await initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).toHaveBeenCalled();
      expect(mockAutoStopCb).toHaveBeenCalled();
    });

    it("treats threshold 0 as the default (20%) and does NOT auto-stop above default", async () => {
      const mockAutoStopCb = vi.fn();
      mockIsActive.mockReturnValue(true);
      setBatteryThresholdGetter(() => 0);
      setBatteryAutoStopCallback(mockAutoStopCb);

      // Battery at 75% > default 20% → should NOT auto-stop.
      await initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).not.toHaveBeenCalled();
      expect(mockAutoStopCb).not.toHaveBeenCalled();
    });

    it("does NOT auto-stop when not preventing sleep", async () => {
      const mockAutoStopCb = vi.fn();
      mockIsActive.mockReturnValue(false);
      setBatteryThresholdGetter(() => 80);
      setBatteryAutoStopCallback(mockAutoStopCb);

      await initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).not.toHaveBeenCalled();
      expect(mockAutoStopCb).not.toHaveBeenCalled();
    });

    it("does NOT auto-stop when battery above threshold", async () => {
      const mockAutoStopCb = vi.fn();
      mockIsActive.mockReturnValue(true);
      setBatteryThresholdGetter(() => 20);
      setBatteryAutoStopCallback(mockAutoStopCb);

      await initBatteryMonitoring();

      const onBatteryCall = mockPowerMonitor.on.mock.calls.find(
        (call: unknown[]) => call[0] === "on-battery",
      );
      const onBatteryCallback = onBatteryCall![1] as () => void;
      onBatteryCallback();

      await vi.advanceTimersByTimeAsync(50);

      expect(mockStopSleep).not.toHaveBeenCalled();
      expect(mockAutoStopCb).not.toHaveBeenCalled();
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
      await initBatteryMonitoring();

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
      expect(parsePmsetOutput("-InternalBattery-0 (id=1234)\t<missing>")).toBeNull();
    });

    it("returns null for NaN parse result (malformed input)", () => {
      // This simulates a pathological case where regex matches but parseInt fails
      // (defense-in-depth — the regex /(\d+)%/ guarantees digits, this guards against future regex changes)
      const result = parsePmsetOutput("InternalBattery-0\tNaN%; discharging; 0:00 remaining present: true");
      expect(result).toBeNull();
    });

    it("ignores extra % tokens before InternalBattery line (AlDente scenario)", () => {
      const stdout =
        "Now drawing from 'Battery Power'\n - AlDente Pro Limit\t80%; present: true\n -InternalBattery-0 (id=1234)\t45%; discharging";
      expect(parsePmsetOutput(stdout)).toBe(45);
    });

    it("ignores Battery Health % token before InternalBattery line (Endurance scenario)", () => {
      const stdout =
        "Now drawing from 'Battery Power'\n - Battery Health: 92%\n -InternalBattery-0 (id=1234)\t60%; discharging; 3:21 remaining present: true";
      expect(parsePmsetOutput(stdout)).toBe(60);
    });

    it("parses charging state correctly", () => {
      const stdout =
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234)\t55%; charging; 1:23 remaining present: true";
      expect(parsePmsetOutput(stdout)).toBe(55);
    });

    it("parses discharging state with multi-line realistic output", () => {
      const stdout = [
        "Now drawing from 'Battery Power'",
        " -InternalBattery-0 (id=4325091)\t87%; discharging; 6:42 remaining present: true",
      ].join("\n");
      expect(parsePmsetOutput(stdout)).toBe(87);
    });

    it("picks InternalBattery line when multiple battery entries present", () => {
      const stdout = [
        "Now drawing from 'Battery Power'",
        " - ExternalBattery-0\t99%; present: true",
        " -InternalBattery-0 (id=1234)\t33%; discharging",
      ].join("\n");
      expect(parsePmsetOutput(stdout)).toBe(33);
    });
  });
});
