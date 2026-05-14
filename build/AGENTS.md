# Build Resources — Packaging & Signing

macOS packaging resources for electron-builder. This directory controls app icons, entitlements, notarization hook, after-pack optimizations, and Electron fuse hardening.

## Files

| File | Role |
|------|------|
| `icon.icns` | macOS app icon consumed by electron-builder |
| `entitlements.mac.plist` | App entitlements: JIT + unsigned executable memory |
| `entitlements.mac.inherit.plist` | Child-process entitlements, mirrors app entitlements |
| `after-pack.cjs` | ARM64-only strip/locales optimization hook |
| `flip-fuses.cjs` | Post-package Electron fuse hardening |
| `notarize.cjs` | Optional Apple notarization hook; skipped unless Apple env vars exist |

## Packaging Flow

Root package scripts:

1. `bun run build`
2. `electron-builder --mac --<arch>`
3. `node build/flip-fuses.cjs <arch>` for distributable packages

`build-macOS-dmg.sh` is the local macOS wrapper: install deps, clean `dist/`, build, package DMG, sign Developer ID if available, otherwise deep ad-hoc re-sign without hardened runtime, then rename with environment suffix.

## electron-builder Constraints

- `hardenedRuntime: false` is intentional. Re-enable only with notarization + JIT entitlements.
- `notarize: false` by default. `build/notarize.cjs` requires `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`.
- `LSUIElement: true` keeps the app tray-only with no Dock icon.
- `dmg.sign: false`; the app bundle is signed, DMG signing is avoided unless the local script ad-hoc signs for quarantine compatibility.
- `electronLanguages: [en]` and `afterPack` locale stripping keep bundles small.

## Flip Fuses

`flip-fuses.cjs` applies after packaging:

- Disable RunAsNode, `--inspect`, and `NODE_OPTIONS`.
- Require app load from ASAR.
- Enable ASAR integrity validation.
- Enable cookie encryption and fuse layers.

## Anti-Patterns

- Never distribute an app bundle before `flip-fuses.cjs` has run.
- Never enable hardened runtime alone; pair it with notarization + correct JIT entitlements.
- Never remove JIT/unsigned executable memory entitlements without verifying Electron/V8 launch on macOS.
- Never assume `context.arch` is a string in `after-pack.cjs`; electron-builder may pass enum value `3` for ARM64.
- Never sign the DMG by default in `electron-builder.yml`; keep signing behavior in `build-macOS-dmg.sh`.

## Commands

```bash
bun run package          # arm64 DMG/ZIP + flip-fuses
bun run package:x64      # x64 DMG/ZIP + flip-fuses
bun run package:dir      # app bundle only; flip-fuses not automatic
./build-macOS-dmg.sh --environment stable --arch arm64
```
