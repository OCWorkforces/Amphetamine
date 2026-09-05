# Repository Context

## Scope and Method

This analysis treated the tracked repository as the primary source of truth. `git ls-files` returned 248 files. The inventory covered source, tests, scripts, root configuration, workflows, packaging resources, documentation, agent guidance, and checked-in generated assets. All 18 applicable `AGENTS.md` files were reviewed before their areas were analyzed.

Six read-only perspectives reviewed the same inventory: architecture and dependency boundaries; product and runtime behavior; quality, security, and performance; build and delivery; developer and real-project use; and documentation consistency. Claims were checked against executable source and contracts first, aligned tests second, configuration and workflows third, and maintained guidance fourth. Historical plans were used only for provenance. CodeGraph provided symbol and call-path checks, while Sentrux provided read-only structural metrics. Oracle reviewed the three challenge boundaries. A librarian checked current Electron, electron-builder, electron-updater, GitHub Actions, and GitHub Releases contracts against primary sources.

Labels in this file have fixed meanings. **Observed** identifies repository or cited primary-source evidence. **Inference** identifies a conclusion drawn from that evidence. **Unresolved** identifies a question that source inspection or the required external reviews did not settle. Tests, builds, packaging, and benchmarks were not executed during this analysis, so reported test totals and release outputs are inventory or configuration facts, not new runtime results.

Generated output, vendored dependencies, caches, binaries, and tool state were not reviewed line by line. `lib/`, `dist/`, `artifacts/`, `coverage/`, `node_modules/`, caches, `.codegraph/`, `.agents/`, and `.omo/` are generated, vendored, or local tool state. Checked-in PNG, ICO, and ICNS files were classified as generated inputs and reviewed through their generators and consumers. `bun.lock` was treated as resolver output. The pre-existing untracked `.agens/` directory was outside the tracked inventory and remained untouched.

## Repository Map

**Observed.** Amphetamine is a mature tray-only Electron application for macOS and Windows. The renderer uses vanilla TypeScript. The project follows Clean Architecture Lite: `src/domain/` contains pure rules, `src/application/` contains use cases and ports, and Electron or Node integration stays in `src/infrastructure/`, `src/main/`, `src/preload/`, and `src/renderer/`.

| Area | Tracked files | Role |
| --- | ---: | --- |
| `src/` | 132 | Runtime source and checked-in application assets |
| `tests/` | 63 | Vitest suites, setup, guidance, and one `.gitkeep` |
| `scripts/` | 10 | Build, release, benchmark, icon, and architecture checks |
| `build/` | 8 | Entitlements, fuses, icons, and packaging hooks |
| `.github/` | 4 | CI, CD, beta workflows, and workflow guidance |
| `docs/` | 6 | Historical implementation plans and reference material |
| `assets/` | 1 | Settings screenshot used by documentation |
| Repository root | 24 | Manifests, lockfile, tool configuration, README, license, and guidance |

The 132 source files are divided into `application` 27, assets 12, `domain` 10, `infrastructure` 18, `main` 31, `preload` 4, `renderer` 24, `shared` 5, and `src/assets.d.ts`. The 63 test-area files are divided into application 9, domain 4, infrastructure 4, main 35, renderer 7, shared 2, and root 2. There are 57 tracked `*.test.ts` files. The larger area total includes setup and guidance files.

Important entry points are `src/main/index.ts`, `src/main/app-shell.ts:createAppShell`, `src/main/composition-root.ts:createAppComposition`, the two preloads in `src/preload/`, and four renderer entries for the popover, Settings, About, and utility dialog. `scripts/build-production.ts` expects one main bundle, two preload bundles, and four renderer HTML outputs.

## Architecture and Key Flows

**Observed.** `src/main/index.ts` owns Electron lifecycle events, single-instance behavior, and the `before-quit` path. `createAppShell` is the process-graph root. Its ready order is tray-only platform setup, popover creation, composition initialization, IPC registration, tray setup, and updater initialization outside benchmark mode (`src/main/app-shell.ts:50`). Its quit order is a bounded settings-store flush, tray cleanup, composition cleanup, window destruction, and process exit (`src/main/app-shell.ts:75`; `src/main/index.ts`).

