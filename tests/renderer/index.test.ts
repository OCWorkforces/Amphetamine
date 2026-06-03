import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppSettings, SessionStatusResponse } from "../../src/shared/types.js";
import { asPerf, DEFAULT_SETTINGS } from "../../src/shared/types.js";
import {
  STATUS_PREVENTING_SLEEP,
  STATUS_SLEEP_PREVENTION_OFF,
} from "../../src/renderer/constants.js";

const mockApi = {
  window: { setHeight: vi.fn() },
  app: { getVersion: vi.fn().mockResolvedValue("1.0.0"), quit: vi.fn() },
  settings: {
    get: vi.fn<() => Promise<AppSettings>>(),
    set: vi.fn(),
    open: vi.fn(),
  },
  session: {
    start: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn<() => Promise<SessionStatusResponse | null>>(),
  },
  onSettingsChanged: vi.fn<(_cb: (s: AppSettings) => void) => () => void>(() => vi.fn()),
  onWindowHide: vi.fn<(_cb: () => void) => () => void>(() => vi.fn()),
  onSessionStatusUpdate: vi.fn<(_cb: (s: SessionStatusResponse) => void) => () => void>(
    () => vi.fn(),
  ),
  autoUpdater: {
    checkForUpdates: vi.fn(),
    onStatus: vi.fn(() => vi.fn()),
  },
};

function setupDom(): void {
  document.body.innerHTML = '<div id="app"></div>';
}

function getTimerText(): string | null {
  return document.getElementById("timer-text")?.textContent ?? null;
}

function getStatusText(): string | null {
  return document.getElementById("status-text")?.textContent ?? null;
}

function getStatusDot(): HTMLElement | null {
  return document.querySelector("#status-dot");
}

