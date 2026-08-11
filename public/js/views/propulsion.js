// Propulsion status view — single SVG engine diagram, semicircle gauges,
// vertical throttle bar on the left, larger bottom telemetry.

const MAX_POWER_KW = 500;
const MAX_TEMP_C   = 1000;

// Engine centre-x positions within the SVG viewBox (0 0 520 305)
const ENG = [
  { id: "port",      cx: 90,  label: "PORT" },
  { id: "centre",    cx: 260, label: "CENTRE" },
  { id: "starboard", cx: 430, label: "STARBOARD" },
];
const GAUGE_CY  = 232; // nozzle exit y — gauge centre
const GAUGE_R1  = 52;  // outer arc radius (PWR)
const GAUGE_R2  = 38;  // inner arc radius (TEMP)

let container = null;

// Per-engine SVG refs
const svgMix     = {};
const svgArcPwr  = {};
const svgArcTemp = {};
const svgValPwr  = {};
const svgValTemp = {};

// Left-column DOM refs
let armedDotEl  = null;
let armedLblEl  = null;
let rcsEl       = null;
let dampEl      = null;
let revEl       = null;
let throttleFillEl = null;
let throttleValEl  = null;

// Bottom-row DOM refs
let speedEl = null;
let accelEl = null;
let soiEl   = null;

// ── helpers ───────────────────────────────────────────────────────────────────

function formatSpeed(ms) {
  if (Math.abs(ms) >= 10000) return `${(ms / 1000).toFixed(1)} km/s`;
  return `${Math.round(ms)} m/s`;
}

function formatMix(mix) {
  if (mix <= 0.05) return "ECO";
  if (mix >= 0.95) return "PWR";
  return `${Math.round(mix * 100)}%`;
}

function tempColour(c) {
  if (c >= 800) return "var(--red)";
  if (c >= 600) return "var(--amber)";
  return "var(--green)";
}