`createAppComposition` wires the 12 application ports, use cases, adapters, and cached process state (`src/main/composition-root.ts:65`; `src/application/ports/index.ts`). The layer guard in `scripts/check-layer-imports.mjs`, restricted ESLint imports, and CI keep Electron out of `domain` and `application`. Semantic `AppPushEvent` values cross `MainToRendererNotifierPort`; `src/infrastructure/notification/broadcast-notifier.ts` maps them to the five push channels. The public `IPC_CHANNELS` contract currently has 16 names, while utility-dialog transport remains private in `src/shared/utility-dialog.ts`.

Sleep prevention has one effective-state rule: stored user intent or an active session. The application recompute use case owns that rule, and `src/infrastructure/sleep/` is the only `powerSaveBlocker` owner. The session engine keeps live state outside settings, uses performance and wall-clock anchors for timed sessions, reconciles after resume, and reports status through typed pushes.

Settings load through `FileSettingsStore`, which validates and migrates raw data, writes a mode-0600 UUID temporary file, renames it atomically, and allows one active plus one merged pending write. The cache and subscribers update only after a successful rename. `SettingsReactionService` is the sole settings-change subscriber for field side effects. `flush()` can drain every update received by main, but it cannot see a renderer-only debounced partial (`src/infrastructure/settings/file-settings-store.ts:248`; `src/renderer/settings/index.ts:52,57,507`).

`WindowGraph` is the only BrowserWindow factory. Settings, About, and utility-dialog windows hide on user close and stay warm; quit paths force-destroy them. Visibility intent flags prevent a late `ready-to-show` event from reopening a dismissed window. Public IPC validates the sender, top frame, and exact development or file origin. All windows use sandboxing, context isolation, and no renderer Node integration. Navigation and popup handling are deny-by-default; About permits only the package repository URL through `shell.openExternal`.

The low-battery path separates detection from policy. `src/main/battery-monitor.ts:createBatteryMonitor` owns power-source listeners, the 60,000 ms unref polling interval, overlap prevention, activity gates, and benchmark counters. `src/application/battery/handle-low-battery-auto-stop.ts:createHandleLowBatteryAutoStop` owns the response: clear standing intent, cancel a session, and notify the user. The existing `BatterySensorPort` exposes percent reads and source events but has no implementation or consumer (`src/application/ports/battery-sensor.port.ts:2`).

## Product and Runtime Behavior

**Observed.** The tray and popover control persistent sleep-prevention intent and timed sessions. A session may be indefinite or duration-based. Canceling a session does not rewrite the stored default duration. The tray icon reflects effective activity, while the tray checkbox reflects user intent. A global shortcut toggles intent, and Settings manages login launch, session defaults, sleep-block mode, battery threshold, and shortcut registration.

Low-battery auto-stop is active only when the threshold, power source, and effective-activity gates allow it. Percent reads use `/usr/bin/pmset` on macOS and PowerShell `Win32_Battery` on Windows through `src/main/platform/battery-percent.ts:getBatteryPercent`; unsupported systems, desktops without a battery, parse failures, timeouts, and command failures return `null`. Platform adapters also isolate login-item options, utility foreground behavior, window chrome, taskbar behavior, and battery shell-outs.

Settings, About, and updater dialogs are warm-cached utility surfaces. The utility dialog is single-flight, binds private IPC to its tracked `webContents.id`, settles content height before fade-in, and owns a reference-counted macOS utility-foreground lease. The hybrid updater permits background checks without download and manual checks with in-app download/install or a GitHub Releases fallback. User-facing updater errors are categorized; raw errors remain in logs.

Benchmark mode runs only against production output, skips updater startup, and supports `idle` and `active-session` scenarios. It emits one `AMPHETAMINE_BENCHMARK_RESULT:` JSON record and tracks semantic renderer and battery counters instead of relying only on CPU samples.

