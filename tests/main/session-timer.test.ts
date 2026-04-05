import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mock functions - evaluated before vi.mock calls
const mockGetSettings = vi.hoisted(() => vi.fn());
const mockOnSessionStateChange = vi.hoisted(() => vi.fn());
const mockBroadcastToWindows = vi.hoisted(() => vi.fn());

// Mutable settings state - updated by mockOnSessionStateChange
let settingsState = {
  launchAtLogin: false,
  preventSleep: false,
  sessionDuration: null as number | null,
};

// Set up getSettings to return the current state
mockGetSettings.mockImplementation(() => ({ ...settingsState }));
mockOnSessionStateChange.mockImplementation((partial: Partial<typeof settingsState>) => {
  settingsState = { ...settingsState, ...partial };
});

vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
  onSettingsChanged: vi.fn(),
}));

vi.mock("../../src/main/utils/broadcast.js", () => ({
  broadcastToWindows: mockBroadcastToWindows,
}));

describe("session-timer", () => {
  let startSession: (_durationMinutes: number | null) => {
    isRunning: boolean;
    startedAt: number | null;
    expiresAt: number | null;
    durationMinutes: number | null;
  };
  let cancelSession: () => {
    isRunning: boolean;
    startedAt: number | null;
    expiresAt: number | null;
    durationMinutes: number | null;
  };
  let getStatus: () => {
    isRunning: boolean;
    startedAt: number | null;
    expiresAt: number | null;
    durationMinutes: number | null;
  };
  let cleanup: () => void;
  let setOnSessionStateChange: (cb: (updates: Partial<typeof settingsState>) => void) => void;
  let setSettingsReader: (getSettings: () => typeof settingsState) => void;

  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();

    // Reset settings state
    settingsState = {
      launchAtLogin: false,
      preventSleep: false,
      sessionDuration: null,
    };

    vi.resetModules();

    const mod = await import("../../src/main/session-timer.js");
    startSession = mod.startSession;
    cancelSession = mod.cancelSession;
    getStatus = mod.getStatus;
    cleanup = mod.cleanup;
    setOnSessionStateChange = mod.setOnSessionStateChange;
    setSettingsReader = mod.setSettingsReader;

    // Wire the callbacks (simulates what coordinator does)
    setOnSessionStateChange(mockOnSessionStateChange);
    setSettingsReader(mockGetSettings);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("startSession", () => {
    it("indefinite - starts session with null duration", () => {
      const state = startSession(null);

      expect(state.isRunning).toBe(true);
      expect(state.startedAt).not.toBeNull();
      expect(state.expiresAt).toBeNull();
      expect(state.durationMinutes).toBeNull();
      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
        preventSleep: true,
      });
    });

    it("timed 30min - starts session with correct expiry", () => {
      const before = performance.now();
      const state = startSession(30);
      const after = performance.now();

      expect(state.isRunning).toBe(true);
      expect(state.startedAt).not.toBeNull();
      expect(state.expiresAt).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
      expect(state.expiresAt).toBeLessThanOrEqual(after + 30 * 60 * 1000);
      expect(state.durationMinutes).toBe(30);
      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: 30,
        preventSleep: true,
      });
    });

    it("clears previous timer when starting a new session", () => {
      // Start first session (30min) and verify it has a timer
      const firstStatus = startSession(30);
      expect(firstStatus.isRunning).toBe(true);

      // Start second session (15min) - should clear first timer
      const secondStatus = startSession(15);

      expect(secondStatus.isRunning).toBe(true);
      expect(secondStatus.durationMinutes).toBe(15);
    });
  });

  describe("cancelSession", () => {
    it("running - cancels active session", () => {
      startSession(30);
      const state = cancelSession();

      expect(state.isRunning).toBe(false);
      expect(state.startedAt).toBeNull();
      expect(state.expiresAt).toBeNull();
      expect(state.durationMinutes).toBeNull();
      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
        preventSleep: false,
      });
    });

    it("no running session - cancel is safe, still syncs sleep", () => {
      const state = cancelSession();

      expect(state.isRunning).toBe(false);
      expect(state.startedAt).toBeNull();
      expect(state.expiresAt).toBeNull();
      expect(state.durationMinutes).toBeNull();
      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
        preventSleep: false,
      });
    });
  });

  describe("getStatus", () => {
    it("no session - returns not running with nulls", () => {
      const state = getStatus();

      expect(state.isRunning).toBe(false);
      expect(state.startedAt).toBeNull();
      expect(state.expiresAt).toBeNull();
      expect(state.durationMinutes).toBeNull();
    });

    it("running session - returns correct state", () => {
      startSession(30);
      const state = getStatus();

      expect(state.isRunning).toBe(true);
      expect(state.startedAt).not.toBeNull();
      expect(state.expiresAt).not.toBeNull();
      expect(state.durationMinutes).toBe(30);
    });

    it("inconsistent state - clears sessionDuration from settings", () => {
      // Simulate: settings say sessionDuration=30 but no timer is running
      mockGetSettings.mockReturnValue({
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: 30,
      });

      const state = getStatus();

      expect(state.isRunning).toBe(false);
      expect(state.startedAt).toBeNull();
      expect(state.expiresAt).toBeNull();
      expect(state.durationMinutes).toBeNull();
      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
      });
    });
  });

  describe("cleanup", () => {
    it("running session - clears timer without syncing sleep", () => {
      startSession(30);

      cleanup();

      expect(getStatus().isRunning).toBe(false);
    });
  });

  describe("timer expiry", () => {
    it("expires - syncs sleep off and clears settings", async () => {
      vi.useFakeTimers();

      vi.resetModules();

      // Reset state after resetModules
      settingsState = {
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      };

const mod = await import("../../src/main/session-timer.js");
      mod.setOnSessionStateChange(mockOnSessionStateChange);
      mod.setSettingsReader(mockGetSettings);
      mod.startSession(1); // 1 minute = 60000ms

      mockOnSessionStateChange.mockClear();

      // Advance timers by 1 minute to trigger expiry
      vi.advanceTimersByTime(1 * 60 * 1000);

      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
        preventSleep: false,
      });
      expect(mod.getStatus().isRunning).toBe(false);

      vi.useRealTimers();
    });
  });
});