// Top-opening semicircle arc path from 0% to p (0..1).
// Fills LEFT → top → RIGHT (CW on screen, sweep=1).
// Low values show a small arc near the left endpoint; high values span the full top.
function arcPath(cx, cy, r, p) {
  if (p <= 0) return "M 0 0";
  const q = Math.min(p, 0.9999);
  // Angle goes from π (left) toward 0 (right) as p increases
  const ex = cx - r * Math.cos(q * Math.PI);
  const ey = cy - r * Math.sin(q * Math.PI);
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

// Full top-semicircle track: left → top → right (CW, sweep=1)
function trackPath(cx, cy, r) {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
}

// ── SVG template ──────────────────────────────────────────────────────────────

function engineGroup({ id, cx, label }) {
  const cy = GAUGE_CY;
  const r1 = GAUGE_R1;
  const r2 = GAUGE_R2;
  // Nozzle bell: body exit cx±36 at y=134, flares to cx±66 at y=232
  const bx = 36; // body half-width
  const nx = 66; // nozzle exit half-width
  const by = 134; // body base / nozzle throat y
  return `
<g id="eng-${id}">
  <text x="${cx}" y="14" text-anchor="middle" class="eng-label">${label}</text>

  <rect x="${cx - bx}" y="22" width="${bx * 2}" height="112" rx="3" class="eng-body"/>
  <line x1="${cx - bx}" y1="38"  x2="${cx + bx}" y2="38"  class="eng-detail"/>
  <line x1="${cx - bx}" y1="${by}" x2="${cx + bx}" y2="${by}" class="eng-detail"/>

  <text id="mix-${id}" x="${cx}" y="90" text-anchor="middle" dominant-baseline="middle" class="eng-mix">—</text>

  <path d="M ${cx - bx},${by}
           C ${cx - bx},${by + 26} ${cx - nx},${by + 68} ${cx - nx},${cy}
           L ${cx + nx},${cy}
           C ${cx + nx},${by + 68} ${cx + bx},${by + 26} ${cx + bx},${by} Z"
        class="eng-nozzle"/>

  <line x1="${cx - 44}" y1="${by + 24}" x2="${cx + 44}" y2="${by + 24}" class="eng-fin"/>
  <line x1="${cx - 57}" y1="${by + 62}" x2="${cx + 57}" y2="${by + 62}" class="eng-fin"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${nx}" ry="5" class="eng-exit"/>

  <path d="${trackPath(cx, cy, r1)}" class="gauge-track gauge-track--outer"/>
  <path id="arc-pwr-${id}"  d="M 0 0" class="gauge-fill-pwr"/>
  <path d="${trackPath(cx, cy, r2)}" class="gauge-track gauge-track--inner"/>
  <path id="arc-temp-${id}" d="M 0 0" class="gauge-fill-temp"/>

  <text x="${cx - 28}" y="${cy + 52}" text-anchor="middle" class="gauge-lbl">PWR</text>
  <text id="val-pwr-${id}"  x="${cx - 28}" y="${cy + 66}" text-anchor="middle" class="gauge-val">—</text>
  <text x="${cx + 28}" y="${cy + 52}" text-anchor="middle" class="gauge-lbl">TEMP</text>
  <text id="val-temp-${id}" x="${cx + 28}" y="${cy + 66}" text-anchor="middle" class="gauge-val">—</text>
</g>`;
}

// ── init ──────────────────────────────────────────────────────────────────────

export function initPropulsion(el) {
  container = el;

  container.innerHTML = `
    <div class="prop-left">
      <div class="prop-armed-row">
        <div class="prop-armed-dot" id="prop-armed-dot"></div>
        <span class="prop-armed-lbl" id="prop-armed-lbl">SAFE</span>
      </div>
      <div class="prop-pills">
        <div class="prop-pill" id="prop-rcs">RCS</div>
        <div class="prop-pill" id="prop-damp">DAMP</div>
        <div class="prop-pill" id="prop-rev">REV</div>
      </div>
      <div class="prop-vthrottle">
        <span class="prop-vthrottle-val" id="prop-throttle-val">—</span>
        <div class="prop-vthrottle-track">
          <div class="prop-vthrottle-fill" id="prop-throttle-fill"></div>
        </div>
        <span class="prop-vthrottle-lbl">THR</span>
      </div>
    </div>

    <div class="prop-main">
      <div class="prop-engine-wrap">
        <svg class="prop-engine-svg"
             viewBox="0 0 520 305"
             xmlns="http://www.w3.org/2000/svg"
             preserveAspectRatio="xMidYMid meet"
             aria-label="Engine schematic">
          ${ENG.map(engineGroup).join("")}
        </svg>
      </div>

      <div class="prop-bottom-row">
        <div class="prop-telem-item">
          <span class="prop-telem-lbl">SPD</span>
          <span class="prop-telem-val" id="prop-speed-val">—</span>
        </div>
        <div class="prop-telem-item">
          <span class="prop-telem-lbl">ACCEL</span>
          <span class="prop-telem-val" id="prop-accel-val">—</span>
        </div>
        <div class="prop-telem-item">
          <span class="prop-telem-lbl">REF</span>
          <span class="prop-telem-val prop-telem-val--ref" id="prop-soi-val">—</span>
        </div>
      </div>
    </div>`;

  // Cache left-column refs
  armedDotEl     = container.querySelector("#prop-armed-dot");
  armedLblEl     = container.querySelector("#prop-armed-lbl");
  rcsEl          = container.querySelector("#prop-rcs");
  dampEl         = container.querySelector("#prop-damp");
  revEl          = container.querySelector("#prop-rev");
  throttleFillEl = container.querySelector("#prop-throttle-fill");
  throttleValEl  = container.querySelector("#prop-throttle-val");

  // Cache bottom refs
  speedEl = container.querySelector("#prop-speed-val");
  accelEl = container.querySelector("#prop-accel-val");
  soiEl   = container.querySelector("#prop-soi-val");

  // Cache per-engine SVG element refs
  ENG.forEach(({ id }) => {
    svgMix[id]     = container.querySelector(`#mix-${id}`);
    svgArcPwr[id]  = container.querySelector(`#arc-pwr-${id}`);
    svgArcTemp[id] = container.querySelector(`#arc-temp-${id}`);
    svgValPwr[id]  = container.querySelector(`#val-pwr-${id}`);
    svgValTemp[id] = container.querySelector(`#val-temp-${id}`);
  });
}

// ── update ────────────────────────────────────────────────────────────────────

export function handlePropulsionState(data) {
  if (!container) return;

  // Armed
  armedDotEl.classList.toggle("prop-armed-dot--armed", data.armed);
  armedLblEl.textContent = data.armed ? "ARMED" : "SAFE";
  armedLblEl.classList.toggle("prop-armed-lbl--armed", data.armed);

  // Toggle pills
  rcsEl.classList.toggle("prop-pill--on",  data.rcs_enabled);
  dampEl.classList.toggle("prop-pill--on", data.dampeners_enabled);
  revEl.classList.toggle("prop-pill--on",  data.reverse_enabled);

  // Vertical throttle
  const pct = Math.round(data.throttle * 100);
  throttleFillEl.style.height = `${pct}%`;
  throttleValEl.textContent   = `${pct}%`;

  // Bottom telemetry
  speedEl.textContent = formatSpeed(data.velocity_ms);
  accelEl.textContent = `${data.acceleration_ms2.toFixed(1)} m/s²`;
  soiEl.textContent   = data.soi_body;

  // Per-engine
  const mixLabel = formatMix(data.mix);
  data.engines.forEach((eng) => {
    const { id } = eng;
    if (!svgMix[id]) return;

    svgMix[id].textContent = mixLabel;

    // Power arc
    const pwrFrac = Math.min(1, eng.power_kw / MAX_POWER_KW);
    svgArcPwr[id].setAttribute("d", arcPath(ENG.find(e => e.id === id).cx, GAUGE_CY, GAUGE_R1, pwrFrac));
    svgValPwr[id].textContent = `${eng.power_kw} kW`;

    // Temp arc
    const tmpFrac = Math.min(1, eng.temp_c / MAX_TEMP_C);
    const col = tempColour(eng.temp_c);
    svgArcTemp[id].setAttribute("d", arcPath(ENG.find(e => e.id === id).cx, GAUGE_CY, GAUGE_R2, tmpFrac));
    svgArcTemp[id].style.stroke = col;
    svgValTemp[id].textContent = `${eng.temp_c}°C`;
    svgValTemp[id].style.fill = col;
  });
}
