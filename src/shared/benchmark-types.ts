export const BENCHMARK_ENV_NAME = "AMPHETAMINE_BENCHMARK" as const;

export type RendererCountdownTimerCounters = {
  readonly starts: number;
  readonly schedules: number;
  readonly callbacks: number;
  readonly fires: number;
  readonly stops: number;
  readonly clears: number;
  readonly active: boolean;
};

export const DEFAULT_RENDERER_COUNTDOWN_TIMER_COUNTERS = {
  starts: 0,
  schedules: 0,
  callbacks: 0,
  fires: 0,
  stops: 0,
  clears: 0,
  active: false,
} as const satisfies RendererCountdownTimerCounters;

const RENDERER_COUNTDOWN_COUNTER_KEYS = [
  "starts",
  "schedules",
  "callbacks",
  "fires",
  "stops",
  "clears",
] as const;

export function isRendererCountdownTimerCounters(
  value: unknown,
): value is RendererCountdownTimerCounters {
  if (!isRecord(value)) return false;
  return (
    RENDERER_COUNTDOWN_COUNTER_KEYS.every((key) => typeof value[key] === "number") &&
    typeof value["active"] === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
