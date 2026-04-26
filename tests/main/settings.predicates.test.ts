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
  mergeValidatedPartial,
} from "../../src/main/settings.js";
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

  describe("mergeValidatedPartial", () => {
    it("preserves sessionDuration: null (indefinite session marker)", () => {
      const base = { ...DEFAULT_SETTINGS, sessionDuration: 60 };
      const result = mergeValidatedPartial(base, { sessionDuration: null });
      expect(result.sessionDuration).toBeNull();
    });

    it("ignores unknown keys in patch", () => {
      const base = { ...DEFAULT_SETTINGS };
      const result = mergeValidatedPartial(base, {
        preventSleep: true,
        // @ts-expect-error -- intentionally testing unknown key fallthrough
        bogusField: "evil",
      });
      expect(result.preventSleep).toBe(true);
      expect(result).not.toHaveProperty("bogusField");
    });

    it("falls back to base when value fails validation", () => {
      const base = { ...DEFAULT_SETTINGS, batteryThreshold: 30 };
      const result = mergeValidatedPartial(base, { batteryThreshold: 150 });
      expect(result.batteryThreshold).toBe(30);
    });
  });
});
