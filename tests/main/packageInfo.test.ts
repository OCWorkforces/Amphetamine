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

  describe("fallback on error", () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      vi.resetModules();

      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });

      const mod = await import("../../src/main/utils/packageInfo.js");
      getPackageInfo = mod.getPackageInfo;
    });

    it("returns fallback when readFileSync throws", () => {
      const info = getPackageInfo();

      expect(info.name).toBe("amphetamine");
      expect(info.version).toBe("1.0.0");
    });

    it("logs error when readFileSync throws", () => {
      getPackageInfo();

      expect(mockLogError).toHaveBeenCalledWith(
        "[PackageInfo] Failed to load package.json:",
        expect.any(Error),
      );
    });

    it("fallback has all required PackageInfo fields", () => {
      const info = getPackageInfo();

      expect(info).toHaveProperty("name");
      expect(info).toHaveProperty("productName");
      expect(info).toHaveProperty("version");
      expect(info).toHaveProperty("description");
      expect(info).toHaveProperty("repository");
      expect(info).toHaveProperty("homepage");
      expect(info).toHaveProperty("author");
    });

    it("fallback is also frozen", () => {
      const info = getPackageInfo();

      expect(Object.isFrozen(info)).toBe(true);
    });

    it("fallback is cached on subsequent calls", () => {
      const first = getPackageInfo();
      const second = getPackageInfo();

      expect(first).toBe(second);
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });
  });
});
