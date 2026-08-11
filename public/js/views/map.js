// Map status view — Drift starmap + per-system planet view.
// Read-only: all selection happens on the physical FTL panel; this view just
// renders whatever coldorbit/output/ftl/target and .../ftl/system say.
//
// Two sub-modes, swapped instantly (no animation):
//   - starmap  — all 26 systems, reticule on the targeted system
//   - system   — parent star + planet row, reticule on the targeted planet

// ── Static lore data ─────────────────────────────────────────────────────────
// The 26 Drift systems. Positions are canonical, extracted from
// drift_star_map_v2.svg (viewBox 0 0 680 640) — they will never change.
// `kind` selects the visual treatment; `deco` adds per-system flourishes
// reproduced from the original map (dust discs, flare spikes, rings…).

const SYSTEMS = [
  { id: "A", name: "Aurivane",  kind: "b-type",      x: 90,  y: 150, labelY: 184 },
  { id: "B", name: "Belkarra",  kind: "binary",      x: 240, y: 95,  labelY: 114 },
  { id: "C", name: "Cathrax",   kind: "m-type",      x: 420, y: 80,  labelY: 102, deco: "flare" },
  { id: "D", name: "Duskane",   kind: "red-giant",   x: 580, y: 160, labelY: 196 },
  { id: "E", name: "Eshalon",   kind: "g-type",      x: 130, y: 290, labelY: 315 },
  { id: "F", name: "Favrenn",   kind: "f-type",      x: 340, y: 170, labelY: 195, deco: "oblate" },
  { id: "G", name: "Gethryn",   kind: "white-dwarf", x: 500, y: 230, labelY: 250 },
  { id: "H", name: "Hessarin",  kind: "k-type",      x: 610, y: 340, labelY: 364, deco: "disc" },
  { id: "I", name: "Ivrenna",   kind: "m-type",      x: 70,  y: 400, labelY: 422 },
  { id: "J", name: "Jovendra",  kind: "a-type",      x: 260, y: 250, labelY: 277 },
  { id: "K", name: "Kerath",    kind: "k-type",      x: 390, y: 300, labelY: 323, deco: "ring" },
  { id: "L", name: "Loreth",    kind: "brown-dwarf", x: 540, y: 120, labelY: 137 },
  { id: "M", name: "Mireth",    kind: "k-type",      x: 600, y: 470, labelY: 492, deco: "green-ring" },
  { id: "N", name: "Nyxaros",   kind: "pulsar",      x: 100, y: 500, labelY: 530 },
  { id: "O", name: "Osmerin",   kind: "f-type",      x: 220, y: 380, labelY: 405 },
  { id: "P", name: "Perlan",    kind: "m-type",      x: 350, y: 430, labelY: 457, deco: "halo" },
  { id: "Q", name: "Quorven",   kind: "k-type",      x: 480, y: 380, labelY: 406 },
  { id: "R", name: "Rovash",    kind: "m-type",      x: 590, y: 540, labelY: 562, deco: "flare" },
  { id: "S", name: "Savarin",   kind: "g-type",      x: 160, y: 540, labelY: 565, deco: "disc" },
  { id: "T", name: "Threnval",  kind: "a-type",      x: 300, y: 320, labelY: 347, deco: "nebula" },
  { id: "U", name: "Undrasi",   kind: "m-type",      x: 440, y: 510, labelY: 532 },
  { id: "V", name: "Vantheris", kind: "a-type",      x: 75,  y: 240, labelY: 269 },
  { id: "W", name: "Wyvane",    kind: "b-type",      x: 520, y: 470, labelY: 498 },
  { id: "X", name: "Xelgrave",  kind: "black-hole",  x: 380, y: 540, labelY: 563 },
  { id: "Y", name: "Yrendal",   kind: "m-deep",      x: 250, y: 460, labelY: 479 },
  { id: "Z", name: "Zerath",    kind: "k-type",      x: 470, y: 90,  labelY: 116 },
];

