// Engineering / Master Systems Display view.
// Wildcard sub: coldorbit/output/engineering/+/state
// Each arriving message calls handleEngineeringState(systemId, data) and
// triggers a targeted DOM update — no full re-render.

const SYSTEMS = {
  weapons:   { label: "WEAPONS",   powerLabel: true  },
  engines:   { label: "ENGINES",   powerLabel: true  },
  ftl:       { label: "FTL DRIVE", powerLabel: true  },
  reactor:   { label: "REACTOR",   powerLabel: false },
  utility_1: { label: "UTIL 1",    powerLabel: true  },
  utility_2: { label: "UTIL 2",    powerLabel: true  },
  utility_3: { label: "UTIL 3",    powerLabel: true  },
  utility_4: { label: "UTIL 4",    powerLabel: true  },
  hull:      { label: "HULL",      powerLabel: false },
};

const MOCK_DAMAGE_EFFECTS = {
  weapons: [
    "MOCK: Fore cannon fire rate reduced by 35%",
    "MOCK: Targeting lock time increased by 2.0s",
    "MOCK: Volley spread increased 15°",
  ],
  engines: [
    "MOCK: Max thrust reduced by 30%",
    "MOCK: Overheat threshold lowered to 600°C",
    "MOCK: Emergency boost unavailable",
  ],
  ftl: [
    "MOCK: Jump charge time increased by 40%",
    "MOCK: Maximum jump range reduced by 50%",
    "MOCK: Cooldown extended to 180s",
  ],
  reactor: [
    "MOCK: Total power budget reduced by 25%",
    "MOCK: Power fluctuations every 30–90s",
    "MOCK: Emergency shutdown possible at < 15%",
  ],
  utility_1: [
    "MOCK: Fore-port hardpoint offline",
    "MOCK: Mounted module non-functional",
  ],
  utility_2: [
    "MOCK: Fore-starboard hardpoint offline",
    "MOCK: Mounted module non-functional",
  ],
  utility_3: [
    "MOCK: Aft-port hardpoint degraded",
    "MOCK: Module power draw capped at 60%",
  ],
  utility_4: [
    "MOCK: Aft-starboard hardpoint degraded",
    "MOCK: Module power draw capped at 60%",
  ],
  hull: [
    "MOCK: Structural integrity compromised",
    "MOCK: Breach detected — sections 4-F, 5-G",
    "MOCK: Emergency pressure doors sealed",
  ],
};

// state[id] = { health, power_allocated, power_unit, power_max, disabled, repair_queue_position }
const state = {};

// Canonical queue from coldorbit/output/repair/queue — full array, authoritative.
let queueState = [];

// SVG <g data-system="..."> refs
const svgRefs = {};

// Mini bar max width in SVG units
const BAR_MAX = 38;

let detailPanel = null;
let queueList = null;
let activeDetail = null;

// ── colour helpers ──────────────────────────────────────────────────────────

function healthColor(id) {
  const s = state[id];
  if (!s) return "var(--dim)";
  if (s.disabled || s.health === 0) return "var(--red)";
  if (s.health < 30) return "var(--red)";
  if (s.health <= 70) return "var(--amber)";
  return "var(--green)";
}

function healthPct(id) {
  const s = state[id];
  if (!s || s.disabled) return 0;
  return Math.max(0, Math.min(100, s.health));
}

function healthLabel(id) {
  const s = state[id];
  if (!s) return "NO DATA";
  if (s.disabled) return "DISABLED";
  return `${s.health}%`;
}

// ── init ────────────────────────────────────────────────────────────────────

export function initEngineering(root) {
  if (!root) return;

  Object.keys(SYSTEMS).forEach((id) => {
    svgRefs[id] = root.querySelector(`[data-system="${id}"]`);
  });

  detailPanel = root.querySelector(".eng-detail");
  queueList   = root.querySelector(".eng-queue-list");

  Object.keys(SYSTEMS).forEach((id) => {
    const el = svgRefs[id];
    if (!el) return;
    el.addEventListener("click", () => toggleDetail(id));
    el.style.cursor = "pointer";
  });

  // Tap the backdrop (outside the card) to close
  detailPanel.addEventListener("click", (e) => {
    if (e.target === detailPanel) closeDetail();
  });

  Object.keys(SYSTEMS).forEach(renderSystem);
  renderQueue();
}

// ── MQTT handler (called from app.js) ───────────────────────────────────────

export function handleEngineeringState(systemId, data) {
  if (!(systemId in SYSTEMS)) return;
  state[systemId] = data;
  renderSystem(systemId);
  if (activeDetail === systemId) renderDetail(systemId);
}

export function handleRepairQueue(data) {
  queueState = Array.isArray(data) ? data : [];
  renderQueue();
  if (activeDetail) renderDetail(activeDetail);
}

// ── render helpers ───────────────────────────────────────────────────────────

