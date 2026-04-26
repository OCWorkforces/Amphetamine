import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SessionState } from "../../src/main/session-timer.js";

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


describe("session-timer", () => {
  let startSession: (_durationMinutes: number | null) => SessionState;
  let cancelSession: () => SessionState;
  let getStatus: () => SessionState;
  let cleanup: () => void;
  let setOnSessionStateChange: (cb: (updates: Partial<typeof settingsState>) => void) => void;
  let setSettingsReader: (getSettings: () => typeof settingsState) => void;
  let setBroadcastFn: (fn: (channel: string, data: unknown) => void) => void;

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
    setBroadcastFn = mod.setBroadcastFn;

    // Wire the callbacks (simulates what coordinator does)
    setOnSessionStateChange(mockOnSessionStateChange);
    setSettingsReader(mockGetSettings);
    setBroadcastFn(mockBroadcastToWindows);
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

    it("reconcileSessionState clears in-memory state when settings say no session", async () => {
      // Start a session, then simulate settings drift (sessionDuration cleared externally)
      startSession(30);
      expect(getStatus().isRunning).toBe(true);

      // Settings now say no session is active — reconcileSessionState must clear
      // in-memory state to match (replaces the side effect formerly inside getStatus()).
      mockGetSettings.mockReturnValue({
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });

      const mod = await import("../../src/main/session-timer.js");
      mod.reconcileSessionState();

      const state = getStatus();
      expect(state.isRunning).toBe(false);
      expect(state.startedAt).toBeNull();
      expect(state.expiresAt).toBeNull();
      expect(state.durationMinutes).toBeNull();
      expect(state.remainingSeconds).toBeNull();
    });

    it("getStatus is pure — never calls onSessionStateChange (no side effects)", () => {
      // Settings say a session is active but module state is empty.
      // The legacy getStatus() side-effected here; the new pure version must not.
      mockGetSettings.mockReturnValue({
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: 30,
      });
      mockOnSessionStateChange.mockClear();

      const state = getStatus();

      expect(state.isRunning).toBe(false);
      expect(state.startedAt).toBeNull();
      expect(state.expiresAt).toBeNull();
      expect(state.durationMinutes).toBeNull();
      expect(mockOnSessionStateChange).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("running session - clears timer without syncing sleep", () => {
      startSession(30);

      cleanup();

      expect(getStatus().isRunning).toBe(false);
    });

    it("cleanup does NOT call onSessionStateChange (vs cancelSession which does)", () => {
      startSession(30);
      mockOnSessionStateChange.mockClear();

      cleanup();

      expect(mockOnSessionStateChange).not.toHaveBeenCalled();
    });

    it("cleanup is safe when no session is active", () => {
      expect(() => cleanup()).not.toThrow();
      expect(getStatus().isRunning).toBe(false);
    });
  });

  describe("timer expiry", () => {
    it("expires - syncs sleep off and clears settings", async () => {
      vi.useFakeTimers();

      vi.resetModules();

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

      vi.advanceTimersByTime(1 * 60 * 1000);

      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
        preventSleep: false,
      });
      expect(mod.getStatus().isRunning).toBe(false);

      vi.useRealTimers();
    });
  });

  describe("edge cases", () => {
    it("second start cancels first timer (concurrent start)", async () => {
      vi.useFakeTimers();

      vi.resetModules();
      settingsState = {
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      };

      const mod = await import("../../src/main/session-timer.js");
      mod.setOnSessionStateChange(mockOnSessionStateChange);
      mod.setSettingsReader(mockGetSettings);

      // Start first session of 2 minutes
      mod.startSession(2);
      // Start second session of 1 minute — should clear first
      mod.startSession(1);

      mockOnSessionStateChange.mockClear();

      // Advance 1 minute — second session expires
      vi.advanceTimersByTime(1 * 60 * 1000);

      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
        preventSleep: false,
      });
      expect(mod.getStatus().isRunning).toBe(false);

      // Advance to 2 minutes — first timer should NOT fire again
      mockOnSessionStateChange.mockClear();
      vi.advanceTimersByTime(1 * 60 * 1000);
      expect(mockOnSessionStateChange).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("zero duration starts and expires immediately", async () => {
      vi.useFakeTimers();

      vi.resetModules();
      settingsState = {
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      };

      const mod = await import("../../src/main/session-timer.js");
      mod.setOnSessionStateChange(mockOnSessionStateChange);
      mod.setSettingsReader(mockGetSettings);

      const state = mod.startSession(0);
      expect(state.isRunning).toBe(true);
      expect(state.durationMinutes).toBe(0);

      mockOnSessionStateChange.mockClear();

      // Zero duration means 0ms timeout — fires on next tick
      vi.advanceTimersByTime(0);

      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
        preventSleep: false,
      });

      vi.useRealTimers();
    });

    it("negative duration creates timer that fires immediately", async () => {
      vi.useFakeTimers();

      vi.resetModules();
      settingsState = {
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      };

      const mod = await import("../../src/main/session-timer.js");
      mod.setOnSessionStateChange(mockOnSessionStateChange);
      mod.setSettingsReader(mockGetSettings);

      const state = mod.startSession(-1);
      expect(state.isRunning).toBe(true);

      mockOnSessionStateChange.mockClear();

      // Negative timeout → fires immediately
      vi.advanceTimersByTime(0);

      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
        preventSleep: false,
      });

      vi.useRealTimers();
    });

    it("getStatus with no session returns all-null fields including remainingSeconds", () => {
      const state = getStatus();

      expect(state).toEqual({
        isRunning: false,
        startedAt: null,
        expiresAt: null,
        durationMinutes: null,
        remainingSeconds: null,
      });
    });

    it("cancelSession vs cleanup: cancelSession calls onSessionStateChange, cleanup does not", () => {
      startSession(30);
      mockOnSessionStateChange.mockClear();

      cancelSession();

      expect(mockOnSessionStateChange).toHaveBeenCalledWith({
        sessionDuration: null,
        preventSleep: false,
      });
    });
  });

  describe("broadcastSessionUpdate", () => {
    let broadcastSessionUpdate: () => void;

    beforeEach(async () => {
      vi.resetModules();
      vi.clearAllMocks();
      settingsState = {
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      };

      const mod = await import("../../src/main/session-timer.js");
      startSession = mod.startSession;
      cancelSession = mod.cancelSession;
      getStatus = mod.getStatus;
      cleanup = mod.cleanup;
      setOnSessionStateChange = mod.setOnSessionStateChange;
      setSettingsReader = mod.setSettingsReader;
      setBroadcastFn = mod.setBroadcastFn;
      broadcastSessionUpdate = mod.broadcastSessionUpdate;

      setOnSessionStateChange(mockOnSessionStateChange);
      setSettingsReader(mockGetSettings);
      setBroadcastFn(mockBroadcastToWindows);
    });

    it("broadcasts pure status snapshot when no session is active (never null)", () => {
      broadcastSessionUpdate();

      expect(mockBroadcastToWindows).toHaveBeenCalledWith(
        "session:status-update",
        {
          isRunning: false,
          startedAt: null,
          expiresAt: null,
          durationMinutes: null,
          remainingSeconds: null,
        },
      );
    });

    it("broadcasts session data with remainingSeconds when session is active", () => {
      startSession(30);
      mockBroadcastToWindows.mockClear();

      broadcastSessionUpdate();

      expect(mockBroadcastToWindows).toHaveBeenCalledWith(
        "session:status-update",
        expect.objectContaining({
          isRunning: true,
          startedAt: expect.any(Number),
          expiresAt: expect.any(Number),
          remainingSeconds: expect.any(Number),
          durationMinutes: 30,
        }),
      );
    });

    it("broadcasts isRunning=true with null expiresAt for indefinite session", () => {
      startSession(null);
      mockBroadcastToWindows.mockClear();

      broadcastSessionUpdate();

      // Indefinite sessions: sessionStartedAt is set so isRunning=true,
      // but expiresAt and remainingSeconds are null (no timer).
      expect(mockBroadcastToWindows).toHaveBeenCalledWith(
        "session:status-update",
        expect.objectContaining({
          isRunning: true,
          startedAt: expect.any(Number),
          expiresAt: null,
          remainingSeconds: null,
          durationMinutes: null,
        }),
      );
    });
  });

  describe("startSessionBroadcast / stopSessionBroadcast", () => {
    let startSessionBroadcast: () => void;
    let stopSessionBroadcast: () => void;

    beforeEach(async () => {
      vi.useFakeTimers();
      vi.resetModules();
      vi.clearAllMocks();
      settingsState = {
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      };

      const mod = await import("../../src/main/session-timer.js");
      startSession = mod.startSession;
      getStatus = mod.getStatus;
      setOnSessionStateChange = mod.setOnSessionStateChange;
      setSettingsReader = mod.setSettingsReader;
      setBroadcastFn = mod.setBroadcastFn;
      startSessionBroadcast = mod.startSessionBroadcast;
      stopSessionBroadcast = mod.stopSessionBroadcast;

      setOnSessionStateChange(mockOnSessionStateChange);
      setSettingsReader(mockGetSettings);
      setBroadcastFn(mockBroadcastToWindows);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("broadcasts session status every 1 second", () => {
      startSession(30);
      mockBroadcastToWindows.mockClear();

      // startSession already calls startSessionBroadcast for timed sessions
      vi.advanceTimersByTime(3000);

      // Should have 3 broadcasts (at 1s, 2s, 3s)
      expect(mockBroadcastToWindows.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("stopSessionBroadcast stops the periodic broadcasts", () => {
      startSessionBroadcast();
      mockBroadcastToWindows.mockClear();

      vi.advanceTimersByTime(2000);
      const callsBeforeStop = mockBroadcastToWindows.mock.calls.length;

      stopSessionBroadcast();
      mockBroadcastToWindows.mockClear();

      vi.advanceTimersByTime(3000);
      expect(mockBroadcastToWindows).not.toHaveBeenCalled();
    });

    it("stopSessionBroadcast is safe to call when not broadcasting", () => {
      expect(() => stopSessionBroadcast()).not.toThrow();
    });
  });
});

describe("session-timer additional edge cases", () => {
  let startSession: (_durationMinutes: number | null) => SessionState;
  let cancelSession: () => SessionState;
  let getStatus: () => SessionState;
  let setOnSessionStateChange: (cb: (updates: Partial<typeof settingsState>) => void) => void;
  let setSettingsReader: (getSettings: () => typeof settingsState) => void;
  let setBroadcastFn: (fn: (channel: string, data: unknown) => void) => void;

  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
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
    setOnSessionStateChange = mod.setOnSessionStateChange;
    setSettingsReader = mod.setSettingsReader;
    setBroadcastFn = mod.setBroadcastFn;

    setOnSessionStateChange(mockOnSessionStateChange);
    setSettingsReader(mockGetSettings);
    setBroadcastFn(mockBroadcastToWindows);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("performance.now() controlled clock", () => {
    it("getStatus().remainingSeconds is computed from mocked performance.now()", async () => {
      vi.resetModules();
      settingsState = {
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      };

      let nowValue = 0;
      const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => nowValue);

      const mod = await import("../../src/main/session-timer.js");
      mod.setOnSessionStateChange(mockOnSessionStateChange);
      mod.setSettingsReader(mockGetSettings);
      mod.setBroadcastFn(mockBroadcastToWindows);

      nowValue = 0;
      mod.startSession(2);

      // Advance the mocked clock by 60 seconds, then read status
      nowValue = 60000;
      const status = mod.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.remainingSeconds).toBe(60);

      nowSpy.mockRestore();
    });
  });

  describe("concurrent startSession calls", () => {
    it("second startSession replaces first - only one active session, no leaked timers", async () => {
      vi.useFakeTimers();
      vi.resetModules();
      settingsState = {
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      };

      const mod = await import("../../src/main/session-timer.js");
      mod.setOnSessionStateChange(mockOnSessionStateChange);
      mod.setSettingsReader(mockGetSettings);
      mod.setBroadcastFn(mockBroadcastToWindows);

      const first = mod.startSession(10);
      const second = mod.startSession(10);

      expect(first.isRunning).toBe(true);
      expect(second.isRunning).toBe(true);

      const status = mod.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.durationMinutes).toBe(10);

      mockOnSessionStateChange.mockClear();
      vi.advanceTimersByTime(10 * 60 * 1000);

      const expiryCalls = mockOnSessionStateChange.mock.calls.filter(
        (args) => args[0]?.sessionDuration === null && args[0]?.preventSleep === false,
      );
      expect(expiryCalls.length).toBe(1);

      mockOnSessionStateChange.mockClear();
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(mockOnSessionStateChange).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("cancelSession racing with expiry", () => {
    it("cancel just before expiry does not double-fire onSessionStateChange", async () => {
      vi.useFakeTimers();
      vi.resetModules();
      settingsState = {
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      };

      const mod = await import("../../src/main/session-timer.js");
      mod.setOnSessionStateChange(mockOnSessionStateChange);
      mod.setSettingsReader(mockGetSettings);
      mod.setBroadcastFn(mockBroadcastToWindows);

      mod.startSession(1);
      vi.advanceTimersByTime(60000 - 1);

      mockOnSessionStateChange.mockClear();

      mod.cancelSession();

      const cancelCallCount = mockOnSessionStateChange.mock.calls.length;
      expect(cancelCallCount).toBe(1);

      mockOnSessionStateChange.mockClear();
      vi.advanceTimersByTime(10);
      expect(mockOnSessionStateChange).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("getStatus consistent shape (P0-2)", () => {
    it("returns SessionStatusResponse with isRunning=false (never null) before any session", () => {
      const status = getStatus();

      expect(status).not.toBeNull();
      expect(status).toEqual({
        isRunning: false,
        startedAt: null,
        expiresAt: null,
        durationMinutes: null,
        remainingSeconds: null,
      });
    });
  });

  describe("reconcileSessionState resets all 3 state fields", () => {
    it("clears sessionDuration, sessionStartedAt, sessionExpiresAt when settings say no session", async () => {
      startSession(45);

      const before = getStatus();
      expect(before.isRunning).toBe(true);
      expect(before.startedAt).not.toBeNull();
      expect(before.expiresAt).not.toBeNull();
      expect(before.durationMinutes).toBe(45);

      mockGetSettings.mockReturnValue({
        launchAtLogin: false,
        preventSleep: false,
        sessionDuration: null,
      });

      const mod = await import("../../src/main/session-timer.js");
      mod.reconcileSessionState();

      const after = getStatus();
      expect(after.isRunning).toBe(false);
      expect(after.startedAt).toBeNull();
      expect(after.expiresAt).toBeNull();
      expect(after.durationMinutes).toBeNull();
      expect(after.remainingSeconds).toBeNull();

      // Reference cancelSession to satisfy noUnusedLocals
      void cancelSession;
    });
  });
});
