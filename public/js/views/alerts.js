// Owns alert state, title-bar colouring, and the alert popup overlay.
// Call initAlerts() once at startup. handleAlerts() on every MQTT update.
// Flash and ack state are derived entirely from the payload — the client
// never publishes an ack and holds no local ack tracking.

let topbarEl = null;
let badgeEl = null;
let popupEl = null;
let popupListEl = null;

let currentAlerts = [];

function missionTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `T+${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtSystem(system) {
  return system.replace(/_/g, " ").toUpperCase();
}

function updateTopbar() {
  const hasWarn = currentAlerts.some((a) => a.severity === "warning");
  const hasCaut = currentAlerts.some((a) => a.severity === "caution");

  topbarEl.classList.toggle("topbar--warn", hasWarn);
  topbarEl.classList.toggle("topbar--caut", !hasWarn && hasCaut);

  if (hasWarn) {
    badgeEl.textContent = "WARN";
    badgeEl.className = "alert-badge alert-badge--warn";
    badgeEl.hidden = false;
  } else if (hasCaut) {
    badgeEl.textContent = "CAUT";
    badgeEl.className = "alert-badge alert-badge--caut";
    badgeEl.hidden = false;
  } else {
    badgeEl.hidden = true;
    badgeEl.className = "alert-badge";
  }
}

function updateFlash() {
  const unackedWarn = currentAlerts.some((a) => a.severity === "warning" && !a.acknowledged);
  const unackedCaut = currentAlerts.some((a) => a.severity === "caution" && !a.acknowledged);

  // Warning flash takes priority; caution flash only if no unacked warnings.
  topbarEl.classList.toggle("topbar--flashing-warn", unackedWarn);
  topbarEl.classList.toggle("topbar--flashing-caut", !unackedWarn && unackedCaut);
}

function renderList() {
  if (currentAlerts.length === 0) {
    popupListEl.innerHTML = '<div class="alert-popup-empty">NO ACTIVE ALERTS</div>';
    return;
  }

  const severityRank = (a) => (a.severity === "warning" ? 0 : 1);

  // Unacked first (warn before caut, newest first within group), then acked same order.
  const sorted = [...currentAlerts].sort((a, b) => {
    const ackedDiff = (a.acknowledged ? 1 : 0) - (b.acknowledged ? 1 : 0);
    if (ackedDiff !== 0) return ackedDiff;
    const sevDiff = severityRank(a) - severityRank(b);
    if (sevDiff !== 0) return sevDiff;
    return b.timestamp_s - a.timestamp_s;
  });

  popupListEl.innerHTML = sorted.map((al) => {
    const warn = al.severity === "warning";
    const acked = !!al.acknowledged;
    const entryClass = "alert-entry" + (acked ? " alert-entry--acked" : "");
    const badgeClass = "alert-entry-badge " + (acked
      ? "alert-entry-badge--acked"
      : warn ? "alert-entry-badge--warn" : "alert-entry-badge--caut");
    const badgeLabel = (warn ? "WARN" : "CAUT") + (acked ? " ✓" : "");
    return `
      <div class="${entryClass}">
        <span class="${badgeClass}">${badgeLabel}</span>
        <div class="alert-entry-body">
          <div class="alert-entry-system">${fmtSystem(al.system)}</div>
          <div class="alert-entry-msg">${al.message}</div>
        </div>
        <div class="alert-entry-time">${missionTime(al.timestamp_s)}</div>
      </div>`;
  }).join("");
}

function openPopup() {
  renderList();
  popupEl.hidden = false;
}

function closePopup(e) {
  if (e) e.stopPropagation();
  popupEl.hidden = true;
  // No ack side-effect — ack is sim-core's responsibility.
}

export function initAlerts(topbar) {
  topbarEl = topbar;
  badgeEl = topbar.querySelector("#alert-badge");

  topbar.addEventListener("click", openPopup);

  popupEl = document.createElement("div");
  popupEl.className = "alert-popup-backdrop";
  popupEl.hidden = true;
  popupEl.innerHTML = `
    <div class="alert-popup">
      <div class="alert-popup-head">
        <span class="alert-popup-title">ACTIVE ALERTS</span>
        <button class="alert-popup-close">✕</button>
      </div>
      <div class="alert-popup-list"></div>
    </div>`;
  document.body.appendChild(popupEl);

  popupListEl = popupEl.querySelector(".alert-popup-list");
  popupEl.querySelector(".alert-popup-close").addEventListener("click", closePopup);
  popupEl.addEventListener("click", (e) => { if (e.target === popupEl) closePopup(); });
}

export function handleAlerts(alerts) {
  currentAlerts = Array.isArray(alerts) ? alerts : [];

  updateTopbar();
  updateFlash();

  if (!popupEl.hidden) renderList();
}
