// Turrets status view — two big turret diagrams side by side (dorsal | ventral).
// Each column: lock/armed badges → rotating SVG turret → compact status strip.
// On tap: a centred popup overlay shows full detail + heat bar + ammo selector
//   (loadout mode). Backdrop tap closes it. Same column tap toggles it.
// Loadout mode: ammo selector in popup when setTurretsLoadoutMode(true).

// MOCK — replace with sim-core data when available.
const AMMO_TYPES = [
  { type: 'Kinetic Slug', desc: 'Standard kinetic penetrator' },
  { type: 'EMP Round',    desc: 'Disables systems, less hull damage' },
  { type: 'Incendiary',   desc: 'Area denial' },
  { type: 'Tracer',       desc: 'Reduces targeting time' },
  { type: 'Flechette',    desc: 'Close range spread' },
];

const state = { dorsal: null, ventral: null };

let openDetail      = null;   // null | 'dorsal' | 'ventral'
let loadoutUnlocked = false;
let publishAmmo     = null;   // (turretId, { type }) => void

const ammoIndex = { dorsal: 0, ventral: 0 };

// Accumulated bearing angles — never clamped to [0, 360].
// CSS transitions between these, so the turret always takes the shortest arc
// without snapping back across the 0/360 boundary.
const accumBearing = { dorsal: 0, ventral: 0 };

function shortestArcBearing(id, targetDeg) {
  // Shortest signed delta from accumulated angle to target, in [-180, 180].
  const current = accumBearing[id] % 360;
  const delta   = ((targetDeg - current) + 540) % 360 - 180;
  accumBearing[id] += delta;
  return accumBearing[id];
}

let container    = null;
let backdropEl   = null;
let popupEl      = null;
const col        = { dorsal: null, ventral: null };

// ── Lock state colour ──────────────────────────────────────────────────────────

function lockColor(lockState, armed) {
  if (lockState === 'locked')    return armed ? '#5fffaa' : 'var(--green)';
  if (lockState === 'acquiring') return 'var(--amber)';
  return 'var(--dim)';
}

// ── Turret SVG (top-down: squarish base + twin barrels; bearing rotates all) ──

function buildTurretSvg(id) {
  return `
<svg id="tr-svg-${id}" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"
     preserveAspectRatio="xMidYMid meet"
     style="width:100%;height:100%;overflow:visible;">

  <!-- Fixed mounting ring (does not rotate) -->
  <g transform="translate(140,140)">
    <circle r="48" fill="none" stroke="var(--dim)"
            stroke-width="1.2" stroke-dasharray="4 3" opacity="0.28"/>
    <!-- Lock-state arc: ring that colours with lock state -->
    <circle id="tr-lock-arc-${id}" r="56"
            fill="none" stroke="transparent" stroke-width="5" opacity="0.45"/>
  </g>

  <!-- Rotating turret assembly — bearing 0 = barrels forward (up) -->
  <g transform="translate(140,140)">
    <g id="tr-bearing-${id}"
       style="transform-origin:0px 0px; transition:transform 200ms linear;">

      <!-- Left barrel -->
      <rect id="tr-bl-${id}" x="-21" y="-148" width="16" height="120" rx="4"
            fill="var(--dim)"/>
      <!-- Right barrel -->
      <rect id="tr-br-${id}" x="5" y="-148" width="16" height="120" rx="4"
            fill="var(--dim)"/>
      <!-- Muzzle brakes -->
      <rect id="tr-ml-${id}" x="-23" y="-153" width="20" height="10" rx="2"
            fill="var(--dim)"/>
      <rect id="tr-mr-${id}" x="3" y="-153" width="20" height="10" rx="2"
            fill="var(--dim)"/>
      <!-- Mantlet -->
      <rect id="tr-mt-${id}" x="-30" y="-36" width="60" height="13" rx="3"
            fill="var(--dim)"/>
      <!-- Housing (squarish) -->
      <rect id="tr-hs-${id}" x="-36" y="-23" width="72" height="62" rx="7"
            fill="#142024" stroke="var(--dim)" stroke-width="2.2"/>
      <!-- Rear dome -->
      <ellipse id="tr-dm-${id}" cx="0" cy="39" rx="32" ry="19"
               fill="#142024" stroke="var(--dim)" stroke-width="1.6"/>
      <!-- Pivot pin -->
      <circle id="tr-pv-${id}" r="8" fill="var(--dim)"/>
    </g>
  </g>

</svg>`;
}

