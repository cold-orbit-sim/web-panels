// FTL Drive status view.
// Layout: armed row → 3-col mid (left panel | SVG | right panel) → status/bar → power row.

const PHASE_LABELS = {
  idle:     'STANDBY',
  charging: 'CHARGING',
  ready:    'JUMP READY',
  jumping:  'JUMPING',
  cooldown: 'COOLDOWN',
};

// ── DOM refs ─────────────────────────────────────────────────────────────────

let container    = null;
let armedDotEl   = null;
let armedLblEl   = null;
let svgEl        = null;
let statusLabelEl = null;
let chargeBarEl  = null;
let chargePctEl  = null;
let destEl       = null;
let rangeEl      = null;
let lagPanelEl   = null;
let lagEl        = null;
let powerBarEl   = null;
let powerValEl   = null;

// ── SVG construction ─────────────────────────────────────────────────────────

function genTicks() {
  return Array.from({ length: 24 }, (_, i) => {
    const major = i % 3 === 0;
    const y1    = major ? 22 : 25;
    return `<line class="ftl-tick${major ? ' ftl-tick--major' : ''}" x1="150" y1="${y1}" x2="150" y2="32" transform="rotate(${i * 15} 150 150)"/>`;
  }).join('');
}

function genSpokes() {
  return Array.from({ length: 8 }, (_, i) =>
    `<line class="ftl-spoke" x1="150" y1="82" x2="150" y2="122" transform="rotate(${i * 45} 150 150)"/>`
  ).join('');
}

