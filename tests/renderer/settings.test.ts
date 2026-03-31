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
    set: vi.fn<(settings: AppSettings) => Promise<AppSettings>>(),
    open: vi.fn(),
  },
  session: {
    start: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn<() => Promise<SessionStatus | null>>(),
  },
  onSettingsChanged: vi.fn(() => vi.fn()),
  autoUpdater: {
    checkForUpdates: vi.fn(),
    onStatus: vi.fn(() => vi.fn()),
  },
};

vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

function setupDom(): void {
  document.body.innerHTML = '<div id="app"></div>';
}

describe("renderer settings", () => {
  const defaultSettings: AppSettings = {
    launchAtLogin: false,
    preventSleep: false,
    sessionDuration: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupDom();

    mockApi.settings.get.mockResolvedValue({ ...defaultSettings });
    mockApi.settings.set.mockImplementation(async (s: AppSettings) => s);
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

  describe("render", () => {
    it("renders settings form with all controls", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(document.getElementById("launch-at-login-toggle")).not.toBeNull();
      expect(document.getElementById("prevent-sleep-toggle")).not.toBeNull();
      expect(document.getElementById("session-duration-select")).not.toBeNull();
    });

    it("renders launch-at-login toggle checked when setting is true", async () => {
      mockApi.settings.get.mockResolvedValue({
        ...defaultSettings,
        launchAtLogin: true,
      });

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });

    it("renders prevent-sleep toggle unchecked by default", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement;
      expect(toggle.checked).toBe(false);
    });

    it("renders duration dropdown with correct options", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      const options = Array.from(select.options);
      const values = options.map((o) => o.value);

      expect(values).toEqual(["", "15", "30", "60", "120", "240"]);
    });

    it("selects correct duration option based on settings", async () => {
      mockApi.settings.get.mockResolvedValue({
        ...defaultSettings,
        sessionDuration: 60,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
        remainingSeconds: 3600,
        durationMinutes: 60,
      });

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      expect(select.value).toBe("60");
    });
  });

  describe("showSaveIndicator", () => {
    it('shows "✓ Saved" indicator after successful save', async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      // Wait for debounce (300ms) + async save
      await vi.advanceTimersByTimeAsync(350);

      const indicator = document.getElementById("launch-save-indicator");
      expect(indicator?.textContent).toBe("✓ Saved");
      expect(indicator?.classList.contains("visible")).toBe(true);
    });

    it("save indicator disappears after 1.5 seconds", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      // Wait for debounce + save + indicator timeout
      await vi.advanceTimersByTimeAsync(350);
      expect(document.getElementById("launch-save-indicator")?.classList.contains("visible")).toBe(
        true,
      );

      await vi.advanceTimersByTimeAsync(1500);
      expect(document.getElementById("launch-save-indicator")?.classList.contains("visible")).toBe(
        false,
      );
    });
  });

  describe("saveSettings debounce", () => {
    it("rapid calls only persist after 300ms debounce", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;

      // Rapid toggling
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(100);

      toggle.checked = false;
      toggle.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(100);

      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      // Not yet saved
      expect(mockApi.settings.set).not.toHaveBeenCalled();

      // Wait for debounce
      await vi.advanceTimersByTimeAsync(350);

      // Only one save call (the last state)
      expect(mockApi.settings.set).toHaveBeenCalledTimes(1);
      expect(mockApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({ launchAtLogin: true }),
      );
    });
  });

  describe("error handling", () => {
    it("sets error via textContent (XSS prevention)", async () => {
      mockApi.settings.set.mockRejectedValue(new Error("Network error"));

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      // Wait for debounce + save failure
      await vi.advanceTimersByTimeAsync(350);

      const errorEl = document.getElementById("settings-error-text");
      expect(errorEl?.textContent).toBe("Network error");
      // Verify it was set via textContent not innerHTML (XSS prevention)
      expect(errorEl?.innerHTML).not.toContain("<script>");
    });

    it("renders generic message for non-Error throws", async () => {
      mockApi.settings.set.mockRejectedValue("unknown failure");

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);

      const errorEl = document.getElementById("settings-error-text");
      expect(errorEl?.textContent).toBe("Failed to save settings");
    });
  });

  describe("toggle and dropdown interactions", () => {
    it("calls settings.set with preventSleep: true when sleep toggle enabled", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);

      expect(mockApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({ preventSleep: true }),
      );
    });

    it("calls session.start when duration dropdown changes", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      select.value = "30";
      select.dispatchEvent(new Event("change"));

      expect(mockApi.session.start).toHaveBeenCalledWith(30);
    });

    it("sets preventSleep: true and sessionDuration when duration selected", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      select.value = "60";
      select.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);

      expect(mockApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionDuration: 60,
          preventSleep: true,
        }),
      );
    });

    it("sends null duration when Indefinitely selected", async () => {
      mockApi.settings.get.mockResolvedValue({
        ...defaultSettings,
        sessionDuration: 30,
        preventSleep: true,
      });

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      select.value = "";
      select.dispatchEvent(new Event("change"));

      expect(mockApi.session.start).toHaveBeenCalledWith(null);

      await vi.advanceTimersByTimeAsync(350);

      expect(mockApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionDuration: null,
          preventSleep: true,
        }),
      );
    });
  });
});