// ── Update SVG elements for a turret ──────────────────────────────────────────

const COLORED_PARTS = ['bl','br','ml','mr','mt','pv'];

function updateSvgTurret(id, s) {
  if (!container) return;
  const color   = lockColor(s.lock_state, s.armed);
  const bearGrp = container.querySelector(`#tr-bearing-${id}`);
  const lockArc = container.querySelector(`#tr-lock-arc-${id}`);
  const housing = container.querySelector(`#tr-hs-${id}`);
  const dome    = container.querySelector(`#tr-dm-${id}`);
  if (!bearGrp) return;

  // Colour structural parts
  COLORED_PARTS.forEach((p) => {
    const el = container.querySelector(`#tr-${p}-${id}`);
    if (el) el.setAttribute('fill', color);
  });
  if (housing) housing.setAttribute('stroke', color);
  if (dome)    dome.setAttribute('stroke', color);

  // Lock-state arc
  if (lockArc) {
    if (s.lock_state === 'locked') {
      lockArc.setAttribute('stroke', color);
      lockArc.removeAttribute('stroke-dasharray');
      lockArc.setAttribute('opacity', '0.45');
    } else if (s.lock_state === 'acquiring') {
      lockArc.setAttribute('stroke', color);
      lockArc.setAttribute('stroke-dasharray', '60 294');
      lockArc.setAttribute('opacity', '0.55');
    } else {
      lockArc.setAttribute('stroke', 'transparent');
    }
  }

  // Bearing rotation — use accumulated angle to avoid 0/360 wrap snap
  if (s.bearing_deg != null && s.lock_state !== 'none') {
    const angle = shortestArcBearing(id, s.bearing_deg);
    bearGrp.style.transform = `rotate(${angle}deg)`;
    bearGrp.style.opacity   = '1';
  } else {
    bearGrp.style.opacity = '0.35';
  }

  // Acquiring pulse
  bearGrp.style.animation = s.lock_state === 'acquiring'
    ? 'turret-acquiring-pulse 1.2s ease-in-out infinite'
    : '';
}

// ── Column HTML ───────────────────────────────────────────────────────────────

function colBadgesHtml(id, s) {
  const armed   = s ? s.armed : false;
  const lock    = s ? (s.lock_state || 'none') : 'none';
  const lockCls = lock === 'locked' ? 'tr-lock--locked'
                : lock === 'acquiring' ? 'tr-lock--acquiring' : '';
  return `
    <div class="tr-col-header">
      <span class="tr-col-title">${id === 'dorsal' ? 'DORSAL' : 'VENTRAL'}</span>
      <div class="tr-header-badges">
        <span class="tr-armed-pill ${armed ? 'tr-armed-pill--armed' : ''}">${armed ? 'ARMED' : 'SAFE'}</span>
        <span class="tr-lock ${lockCls}">${lock.toUpperCase()}</span>
      </div>
    </div>`;
}

function ammoBarHtml(ammoRemaining, ammoLoaded) {
  if (!ammoRemaining || !ammoRemaining.length) return '';
  const total  = ammoRemaining.reduce((a, x) => a + x.count, 0);
  const loaded = ammoRemaining.find((a) => a.type === ammoLoaded);
  const count  = loaded ? loaded.count : total;
  const pct    = total > 0 ? Math.min(100, (count / total) * 100) : 0;
  return `
    <div class="tr-ammo-bar-track">
      <div class="tr-ammo-bar-fill" style="width:${pct.toFixed(1)}%"></div>
    </div>
    <div class="tr-ammo-count">${count} / ${total}</div>`;
}

function statusStripHtml(id, s) {
  if (!s) return `<div class="tr-status-strip"><div class="tr-no-data">NO DATA — TAP FOR DETAIL</div></div>`;
  const fmCls = s.fire_mode === 'lethal' ? 'tr-firemode--lethal' : 'tr-firemode--nonlethal';
  return `
    <div class="tr-status-strip">
      <div class="tr-field-row">
        <span class="tr-lbl">TARGET</span>
        <span class="tr-val tr-val--target">${s.target_name || 'NO TARGET'}</span>
      </div>
      <div class="tr-field-row">
        <span class="tr-lbl">MODE</span>
        <span class="tr-firemode ${fmCls}">${s.fire_mode === 'lethal' ? 'LETHAL' : 'NON-LETHAL'}</span>
      </div>
      ${s.target_range_m != null ? `
      <div class="tr-field-row">
        <span class="tr-lbl">RANGE</span>
        <span class="tr-val">${s.target_range_m} m</span>
      </div>` : ''}
      <div class="tr-field-col">
        <span class="tr-lbl">AMMO — ${s.ammo_loaded || '—'}</span>
        ${ammoBarHtml(s.ammo_remaining, s.ammo_loaded)}
      </div>
    </div>`;
}

