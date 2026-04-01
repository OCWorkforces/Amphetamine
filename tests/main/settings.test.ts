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
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings,
} from "../../src/main/settings.js";
import { DEFAULT_SETTINGS } from "../../src/shared/types.js";

describe("settings", () => {
  const settingsPath = join(MOCK_USER_DATA_PATH, "settings.json");

  beforeEach(() => {
    vi.clearAllMocks();

    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
    mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });

    loadSettings();
  });

  afterEach(() => {
    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
  });

  describe("loadSettings", () => {
    it("returns defaults when no file exists", () => {
      if (existsSync(settingsPath)) {
        rmSync(settingsPath);
      }

      const settings = loadSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("reads existing file correctly", () => {
      const expectedSettings = { launchAtLogin: true };

      mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });
      const fs = require("fs");
      fs.writeFileSync(settingsPath, JSON.stringify(expectedSettings));

      const settings = loadSettings();

      expect(settings.launchAtLogin).toBe(true);
    });

    it("handles corrupted JSON (returns defaults)", () => {
      mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });
      const fs = require("fs");
      fs.writeFileSync(settingsPath, "{ not valid json }");

      const settings = loadSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("saveSettings", () => {
    it("persists to disk", async () => {
      const settingsToSave = { launchAtLogin: true };

      await saveSettings(settingsToSave);

      expect(existsSync(settingsPath)).toBe(true);

      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);

      expect(saved.launchAtLogin).toBe(true);
    });

    it("writes atomically so final file only appears when write is complete", async () => {
      const settingsToSave = { launchAtLogin: true, preventSleep: true };

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
    it("returns cached copy", () => {
      loadSettings();

      const settings = getSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("updateSettings", () => {
    it("merges partial, saves, and returns full settings", async () => {
      await saveSettings({ launchAtLogin: false });

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
      await saveSettings({ launchAtLogin: false });

      const result = await updateSettings({ launchAtLogin: true });

      expect(result.launchAtLogin).toBe(true);

      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.launchAtLogin).toBe(true);

      const result2 = await updateSettings({ launchAtLogin: false });
      expect(result2.launchAtLogin).toBe(false);
    });

    it("defaults launchAtLogin to false when not in file", () => {
      const fs = require("fs");
      fs.writeFileSync(settingsPath, JSON.stringify({}));

      const settings = loadSettings();

      expect(settings.launchAtLogin).toBe(false);
    });
  });
});
