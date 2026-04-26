import "./styles/main.css";
import type { AppSettings } from "../shared/types.js";
import { DEFAULT_SETTINGS } from "../shared/types.js";
import { STATUS_PREVENTING_SLEEP, STATUS_SLEEP_PREVENTION_OFF } from "./constants.js";

type SessionStatus = Awaited<ReturnType<typeof window.api.session.getStatus>> | null;

const MIN_H = 180;
const MAX_H = 420;

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let sessionStatus: SessionStatus = null;
let statusError: string | null = null;
let unsubscribeSettings: (() => void) | null = null;
let unsubscribeSessionStatus: (() => void) | null = null;
let isPopoverVisible = false;
let isLoading = true;

const TIMER_ICON_SVG = `<svg class="popover-timer-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="5"/><path d="M6 3v3l2 2"/></svg><span class="visually-hidden">Timer</span>`;

const BOLT_ICON_SVG = `<svg class="app-title-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M7 1L1 7h4l-1 4 6-6H6z"/></svg><span class="visually-hidden">Active</span>`;

// Cached DOM element references (populated after render)
let statusDotEl: HTMLElement | null = null;
let statusTextEl: HTMLElement | null = null;
let timerTextEl: HTMLElement | null = null;
let statusErrorEl: HTMLElement | null = null;
let rafId: number | null = null;

function getApp(): HTMLElement | null {
  return document.getElementById("app");
}

function formatTimerLabel(): string {
  if (!settings.preventSleep) {
    return `${TIMER_ICON_SVG} Indefinitely`;
  }

  if (!sessionStatus?.isRunning || sessionStatus.durationMinutes === null) {
    return `${TIMER_ICON_SVG} Indefinitely`;
  }

  const computedRemaining = sessionStatus.remainingSeconds;

  const totalSeconds = Math.max(0, Math.ceil(computedRemaining));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);

  if (hours >= 1) {
    return `${TIMER_ICON_SVG} ${hours}h ${minutes}m remaining`;
  }

  const minuteValue = Math.max(0, Math.ceil(totalSeconds / 60));
  return `${TIMER_ICON_SVG} ${minuteValue}m remaining`;
}

function resizeToContent(): void {
  const app = getApp();
  if (!app) return;

  const targetH = Math.min(MAX_H, Math.max(MIN_H, Math.ceil(app.scrollHeight)));
  window.api.window.setHeight(targetH);
}

function updateStatusUI(): void {
  if (isLoading) return;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
  }
  rafId = requestAnimationFrame(() => {
    rafId = null;
    statusDotEl?.classList.toggle("active", settings.preventSleep);
    if (statusTextEl) {
      statusTextEl.textContent = settings.preventSleep
        ? STATUS_PREVENTING_SLEEP
        : STATUS_SLEEP_PREVENTION_OFF;
    }
    if (timerTextEl) {
      timerTextEl.innerHTML = formatTimerLabel();
    }
    if (statusErrorEl) {
      statusErrorEl.textContent = statusError ?? "";
      statusErrorEl.classList.toggle("visible", statusError !== null);
    }
  });
}

async function refreshSessionStatus(): Promise<void> {
  if (!settings.preventSleep) {
    sessionStatus = null;
    statusError = null;
    updateStatusUI();
    return;
  }

  try {
    sessionStatus = await window.api.session.getStatus();
    statusError = null;
  } catch {
    console.warn("[renderer] Failed to get session status");
    sessionStatus = null;
    statusError = "Status unavailable";
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
    void window.api.app.quit();
  });
}

function renderLoading(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="popover">
      <div id="popover-loading" class="popover-loading" role="status" aria-live="polite">
        <span class="visually-hidden">Loading</span>
        <span class="popover-loading-dot" aria-hidden="true"></span>
        <span class="popover-loading-dot" aria-hidden="true"></span>
        <span class="popover-loading-dot" aria-hidden="true"></span>
      </div>
    </div>
  `;

  if (isPopoverVisible) {
    app.classList.add("visible");
  }
}

function render(version: string): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="popover">
      <header class="popover-header">
        <span class="app-title">${BOLT_ICON_SVG} Amphetamine</span>
        <span class="app-version">v${version}</span>
      </header>

      <section class="popover-status" aria-live="polite">
        <span id="status-dot" class="status-dot${settings.preventSleep ? " active" : ""}"></span>
        <span id="status-text" class="status-text">${settings.preventSleep ? STATUS_PREVENTING_SLEEP : STATUS_SLEEP_PREVENTION_OFF}</span>
      </section>

      <p id="status-error" class="status-error${statusError !== null ? " visible" : ""}">${statusError ?? ""}</p>

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
    statusErrorEl = app.querySelector("#status-error");
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
    statusErrorEl = null;
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
  isLoading = true;
  isPopoverVisible = true;
  renderLoading();

  try {
    const data = await loadInitialData();
    settings = data.settings;

    await refreshSessionStatus();
    isLoading = false;
    render(data.version);

    setupPushSubscriptions();
    attachWindowEvents();
  } catch {
    // Render fallback UI on init failure
    isLoading = false;
    const version = "-";
    render(version);
    requestAnimationFrame(() => {
      const app = getApp();
      if (!app) return;

      // Cache DOM element references for updateStatusUI
      statusDotEl = app.querySelector("#status-dot");
      statusTextEl = app.querySelector("#status-text");
      timerTextEl = app.querySelector("#timer-text");
      statusErrorEl = app.querySelector("#status-error");

      isPopoverVisible = true;
      app.classList.add("visible");
      resizeToContent();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
