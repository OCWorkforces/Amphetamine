import "./styles/main.css";
import type { AppSettings } from "../shared/types.js";

type SessionStatus = Awaited<ReturnType<typeof window.api.session.getStatus>>;

const MIN_H = 180;
const MAX_H = 420;

let settings: AppSettings = {
  launchAtLogin: false,
  preventSleep: false,
  sessionDuration: null,
};
let sessionStatus: SessionStatus = null;
let sessionPollTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeSettings: (() => void) | null = null;
let isPopoverVisible = false;

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
      : Math.max(0, Math.floor((sessionStatus.expiresAt - Date.now()) / 1000)));

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
  const app = getApp();
  if (!app) return;

  const statusDot = app.querySelector<HTMLElement>("#status-dot");
  const statusText = app.querySelector<HTMLElement>("#status-text");
  const timerText = app.querySelector<HTMLElement>("#timer-text");

  statusDot?.classList.toggle("active", settings.preventSleep);

  if (statusText) {
    statusText.textContent = settings.preventSleep
      ? "Preventing Sleep"
      : "Sleep Prevention Off";
  }

  if (timerText) {
    timerText.textContent = formatTimerLabel();
  }
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
    sessionStatus = null;
  }

  updateStatusUI();
}

function shouldPollSession(): boolean {
  return isPopoverVisible && document.visibilityState === "visible";
}

function stopSessionPolling(): void {
  if (sessionPollTimer) {
    clearInterval(sessionPollTimer);
    sessionPollTimer = null;
  }
}

function startSessionPolling(): void {
  if (!shouldPollSession() || sessionPollTimer) {
    return;
  }

  void refreshSessionStatus();
  sessionPollTimer = setInterval(() => {
    void refreshSessionStatus();
  }, 1000);
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
    // TODO: Add QUIT IPC channel
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
  stopSessionPolling();
}

function handleVisibilityChange(): void {
  const app = getApp();
  if (!app) return;

  if (document.visibilityState === "visible") {
    isPopoverVisible = true;
    app.classList.add("visible");
    startSessionPolling();
    return;
  }

  stopSessionPolling();
}

async function init() {
  try {
    const [nextSettings, version] = await Promise.all([
      window.api.settings.get(),
      window.api.app.getVersion(),
    ]);

    settings = nextSettings;
    isPopoverVisible = true;

    render(version);
    await refreshSessionStatus();
    startSessionPolling();

    unsubscribeSettings = window.api.onSettingsChanged((next) => {
      settings = next;
      updateStatusUI();

      if (!settings.preventSleep) {
        sessionStatus = null;
      }

      if (shouldPollSession()) {
        startSessionPolling();
      } else {
        stopSessionPolling();
      }
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener(
      "popover:hide",
      handlePopoverHide as EventListener,
    );
    window.addEventListener("popover:hide", handlePopoverHide as EventListener);

    window.addEventListener("beforeunload", () => {
      stopSessionPolling();
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
  } catch {
    const version = "-";
    render(version);
    requestAnimationFrame(() => {
      const app = getApp();
      if (!app) return;

      isPopoverVisible = true;
      app.classList.add("visible");
      resizeToContent();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
