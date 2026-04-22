import "./styles/main.css";
import type { AppSettings } from "../shared/types.js";
import { DEFAULT_SETTINGS } from "../shared/types.js";

type SessionStatus = Awaited<ReturnType<typeof window.api.session.getStatus>>;

const MIN_H = 180;
const MAX_H = 420;

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let sessionStatus: SessionStatus = null;
let unsubscribeSettings: (() => void) | null = null;
let unsubscribeSessionStatus: (() => void) | null = null;
let isPopoverVisible = false;

// Cached DOM element references (populated after render)
let statusDotEl: HTMLElement | null = null;
let statusTextEl: HTMLElement | null = null;
let timerTextEl: HTMLElement | null = null;
let rafId: number | null = null;

function getApp(): HTMLElement | null {
  return document.getElementById("app");
}

function formatTimerLabel(): string {
  if (!settings.preventSleep) {
    return "⏱ Indefinitely";
  }

  if (!sessionStatus?.isRunning || sessionStatus.durationMinutes === null) {
    return "⏱ Indefinitely";
  }

  const computedRemaining =
    sessionStatus.remainingSeconds ??
    (sessionStatus.expiresAt === null
      ? null
      : Math.max(0, Math.floor((sessionStatus.expiresAt - performance.now()) / 1000)));

  if (computedRemaining === null) {
    return "⏱ Indefinitely";
  }

  const totalSeconds = Math.max(0, Math.ceil(computedRemaining));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);

  if (hours >= 1) {
    return `⏱ ${hours}h ${minutes}m remaining`;
  }

  const minuteValue = Math.max(0, Math.ceil(totalSeconds / 60));
  return `⏱ ${minuteValue}m remaining`;
}

function resizeToContent(): void {
  const app = getApp();
  if (!app) return;

  const targetH = Math.min(MAX_H, Math.max(MIN_H, Math.ceil(app.scrollHeight)));
  window.api.window.setHeight(targetH);
}

function updateStatusUI(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
  }
  rafId = requestAnimationFrame(() => {
    rafId = null;
    statusDotEl?.classList.toggle("active", settings.preventSleep);
    if (statusTextEl) {
      statusTextEl.textContent = settings.preventSleep
        ? "Preventing Sleep"
        : "Sleep Prevention Off";
    }
    if (timerTextEl) {
      timerTextEl.textContent = formatTimerLabel();
    }
  });
}

async function refreshSessionStatus(): Promise<void> {
  if (!settings.preventSleep) {
    sessionStatus = null;
    updateStatusUI();
    return;
  }

  try {
    sessionStatus = await window.api.session.getStatus();
  } catch {
    console.warn("[renderer] Failed to get session status");
    sessionStatus = null;
  }

  updateStatusUI();
}

function bindEvents(): void {
  const app = getApp();
  if (!app) return;

  const settingsButton =
    app.querySelector<HTMLButtonElement>("#settings-action");
  const quitButton = app.querySelector<HTMLButtonElement>("#quit-action");

  settingsButton?.addEventListener("click", () => {
    void window.api.settings.open();
  });

  quitButton?.addEventListener("click", () => {
    void window.api.quit();
  });
}

function render(version: string): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="popover">
      <header class="popover-header">
        <span class="app-title">⚡ Amphetamine</span>
        <span class="app-version">v${version}</span>
      </header>

      <section class="popover-status" aria-live="polite">
        <span id="status-dot" class="status-dot${settings.preventSleep ? " active" : ""}"></span>
        <span id="status-text" class="status-text">${settings.preventSleep ? "Preventing Sleep" : "Sleep Prevention Off"}</span>
      </section>

      <p id="timer-text" class="popover-timer">${formatTimerLabel()}</p>

      <div class="popover-divider" role="presentation"></div>

      <footer class="popover-footer">
        <button id="settings-action" class="footer-action" type="button">Settings...</button>
        <button id="quit-action" class="footer-action footer-action--quit" type="button">Quit</button>
      </footer>
    </div>
  `;

  bindEvents();

  requestAnimationFrame(() => {
    // Cache DOM element references for updateStatusUI
    statusDotEl = app.querySelector("#status-dot");
    statusTextEl = app.querySelector("#status-text");
    timerTextEl = app.querySelector("#timer-text");
    resizeToContent();

    if (isPopoverVisible) {
      app.classList.add("visible");
    }
  });
}

function handlePopoverHide(): void {
  const app = getApp();
  if (!app) return;

  isPopoverVisible = false;
  app.classList.remove("visible");
}

function handleVisibilityChange(): void {
  const app = getApp();
  if (!app) return;

  if (document.visibilityState === "visible") {
    isPopoverVisible = true;
    app.classList.add("visible");
    return;
  }
}

/** Load settings and version from main process */
async function loadInitialData(): Promise<{ settings: AppSettings; version: string }> {
  const [nextSettings, version] = await Promise.all([
    window.api.settings.get(),
    window.api.app.getVersion(),
  ]);
  return { settings: nextSettings, version };
}

/** Subscribe to push updates from main process */
function setupPushSubscriptions(): void {
  unsubscribeSettings = window.api.onSettingsChanged((next) => {
    settings = next;
    updateStatusUI();

    if (!settings.preventSleep) {
      sessionStatus = null;
    }
  });

  unsubscribeSessionStatus = window.api.onSessionStatusUpdate((status) => {
    sessionStatus = status;
    updateStatusUI();
  });
}

/** Attach window/document event listeners for popover lifecycle */
function attachWindowEvents(): void {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener(
    "popover:hide",
    handlePopoverHide as EventListener,
  );
  window.addEventListener("popover:hide", handlePopoverHide as EventListener);

  window.addEventListener("beforeunload", () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    statusDotEl = null;
    statusTextEl = null;
    timerTextEl = null;
    unsubscribeSessionStatus?.();
    unsubscribeSessionStatus = null;
    unsubscribeSettings?.();
    unsubscribeSettings = null;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener(
      "popover:hide",
      handlePopoverHide as EventListener,
    );
    window.removeEventListener(
      "popover:hide",
      handlePopoverHide as EventListener,
    );
  });
}

async function init() {
  try {
    const data = await loadInitialData();
    settings = data.settings;
    isPopoverVisible = true;

    await refreshSessionStatus();
    render(data.version);

    setupPushSubscriptions();
    attachWindowEvents();
  } catch {
    // Render fallback UI on init failure
    const version = "-";
    render(version);
    requestAnimationFrame(() => {
      const app = getApp();
      if (!app) return;

      // Cache DOM element references for updateStatusUI
      statusDotEl = app.querySelector("#status-dot");
      statusTextEl = app.querySelector("#status-text");
      timerTextEl = app.querySelector("#timer-text");

      isPopoverVisible = true;
      app.classList.add("visible");
      resizeToContent();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
