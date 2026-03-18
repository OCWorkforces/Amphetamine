import { powerSaveBlocker } from "electron";

let blockerId: number | null = null;

/**
 * Start preventing system sleep.
 * No-op if already active.
 */
export function startPreventingSleep(): void {
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
    return;
  }
  blockerId = powerSaveBlocker.start("prevent-display-sleep");
  console.log("[power-saver] Started preventing sleep (id:", blockerId, ")");
}

/**
 * Stop preventing system sleep.
 * No-op if not active.
 */
export function stopPreventingSleep(): void {
  if (blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId);
    }
    blockerId = null;
  }
  console.log("[power-saver] Stopped preventing sleep");
}

/**
 * Check if sleep prevention is currently active.
 */
export function isPreventingSleep(): boolean {
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
}

/**
 * Sync the prevent-sleep state with the desired enabled flag.
 * Called on startup and when settings change.
 */
export function syncPreventSleep(enabled: boolean): void {
  if (enabled) {
    startPreventingSleep();
  } else {
    stopPreventingSleep();
  }
}
