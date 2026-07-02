import {
  DEFAULT_RENDERER_COUNTDOWN_TIMER_COUNTERS,
  type RendererCountdownTimerCounters,
} from "../shared/benchmark-types.js";

type MutableRendererCountdownTimerCounters = {
  -readonly [Key in keyof RendererCountdownTimerCounters]: RendererCountdownTimerCounters[Key];
};

const rendererCountdownTimerCounters: MutableRendererCountdownTimerCounters = {
  ...DEFAULT_RENDERER_COUNTDOWN_TIMER_COUNTERS,
};
let countersEnabled = false;

export function installRendererBenchmarkCounters(): void {
  countersEnabled = window.api.benchmark.isEnabled();
  if (!countersEnabled) return;
  window.__AMPHETAMINE_BENCHMARK__ = {
    getRendererCountdownTimerCounters: () => ({ ...rendererCountdownTimerCounters }),
  };
}

export function recordCountdownStart(): void {
  if (!countersEnabled) return;
  rendererCountdownTimerCounters.starts += 1;
}

export function recordCountdownSchedule(): void {
  if (!countersEnabled) return;
  rendererCountdownTimerCounters.schedules += 1;
  rendererCountdownTimerCounters.active = true;
}

export function recordCountdownCallback(): void {
  if (!countersEnabled) return;
  rendererCountdownTimerCounters.callbacks += 1;
  rendererCountdownTimerCounters.fires += 1;
}

export function recordCountdownStop(): void {
  if (!countersEnabled) return;
  rendererCountdownTimerCounters.stops += 1;
}

export function recordCountdownClear(): void {
  if (!countersEnabled) return;
  rendererCountdownTimerCounters.clears += 1;
  rendererCountdownTimerCounters.active = false;
}
