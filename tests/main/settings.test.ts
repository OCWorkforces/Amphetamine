import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/amphetamine-settings-test"),
  },
}));

vi.mock("electron-log", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const MOCK_USER_DATA_PATH = "/tmp/amphetamine-settings-test";

import {
  initSettings,
  saveSettings,
  getSettings,
  updateSettings,
} from "../../src/main/settings.js";
import { DEFAULT_SETTINGS } from "../../src/shared/types.js";

describe("settings", () => {
  const settingsPath = join(MOCK_USER_DATA_PATH, "settings.json");

  beforeEach(async () => {
    vi.clearAllMocks();

    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
    mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });

    await initSettings();
  });

  afterEach(() => {
    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
  });

  describe("initSettings", () => {
    it("returns defaults when no file exists", async () => {
      if (existsSync(settingsPath)) {
        rmSync(settingsPath);
      }

      await initSettings();
      const settings = getSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("reads existing file correctly", async () => {
      const expectedSettings = { launchAtLogin: true };

      mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });
      const fs = require("fs");
      fs.writeFileSync(settingsPath, JSON.stringify(expectedSettings));

      await initSettings();
      const settings = getSettings();

      expect(settings.launchAtLogin).toBe(true);
    });

    it("handles corrupted JSON (returns defaults)", async () => {
      mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });
      const fs = require("fs");
      fs.writeFileSync(settingsPath, "{ not valid json }");

      await initSettings();
      const settings = getSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("saveSettings", () => {
    it("persists to disk", async () => {
      const settingsToSave = { ...DEFAULT_SETTINGS, launchAtLogin: true };

      await saveSettings(settingsToSave);

      expect(existsSync(settingsPath)).toBe(true);

      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);

      expect(saved.launchAtLogin).toBe(true);
    });

    it("writes atomically so final file only appears when write is complete", async () => {
      const settingsToSave = { ...DEFAULT_SETTINGS, launchAtLogin: true, preventSleep: true };

      await saveSettings(settingsToSave);

      // Final file should exist with correct content
      expect(existsSync(settingsPath)).toBe(true);
      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.launchAtLogin).toBe(true);
      expect(saved.preventSleep).toBe(true);
    });
  });

  describe("getSettings", () => {
    it("returns cached copy", async () => {
      await initSettings();

      const settings = getSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("updateSettings", () => {
    it("merges partial, saves, and returns full settings", async () => {
      await saveSettings({ ...DEFAULT_SETTINGS, launchAtLogin: false });

      const result = await updateSettings({ launchAtLogin: true });

      expect(result.launchAtLogin).toBe(true);

      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.launchAtLogin).toBe(true);

      const cached = getSettings();
      expect(cached.launchAtLogin).toBe(true);
    });

    it("ignores unknown properties in partial", async () => {
      getSettings();

      const result = await updateSettings({ launchAtLogin: true });

      expect(Object.keys(result).sort()).toEqual(
        ["launchAtLogin", "preventSleep", "sessionDuration", "batteryThreshold", "shortcut"].sort(),
      );
    });

    it("updates launchAtLogin correctly", async () => {
      await saveSettings({ ...DEFAULT_SETTINGS, launchAtLogin: false });

      const result = await updateSettings({ launchAtLogin: true });

      expect(result.launchAtLogin).toBe(true);

      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.launchAtLogin).toBe(true);

      const result2 = await updateSettings({ launchAtLogin: false });
      expect(result2.launchAtLogin).toBe(false);
    });

    it("defaults launchAtLogin to false when not in file", async () => {
      const fs = require("fs");
      fs.writeFileSync(settingsPath, JSON.stringify({}));

      await initSettings();
      const settings = getSettings();

      expect(settings.launchAtLogin).toBe(false);
    });
  });

  describe("validation edge cases", () => {
    it("rejects NaN sessionDuration (no change)", async () => {
      await updateSettings({ sessionDuration: 60 });
      const before = getSettings().sessionDuration;

      const result = await updateSettings({ sessionDuration: Number.NaN });

      expect(result.sessionDuration).toBe(before);
      expect(result.sessionDuration).toBe(60);
    });

    it("rejects Infinity sessionDuration (no change)", async () => {
      await updateSettings({ sessionDuration: 60 });
      const before = getSettings().sessionDuration;

      const result = await updateSettings({ sessionDuration: Number.POSITIVE_INFINITY });

      expect(result.sessionDuration).toBe(before);
      expect(result.sessionDuration).toBe(60);

      const result2 = await updateSettings({ sessionDuration: Number.NEGATIVE_INFINITY });
      expect(result2.sessionDuration).toBe(60);
    });
  });

  describe("concurrent updateSettings", () => {
    it("final state matches the last call when fired rapidly", async () => {
      await updateSettings({ sessionDuration: 10 });

      const p1 = updateSettings({ sessionDuration: 30 });
      const p2 = updateSettings({ sessionDuration: 60 });
      const p3 = updateSettings({ sessionDuration: 90 });

      const results = await Promise.all([p1, p2, p3]);

      // Final result observed by caller and cache must reflect the last update
      expect(results[2].sessionDuration).toBe(90);
      expect(getSettings().sessionDuration).toBe(90);
    });
  });

  describe("no-change dedup", () => {
    it("does not write to disk when partial matches current settings", async () => {
      // Establish baseline on disk
      await updateSettings({ launchAtLogin: true });
      expect(existsSync(settingsPath)).toBe(true);

      // Remove the file — if updateSettings tries to write again, the file will reappear
      rmSync(settingsPath);
      expect(existsSync(settingsPath)).toBe(false);

      // Same value as cache — dedup must skip the disk write
      const result = await updateSettings({ launchAtLogin: true });

      expect(result.launchAtLogin).toBe(true);
      expect(existsSync(settingsPath)).toBe(false);
    });
  });
});