// Background starfield dots — decorative, from the original map.
const FIELD_STARS = [
  [70, 60, 1, 0.5],   [250, 65, 1.3, 0.35], [410, 50, 1, 0.5],   [560, 60, 1.2, 0.4],
  [150, 150, 1, 0.45],[280, 220, 1.3, 0.3], [430, 160, 1, 0.5],  [600, 150, 1.1, 0.4],
  [110, 255, 1.2, 0.4],[500, 250, 1, 0.5],  [620, 270, 1.3, 0.3],[140, 330, 1, 0.5],
  [380, 350, 1.2, 0.35],[540, 340, 1, 0.45],[300, 410, 1.3, 0.3],[460, 430, 1, 0.5],
  [610, 410, 1.1, 0.4],[60, 500, 1, 0.5],   [400, 480, 1.2, 0.35],[550, 490, 1, 0.45],
];

// ── Star icon rendering ──────────────────────────────────────────────────────
// Panel-aesthetic translation of the original saturated palette:
//   hot (B/A)      → white core, faint blue halo
//   warm (F)       → warm white
//   mid (G/K)      → amber
//   cool (M)       → dim red
//   exotics        → distinctive shapes per the original map

function starIcon(sys, s = 1) {
  const { x, y, kind, deco } = sys;
  const parts = [];

  switch (kind) {
    case "b-type":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${22 * s}" class="ms-halo-blue"/>`,
        `<circle cx="${x}" cy="${y}" r="${16 * s}" class="ms-glow-blue"/>`,
        `<circle cx="${x}" cy="${y}" r="${9 * s}" class="ms-hot"/>`,
      );
      break;
    case "a-type":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${15 * s}" class="ms-glow-white"/>`,
        `<circle cx="${x}" cy="${y}" r="${8 * s}" class="ms-hot"/>`,
      );
      break;
    case "f-type":
      parts.push(`<circle cx="${x}" cy="${y}" r="${13 * s}" class="ms-glow-warm"/>`);
      if (deco === "oblate") {
        parts.push(`<ellipse cx="${x}" cy="${y}" rx="${9 * s}" ry="${6 * s}" class="ms-warm"/>`);
      } else {
        parts.push(`<circle cx="${x}" cy="${y}" r="${7 * s}" class="ms-warm"/>`);
      }
      break;
    case "g-type":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${13 * s}" class="ms-glow-amber"/>`,
        `<circle cx="${x}" cy="${y}" r="${7 * s}" class="ms-amber"/>`,
      );
      break;
    case "k-type":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${12 * s}" class="ms-glow-amber"/>`,
        `<circle cx="${x}" cy="${y}" r="${6 * s}" class="ms-amber-deep"/>`,
      );
      break;
    case "m-type":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${10 * s}" class="ms-glow-red"/>`,
        `<circle cx="${x}" cy="${y}" r="${5 * s}" class="ms-red"/>`,
      );
      break;
    case "m-deep":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${7 * s}" class="ms-glow-red"/>`,
        `<circle cx="${x}" cy="${y}" r="${4 * s}" class="ms-red-deep"/>`,
      );
      break;
    case "binary":
      parts.push(
        `<ellipse cx="${x}" cy="${y}" rx="${15 * s}" ry="${7 * s}" class="ms-orbit"/>`,
        `<circle cx="${x - 7 * s}" cy="${y}" r="${5 * s}" class="ms-amber"/>`,
        `<circle cx="${x + 7 * s}" cy="${y}" r="${5 * s}" class="ms-amber-deep"/>`,
      );
      break;
    case "brown-dwarf":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${6 * s}" class="ms-ring-dim"/>`,
        `<circle cx="${x}" cy="${y}" r="${3 * s}" class="ms-brown"/>`,
      );
      break;
    case "white-dwarf":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${7 * s}" class="ms-ring-dim"/>`,
        `<circle cx="${x}" cy="${y}" r="${3 * s}" class="ms-hot"/>`,
      );
      break;
    case "red-giant":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${24 * s}" class="ms-glow-red"/>`,
        `<circle cx="${x}" cy="${y}" r="${15 * s}" class="ms-red-giant"/>`,
      );
      break;
    case "pulsar":
      parts.push(
        `<line x1="${x}" y1="${y}" x2="${x + 18 * s}" y2="${y - 18 * s}" class="ms-beam"/>`,
        `<line x1="${x}" y1="${y}" x2="${x - 18 * s}" y2="${y + 18 * s}" class="ms-beam"/>`,
        `<circle cx="${x}" cy="${y}" r="${8 * s}" class="ms-glow-blue"/>`,
        `<circle cx="${x}" cy="${y}" r="${4 * s}" class="ms-hot"/>`,
      );
      break;
    case "black-hole":
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${11 * s}" class="ms-accretion"/>`,
        `<circle cx="${x}" cy="${y}" r="${6 * s}" class="ms-void"/>`,
      );
      break;
  }

  switch (deco) {
    case "flare":
      parts.unshift(
        `<line x1="${x + 7 * s}" y1="${y - 7 * s}" x2="${x + 11 * s}" y2="${y - 11 * s}" class="ms-flare"/>`,
        `<line x1="${x - 7 * s}" y1="${y - 7 * s}" x2="${x - 11 * s}" y2="${y - 11 * s}" class="ms-flare"/>`,
        `<line x1="${x + 7 * s}" y1="${y + 7 * s}" x2="${x + 11 * s}" y2="${y + 11 * s}" class="ms-flare"/>`,
        `<line x1="${x - 7 * s}" y1="${y + 7 * s}" x2="${x - 11 * s}" y2="${y + 11 * s}" class="ms-flare"/>`,
      );
      break;
    case "disc":
      parts.unshift(`<ellipse cx="${x}" cy="${y}" rx="${16 * s}" ry="${9 * s}" class="ms-disc"/>`);
      break;
    case "nebula":
      parts.unshift(`<ellipse cx="${x}" cy="${y}" rx="${22 * s}" ry="${15 * s}" class="ms-nebula"/>`);
      break;
    case "ring":
      parts.push(`<circle cx="${x}" cy="${y}" r="${11 * s}" class="ms-ring-amber"/>`);
      break;
    case "green-ring":
      parts.push(`<circle cx="${x}" cy="${y}" r="${10 * s}" class="ms-ring-green"/>`);
      break;
    case "halo":
      parts.unshift(`<circle cx="${x}" cy="${y}" r="${15 * s}" class="ms-glow-red-faint"/>`);
      break;
  }

  return parts.join("\n");
}

