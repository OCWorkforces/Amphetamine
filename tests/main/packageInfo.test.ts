import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as fs from "fs";
import type { getPackageInfo as GetPackageInfoFn } from "../../src/main/utils/packageInfo.js";

const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockLogDebug = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  app: {
    getAppPath: vi.fn().mockReturnValue("/path/to/app.asar"),
    getPath: vi.fn().mockReturnValue("/tmp/test-user-data"),
  },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    readFileSync: mockReadFileSync,
  };
});

vi.mock("electron-log", () => ({
  default: {
    debug: mockLogDebug,
    error: mockLogError,
  },
}));

const MOCK_PKG = {
  name: "amphetamine",
  productName: "Amphetamine",
  version: "1.2.3",
  description: "Test description",
  repository: "https://github.com/test/repo",
  homepage: "https://example.com",
  author: "Test Author",
  license: "MIT",
};

describe("packageInfo", () => {
  let getPackageInfo: typeof GetPackageInfoFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockReadFileSync.mockReturnValue(JSON.stringify(MOCK_PKG));

    const mod = await import("../../src/main/utils/packageInfo.js");
    getPackageInfo = mod.getPackageInfo;
  });

  it("returns parsed package.json on success", () => {
    const info = getPackageInfo();

    expect(info.name).toBe("amphetamine");
    expect(info.productName).toBe("Amphetamine");
    expect(info.version).toBe("1.2.3");
    expect(info.description).toBe("Test description");
    expect(info.author).toBe("Test Author");
    expect(info.repository).toBe("https://github.com/test/repo");
    expect(info.homepage).toBe("https://example.com");
  });

  it("calls readFileSync with correct path and encoding", () => {
    getPackageInfo();

    expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining("package.json"), "utf-8");
  });

  it("returns a frozen object (Object.isFrozen)", () => {
    const info = getPackageInfo();

    expect(Object.isFrozen(info)).toBe(true);
  });

  it("returns cached value on subsequent calls (readFileSync called once)", () => {
    const first = getPackageInfo();
    const second = getPackageInfo();

    expect(first).toBe(second);
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it("logs debug message on successful load", () => {
    getPackageInfo();

    expect(mockLogDebug).toHaveBeenCalledWith("[PackageInfo] Loaded package.json");
  });

  describe("throws on invalid shape", () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      vi.resetModules();
    });

    async function loadModule(): Promise<typeof GetPackageInfoFn> {
      const mod = await import("../../src/main/utils/packageInfo.js");
      return mod.getPackageInfo;
    }

    it("throws when readFileSync throws (propagates fs error)", async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });
      const fn = await loadModule();
      expect(() => fn()).toThrow("ENOENT: no such file or directory");
    });

    it("throws when JSON is malformed (propagates parse error)", async () => {
      mockReadFileSync.mockReturnValue("{ not valid json");
      const fn = await loadModule();
      expect(() => fn()).toThrow();
    });

    it("throws 'Invalid package.json shape' when name is missing", async () => {
      const { name: _omit, ...rest } = MOCK_PKG;
      void _omit;
      mockReadFileSync.mockReturnValue(JSON.stringify(rest));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when name is a number", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ ...MOCK_PKG, name: 42 }));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when name is empty string", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ ...MOCK_PKG, name: "" }));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when version is missing", async () => {
      const { version: _omit, ...rest } = MOCK_PKG;
      void _omit;
      mockReadFileSync.mockReturnValue(JSON.stringify(rest));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when productName is missing", async () => {
      const { productName: _omit, ...rest } = MOCK_PKG;
      void _omit;
      mockReadFileSync.mockReturnValue(JSON.stringify(rest));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when description is missing", async () => {
      const { description: _omit, ...rest } = MOCK_PKG;
      void _omit;
      mockReadFileSync.mockReturnValue(JSON.stringify(rest));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when repository is missing", async () => {
      const { repository: _omit, ...rest } = MOCK_PKG;
      void _omit;
      mockReadFileSync.mockReturnValue(JSON.stringify(rest));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when homepage is missing", async () => {
      const { homepage: _omit, ...rest } = MOCK_PKG;
      void _omit;
      mockReadFileSync.mockReturnValue(JSON.stringify(rest));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when author is missing", async () => {
      const { author: _omit, ...rest } = MOCK_PKG;
      void _omit;
      mockReadFileSync.mockReturnValue(JSON.stringify(rest));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when license is present but not a string", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ ...MOCK_PKG, license: 123 }));
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when parsed value is null", async () => {
      mockReadFileSync.mockReturnValue("null");
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("throws when parsed value is an array", async () => {
      mockReadFileSync.mockReturnValue("[]");
      const fn = await loadModule();
      expect(() => fn()).toThrow("Invalid package.json shape");
    });

    it("accepts valid input with optional license field", async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify(MOCK_PKG));
      const fn = await loadModule();
      const info = fn();
      expect(info.license).toBe("MIT");
    });
  });
});
