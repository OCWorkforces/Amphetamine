import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppSettings, SessionStatusResponse } from "../../src/shared/types.js";

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
    getStatus: vi.fn<() => Promise<SessionStatusResponse | null>>(),
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
  describe("onSettingsChanged push updates", () => {
    it("updates UI when settings are pushed from main process", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      // Verify initial state
      const launchToggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      expect(launchToggle.checked).toBe(false);

      // Get the onSettingsChanged callback and simulate push
      const callback = mockApi.onSettingsChanged.mock.calls[0]![0];
      callback({
        ...defaultSettings,
        launchAtLogin: true,
        preventSleep: true,
      });

      // Verify UI updated
      expect(launchToggle.checked).toBe(true);
      const sleepToggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement;
      expect(sleepToggle.checked).toBe(true);
    });

    it("updates duration dropdown when pushed", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      expect(select.value).toBe("");

      const callback = mockApi.onSettingsChanged.mock.calls[0]![0];
      callback({
        ...defaultSettings,
        sessionDuration: 120,
        preventSleep: true,
      });

      expect(select.value).toBe("120");
    });
  });

  describe("isSaving guard", () => {
    it("does not double-save when already saving", async () => {
      // Make save take a while
      let resolveSet: ((v: AppSettings) => void) | null = null;
      mockApi.settings.set.mockImplementation(
        () =>
          new Promise<AppSettings>((resolve) => {
            resolveSet = resolve;
          }),
      );

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      // First toggle change
      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      // Wait for debounce to trigger save
      await vi.advanceTimersByTimeAsync(350);

      // Second toggle change while first save is pending
      toggle.checked = false;
      toggle.dispatchEvent(new Event("change"));

      // Wait for second debounce
      await vi.advanceTimersByTimeAsync(350);

      // Only the first save should have been called (isSaving guard)
      expect(mockApi.settings.set).toHaveBeenCalledTimes(1);

      // Resolve the pending save
      resolveSet?.({ ...defaultSettings, launchAtLogin: true });
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  describe("session status on init", () => {
    it("sets sessionDuration from running session status", async () => {
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
});