// Reticule: four short diagonal lines radiating outward from a central gap (×).
function reticule(x, y, gap, len) {
  const o = gap, e = gap + len;
  const d = (v) => v / Math.SQRT2;
  return `<g class="map-reticule">
    <line x1="${x + d(o)}" y1="${y - d(o)}" x2="${x + d(e)}" y2="${y - d(e)}"/>
    <line x1="${x - d(o)}" y1="${y - d(o)}" x2="${x - d(e)}" y2="${y - d(e)}"/>
    <line x1="${x + d(o)}" y1="${y + d(o)}" x2="${x + d(e)}" y2="${y + d(e)}"/>
    <line x1="${x - d(o)}" y1="${y + d(o)}" x2="${x - d(e)}" y2="${y + d(e)}"/>
  </g>`;
}

// ── Starmap SVG (exported so the preview page can reuse it) ─────────────────

export function buildStarmapSvg() {
  const field = FIELD_STARS
    .map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" class="ms-field" opacity="${o}"/>`)
    .join("\n");

  const systems = SYSTEMS.map((sys) => `
    <g class="map-system" data-system="${sys.id}">
      ${starIcon(sys)}
      <text x="${sys.x}" y="${sys.labelY}" class="map-sys-label">${sys.id}</text>
    </g>`).join("\n");

  return `<svg class="map-starmap-svg" viewBox="0 0 680 640"
     xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${field}
    ${systems}
    <g id="map-reticule-slot"></g>
  </svg>`;
}

// ── DOM refs / state ─────────────────────────────────────────────────────────

let container = null;
let detailsEl = null;
let starmapWrapEl = null;
let systemWrapEl = null;
let reticuleSlotEl = null;

let lastTarget = { type: "none" };
let lastSystem = { system_id: null };

// ── Details panel ────────────────────────────────────────────────────────────