function colHtml(id, s) {
  return colBadgesHtml(id, s) + `<div class="tr-svg-wrap">${buildTurretSvg(id)}</div>` + statusStripHtml(id, s);
}

// ── Popup HTML ────────────────────────────────────────────────────────────────

function ammoSelectorHtml(id) {
  const cur = AMMO_TYPES[ammoIndex[id]];
  return `
    <div class="tr-ammo-sel">
      <div class="tr-detail-section">AMMO SELECTION <span class="tr-detail-note">MOCK</span></div>
      <div class="tr-ammo-sel-row">
        <button class="tr-ammo-prev" data-turret="${id}">&#9664;</button>
        <span class="tr-ammo-name">${cur.type}</span>
        <button class="tr-ammo-next" data-turret="${id}">&#9654;</button>
      </div>
      <div class="tr-ammo-desc">${cur.desc}</div>
      <button class="tr-ammo-confirm" data-turret="${id}">CONFIRM</button>
    </div>`;
}

function popupHtml(id, s) {
  if (!s) return `<div class="tr-popup-no-data">NO DATA</div>`;

  const lockCls = s.lock_state === 'locked'   ? 'tr-lock--locked'
                : s.lock_state === 'acquiring' ? 'tr-lock--acquiring'
                : '';
  const heatPct   = Math.min(100, (s.heat || 0) * 100).toFixed(1);
  const heatColor = s.heat > 0.8 ? 'var(--red)'
                  : s.heat > 0.5 ? 'var(--amber)'
                  : 'var(--green)';

  const ammoRows = s.ammo_remaining && s.ammo_remaining.length
    ? s.ammo_remaining.map((a) => `
        <div class="tr-detail-ammo-row">
          <span class="tr-detail-ammo-type">${a.type}</span>
          <span class="tr-detail-ammo-count">${a.count}</span>
        </div>`).join('')
    : '<div class="tr-detail-ammo-row"><span class="tr-detail-ammo-type">—</span></div>';

  return `
    <div class="tr-popup-head">
      <span class="tr-popup-title">${id.toUpperCase()}</span>
      <button class="tr-popup-close" id="tr-popup-close">✕</button>
    </div>

    <div class="tr-field-row">
      <span class="tr-lbl">ARMED</span>
      <span class="tr-armed-pill ${s.armed ? 'tr-armed-pill--armed' : ''}">${s.armed ? 'ARMED' : 'SAFE'}</span>
    </div>
    <div class="tr-field-row">
      <span class="tr-lbl">LOCK</span>
      <span class="tr-lock ${lockCls}">${(s.lock_state || 'none').toUpperCase()}</span>
    </div>
    <div class="tr-field-row">
      <span class="tr-lbl">TARGET</span>
      <span class="tr-val">${s.target_name || 'NO TARGET'}</span>
    </div>
    <div class="tr-field-row">
      <span class="tr-lbl">CLASS</span>
      <span class="tr-val">${s.target_class || '—'}</span>
    </div>
    <div class="tr-field-row">
      <span class="tr-lbl">ALLIANCE</span>
      <span class="tr-val">${s.target_alliance || '—'}</span>
    </div>
    <div class="tr-field-row">
      <span class="tr-lbl">MODE</span>
      <span class="tr-val">${s.fire_mode === 'lethal' ? 'LETHAL' : 'NON-LETHAL'}</span>
    </div>
    ${s.target_range_m != null
      ? `<div class="tr-field-row">
           <span class="tr-lbl">RANGE</span>
           <span class="tr-val">${s.target_range_m} m</span>
         </div>`
      : ''}

    <div class="tr-detail-section">AMMO</div>
    ${ammoRows}

    ${loadoutUnlocked ? ammoSelectorHtml(id) : ''}

    <div class="tr-detail-section">
      HEAT <span class="tr-detail-note">MOCK — not modelled in sim-core</span>
    </div>
    <div class="tr-heat-bar-track">
      <div class="tr-heat-bar-fill" style="width:${heatPct}%;background:${heatColor}"></div>
    </div>
    <div class="tr-heat-val">${((s.heat || 0) * 100).toFixed(0)}%</div>`;
}

