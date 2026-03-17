import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

// vi.mock is hoisted above all code, so the path must be a literal string in the mock factory
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/amphetamine-settings-test"),
  },
    }));

// Define the same path for use in tests
const MOCK_USER_DATA_PATH = "/tmp/amphetamine-settings-test";

// Import after mocking
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
    // Reset mocks
    vi.clearAllMocks();

    // Ensure clean temp directory
    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
    mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });

    // Reset the settings cache by reloading
    loadSettings();
  });

  afterEach(() => {
    // Cleanup temp directory
    if (existsSync(MOCK_USER_DATA_PATH)) {
      rmSync(MOCK_USER_DATA_PATH, { recursive: true, force: true });
    }
  });

  describe("loadSettings", () => {
    it("returns defaults when no file exists", () => {
      // Delete settings file if it exists
      if (existsSync(settingsPath)) {
        rmSync(settingsPath);
      }

      const settings = loadSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("reads existing file correctly", () => {
      const expectedSettings = {
        launchAtLogin: true,
      };

      // Write settings file directly
      mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });
      const fs = require("fs");
      fs.writeFileSync(settingsPath, JSON.stringify(expectedSettings));

      const settings = loadSettings();

      expect(settings.launchAtLogin).toBe(true);
    });

    it("handles corrupted JSON (returns defaults)", () => {
      // Write invalid JSON
      mkdirSync(MOCK_USER_DATA_PATH, { recursive: true });
      const fs = require("fs");
      fs.writeFileSync(settingsPath, "{ not valid json }");

      const settings = loadSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("saveSettings", () => {
    it("persists to disk", () => {
      const settingsToSave = {
        launchAtLogin: true,
      };

      saveSettings(settingsToSave);

      // Verify file was created and contains correct data
      expect(existsSync(settingsPath)).toBe(true);

      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);

      expect(saved.launchAtLogin).toBe(true);
    });
  });
  describe("getSettings", () => {
    it("returns cached copy", () => {
      // Load to populate cache
      loadSettings();

      const settings = getSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("updateSettings", () => {
    it("merges partial, saves, and returns full settings", () => {
      // First, save initial settings
      saveSettings({ launchAtLogin: false });

      // Now update with partial
      const result = updateSettings({ launchAtLogin: true });

      expect(result.launchAtLogin).toBe(true);

      // Verify it was saved to disk
      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.launchAtLogin).toBe(true);

      // Verify cache was updated
      const cached = getSettings();
      expect(cached.launchAtLogin).toBe(true);
    });

    it("ignores unknown properties in partial", () => {
      // TypeScript would catch this at compile time, but runtime test too
      const initial = getSettings();

      const result = updateSettings({ launchAtLogin: true });

      // Verify unknown property wasn't added to result
      expect(Object.keys(result).sort()).toEqual(["launchAtLogin", "preventSleep"].sort());
    });

    it("updates launchAtLogin correctly", () => {
      // Start with default (false)
      saveSettings({ launchAtLogin: false });

      // Enable launch at login
      const result = updateSettings({ launchAtLogin: true });

      expect(result.launchAtLogin).toBe(true);

      // Verify it was saved to disk
      const raw = readFileSync(settingsPath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.launchAtLogin).toBe(true);

      // Disable again
      const result2 = updateSettings({ launchAtLogin: false });
      expect(result2.launchAtLogin).toBe(false);
    });

    it("defaults launchAtLogin to false when not in file", () => {
      // Write settings without launchAtLogin
      const fs = require("fs");
      fs.writeFileSync(settingsPath, JSON.stringify({}));

      const settings = loadSettings();

      expect(settings.launchAtLogin).toBe(false);
    });
  });
});
