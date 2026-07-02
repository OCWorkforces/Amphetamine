# GitHub Workflows - CI/CD

Workflow definitions for lint/test/build and release publishing. These files couple package versioning, CI artifacts, and runtime auto-updater release URLs.

## Files

| File | Role |
|------|------|
| `ci.yml` | Lint, typecheck, test, main-branch macOS package artifacts |
| `cd.yml` | Release successful CI artifacts from main via `workflow_run` |

## CI Rules

- CI runs on push and pull request for `main` and `develop`.
- Concurrency cancels in-progress runs per workflow/ref.
- Node is pinned to `26.3.0`; Bun is pinned to `1.3.14`.
- Install uses `bun install --frozen-lockfile`.
- Lint job includes a source guard: fail if `OCWorkforces` appears under `src/`.
- Build job runs only for push to `main` after lint and test pass.
- Build matrix packages arm64 on `macos-latest` and x64 on `macos-15-intel`.
- Build artifacts upload `dist/*.dmg` and `dist/*.zip` for 14 days.

## CD Rules

- CD triggers from successful CI `workflow_run` on `main`, not directly from tags.
- It checks out the CI head SHA and reads `package.json.version`.
- It creates and pushes `v<version>` only if missing.
- It downloads `dist-mac-arm64` and `dist-mac-x64` artifacts from that CI run.
- It verifies at least one DMG or ZIP before `softprops/action-gh-release` publishes with generated notes.
- Release concurrency is global `release` with `cancel-in-progress: false`.

## Gotchas

- Actions are pinned by commit SHA; update comments and SHAs together.
- Keep CI Node/Bun pins aligned with `package.json` engines and package manager.
- If CI packaging remains raw `electron-builder`, check it stays equivalent to local `package*` scripts for fuse/signing expectations.
- Runtime updater opens GitHub release URLs derived from package metadata; release tags must match `v<package.json.version>`.
- Do not put generated artifacts under workflow source directories; CI downloads into temporary `artifacts/` paths.