// ── Popup open / close ────────────────────────────────────────────────────────

function openPopup(id) {
  openDetail = id;
  popupEl.innerHTML = popupHtml(id, state[id]);
  backdropEl.hidden = false;
  bindPopupButtons(id);
}

function closePopup() {
  openDetail = null;
  backdropEl.hidden = true;
}

function bindPopupButtons(id) {
  const closeBtn = document.getElementById('tr-popup-close');
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePopup(); });

  popupEl.querySelectorAll('.tr-ammo-prev').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    ammoIndex[id] = (ammoIndex[id] - 1 + AMMO_TYPES.length) % AMMO_TYPES.length;
    popupEl.innerHTML = popupHtml(id, state[id]);
    bindPopupButtons(id);
  }));
  popupEl.querySelectorAll('.tr-ammo-next').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    ammoIndex[id] = (ammoIndex[id] + 1) % AMMO_TYPES.length;
    popupEl.innerHTML = popupHtml(id, state[id]);
    bindPopupButtons(id);
  }));

  const confirmBtn = popupEl.querySelector('.tr-ammo-confirm');
  if (confirmBtn) confirmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (publishAmmo) publishAmmo(id, { type: AMMO_TYPES[ammoIndex[id]].type });
    confirmBtn.textContent = 'SENT ✓';
    confirmBtn.disabled = true;
    setTimeout(() => {
      if (confirmBtn) { confirmBtn.textContent = 'CONFIRM'; confirmBtn.disabled = false; }
    }, 1500);
  });
}

// ── Column partial updaters ───────────────────────────────────────────────────

function updateColPartial(id, s) {
  const colEl = col[id];
  if (!colEl) return;

  // SVG turret (the SVG elements exist in the rendered column)
  updateSvgTurret(id, s);

  // Badges header
  const hdr = colEl.querySelector('.tr-col-header');
  if (hdr) hdr.outerHTML = colBadgesHtml(id, s);

  // Status strip
  const strip = colEl.querySelector('.tr-status-strip');
  if (strip) strip.outerHTML = statusStripHtml(id, s);
}

// ── init ──────────────────────────────────────────────────────────────────────

export function initTurrets(el, onAmmoConfirm) {
  container   = el;
  publishAmmo = onAmmoConfirm;

  container.innerHTML = `
<div class="tr-inner">
  <div class="tr-col tr-col--dorsal"  id="tr-col-dorsal"></div>
  <div class="tr-col tr-col--ventral" id="tr-col-ventral"></div>

  <!-- Popup overlay — absolute, covers whole view -->
  <div class="tr-popup-backdrop" id="tr-popup-backdrop" hidden>
    <div class="tr-popup" id="tr-popup"></div>
  </div>
</div>`;

  col.dorsal  = container.querySelector('#tr-col-dorsal');
  col.ventral = container.querySelector('#tr-col-ventral');
  backdropEl  = container.querySelector('#tr-popup-backdrop');
  popupEl     = container.querySelector('#tr-popup');

  // Backdrop tap closes popup
  backdropEl.addEventListener('click', (e) => {
    if (e.target === backdropEl) closePopup();
  });

  // Column tap opens popup (or toggles if same turret)
  col.dorsal.addEventListener('click', () => {
    if (openDetail === 'dorsal') { closePopup(); return; }
    openPopup('dorsal');
  });
  col.ventral.addEventListener('click', () => {
    if (openDetail === 'ventral') { closePopup(); return; }
    openPopup('ventral');
  });

  // Initial render
  col.dorsal.innerHTML  = colHtml('dorsal',  null);
  col.ventral.innerHTML = colHtml('ventral', null);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setTurretsLoadoutMode(unlocked) {
  loadoutUnlocked = unlocked;
  // Refresh popup if open
  if (openDetail) {
    popupEl.innerHTML = popupHtml(openDetail, state[openDetail]);
    bindPopupButtons(openDetail);
  }
}

export function handleTurretState(turretId, data) {
  if (turretId !== 'dorsal' && turretId !== 'ventral') return;
  state[turretId] = data;

  // Update the column (partial DOM update — avoids rebuilding the SVG)
  updateColPartial(turretId, data);

  // Refresh popup if it's showing this turret
  if (openDetail === turretId) {
    popupEl.innerHTML = popupHtml(turretId, data);
    bindPopupButtons(turretId);
  }
}
