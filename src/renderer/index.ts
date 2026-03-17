import "./styles/main.css";

async function init() {
  const app = document.getElementById("app");
  if (!app) return;

  try {
    const version = await window.api.app.getVersion();
    app.innerHTML = `
      <div class="body">
        <div class="state-screen">
          <div class="state-icon">⚡</div>
          <p class="state-title">Amphetamine is running</p>
          <p class="state-desc">Prevent your Mac from sleeping via the menu bar.</p>
        </div>
      </div>
      <footer class="footer">
        <span class="footer-version">v${version}</span>
      </footer>
    `;

    // Measure and resize the Electron BrowserWindow
    const FOOTER_H = 32;
    const MIN_H = 220;
    const MAX_H = 480;
    const bodyEl = app.querySelector<HTMLElement>(".body");
    const bodyH = bodyEl ? bodyEl.scrollHeight : 0;
    const targetH = Math.min(MAX_H, Math.max(MIN_H, bodyH + FOOTER_H));
    window.api.window.setHeight(targetH);
  } catch {
    // Silent fail — app shell still renders
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