describe("renderer popover (index.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupDom();

    // Default: preventSleep off
    const defaultSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      launchAtLogin: false,
      preventSleep: false,
      sessionDuration: null,
    };
    mockApi.settings.get.mockResolvedValue(defaultSettings);
    mockApi.session.getStatus.mockResolvedValue(null);

    Object.defineProperty(globalThis, "window", {
      value: {
        ...globalThis.window,
        api: mockApi,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        addEventListener: globalThis.window?.addEventListener?.bind(globalThis.window) ?? vi.fn(),
        removeEventListener:
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          globalThis.window?.removeEventListener?.bind(globalThis.window) ?? vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("formatTimerLabel via render", () => {
    it('renders "Timer Indefinitely" when preventSleep is false', async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue(null);

      // Trigger DOMContentLoaded → init()
      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));

      // Let promises resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(getTimerText()).toBe("Timer Indefinitely");
    });

    it('renders "Timer Indefinitely" when session not running', async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: false,
        startedAt: null,
        expiresAt: null,
        remainingSeconds: null,
        durationMinutes: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getTimerText()).toBe("Timer Indefinitely");
    });

    it('renders "Timer Indefinitely" when running with null durationMinutes', async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: null,
        remainingSeconds: null,
        durationMinutes: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getTimerText()).toBe("Timer Indefinitely");
    });

    it("renders hours and minutes remaining for large durations", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: 120,
      });
      // 1h 30m = 5400 seconds
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now() - 30 * 60 * 1000),
        expiresAt: asPerf(Date.now() + 90 * 60 * 1000),
        remainingSeconds: 5400,
        durationMinutes: 120,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("h");
      expect(text).toContain("m remaining");
    });

    it("renders minutes only when less than an hour", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: 30,
      });
      // 25 minutes remaining = 1500 seconds
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now() - 5 * 60 * 1000),
        expiresAt: asPerf(Date.now() + 25 * 60 * 1000),
        remainingSeconds: 1500,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("m remaining");
      expect(text).not.toContain("h");
    });
  });

  describe("status UI", () => {
    it("shows active status dot and text when preventSleep is true", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue(null);

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatusDot()?.classList.contains("active")).toBe(true);
      expect(getStatusText()).toBe(STATUS_PREVENTING_SLEEP);
    });

    it("shows inactive status when preventSleep is false", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue(null);

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatusDot()?.classList.contains("active")).toBe(false);
      expect(getStatusText()).toBe(STATUS_SLEEP_PREVENTION_OFF);
    });
  });

  describe("render", () => {
    it("renders version in header", async () => {
      mockApi.app.getVersion.mockResolvedValue("2.5.0");
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const version = document.querySelector(".app-version");
      expect(version?.textContent).toBe("v2.5.0");
    });

    it("renders settings and quit buttons", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(document.getElementById("settings-action")).not.toBeNull();
      expect(document.getElementById("quit-action")).not.toBeNull();
    });

    it("calls settings.open when settings button clicked", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      document.getElementById("settings-action")?.click();
      expect(mockApi.settings.open).toHaveBeenCalledOnce();
    });

    it("calls app.quit when quit button clicked", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      document.getElementById("quit-action")?.click();
      expect(mockApi.app.quit).toHaveBeenCalledOnce();
    });

    it("renders fallback when init throws", async () => {
      mockApi.settings.get.mockRejectedValue(new Error("IPC error"));

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const version = document.querySelector(".app-version");
      expect(version?.textContent).toBe("v-");
    });
  });

  describe("resize", () => {
    it("calls window.api.window.setHeight after render", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      // requestAnimationFrame needs to fire
      await vi.advanceTimersByTimeAsync(16);

      expect(mockApi.window.setHeight).toHaveBeenCalled();
    });

  });
  describe("push subscriptions", () => {
    it("subscribes to onSettingsChanged on init", async () => {
      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockApi.onSettingsChanged).toHaveBeenCalledWith(expect.any(Function));
    });

    it("subscribes to onSessionStatusUpdate on init", async () => {
      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockApi.onSessionStatusUpdate).toHaveBeenCalledWith(expect.any(Function));
    });

    it("updates status when settings push arrives (preventSleep on)", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatusText()).toBe(STATUS_SLEEP_PREVENTION_OFF);

      // Simulate push: preventSleep turned on
      const settingsCallback = mockApi.onSettingsChanged.mock.calls[0]![0];
      settingsCallback({
        ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: null,
      });

      // Wait for rAF
      await vi.advanceTimersByTimeAsync(16);

      expect(getStatusText()).toBe(STATUS_PREVENTING_SLEEP);
      expect(getStatusDot()?.classList.contains("active")).toBe(true);
    });

    it("updates timer when session status push arrives", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: 30,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 25 * 60 * 1000),
        remainingSeconds: 1500,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      // Simulate session status push with updated remaining time
      const sessionCallback = mockApi.onSessionStatusUpdate.mock.calls[0]![0];
      sessionCallback({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 10 * 60 * 1000),
        remainingSeconds: 600,
        durationMinutes: 30,
      });

      await vi.advanceTimersByTimeAsync(16);

      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("m remaining");
    });

    it("keeps session active when preventSleep is turned off via push while session running", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: 30,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 25 * 60 * 1000),
        remainingSeconds: 1500,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      // Turn off preventSleep via push — session still running
      const settingsCallback = mockApi.onSettingsChanged.mock.calls[0]![0];
      settingsCallback({
        ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });

      await vi.advanceTimersByTimeAsync(16);

      // Effective active state stays true while session.isRunning is true.
      expect(getStatusText()).toBe(STATUS_PREVENTING_SLEEP);
      expect(getStatusDot()?.classList.contains("active")).toBe(true);
      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("m remaining");
    });

    it("shows active status and remaining timer for running timed session even when preventSleep is false", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: 30,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 20 * 60 * 1000),
        remainingSeconds: 1200,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatusDot()?.classList.contains("active")).toBe(true);
      expect(getStatusText()).toBe(STATUS_PREVENTING_SLEEP);
      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("m remaining");
    });

    it("fetches session.getStatus during init even when preventSleep is false", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue(null);

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockApi.session.getStatus).toHaveBeenCalled();
    });
  });

  describe("session display", () => {
    it("renders seconds when less than a minute", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: 15,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now() - 14 * 60 * 1000),
        expiresAt: asPerf(Date.now() + 45 * 1000),
        remainingSeconds: 45,
        durationMinutes: 15,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("Timer");
      // 45 seconds rounds up to 1 minute
      expect(text).toContain("m remaining");
    });

    it("renders zero remaining as 0m", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: 15,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now() - 15 * 60 * 1000),
        expiresAt: asPerf(Date.now()),
        remainingSeconds: 0,
        durationMinutes: 15,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("0m remaining");
    });
  });
});
