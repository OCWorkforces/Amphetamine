### Proposal 3: Verify the Production Release Matrix

#### Coding Prompt

Add a production release-asset verifier that stops CD before GitHub publication when any of the four downloaded package artifacts, the flattened staging directory, or updater feeds are incomplete or inconsistent. Put the read-only verifier under `scripts/`, then run it after `Stage unique release assets` and before `Publish GitHub release` in `.github/workflows/cd.yml`.

Build expected basenames from `dist-mac-arm64`, `dist-mac-x64`, `dist-win-x64`, `dist-win-arm64`, and parsed feeds, not guessed macOS x64 names. Each Mac source artifact needs one DMG and one ZIP. Each Windows source artifact needs one non-portable EXE and one `-portable.exe`.

Reject conflicting duplicate basenames, missing staged packages or blockmaps, feed versions that differ from `package.json`, dangling URLs, mismatched sizes or SHA-512 values, and top-level paths outside `files[]`. Use `parseLatestYml()` where its fixed feed parser applies. Keep production tag-without-release recovery and existing `--clobber` publication behavior, do not change Beta, and add temporary-fixture tests for a complete matrix and every failure class. Diagnostics must be deterministic, failures must exit nonzero, and the verifier must never mutate downloaded or staged artifacts.

#### How I Would Use This Codebase

I would use this gate before publishing native installers for both supported architectures, so I know each release is complete before users or auto-updaters see it. A failed packaging job, stale feed, or flattened-name collision would fail CD at a reproducible local check instead of creating a partial GitHub release.

#### Why This Is Challenging

Four jobs produce architecture-specific packages, but publication flattens their outputs and updater feeds point to selected payloads by name, size, and hash. One file count or suffix is not enough. The verifier has to reconcile source provenance, staged bytes, merged metadata, blockmaps, and recovery semantics without packaging again or rewriting artifacts.

#### Evaluation Rubric

1. A read-only TypeScript verifier under `scripts/` derives its contract from the four downloaded source directories and `electron-builder.yml`, requiring DMG plus ZIP for both Mac architectures and non-portable plus `-portable.exe` installers for both Windows architectures. It derives actual basenames from source inventories and feeds instead of hardcoding a guessed macOS x64 name or accepting both feeds plus any one binary.
2. The verifier proves that every expected package and updater blockmap survives flattening into `artifacts/release-staging` with identical bytes, and it fails on different-content duplicate basenames rather than accepting `stage-release-assets.py` warnings. It parses `latest-mac.yml` and `latest.yml` through `parseLatestYml()` where applicable, requires version equality with `package.json`, exact feed-to-source payload sets, staged URLs, valid top-level paths, and matching size and base64 SHA-512 metadata.
3. `.github/workflows/cd.yml` runs the verifier after `Stage unique release assets` and before any `gh release` publication; a nonzero result blocks publication with deterministic diagnostics. The change leaves Beta untouched and preserves production's already-published-release skip, tag-without-release recovery, unique staging, and existing `--clobber` behavior, while the verifier performs no writes.
4. `tests/main/release-asset-contract.test.ts` builds temporary fixture trees for a complete matrix and focused failures covering every missing target class, source/stage mismatch, basename conflict, missing feed entry, dangling URL, version, size or hash mismatch, invalid top-level path, and missing blockmap. The change passes `bun run test -- tests/main/release-asset-contract.test.ts tests/main/merge-latest-yml.test.ts`, `bun run typecheck`, `bun run typecheck:tests`, `bun run typecheck:sticky`, `bun run typecheck:layers`, `bun run lint`, `bun run test`, and `bun run test:coverage` with the configured 90% line, function, and branch thresholds.