function formatSpool(s) {
  if (typeof s !== "number" || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  return `${m}m ${s - m * 60}s`;
}

function row(label, value) {
  return `<div class="map-field">
    <div class="map-field-lbl">${label}</div>
    <div class="map-field-val">${value}</div>
  </div>`;
}

function renderDetails() {
  const t = lastTarget;
  if (!t || t.type === "none") {
    detailsEl.innerHTML = `<div class="map-no-target">NO TARGET SELECTED</div>`;
    return;
  }
  const rows = [];
  rows.push(`<div class="map-target-name">${t.name ?? "—"}</div>`);
  rows.push(row("TYPE", t.star_type ?? "—"));
  if (t.type === "star")   rows.push(row("PLANETS", t.planet_count ?? "—"));
  if (t.type === "planet") rows.push(row("SYSTEM", t.system_name ?? "—"));
  rows.push(row("DISTANCE", typeof t.distance_au === "number" ? `${t.distance_au.toFixed(1)} AU` : "—"));
  rows.push(row("SPOOL", formatSpool(t.spool_time_s)));
  detailsEl.innerHTML = rows.join("\n");
}

// ── Map area ─────────────────────────────────────────────────────────────────

function renderReticule() {
  const t = lastTarget;
  if (!t || t.type === "none" || !t.system_id) {
    reticuleSlotEl.innerHTML = "";
    return;
  }
  const sys = SYSTEMS.find((s) => s.id === t.system_id);
  if (!sys) {
    reticuleSlotEl.innerHTML = "";
    return;
  }
  reticuleSlotEl.innerHTML = reticule(sys.x, sys.y, 14, 12);
}

function renderSystemView() {
  const sysData = lastSystem;
  const star = SYSTEMS.find((s) => s.id === sysData.system_id);
  const planets = Array.isArray(sysData.planets) ? sysData.planets : [];

  const W = 680, H = 300, cy = H / 2 - 20;
  const starX = 90;
  const parts = [];

  const starDef = star
    ? { ...star, x: starX, y: cy }
    : { id: "?", name: sysData.star_name ?? "?", kind: "g-type", x: starX, y: cy };
  parts.push(starIcon(starDef, 1.4));
  parts.push(`<text x="${starX}" y="${cy + 52}" class="map-sysview-label map-sysview-label--star">${sysData.star_name ?? starDef.name ?? "—"}</text>`);

  if (planets.length === 0) {
    parts.push(`<text x="${(W + starX) / 2}" y="${cy + 5}" class="map-no-planets">NO PLANETS</text>`);
  } else {
    const left = starX + 110;
    const right = W - 60;
    const step = planets.length > 1 ? (right - left) / (planets.length - 1) : 0;
    planets.forEach((p, i) => {
      const px = planets.length > 1 ? left + step * i : (left + right) / 2;
      parts.push(`<circle cx="${px}" cy="${cy}" r="8" class="map-planet"/>`);
      parts.push(`<text x="${px}" y="${cy + 32}" class="map-sysview-label">${p.name}</text>`);
      if (lastTarget.type === "planet" && lastTarget.name === p.name) {
        parts.push(reticule(px, cy, 13, 11));
      }
    });
  }

  systemWrapEl.innerHTML = `<svg class="map-system-svg" viewBox="0 0 ${W} ${H}"
     xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${parts.join("\n")}
  </svg>`;
}

function renderMapArea() {
  const systemActive = lastSystem && lastSystem.system_id != null;
  starmapWrapEl.hidden = systemActive;
  systemWrapEl.hidden = !systemActive;
  if (systemActive) {
    renderSystemView();
  } else {
    systemWrapEl.innerHTML = "";
    renderReticule();
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function initMap(el) {
  container = el;
  container.innerHTML = `
    <div class="map-details" id="map-details"></div>
    <div class="map-area">
      <div class="map-starmap-wrap" id="map-starmap-wrap">${buildStarmapSvg()}</div>
      <div class="map-system-wrap" id="map-system-wrap" hidden></div>
    </div>`;
  detailsEl = container.querySelector("#map-details");
  starmapWrapEl = container.querySelector("#map-starmap-wrap");
  systemWrapEl = container.querySelector("#map-system-wrap");
  reticuleSlotEl = container.querySelector("#map-reticule-slot");
  renderDetails();
  renderMapArea();
}

export function handleFtlTarget(data) {
  if (!data || typeof data.type !== "string") return;
  lastTarget = data;
  renderDetails();
  renderMapArea();
}

export function handleFtlSystem(data) {
  if (!data || typeof data !== "object") return;
  lastSystem = data;
  renderMapArea();
}