function buildSvg() {
  return `<svg id="ftl-svg" class="ftl-svg ftl-idle" viewBox="0 0 300 300"
     xmlns="http://www.w3.org/2000/svg"
     preserveAspectRatio="xMidYMid meet">
  <defs>
    <radialGradient id="ftl-glow-grad" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#ffb000" stop-opacity="1"/>
      <stop offset="40%"  stop-color="#ffb000" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffb000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ftl-bg-grad" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#c87800" stop-opacity="0.12"/>
      <stop offset="55%"  stop-color="#0820cc" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <filter id="ftl-blur-sm" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3.5"/>
    </filter>
  </defs>

  <circle class="ftl-bg-glow" cx="150" cy="150" r="148" fill="url(#ftl-bg-grad)"/>

  <g class="ftl-ring-cw">
    <circle class="ftl-ring-seg ftl-ring-seg--outer"
            cx="150" cy="150" r="138" fill="none"
            stroke="var(--amber)" stroke-width="3"
            pathLength="1000" stroke-dasharray="50 12.5"/>
  </g>

  <g class="ftl-tick-ring">${genTicks()}</g>

  <g class="ftl-ring-ccw">
    <circle class="ftl-ring-seg ftl-ring-seg--coil"
            cx="150" cy="150" r="96" fill="none"
            stroke="var(--blue)" stroke-width="5"
            pathLength="1000" stroke-dasharray="130 37"/>
  </g>

  <g class="ftl-ring-cw-inner">
    <circle class="ftl-ring-seg ftl-ring-seg--inner"
            cx="150" cy="150" r="70" fill="none"
            stroke="var(--amber)" stroke-width="2.5"
            pathLength="1000" stroke-dasharray="100 25"/>
  </g>

  <g class="ftl-spokes">${genSpokes()}</g>

  <circle class="ftl-core-glow" cx="150" cy="150" r="50"
          fill="url(#ftl-glow-grad)" filter="url(#ftl-blur-sm)"/>
  <circle class="ftl-core-ring" cx="150" cy="150" r="22"
          fill="none" stroke="var(--amber)" stroke-width="2"/>
  <circle class="ftl-core-center" cx="150" cy="150" r="8" fill="var(--amber)"/>

  <circle class="ftl-jump-flash" cx="150" cy="150" r="150"
          fill="white" opacity="0" pointer-events="none"/>
</svg>`;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatLag(lag) {
  if (lag == null) return '—';
  return `+${Number(lag).toFixed(1)}s`;
}

// ── Phase → visual parameters ─────────────────────────────────────────────────

function computeSpinDurs(phase, progress) {
  const ratio = phase === 'ready' || phase === 'jumping' ? 1
               : phase === 'charging' || phase === 'cooldown' ? progress
               : 0;
  return {
    cw:    25    - ratio * 23,
    ccw:   18    - ratio * 16.6,
    inner: 42    - ratio * 38.6,
  };
}

function computeGlow(phase, progress) {
  if (phase === 'jumping') return 1.0;
  if (phase === 'ready')   return 0.9;
  const p = (phase === 'charging' || phase === 'cooldown') ? progress : 0;
  return 0.18 + p * 0.72;
}

function computePulseDur(phase, progress) {
  if (phase === 'jumping') return 0.3;
  if (phase === 'ready')   return 0.7;
  const p = (phase === 'charging' || phase === 'cooldown') ? progress : 0;
  return 3.0 - p * 2.3;
}

// ── init ──────────────────────────────────────────────────────────────────────

export function initFtl(el) {
  container = el;

  container.innerHTML = `
<div class="ftl-inner">

  <div class="ftl-armed-row">
    <div class="ftl-armed-dot" id="ftl-armed-dot"></div>
    <span class="ftl-armed-lbl" id="ftl-armed-lbl">DISARMED</span>
  </div>

  <div class="ftl-mid-row">

    <!-- Left panel: destination + range -->
    <div class="ftl-side-panel ftl-left-panel">
      <div class="ftl-side-lbl">DESTINATION</div>
      <div class="ftl-side-val ftl-side-val--dest" id="ftl-dest">—</div>
      <div class="ftl-side-lbl ftl-side-lbl--lower">RANGE</div>
      <div class="ftl-side-val" id="ftl-range">—</div>
    </div>

    <!-- Centre: SVG drive graphic -->
    <div class="ftl-graphic-wrap">
      ${buildSvg()}
    </div>

    <!-- Right panel: signal lag -->
    <div class="ftl-side-panel ftl-right-panel" id="ftl-lag-panel">
      <div class="ftl-side-lbl">SIGNAL LAG</div>
      <div class="ftl-lag-val" id="ftl-lag">—</div>
    </div>

  </div>

  <div class="ftl-status-area">
    <div class="ftl-status-label ftl-status-label--idle" id="ftl-status-label">STANDBY</div>
    <div class="ftl-charge-row">
      <div class="ftl-charge-bar-track">
        <div class="ftl-charge-bar-fill ftl-charge-bar--dim" id="ftl-charge-bar" style="width:0%"></div>
      </div>
      <span class="ftl-charge-pct" id="ftl-charge-pct">—</span>
    </div>
  </div>

  <div class="ftl-power-row">
    <span class="ftl-power-lbl">FTL POWER</span>
    <div class="ftl-power-bar-track">
      <div class="ftl-power-bar-fill" id="ftl-power-bar"></div>
    </div>
    <span class="ftl-power-val" id="ftl-power-val">—</span>
  </div>

</div>`;

  armedDotEl    = container.querySelector('#ftl-armed-dot');
  armedLblEl    = container.querySelector('#ftl-armed-lbl');
  svgEl         = container.querySelector('#ftl-svg');
  statusLabelEl = container.querySelector('#ftl-status-label');
  chargeBarEl   = container.querySelector('#ftl-charge-bar');
  chargePctEl   = container.querySelector('#ftl-charge-pct');
  destEl        = container.querySelector('#ftl-dest');
  rangeEl       = container.querySelector('#ftl-range');
  lagPanelEl    = container.querySelector('#ftl-lag-panel');
  lagEl         = container.querySelector('#ftl-lag');
  powerBarEl    = container.querySelector('#ftl-power-bar');
  powerValEl    = container.querySelector('#ftl-power-val');
}

// ── update ────────────────────────────────────────────────────────────────────

export function handleFtlState(data) {
  if (!container) return;

  const {
    armed        = false,
    phase        = 'idle',
    progress     = 0,
    destination  = null,
    range_au     = null,
    signal_lag_s = null,
    power_kw     = null,
    power_max_kw = null,
  } = data;

  // Armed indicator
  armedDotEl.classList.toggle('ftl-armed-dot--armed', armed);
  armedLblEl.textContent = armed ? 'ARMED' : 'DISARMED';
  armedLblEl.classList.toggle('ftl-armed-lbl--armed', armed);

  // SVG phase class
  svgEl.classList.remove('ftl-idle', 'ftl-charging', 'ftl-ready', 'ftl-jumping', 'ftl-cooldown');
  svgEl.classList.add(`ftl-${phase}`);

  // CSS variables on the SVG
  const spin     = computeSpinDurs(phase, progress);
  const glow     = computeGlow(phase, progress);
  const pulseDur = computePulseDur(phase, progress);
  svgEl.style.setProperty('--ftl-progress',       progress.toFixed(4));
  svgEl.style.setProperty('--ftl-spin-dur',       `${spin.cw.toFixed(2)}s`);
  svgEl.style.setProperty('--ftl-spin-dur-ccw',   `${spin.ccw.toFixed(2)}s`);
  svgEl.style.setProperty('--ftl-spin-dur-inner', `${spin.inner.toFixed(2)}s`);
  svgEl.style.setProperty('--ftl-glow',           glow.toFixed(4));
  svgEl.style.setProperty('--ftl-pulse-dur',      `${pulseDur.toFixed(2)}s`);

  // Status label
  statusLabelEl.textContent = PHASE_LABELS[phase] || phase.toUpperCase();
  statusLabelEl.className   = `ftl-status-label ftl-status-label--${phase}`;

  // Charge bar
  let barPct = 0, barMod = 'ftl-charge-bar--dim', pctText = '—';
  if (phase === 'charging') {
    barPct = progress * 100; barMod = 'ftl-charge-bar--amber'; pctText = `${Math.round(progress * 100)}%`;
  } else if (phase === 'ready') {
    barPct = 100; barMod = 'ftl-charge-bar--green'; pctText = '100%';
  } else if (phase === 'cooldown') {
    barPct = progress * 100; pctText = `${Math.round(progress * 100)}%`;
  }
  chargeBarEl.style.width = `${barPct.toFixed(1)}%`;
  chargeBarEl.className   = `ftl-charge-bar-fill ${barMod}`;
  chargePctEl.textContent = pctText;

  // Left panel
  destEl.textContent  = destination || 'NO DESTINATION';
  rangeEl.textContent = range_au != null ? `${Number(range_au).toFixed(1)} AU` : '—';

  // Right panel — signal lag with flash when > 1 s
  lagEl.textContent = signal_lag_s != null ? formatLag(signal_lag_s) : '—';
  const lagHigh     = signal_lag_s != null && signal_lag_s > 1.0;
  lagPanelEl.classList.toggle('ftl-lag-high', lagHigh);

  // Power bar
  if (power_kw != null && power_max_kw != null && power_max_kw > 0) {
    powerBarEl.style.width = `${Math.min(100, (power_kw / power_max_kw) * 100).toFixed(1)}%`;
    powerValEl.textContent = `${power_kw} kW`;
  } else {
    powerBarEl.style.width = '0%';
    powerValEl.textContent = '—';
  }
}