function renderSystem(id) {
  const el = svgRefs[id];
  if (!el) return;

  const color = healthColor(id);
  const s = state[id];

  // Color the visual fill(s) within this group
  el.querySelectorAll(".sys-fill").forEach((shape) => {
    shape.setAttribute("stroke", color);
    shape.setAttribute("fill", color);
    shape.setAttribute("fill-opacity", s ? "0.12" : "0.04");
  });

  // Hull outline gets special treatment — only stroke, fill stays transparent
  if (id === "hull") {
    el.querySelectorAll(".hull-line").forEach((shape) => {
      shape.setAttribute("stroke", color);
    });
  }

  // Mini health bar fill
  const barFill = el.querySelector(".sys-bar-fill");
  if (barFill) {
    const w = Math.round((healthPct(id) / 100) * BAR_MAX);
    barFill.setAttribute("width", String(w));
    barFill.setAttribute("fill", color);
  }

  // Mini label text (health %)
  const healthTxt = el.querySelector(".sys-health-text");
  if (healthTxt) healthTxt.textContent = healthLabel(id);

  // Disabled flash class on the group
  el.classList.toggle("sys-disabled", !!(s && s.disabled));
}

function formatEta(seconds) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function healthColorFromHealth(health) {
  if (health === 0) return "var(--red)";
  if (health < 30) return "var(--red)";
  if (health <= 70) return "var(--amber)";
  return "var(--green)";
}

function statusBadgeHtml(status) {
  if (status === "in_progress") return '<span class="eng-queue-badge eng-queue-badge--active">IN PROGRESS</span>';
  if (status === "blocked")     return '<span class="eng-queue-badge eng-queue-badge--blocked">BLOCKED</span>';
  return '<span class="eng-queue-badge eng-queue-badge--queued">QUEUED</span>';
}

function renderQueue() {
  if (!queueList) return;

  if (queueState.length === 0) {
    queueList.innerHTML = '<div class="eng-queue-nominal">ALL SYSTEMS<br>NOMINAL</div>';
    return;
  }

  queueList.innerHTML = queueState.map((entry, i) => {
    const sys = SYSTEMS[entry.system];
    const label = sys ? sys.label : entry.system.replace(/_/g, " ").toUpperCase();
    const color = healthColorFromHealth(entry.health);
    return `<div class="eng-queue-item">
      <div class="eng-queue-main">
        <span class="eng-queue-pos" style="color:${color}">${i + 1}</span>
        <span class="eng-queue-name" style="color:${color}">${label}</span>
        <span class="eng-queue-eta">${formatEta(entry.repair_eta_seconds)}</span>
      </div>
      <div class="eng-queue-sub">${statusBadgeHtml(entry.status)}</div>
    </div>`;
  }).join('<div class="eng-queue-divider"></div>');
}

// ── detail panel ─────────────────────────────────────────────────────────────

function toggleDetail(id) {
  if (activeDetail === id) closeDetail();
  else openDetail(id);
}

function openDetail(id) {
  activeDetail = id;
  renderDetail(id);
  detailPanel.removeAttribute("hidden");
}

function closeDetail() {
  activeDetail = null;
  detailPanel.setAttribute("hidden", "");
}

function renderDetail(id) {
  if (!detailPanel) return;

  const sys  = SYSTEMS[id];
  const s    = state[id];
  const color = healthColor(id);
  const pct  = healthPct(id);

  let powerHtml = "";
  if (sys.powerLabel && s && s.power_allocated != null) {
    const powerPct = Math.round((s.power_allocated / s.power_max) * 100);
    powerHtml = `
      <div class="eng-det-row">
        <span class="eng-det-lbl">POWER</span>
        <span class="eng-det-val" style="color:var(--blue)">${s.power_allocated} ${s.power_unit || "kW"} / ${s.power_max} ${s.power_unit || "kW"}</span>
      </div>
      <div class="eng-det-barwrap">
        <div class="eng-det-barfill" style="width:${powerPct}%;background:var(--blue)"></div>
      </div>`;
  }

  const queueEntry = queueState.find((e) => e.system === id);
  const queuePos = queueEntry ? `#${queueState.indexOf(queueEntry) + 1}` : "NOT IN QUEUE";
  const repairEta = queueEntry ? formatEta(queueEntry.repair_eta_seconds) : "—";
  const queueStatusHtml = queueEntry
    ? `<div>${statusBadgeHtml(queueEntry.status)}</div>`
    : "";

  const effects = MOCK_DAMAGE_EFFECTS[id] || [];
  const effectsHtml = effects.length
    ? `<div class="eng-det-section-head">DAMAGE EFFECTS</div>
       ${effects.map((e) => `<div class="eng-det-effect">${e}</div>`).join("")}`
    : "";

  detailPanel.innerHTML = `
    <div class="eng-detail-card">
      <div class="eng-det-head">
        <span class="eng-det-title" style="color:${color}">${sys.label}</span>
        <button class="eng-det-close" aria-label="Close">✕</button>
      </div>
      <div class="eng-det-row">
        <span class="eng-det-lbl">HEALTH</span>
        <span class="eng-det-val" style="color:${color}">${healthLabel(id)}</span>
      </div>
      <div class="eng-det-barwrap">
        <div class="eng-det-barfill" style="width:${pct}%;background:${color}"></div>
      </div>
      ${powerHtml}
      ${effectsHtml}
      <div class="eng-det-meta">
        <div>REPAIR QUEUE: <span style="color:${color}">${queuePos}</span></div>
        ${queueStatusHtml}
        <div>ETA: <span style="color:var(--dim)">${repairEta}</span></div>
      </div>
    </div>`;

  detailPanel.querySelector(".eng-det-close")
    .addEventListener("click", closeDetail);
}
