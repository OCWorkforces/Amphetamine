import type { Api } from "../preload/index.js";
import type { RendererCountdownTimerCounters } from "../shared/benchmark-types.js";

declare global {
  interface Window {
    api: Api;
    __AMPHETAMINE_BENCHMARK__?: {
      readonly getRendererCountdownTimerCounters: () => RendererCountdownTimerCounters;
    };
  }
}

export {};
