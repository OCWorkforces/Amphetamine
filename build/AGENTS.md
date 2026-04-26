# Build — Packaging & Signing Scripts

macOS build pipeline: post-pack optimizations, fuse flipping, entitlements, and (non-functional) notarization.

## FILES

| File                             | Role                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `after-pack.cjs`                 | ARM64-only binary stripping + locale removal                                 |
| `flip-fuses.cjs`                 | Electron fuse configuration post-build                                       |
| `notarize.cjs`                   | Apple notarization (**non-functional** — `@electron/notarize` not installed) |
| `entitlements.mac.plist`         | Main process entitlements (JIT + unsigned executable memory)                 |
| `entitlements.mac.inherit.plist` | Helper/renderer process entitlements (identical to main)                     |
| `icon.icns`                      | App icon for packaging                                                       |

## AFTER-PACK PIPELINE

`after-pack.cjs` runs after electron-builder packages the app, before DMG creation:

1. Remove `.DS_Store` and AppleDouble files
2. Strip Electron Framework binary (biggest size impact — symlink-aware, targets `Versions/Current/`)
3. Strip helper apps (Renderer, GPU, Plugin helpers)
4. Strip main executable
5. Remove non-English `.lproj` locale files from framework resources
6. Report final bundle size

**ARM64 only** (arch enum 3). Skipped for x64 builds. Uses `strip -x -S` for all binaries.

## FLIP-FUSES

`flip-fuses.cjs` runs post-build via CLI: `node build/flip-fuses.cjs [arm64|x64]`

| Fuse                                    | Value   | Purpose                         |
| --------------------------------------- | ------- | ------------------------------- |
| `RunAsNode`                             | `false` | Disables `ELECTRON_RUN_AS_NODE` |
| `EnableNodeCliInspectArguments`         | `false` | Disables `--inspect` flag       |
| `EnableNodeOptionsEnvironmentVariable`  | `false` | Disables `NODE_OPTIONS` env     |
| `OnlyLoadAppFromAsar`                   | `true`  | Forces ASAR-only loading        |
| `EnableEmbeddedAsarIntegrityValidation` | `true`  | ASAR integrity checks           |
| `EnableCookieEncryption`                | `true`  | Encrypts cookies                |
| `EnableFuses`                           | `true`  | Enables fuse system             |

**Note**: `EnableNodeOptionsEnvironmentVariable` appeared twice (now deduplicated — the duplicate line was removed).

## ENTITLEMENTS

Both plist files grant the same two entitlements:

- `com.apple.security.cs.allow-jit` — required for V8 JIT compilation
- `com.apple.security.cs.allow-unsigned-executable-memory` — required for Electron renderer

Hardened runtime is **disabled** in electron-builder config. Gatekeeper is disabled. Notarization is disabled.

## NOTARIZATION (NON-FUNCTIONAL)

`notarize.cjs` is wired via `afterSign` in electron-builder config but `@electron/notarize` is not in `package.json`. If Apple credentials are provided (`APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`), the script would notarize via `notarytool`. Currently always skips with a warning.

## PACKAGING FLOW

```
electron-builder (CLI-only, no config block)
  → afterPack: build/after-pack.cjs (strip binaries + locales)
  → afterSign: build/notarize.cjs (skipped)
  → DMG: build-macOS-dmg.sh (custom script, ad-hoc signing fallback)
  → flip-fuses: build/flip-fuses.cjs (post-build fuse flipping)
```

## ANTI-PATTERNS

- Never install `@electron/notarize` without updating `package.json` — the hook will fail silently
- Never modify entitlements without understanding hardened runtime implications for Electron
- `after-pack.cjs` only runs for ARM64 — x64 builds skip all optimizations
