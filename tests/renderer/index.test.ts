import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppSettings } from "../../src/shared/types.js";

type SessionStatus = {
  isRunning: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  remainingSeconds: number | null;
  durationMinutes: number | null;
};

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
    getStatus: vi.fn<() => Promise<SessionStatus | null>>(),
  },
  onSettingsChanged: vi.fn(() => vi.fn()),
  onSessionStatusUpdate: vi.fn(() => vi.fn()),
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
        addEventListener: globalThis.window?.addEventListener?.bind(globalThis.window) ?? vi.fn(),
        removeEventListener:
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
    it('renders "⏱ Indefinitely" when preventSleep is false', async () => {
      mockApi.settings.get.mockResolvedValue({
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

      expect(getTimerText()).toBe("⏱ Indefinitely");
    });

    it('renders "⏱ Indefinitely" when session not running', async () => {
      mockApi.settings.get.mockResolvedValue({
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

      expect(getTimerText()).toBe("⏱ Indefinitely");
    });

    it('renders "⏱ Indefinitely" when running with null durationMinutes', async () => {
      mockApi.settings.get.mockResolvedValue({
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: Date.now(),
        expiresAt: null,
        remainingSeconds: null,
        durationMinutes: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getTimerText()).toBe("⏱ Indefinitely");
    });

    it("renders hours and minutes remaining for large durations", async () => {
      mockApi.settings.get.mockResolvedValue({
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: 120,
      });
      // 1h 30m = 5400 seconds
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: Date.now() - 30 * 60 * 1000,
        expiresAt: Date.now() + 90 * 60 * 1000,
        remainingSeconds: 5400,
        durationMinutes: 120,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("⏱");
      expect(text).toContain("h");
      expect(text).toContain("m remaining");
    });

    it("renders minutes only when less than an hour", async () => {
      mockApi.settings.get.mockResolvedValue({
        launchAtLogin: false,
        preventSleep: true,
        sessionDuration: 30,
      });
      // 25 minutes remaining = 1500 seconds
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: Date.now() - 5 * 60 * 1000,
        expiresAt: Date.now() + 25 * 60 * 1000,
        remainingSeconds: 1500,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("⏱");
      expect(text).toContain("m remaining");
      expect(text).not.toContain("h");
    });
  });

  describe("status UI", () => {
    it("shows active status dot and text when preventSleep is true", async () => {
      mockApi.settings.get.mockResolvedValue({
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
      expect(getStatusText()).toBe("Preventing Sleep");
    });

    it("shows inactive status when preventSleep is false", async () => {
      mockApi.settings.get.mockResolvedValue({
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
      expect(getStatusText()).toBe("Sleep Prevention Off");
    });
  });

  describe("render", () => {
    it("renders version in header", async () => {
      mockApi.app.getVersion.mockResolvedValue("2.5.0");
      mockApi.settings.get.mockResolvedValue({
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
      mockApi.settings.get.mockResolvedValue({
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
      mockApi.settings.get.mockResolvedValue({
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
      mockApi.settings.get.mockResolvedValue({
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

      // Should still render with fallback version "-"
      const version = document.querySelector(".app-version");
      expect(version?.textContent).toBe("v-");
    });
  });

  describe("resize", () => {
    it("calls window.api.window.setHeight after render", async () => {
      mockApi.settings.get.mockResolvedValue({
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
});
