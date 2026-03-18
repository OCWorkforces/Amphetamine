# Amphetamine

A macOS menu bar app that keeps your Mac awake. Runs in the system tray and prevents your Mac from going to sleep.

## Features

- **Sleep Prevention** — Keep your Mac awake while Amphetamine is running
- **Tray-native** — Lives in the menu bar, no Dock icon
- **Launch at Login** — Optionally start Amphetamine automatically when you log in to macOS
- **Settings UI** — Configure sleep prevention and login preferences via a native macOS settings window

## Screenshots

![Settings](assets/setting-page.png)

_Configure sleep prevention and login preferences_

## Requirements

- macOS (Apple Silicon)
- Bun 1.3.10+ or Node.js 24.14.0+

## Development

```bash
bun install
bun run dev          # Start dev server + Electron
bun run build        # Build all processes (main + preload + renderer)
bun run test         # Run test suite
bun run test:watch   # Run tests in watch mode
bun run typecheck    # TypeScript check
bun run clean        # Remove lib/ and dist/
```

## Build & Installation

### Build DMG

```bash
# Build DMG with environment suffix
./build-macOS-dmg.sh --environment stable

# Build DMG without suffix (default)
./build-macOS-dmg.sh

# Show help
./build-macOS-dmg.sh --help
```

The script will:

1. Install dependencies
2. Clean the `dist/` directory
3. Build all TypeScript sources (main, preload, renderer)
4. Package the app into a DMG for macOS arm64
5. Sign the app (Developer ID if available, otherwise ad-hoc with re-signing)
6. Append environment suffix to filename (if `--environment` provided)

Output examples:

- With `--environment stable`: `dist/Amphetamine-1.0.1-arm64-stable.dmg`
- Without flag: `dist/Amphetamine-1.0.1-arm64.dmg`

### Install to Applications

1. Open the DMG file from `dist/`
2. Drag **Amphetamine.app** to the **Applications** folder
3. Eject the DMG

### Troubleshooting Security Warnings

If macOS blocks the app with "cannot be opened because it is from an unidentified developer":

**Option 1: Remove quarantine (recommended for ad-hoc signed builds)**

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Amphetamine.app"
```

**Option 2: System Settings**

1. Open **System Settings** → **Privacy & Security**
2. Scroll down to find the security warning
3. Click **Open Anyway**
4. Confirm by clicking **Open** in the dialog

**Option 3: Right-click open**

1. Right-click (or Control-click) on **Amphetamine.app**
2. Select **Open** from the context menu
3. Click **Open** in the confirmation dialog

### App Won't Start / Crashes on Launch

If the app crashes or won't start:

1. **Check Console logs:**

   ```bash
   log stream --predicate 'process == "Amphetamine"' --level debug
   ```

2. **Verify architecture:** Ensure you're on Apple Silicon (arm64)

   ```bash
   uname -m  # should output "arm64"
   ```

3. **Re-sign the app bundle:**

   ```bash
   codesign --force --deep --sign - "/Applications/Amphetamine.app"
   ```

4. **Remove and reinstall:**

   ```bash
   rm -rf "/Applications/Amphetamine.app"
   # Reinstall from DMG
   ```

## Tech Stack

| Layer    | Tech            |
| -------- | --------------- |
| Runtime  | Electron 41     |
| Language | TypeScript 5.9  |
| Build    | Rslib + Rsbuild |
| Test     | Vitest 4        |

## Contact

If you have any questions or encounter issues, feel free to reach out to [kennydizi@ocworkforces.com](mailto:kennydizi@ocworkforces.com)

## License

Unlicense
