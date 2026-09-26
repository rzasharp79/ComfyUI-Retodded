// Sidebar "Restart" button, placed just above Help; the server half is restart.py.
// The frontend has no API for buttons in the sidebar's bottom group, so this clones the
// Help button (keeping its look in every sidebar size/style) and re-adds the clone
// whenever Vue re-renders the sidebar.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const BUTTON_ID = "retodded-restart-button";

async function restart() {
  const queue = await api.getQueue();
  const busy = queue.Running.length + queue.Pending.length;
  const message = busy
    ? `${busy} job(s) are running or queued. Restarting stops the running one and clears the queue.`
    : "The page reconnects on its own once the server is back (about a minute).";
  const ok = await app.extensionManager.dialog.confirm({ title: "Restart ComfyUI?", message });
  if (!ok) return;

  const res = await api.fetchApi("/retodded/restart", { method: "POST" });
  if (!res.ok) {
    app.extensionManager.toast.add({ severity: "error", summary: "Restart failed", detail: `HTTP ${res.status}`, life: 5000 });
    return;
  }
  app.extensionManager.toast.add({ severity: "info", summary: "Restarting ComfyUI...", life: 8000 });
}

function makeButton(help) {
  const button = help.cloneNode(true);
  button.id = BUTTON_ID;
  button.removeAttribute("data-testid");
  button.classList.remove("comfy-help-center-btn");
  button.setAttribute("aria-label", "Restart ComfyUI");
  button.title = "Restart ComfyUI";
  button.querySelector(".sidebar-icon-badge")?.remove();
  const icon = button.querySelector(".side-bar-button-icon");
  if (icon) icon.className = "pi pi-refresh side-bar-button-icon";
  const label = button.querySelector(".side-bar-button-label");
  if (label) label.textContent = "Restart";
  button.addEventListener("click", restart);
  return button;
}

function place() {
  const help = document.querySelector('[data-testid="help-center-button"]');
  if (!help) return;
  const current = document.getElementById(BUTTON_ID);
  // Rebuild when missing or when the sidebar switched size (label shown vs hidden).
  const helpHasLabel = !!help.querySelector(".side-bar-button-label");
  if (current && current.nextElementSibling === help && !!current.querySelector(".side-bar-button-label") === helpHasLabel) return;
  current?.remove();
  help.before(makeButton(help));
}

app.registerExtension({
  name: "retodded.RestartButton",
  setup() {
    place();
    new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
  },
});
