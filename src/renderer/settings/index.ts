import "./styles.css";
import log from "electron-log";
import type { AppSettings } from "../../shared/types.js";
import { DEFAULT_SETTINGS } from "../../shared/types.js";

const heroIcon = new URL("../../assets/settings-hero-icon.png", import.meta.url).toString();

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isSaving = false;
const saveIndicatorTimers = new Map<string, ReturnType<typeof setTimeout>>();

window.addEventListener("beforeunload", () => {
  for (const timer of saveIndicatorTimers.values()) {
    clearTimeout(timer);
  }
  saveIndicatorTimers.clear();
});

/** Build the settings form HTML template */
function buildSettingsForm(): string {
  return `
    <div class="settings-titlebar">
      <span class="settings-title">Settings</span>
    </div>
    <div class="settings-hero">
      <img class="settings-hero-icon" src="${heroIcon}" alt="Amphetamine" />
      <div class="settings-hero-text">
        <div class="settings-hero-name">Amphetamine</div>
        <div class="settings-hero-desc">Keep your Mac awake</div>
      </div>
    </div>
    <div class="settings-content">
      <p id="settings-error-text" class="settings-error"></p>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="launch-at-login-toggle">
            🚀 Launch at Login
          </label>
          <span class="setting-description">Automatically start Amphetamine when you log in</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="launch-save-indicator"></span>
          <label class="toggle-switch">
            <input type="checkbox" id="launch-at-login-toggle" class="toggle-input" role="switch" aria-checked="${settings.launchAtLogin}"${settings.launchAtLogin ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="prevent-sleep-toggle">
            🔋 Prevent Sleep
          </label>
          <span class="setting-description">Keep your Mac awake while Amphetamine is running</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="sleep-save-indicator"></span>
          <label class="toggle-switch">
            <input type="checkbox" id="prevent-sleep-toggle" class="toggle-input" role="switch" aria-checked="${settings.preventSleep}"${settings.preventSleep ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--select">
        <div class="setting-row-inner">
          <label class="setting-label" for="session-duration-select">
            ⏳ Activate for
          </label>
          <span class="setting-description">Duration to keep your Mac awake</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="duration-save-indicator"></span>
          <select id="session-duration-select" class="setting-select">
            <option value=""${settings.sessionDuration === null ? " selected" : ""}>Indefinitely</option>
            <option value="15"${settings.sessionDuration === 15 ? " selected" : ""}>15 Minutes</option>
            <option value="30"${settings.sessionDuration === 30 ? " selected" : ""}>30 Minutes</option>
            <option value="60"${settings.sessionDuration === 60 ? " selected" : ""}>1 Hour</option>
            <option value="120"${settings.sessionDuration === 120 ? " selected" : ""}>2 Hours</option>
            <option value="240"${settings.sessionDuration === 240 ? " selected" : ""}>4 Hours</option>
          </select>
        </div>
      </div>
    </div>
    <div class="settings-footer">
      <span class="settings-footer-text">Amphetamine &middot; &copy; ${new Date().getFullYear()}</span>
    </div>
  `;
}

/** Attach change listeners to toggles and dropdown */
function attachFormListeners(): void {
  const launchToggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement | null;
  if (launchToggle) {
    launchToggle.addEventListener("change", () => {
      void saveSettings({ launchAtLogin: launchToggle.checked }, "launch-save-indicator");
    });
  }

  const sleepToggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement | null;
  if (sleepToggle) {
    sleepToggle.addEventListener("change", () => {
      void saveSettings({ preventSleep: sleepToggle.checked }, "sleep-save-indicator");
    });
  }

  const durationSelect = document.getElementById(
    "session-duration-select",
  ) as HTMLSelectElement | null;
  if (durationSelect) {
    durationSelect.addEventListener("change", () => {
      const raw = durationSelect.value;
      const duration: number | null = raw === "" ? null : parseInt(raw, 10);
      settings.sessionDuration = duration;
      void window.api.session.start(duration);
      void saveSettings({ sessionDuration: duration, preventSleep: true }, "duration-save-indicator");
    });
  }
}

function render(errorMessage?: string): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = buildSettingsForm();

  // Set error message safely via textContent (prevents XSS)
  const errorEl = document.getElementById("settings-error-text");
  if (errorEl) {
    errorEl.textContent = errorMessage ?? "";
  }

  attachFormListeners();
}

function updateSettingsUI(s: AppSettings): void {
  const launchToggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement | null;
  if (launchToggle) {
    launchToggle.checked = s.launchAtLogin;
    launchToggle.setAttribute("aria-checked", String(s.launchAtLogin));
  }

  const sleepToggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement | null;
  if (sleepToggle) {
    sleepToggle.checked = s.preventSleep;
    sleepToggle.setAttribute("aria-checked", String(s.preventSleep));
  }

  const durationSelect = document.getElementById(
    "session-duration-select",
  ) as HTMLSelectElement | null;
  if (durationSelect) {
    durationSelect.value = s.sessionDuration === null ? "" : String(s.sessionDuration);
  }
}

function showSaveIndicator(id: string, text: string): void {
  const indicator = document.getElementById(id);
  if (!indicator) return;

  // Clear previous timer for this specific indicator (not shared)
  const prevTimer = saveIndicatorTimers.get(id);
  if (prevTimer !== undefined) {
    clearTimeout(prevTimer);
    saveIndicatorTimers.delete(id);
  }

  indicator.textContent = text;
  indicator.classList.add("visible");

  const timer = setTimeout(() => {
    indicator.classList.remove("visible");
    saveIndicatorTimers.delete(id);
  }, 1500);
  saveIndicatorTimers.set(id, timer);
}


async function saveSettings(
  partial: Partial<AppSettings>,
  indicatorId: string = "launch-save-indicator",
): Promise<void> {
  // Merge partial into settings immediately for UI responsiveness
  settings = { ...settings, ...partial };

  // Debounce the actual persistence
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (isSaving) return;
    isSaving = true;
    try {
      await window.api.settings.set(settings);
      showSaveIndicator(indicatorId, "✓ Saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      render(message);
    } finally {
      isSaving = false;
    }
  }, 300);
}

async function init(): Promise<void> {
  try {
    settings = await window.api.settings.get();
  } catch (e1) {
    log.info("[settings] Failed to load settings, using defaults", e1);
  }

  try {
    const status = await window.api.session.getStatus();
    if (status?.isRunning) {
      settings.sessionDuration = status.durationMinutes;
    }
  } catch (e2) {
    log.info("[settings] Failed to get session status", e2);
  }

  render();

  window.api.onSettingsChanged((newSettings: AppSettings) => {
    settings = newSettings;
    updateSettingsUI(settings);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
