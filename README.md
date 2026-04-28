# Amphetamine

A macOS menu bar app that keeps your Mac awake. Runs in the system tray and prevents your Mac from going to sleep.

## Features

- **Sleep Prevention** — Keep your Mac awake using `powerSaveBlocker` (prevent-display-sleep)
- **Session Timer** — Start timed or indefinite sessions with configurable duration
- **Battery-Aware Auto-Disable** — Automatically stop sleep prevention when battery drops below a configurable threshold
- **Global Shortcut** — Toggle sleep prevention with a keyboard shortcut (default: Cmd+Shift+A)
- **Auto-Updater** — Periodically checks for updates with exponential backoff on failure
- **Tray-native** — Lives in the menu bar, no Dock icon
- **Launch at Login** — Optionally start Amphetamine automatically when you log in to macOS
- **Settings UI** — Configure launch-at-login, sleep prevention, session duration, battery threshold, and keyboard shortcut

## Screenshots

![Settings](assets/setting-page.png)

_Configure launch-at-login, sleep prevention, session duration, battery threshold, and keyboard shortcut_

## Requirements

- macOS (Apple Silicon arm64 or Intel x64)
- Bun ≥1.3.13 or Node.js ≥22.0.0

## Development

```bash
bun install
bun run dev             # Start dev server + Electron
bun run build           # Build all processes (main + preload + renderer)
bun run test            # Run test suite (339 tests)
bun run test:watch      # Run tests in watch mode
bun run test:coverage   # Run tests with v8 coverage
bun run typecheck       # TypeScript check (tsc -b)
bun run typecheck:tests # TypeScript check for tests
bun run lint            # ESLint check (src/ tests/)
bun run format          # Prettier format
bun run clean           # Remove lib/ and dist/
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

- With `--environment stable`: `dist/Amphetamine-1.5.6-arm64-stable.dmg`
- Without flag: `dist/Amphetamine-1.5.6-arm64.dmg`

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

| Layer          | Tech                 |
| -------------- | -------------------- |
| Runtime        | Electron 41          |
| Language       | TypeScript 6.0       |
| Build          | Rslib + Rsbuild      |
| Package Mgr    | Bun                  |
| Test           | Vitest 4 (339 tests) |
| Lint           | ESLint 10 + Prettier |

## Contact

If you have any questions or encounter issues, feel free to reach out to [kennydizi@ocworkforces.com](mailto:kennydizi@ocworkforces.com)

## License

Unlicense