## Quality, Security, and Performance

**Observed.** Vitest uses four projects: domain, application, main, and renderer. The repository configures V8 line, function, and branch thresholds of 90%. Several process entry and integration files are excluded from measured coverage even when they have behavior-oriented tests. The current inventory contains 57 test files, but the suite and coverage totals were not rerun.

Type and architecture constraints are strict. Production source uses TypeScript 7 native CLI checks alongside the TypeScript 6 API package used by ESLint, with strict optional properties, unchecked-index checks, exhaustive returns, and no unsafe suppression. Relevant gates are `bun run typecheck`, `bun run typecheck:tests`, `bun run typecheck:sticky`, `bun run typecheck:layers`, `bun run lint`, `bun run test`, `bun run test:coverage`, `bun run build`, and the combined `bun run check`.

Security boundaries are explicit. `validateSender()` rejects unapproved URLs and child frames; public preload APIs are typed and exhaustively wired. Utility-dialog messages use a separate preload and exact WebContents identity. Settings persistence narrows parsed JSON from `unknown`, validates fields, writes atomically, and preserves the last committed cache after failure. Updater feed URLs come from package metadata, simultaneous checks are single-flight, and window-open attempts are denied before any allowlisted external navigation is handled.

Performance-sensitive loops have bounded ownership. Battery reads cannot overlap and the polling timer is unref'd. Session timing avoids `Date.now()` for elapsed time. Renderer session actions preserve stable control identity within a running or idle mode. Window hides are coalesced, and warm caches avoid rebuilding utility renderers on every open.

The read-only Sentrux scan covered 234 files, 33,633 lines, and 325 import edges. It returned a quality signal of 7,185 on its reported integer scale; acyclicity and depth were 10,000, modularity was the weakest component at 4,380, equality was 5,494, and redundancy was 7,956. Its DSM contained 163 nodes and placed all 325 edges below the diagonal, which the tool interpreted as downward dependency flow. Its import-graph test heuristic linked 85 of 171 source files to tests and left 86 unlinked; that ratio is not V8 coverage. A 90-day git scan found 232 commits, 30 hotspots, 50 change-coupling pairs, and 189 files with one author. `check_rules` returned `pass` with `rules_checked: 0`, so it does not provide enforcement evidence.

**Inference.** The dependency graph is acyclic, but composition roots, renderer entries, and delivery scripts remain natural change-coupling points. The repository reduces that concentration through narrow factories, focused tests, and build-time contract checks. The Sentrux import heuristic identifies review targets, not untested behavior, because several named suites exercise code through mocks or higher-level entry points.

## Build, Test, Packaging, and Release

**Observed.** `package.json` is the current package authority: version 1.11.4, Electron `^43.4.1`, Node `>=26 <27`, Bun 1.3.14, `@typescript/native ^7.0.2`, TypeScript 6.0.3, Vitest 4.1.11, electron-builder 26.15.3, and runtime dependencies limited to `electron-log` and `electron-updater`.

`scripts/build-production.ts` launches main, preload, and renderer builds concurrently, then verifies seven expected outputs. CI runs lint, tests, and builds before packaging four named artifacts: `dist-mac-arm64`, `dist-mac-x64`, `dist-win-x64`, and `dist-win-arm64`. electron-builder configures DMG and ZIP for each macOS architecture and NSIS plus portable for each Windows architecture. `build/afterPack.cjs` applies Electron fuses before archives and fails closed; macOS is re-signed after mutation. Hardened runtime and notarization are disabled, and Windows packages are unsigned by default.

Production CD downloads all four named artifacts, merges architecture feeds into one `latest-mac.yml` and one `latest.yml`, stages flattened assets, and publishes or reuses a release tag. `scripts/merge-latest-yml.ts:parseLatestYml` parses the fixed builder feed shape and `mergeFeeds` requires a common version. The current coarse gate accepts both feeds plus any one DMG, ZIP, or EXE. `scripts/stage-release-assets.py` warns and skips missing architecture directories or conflicting basenames, then succeeds when both feeds and at least one package binary remain. This does not enforce the configured four-architecture product matrix before publication.

