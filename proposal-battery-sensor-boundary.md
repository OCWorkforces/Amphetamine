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
