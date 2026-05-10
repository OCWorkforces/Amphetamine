import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/amphetamine-predicates-test"),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("electron-log", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  isBoolean,
  isPositiveNumber,
  isClamped0to100,
  isNonEmptyString,
  isValidAccelerator,
  mergeValidatedPartial,
} from "../../src/shared/settings-validators.js";
import { DEFAULT_SETTINGS } from "../../src/shared/types.js";

describe("settings predicates", () => {
  describe("isBoolean", () => {
    it("accepts true and false", () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });
    it("rejects non-boolean values", () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean("true")).toBe(false);
      expect(isBoolean(null)).toBe(false);
      expect(isBoolean(undefined)).toBe(false);
      expect(isBoolean({})).toBe(false);
    });
  });

  describe("isPositiveNumber", () => {
    it("accepts positive finite numbers", () => {
      expect(isPositiveNumber(1)).toBe(true);
      expect(isPositiveNumber(0.5)).toBe(true);
    });
    it("rejects zero, negatives, NaN, Infinity, non-numbers", () => {
      expect(isPositiveNumber(0)).toBe(false);
      expect(isPositiveNumber(-1)).toBe(false);
      expect(isPositiveNumber(Number.NaN)).toBe(false);
      expect(isPositiveNumber(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isPositiveNumber("1")).toBe(false);
      expect(isPositiveNumber(null)).toBe(false);
    });
  });

  describe("isClamped0to100", () => {
    it("accepts numbers within [0, 100]", () => {
      expect(isClamped0to100(0)).toBe(true);
      expect(isClamped0to100(50)).toBe(true);
      expect(isClamped0to100(100)).toBe(true);
    });
    it("rejects out-of-range, NaN, non-numbers", () => {
      expect(isClamped0to100(-0.1)).toBe(false);
      expect(isClamped0to100(100.1)).toBe(false);
      expect(isClamped0to100(Number.NaN)).toBe(false);
      expect(isClamped0to100("50")).toBe(false);
      expect(isClamped0to100(null)).toBe(false);
    });
  });

  describe("isNonEmptyString", () => {
    it("accepts non-empty strings (including whitespace)", () => {
      expect(isNonEmptyString("a")).toBe(true);
      expect(isNonEmptyString(" ")).toBe(true);
    });
    it("rejects empty string and non-strings", () => {
      expect(isNonEmptyString("")).toBe(false);
      expect(isNonEmptyString(0)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
    });
  });

  describe("isValidAccelerator", () => {
    it("accepts valid accelerators with modifier + key", () => {
      expect(isValidAccelerator("Cmd+Shift+A")).toBe(true);
      expect(isValidAccelerator("Cmd+Ctrl+X")).toBe(true);
      expect(isValidAccelerator("Cmd+Option+K")).toBe(true);
      expect(isValidAccelerator("Command+Shift+A")).toBe(true);
      expect(isValidAccelerator("Alt+Shift+R")).toBe(true);
    });
    it("rejects modifier-only strings", () => {
      expect(isValidAccelerator("Cmd")).toBe(false);
      expect(isValidAccelerator("Shift")).toBe(false);
      expect(isValidAccelerator("Cmd+Shift")).toBe(false);
    });
    it("rejects reserved/system-conflicting shortcuts", () => {
      expect(isValidAccelerator("Cmd+Q")).toBe(false);
      expect(isValidAccelerator("Cmd+W")).toBe(false);
      expect(isValidAccelerator("Cmd+Tab")).toBe(false);
      expect(isValidAccelerator("Cmd+Space")).toBe(false);
      expect(isValidAccelerator("Command+Q")).toBe(false);
    });
    it("rejects empty/non-string/non-modifier inputs", () => {
      expect(isValidAccelerator("")).toBe(false);
      expect(isValidAccelerator("A")).toBe(false);
      expect(isValidAccelerator(123)).toBe(false);
      expect(isValidAccelerator(null)).toBe(false);
      expect(isValidAccelerator(undefined)).toBe(false);
    });
  });

  describe("mergeValidatedPartial", () => {
    it("preserves sessionDuration: null (indefinite session marker)", () => {
      const base = { ...DEFAULT_SETTINGS, sessionDuration: 60 };
      const result = mergeValidatedPartial(base, { sessionDuration: null });
      expect(result.merged.sessionDuration).toBeNull();
      expect(result.rejectedKeys).toEqual([]);
    });

    it("ignores unknown keys in patch", () => {
      const base = { ...DEFAULT_SETTINGS };
      const result = mergeValidatedPartial(base, {
        preventSleep: true,
        // @ts-expect-error -- intentionally testing unknown key fallthrough
        bogusField: "evil",
      });
      expect(result.merged.preventSleep).toBe(true);
      expect(result.merged).not.toHaveProperty("bogusField");
      expect(result.rejectedKeys).toContain("bogusField");
    });

    it("falls back to base when value fails validation", () => {
      const base = { ...DEFAULT_SETTINGS, batteryThreshold: 30 };
      const result = mergeValidatedPartial(base, { batteryThreshold: 150 });
      expect(result.merged.batteryThreshold).toBe(30);
      expect(result.rejectedKeys).toEqual(["batteryThreshold"]);
    });
  });
});