Current primary sources confirm that macOS and Windows updater clients request `latest-mac.yml` and `latest.yml`, respectively, and that GitHub requires release asset names to be unique within a release. A named `actions/download-artifact` operation fails when that artifact is absent. These facts come from [electron-builder auto-update documentation](https://www.electron.build/docs/features/auto-update), [electron-updater provider source](https://github.com/electron-userland/electron-builder/blob/7abb30e393326676237862163a115c96e2f0e80d/packages/electron-updater/src/providers/Provider.ts#L37-L57), [GitHub release-asset documentation](https://docs.github.com/en/rest/releases/assets#upload-a-release-asset), and [actions/download-artifact source](https://github.com/actions/download-artifact/blob/484a0b528fb4d7bd804637ccb632e47a0e638317/src/download-artifact.ts#L69-L87). Current electron-builder documentation also describes v27 behavior, so claims for the repository's v26.15.3 dependency were limited to contracts confirmed in matching source or repository output.

## Developer Experience and Real-Project Use

**Observed.** The repository provides clear extension seams without presenting itself as a library. Application ports isolate settings, scheduling, clocks, logging, notifications, updater behavior, auto-launch, and sleep control. Composition factories use explicit dependencies, while stable main facades preserve import paths. Typed IPC contracts, exhaustive preload wiring, platform entry barrels, and pure domain rules make behavior testable without launching Electron.

The build and test commands are centralized in `package.json`, and nested guidance records local ownership rules. Source strings and CSS are separated from renderer logic. Parser functions for battery output and updater feeds are exported for focused tests. The benchmark harness provides a repeatable production check for timer and battery callback behavior.

Documentation has drifted behind executable metadata. README references version 1.11.0 and Electron `^43.2.0`; root guidance references version 1.11.2 and Electron `^43.3.0`; `package.json` reports 1.11.4 and `^43.4.1`. README also contains two different test totals, while the tracked inventory establishes only the 57 test-file count. One project map omits the utility-dialog renderer. Historical plans under `docs/` describe work that source and tests show as completed or superseded.

**Inference.** A developer should use source, tests, and active configuration as the operational contract, then treat guidance as intent and historical plans as background. The application is a strong base for a cross-platform tray utility because lifecycle, platform, persistence, and update concerns already have owners. Reuse outside Electron would require new adapters, not extraction of the current process graph.

## Constraints, Risks, and Opportunities

### Observed constraints

- Product platforms are `darwin` and `win32`; Linux is out of scope.
- `domain` and `application` cannot import Electron, Node I/O, process roots, or `IPC_CHANNELS`.
- `WindowGraph` is the sole BrowserWindow factory, and `src/infrastructure/sleep/` is the sole `powerSaveBlocker` owner.
- `SettingsReactionService` is the only settings side-effect subscriber. Live session state must not be persisted in settings.
- Public IPC requires sender validation and exhaustive preload wiring. Utility-dialog channels stay private to their dedicated preload.
- Settings writes remain atomic and coalesced, and quit waits are bounded.
- Production release publication must retain tag-without-assets recovery and beta isolation.

### Reasoned opportunities

**Inference.** Three changes require repository-specific reasoning without product redesign: finish the already-declared battery hardware boundary, close the renderer-to-main settings handoff before destructive quit, and enforce the configured production release matrix before GitHub publication. Each crosses an existing ownership boundary, has focused tests, and can fail in ways that a local patch would miss.

### Unresolved questions

- `electron-builder.yml` configures `afterPack` globally, and [current electron-builder lifecycle documentation](https://www.electron.build/docs/features/build-lifecycle#-afterpack) describes the hook as operating on the staged unpacked application. The project uses v26.15.3 while the current documentation is v27-oriented, `build/AGENTS.md` contradicts the README about `package:dir`, and no package was inspected, so the exact directory-target behavior remains unresolved.
- `electron-builder.yml` selects `assets/setting-page.png` through `assets/**/*`, and no exclusion removes it. The screenshot is referenced only by README and has no runtime consumer; repository evidence does not establish whether shipping it is intentional, and produced package contents were not inspected.
- [Vitest 4.1.11 project documentation](https://vitest.dev/guide/projects) defines coverage as whole-process coverage, so the root 90% line, function, and branch thresholds are global rather than four independent per-project gates. Coverage was not executed, so the actual measured result remains unresolved; CI currently runs `bun run test`, not `bun run test:coverage`.
- Exact generated artifact basenames were not produced during analysis. The release proposal therefore derives expectations from the four downloaded source directories and merged feed entries instead of guessing names.
- Electron does not guarantee completion of arbitrary asynchronous renderer work during unload, and `BrowserWindow.destroy()` skips DOM unload events. The settings proposal can guarantee handoff only for a live, responsive renderer; the existing 2,000 ms quit deadline remains the failure boundary. See [BrowserWindow lifecycle documentation](https://www.electronjs.org/docs/latest/api/browser-window#event-close) and [`destroy()` documentation](https://github.com/electron/electron/blob/b8eb33a7ab306ad2883ca01970ed41069c5958ff/docs/api/browser-window.md#L470-L477).

### Rubric grounding trace

**Proposal 1, battery sensor boundary.** The requested flow is platform power state and percent -> `BatterySensorPort` -> `createBatteryMonitor` -> `createHandleLowBatteryAutoStop`. Ownership supports a thin adapter under `src/main/platform/`; detection stays in main, policy stays in application, and `pmset` or PowerShell stays in `battery-percent.ts`. Criterion 1 traces to `src/application/ports/battery-sensor.port.ts:2`, `src/main/battery-monitor.ts:94,164,203`, and `src/main/platform/battery-percent.ts:111`. Criterion 2 traces to the threshold/activity gates, 60,000 ms unref interval, overlap guard, resume path, reconfigure path, null behavior, and benchmark counters in `src/main/battery-monitor.ts:114-251` and `src/infrastructure/benchmark/benchmark.ts:188`. Criterion 3 traces to construction and cleanup in `src/main/composition-root.ts:162,217`; Electron's public EventEmitter contract supports exact callback removal and idempotent unsubscribe. Criterion 4 traces to `tests/main/battery-monitor.test.ts`, `tests/main/battery-percent.test.ts`, `tests/main/composition-wiring.test.ts`, `tests/shared/benchmark-types.test.ts`, and the repository's type, layer, lint, build, coverage, and benchmark commands. A new port, a DI framework, application-owned polling, or moved shell-outs would violate established ownership.

**Proposal 2, settings quit handoff.** The requested flow is renderer debounce state -> typed preload/IPC flush request and acknowledgement -> main `FileSettingsStore.flush()` -> tray/composition/window teardown. The current gap is visible at `src/renderer/settings/index.ts:52,57,507,616`, `src/main/app-shell.ts:21,75-105`, and `src/main/process/window-graph.ts:350-378,462`. Criterion 1 traces to existing 300 ms debounce, partial merging, in-flight serialization, and save-error behavior covered by `tests/renderer/settings.test.ts`. Criterion 2 traces to `src/shared/types.ts:13`, `src/preload/index.ts:22,43,166`, `src/main/ipc-utils.ts:validateSender`, the public IPC budget test, and exact Settings WebContents ownership in `WindowGraph`; utility-dialog transport is intentionally separate. Criterion 3 traces to the existing single 2,000 ms cleanup budget, `flushSettingsWriteChain()`, composition cleanup, and force-destroy order. Criterion 4 traces to renderer, preload, IPC, AppShell, WindowGraph, and settings-store tests plus type, layer, lint, build, and coverage gates. Unload-only async work, sleeps, `executeJavaScript`, DOM events, a second subscriber, or two sequential 2-second waits would not satisfy the lifecycle contract.

**Proposal 3, production release contract.** The requested flow is four downloaded matrix artifacts -> feed merge -> flattened staging -> read-only verification -> GitHub release publication. Ownership supports a TypeScript verifier in `scripts/` and fixture tests under `tests/main/`, with workflow placement after staging and before `gh release`. Criterion 1 traces to `.github/workflows/ci.yml:57`, `.github/workflows/cd.yml`, and the DMG/ZIP plus NSIS/portable targets in `electron-builder.yml:25`. Criterion 2 traces to collision and missing-directory behavior in `scripts/stage-release-assets.py:47,108-116` and GitHub's unique release-asset name contract. Criterion 3 traces to `scripts/merge-latest-yml.ts:60,131,171`, `tests/main/merge-latest-yml.test.ts`, package version, feed URLs, size and SHA-512 fields, top-level path, updater blockmaps, and the staged bytes. Criterion 4 traces to `.github/workflows/cd.yml:46,192,207,253`: nonzero verification must block publication without changing tag-without-release recovery, `--clobber`, or Beta. Extension-only counts, guessed macOS x64 names, collision warnings treated as success, or a mutating verifier would miss the contract.

## Coverage Ledger

Perspective keys: A = architecture; R = product/runtime; Q = quality/security/performance; D = build/delivery; E = developer/real-project use; C = documentation consistency. Oracle and librarian reviews are listed where they resolved proposal-level uncertainty.

| Inventoried area | Primary coverage | Secondary coverage | Disposition |
| --- | --- | --- | --- |
| Root manifests and runtime metadata, including `package.json` | D | E, C | Reviewed; executable metadata treated as current authority |
| Root TypeScript, ESLint, Vitest, Rslib, Rsbuild, and electron-builder configuration | D | A, Q | Reviewed for gates, outputs, boundaries, and package targets |
| Root README, license, security text, and root `AGENTS.md` | C | E, Q | Reviewed; version and test-count drift recorded |
| `bun.lock` | D | Q | Classified as resolver output; dependency declarations checked through manifests |
| `.github/workflows/` | D | Q, C | All workflow files and guidance reviewed; production and beta paths separated |
| `build/` | D | Q, A | Hooks, fuses, signing resources, entitlements, and guidance reviewed |
| `scripts/` | D | Q, A, E | All tooling and guidance reviewed; merge, staging, build, layer, icon, and benchmark seams traced |
| `docs/` | C | A, E | All files classified as historical or reference material, not current executable requirements |
| Root `assets/` | C | D | Screenshot classified as documentation media; packaging inclusion left unresolved |
| `src/domain/` | A | R, Q, E | Pure rules, settings contracts, duration validation, and time types reviewed |
| `src/application/` | A | R, Q, E | Use cases, 12-port barrel, reactions, session engine, and low-battery policy reviewed |
| `src/infrastructure/` | A | R, Q, D | Settings, sleep, updater, notification, logging, and benchmark adapters reviewed |
| `src/main/` | A | R, Q, D | Lifecycle, composition, IPC, tray, windows, facades, and state ownership traced |
| `src/main/platform/` | A | R, Q | Both OS adapters, shell-outs, utility presentation, and local guidance reviewed |
| `src/preload/` | A | Q, R | Public and utility-dialog bridges, typed contracts, and exhaustiveness reviewed |
| `src/renderer/` | R | Q, A, E | Four renderer surfaces, constants, styles, warm-cache behavior, and accessibility signals reviewed |
| `src/renderer/settings/` | R | Q, A | Debounced persistence, shortcut recording, focus restoration, and local guidance reviewed |
| `src/shared/` | A | Q, R | IPC maps, push contracts, benchmark types, private dialog channels, and guidance reviewed |
| `src/assets/` and `src/assets.d.ts` | D | R, C | Checked-in generated runtime assets reviewed through generators and consumers; binaries not decoded line by line |
| `tests/application/`, `tests/domain/`, and `tests/infrastructure/` | Q | A, R | All suites and guidance assigned; pure use-case and adapter coverage mapped |
| `tests/main/` | Q | A, R, D | All suites and local mocking guidance assigned; lifecycle, IPC, platform, updater, and tooling tests mapped |
| `tests/renderer/`, `tests/shared/`, and root test setup | Q | R, A | Renderer behavior, shared contracts, environment setup, and guidance reviewed |
| Ignored `lib/`, `dist/`, `artifacts/`, `coverage/`, `node_modules/`, caches, and tool state | D | Q | Explicitly excluded as generated, vendored, or local state; generators and consumers were reviewed instead |
| Three proposal boundaries | Oracle | A, R, Q, D | All retained with narrowed ownership and failure behavior |
| Current Electron, updater, and GitHub contracts | Librarian | Oracle, D, Q | Primary sources reconciled; version-sensitive and repository-specific unknowns recorded |

## Proposed Coding Challenges

### Proposal 1: Complete the Battery Sensor Boundary

#### Coding Prompt

Complete the existing `BatterySensorPort` boundary so `createBatteryMonitor` no longer imports Electron `powerMonitor` or `main/platform/getBatteryPercent` directly. Extend the port only enough to expose current power-source state, add a thin adapter under `src/main/platform/`, and inject it from `createAppComposition`.

Keep low-battery policy in `createHandleLowBatteryAutoStop`. The adapter must not make threshold, polling, or sleep-prevention decisions.

Keep the detector's current behavior intact: threshold and effective-activity gates, AC/battery transitions, immediate resume checks, 60,000 ms unref polling, rejection and `null` handling, overlap prevention, reconfiguration, and benchmark counter meanings. Initialization must subscribe once, and cleanup must clear the interval and remove only its own listeners through an idempotent unsubscribe.

Update focused adapter, monitor, composition-wiring, platform-parser, and benchmark-contract tests. Keep the 12-port budget, both macOS and Windows shell-outs in `battery-percent.ts`, and application ownership of the auto-stop response. The change must pass the repository's type, layer, lint, build, coverage, and idle benchmark gates.

#### How I Would Use This Codebase

I would use this boundary to provide deterministic battery sensors in integration tests and add another supported desktop battery provider without changing low-battery policy. The application would keep one detector contract, while each Electron platform adapter handled its own hardware and process details.

#### Why This Is Challenging

The monitor currently combines hardware access with scheduling, lifecycle work, policy gates, and benchmark accounting. Pulling out only the physical sensor means preserving listener identity, cleanup, resume behavior, and overlap behavior. Moving too much into application code would reverse the dependency direction, while a mock-only refactor could change runtime counters without showing it.

#### Evaluation Rubric

1. `BatterySensorPort` exposes percent reads, current power-source state, and AC/battery/resume subscription without threshold or auto-stop policy. A thin adapter under `src/main/platform/` implements it with `powerMonitor` and `getBatteryPercent()`, while `createBatteryMonitor` loses those direct imports and no thirteenth application port is added.
2. Threshold-disabled, inactive, AC, unavailable-percent, resume, periodic, reconfigure, rejection, and overlapping-read behavior remains correct. The `scheduled`, `callbackAttempted`, `guardedSkipped`, and `completedRead` benchmark counters keep their current meanings, including zero-valued non-benchmark behavior.
3. `createAppComposition` constructs and injects one sensor, monitor initialization subscribes once, and cleanup clears polling plus the exact registered callbacks without touching other listeners. Detector code retains the 60,000 ms unref interval, while `createHandleLowBatteryAutoStop` retains policy and `battery-percent.ts` retains both OS shell-outs.
4. Focused coverage includes `tests/main/battery-sensor.test.ts`, `tests/main/battery-monitor.test.ts`, `tests/main/battery-percent.test.ts`, `tests/main/composition-wiring.test.ts`, and `tests/shared/benchmark-types.test.ts`. The change passes `bun run test -- tests/main/battery-sensor.test.ts tests/main/battery-monitor.test.ts tests/main/battery-percent.test.ts tests/main/composition-wiring.test.ts tests/shared/benchmark-types.test.ts`, `bun run typecheck`, `bun run typecheck:tests`, `bun run typecheck:sticky`, `bun run typecheck:layers`, `bun run lint`, `bun run build`, `bun run test:coverage` with the configured 90% line, function, and branch thresholds, and `bun run benchmark:performance -- --scenario idle`.

### Proposal 2: Flush Pending Settings Before Quit

#### Coding Prompt

Guarantee that unsent Settings changes reach the main process before quit destroys the warm-cached Settings renderer. Add a typed, settings-specific main-to-renderer flush request and renderer-to-main acknowledgement through the shared IPC and preload contract. `AppShell.cleanup()` must request and await the renderer drain before `flushSettingsWriteChain()`, then continue with tray, composition, and window teardown.

Keep normal saves debounced at 300 ms. When a flush request arrives, cancel the timer and drain pending and in-flight updates through `window.api.settings.set`. Acknowledge only after the live renderer settles. Use one 2,000 ms quit budget so a missing, destroyed, hung, or failed renderer cannot stall shutdown, and remove every temporary listener. Hidden warm-cache Settings windows must participate, while absent windows return immediately.

Authenticate the acknowledgement with `validateSender()` and the exact Settings `webContents`. Do not rely on asynchronous unload work, `executeJavaScript`, DOM events, sleeps, utility-dialog transport, or a second settings subscriber. Add focused renderer, preload, IPC, `WindowGraph`, `AppShell`, and settings-store tests for ordering, coalescing, failure handling, and deadline behavior.

#### How I Would Use This Codebase

I would use Amphetamine's Settings window as a warm, low-friction control panel where a user can change several options and quit immediately without losing the last edit. The same handoff would give future utility settings a clear persistence boundary without making every input write to disk synchronously.

#### Why This Is Challenging

The unsaved state sits behind a renderer timer, while main owns durable writes and process teardown. Quit has to coordinate two asynchronous queues across IPC without trusting unload or waiting forever. Sender validation, hidden-window behavior, late acknowledgements, save rejection, and last-write-wins merging mean a local `beforeunload` patch will not cover the full flow.

#### Evaluation Rubric

1. Normal edits remain debounced for 300 ms, while a flush request cancels the old timer and drains pending plus in-flight updates through the existing settings API. Newer partials preserve last-write-wins merging, no update is sent twice, save errors remain visible, and acknowledgement occurs only after the live renderer has settled.
2. The request and acknowledgement are typed consistently through `src/shared/types.ts`, `src/preload/index.ts`, renderer declarations, main IPC wiring, and the enforced public-channel budget. Main registers acknowledgement before sending, validates the top-frame origin with `validateSender()`, binds the response to the exact Settings `webContents`, and rejects wrong origins, child frames, stale responses, and other windows without reusing utility-dialog transport.
3. `AppShell.cleanup()` orders renderer handoff before `flushSettingsWriteChain()`, then tray cleanup, composition cleanup, and `destroyAllWindows()`, all within one 2,000 ms deadline. Hidden warm-cache windows participate, absent windows complete immediately, and timeout, destruction, failed persistence, or late acknowledgement cannot hang cleanup or leak listeners; repeated cleanup stays idempotent.
4. Focused tests cover `tests/renderer/settings.test.ts`, `tests/main/preload.test.ts`, `tests/main/ipc.test.ts`, `tests/main/ipc-handlers.test.ts`, `tests/main/app-shell.test.ts`, `tests/main/window-graph.test.ts`, and `tests/main/settings.test.ts`, including a flush at 299 ms and an unresponsive renderer. The change passes `bun run test -- tests/renderer/settings.test.ts tests/main/preload.test.ts tests/main/ipc.test.ts tests/main/ipc-handlers.test.ts tests/main/app-shell.test.ts tests/main/window-graph.test.ts tests/main/settings.test.ts`, `bun run typecheck`, `bun run typecheck:tests`, `bun run typecheck:sticky`, `bun run typecheck:layers`, `bun run lint`, `bun run build`, and `bun run test:coverage` with the configured 90% line, function, and branch thresholds.

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
