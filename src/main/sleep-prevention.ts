import { powerSaveBlocker } from "electron";
import log from "electron-log";

let blockerId: number | null = null;

export function startPreventingSleep(): void {
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
    return;
  }
  const id = powerSaveBlocker.start("prevent-display-sleep");
  if (id >= 0) {
    blockerId = id;
    log.info("[sleep-prevention] Started preventing sleep (id:", blockerId, ")");
  } else {
    log.error("[sleep-prevention] Failed to start preventing sleep (id:", id, ")");
  }
}

export function stopPreventingSleep(): void {
  if (blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId);
    }
    blockerId = null;
    log.info("[sleep-prevention] Stopped preventing sleep");
  }
}

export function isPreventingSleep(): boolean {
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
}

export function syncPreventSleep(enabled: boolean): void {
  if (enabled) {
    startPreventingSleep();
  } else {
    stopPreventingSleep();
  }
}
