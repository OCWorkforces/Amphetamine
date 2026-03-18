import "./styles.css";
import type { AppSettings } from "../../shared/types.js";
import heroIcon from "../../assets/settings-hero-icon.png";

let settings: AppSettings = {
  launchAtLogin: false,
  preventSleep: false,
};
let isSaving = false;
const saveIndicatorTimers = new Map<string, ReturnType<typeof setTimeout>>();

function render(errorMessage?: string): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
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
      ${errorMessage ? `<p class="settings-error">${errorMessage}</p>` : ""}
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
            <input type="checkbox" id="launch-at-login-toggle" class="toggle-input"${settings.launchAtLogin ? " checked" : ""} />
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
            <input type="checkbox" id="prevent-sleep-toggle" class="toggle-input"${settings.preventSleep ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
    </div>
    <div class="settings-footer">
      <span class="settings-footer-text">Amphetamine &middot; &copy; ${new Date().getFullYear()}</span>
    </div>
  `;

  setupToggleListener();
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

function setupToggleListener(): void {
  const launchToggle = document.getElementById(
    "launch-at-login-toggle",
  ) as HTMLInputElement | null;
  if (launchToggle) {
    launchToggle.addEventListener("change", () => {
      void saveSettings(
        { launchAtLogin: launchToggle.checked },
        "launch-save-indicator",
      );
    });
  }

  const sleepToggle = document.getElementById(
    "prevent-sleep-toggle",
  ) as HTMLInputElement | null;
  if (sleepToggle) {
    sleepToggle.addEventListener("change", () => {
      void saveSettings(
        { preventSleep: sleepToggle.checked },
        "sleep-save-indicator",
      );
    });
  }
}

async function saveSettings(
  partial: Partial<AppSettings>,
  indicatorId: string = "launch-save-indicator",
): Promise<void> {
  if (isSaving) return;
  isSaving = true;

  try {
    const updated = await window.api.settings.set(partial);
    settings = updated;
    showSaveIndicator(indicatorId, "✓ Saved");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save settings";
    render(message);
  } finally {
    isSaving = false;
  }
}

async function init(): Promise<void> {
  try {
    settings = await window.api.settings.get();
  } catch {
    // Use default if load fails; render will show no error
  }
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
