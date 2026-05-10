import log from "electron-log";
import { getPackageInfo } from "./utils/packageInfo.js";

let cachedReleaseUrlBase: string | null = null;

/**
 * Lazily compute the GitHub release URL base from package.json's `repository` field.
 * Cached after first successful read. Returns `null` if the repository URL is missing
 * or malformed (caller should skip opening the URL in that case).
 * Must be called after `app.isReady()` (depends on `app.getAppPath()`).
 */
export function getReleaseUrlBase(): string | null {
  if (cachedReleaseUrlBase !== null) {
    return cachedReleaseUrlBase;
  }
  try {
    const pkg = getPackageInfo();
    const repoUrlStr = pkg.repository;
    // Validate it's an https github URL before trusting it
    const parsed = new URL(repoUrlStr);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
      log.warn("[auto-updater] package.json repository is not an https github.com URL:", repoUrlStr);
      return null;
    }
    const normalized = repoUrlStr.replace(/\.git$/, "").replace(/\/$/, "");
    cachedReleaseUrlBase = `${normalized}/releases/tag/v`;
    return cachedReleaseUrlBase;
  } catch (err) {
    log.warn("[auto-updater] Failed to derive release URL from package.json:", err);
    return null;
  }
}

/**
 * Sanitize an auto-updater error into a fixed category to avoid leaking
 * filesystem paths, proxy URLs, or tokens into the renderer/UI. The raw
 * `err.message` is still logged via electron-log for diagnostics.
 */
export function categorizeUpdaterError(err: Error): "network" | "signature" | "io" | "unknown" {
  const haystack = `${err.name} ${err.message}`.toLowerCase();
  if (
    haystack.includes("enotfound") ||
    haystack.includes("econnrefused") ||
    haystack.includes("etimedout") ||
    haystack.includes("net")
  ) {
    return "network";
  }
  if (
    haystack.includes("signature") ||
    haystack.includes("certificate") ||
    haystack.includes("code-signing")
  ) {
    return "signature";
  }
  if (
    haystack.includes("eacces") ||
    haystack.includes("enospc") ||
    haystack.includes("eio") ||
    haystack.includes("write") ||
    haystack.includes("read")
  ) {
    return "io";
  }
  return "unknown";
}
