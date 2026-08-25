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

// Last known lock_progress per turret — sim-core already holds this value
// internally on a brief aim loss, so the client just mirrors what it's sent.
// Only falls back to the cached value if the field itself is missing;
// reset to 0 when target_name goes null.
const lastLockProgress = { dorsal: 0, ventral: 0 };
// Last dash-offset actually painted — used to detect a drop and snap instead
// of animating it (a drop means a new target, not the same acquisition easing down).
const lastDisplayedProgress = { dorsal: 0, ventral: 0 };
const PROGRESS_ARC_R = 64;
const PROGRESS_ARC_C = 2 * Math.PI * PROGRESS_ARC_R;

function resolveLockProgress(id, s) {
  if (s.target_name == null) {
    lastLockProgress[id] = 0;
  } else if (s.lock_progress != null) {
    lastLockProgress[id] = s.lock_progress;
  }
  return lastLockProgress[id];
}

function elevationText(deg) {
  if (deg == null) return null;
  const sign = deg > 0 ? '+' : deg < 0 ? '-' : '';
  return `${sign}${Math.abs(deg).toFixed(1)}°`;
}

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

// Ammo contract carries a per-type max alongside count (batch 27), so low-ammo
// thresholds are a % of that type's magazine, not an absolute round count —
// a Kinetic Slug mag and an EMP Round mag don't hold the same number of rounds.
function loadedAmmoPct(s) {
  if (!s.ammo_remaining || !s.ammo_remaining.length) return null;
  const loaded = s.ammo_remaining.find((a) => a.type === s.ammo_loaded);
  if (!loaded || !loaded.max) return null;
  return (loaded.count / loaded.max) * 100;
}

function isLowAmmo(s) {
  const pct = loadedAmmoPct(s);
  return pct != null && pct <= 10;
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
    <!-- Lock acquisition progress arc: fills clockwise from 12 o'clock, colours with lock state -->
    <circle id="tr-progress-arc-${id}" r="${PROGRESS_ARC_R}"
            fill="none" stroke="var(--amber)" stroke-width="4" stroke-linecap="round"
            transform="rotate(-90)"
            stroke-dasharray="${PROGRESS_ARC_C}" stroke-dashoffset="${PROGRESS_ARC_C}"
            style="opacity:0; transition:stroke-dashoffset 300ms ease, opacity 200ms ease;"/>
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
  const housing = container.querySelector(`#tr-hs-${id}`);
  const dome    = container.querySelector(`#tr-dm-${id}`);
  if (!bearGrp) return;

  // Colour structural parts — low ammo overrides with a flashing red. While
  // flashing, skip the attribute write entirely: sim-core republishes state
  // ~10Hz, and rewriting the fill/stroke attribute every tick fights the CSS
  // animation for ownership of that property and freezes it. The CSS class
  // must be the sole thing driving colour until low-ammo clears.
  const lowAmmo = isLowAmmo(s);
  COLORED_PARTS.forEach((p) => {
    const el = container.querySelector(`#tr-${p}-${id}`);
    if (el) {
      el.setAttribute('fill', lowAmmo ? 'var(--red)' : color);
      el.classList.toggle('tr-low-ammo-flash', lowAmmo);
    }
  });
  if (housing) {
    housing.setAttribute('stroke', lowAmmo ? 'var(--red)' : color);
    housing.classList.toggle('tr-low-ammo-flash-stroke', lowAmmo);
  }
  if (dome) {
    dome.setAttribute('stroke', lowAmmo ? 'var(--red)' : color);
    dome.classList.toggle('tr-low-ammo-flash-stroke', lowAmmo);
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

  // Lock acquisition progress arc
  const progressArc = container.querySelector(`#tr-progress-arc-${id}`);
  if (progressArc) {
    const progress = resolveLockProgress(id, s);
    const visible  = !(s.lock_state === 'none' && progress === 0);
    progressArc.style.opacity = visible ? '1' : '0';
    progressArc.setAttribute('stroke', s.lock_state === 'locked' ? 'var(--green)' : 'var(--amber)');

    const dropped = progress < lastDisplayedProgress[id];
    if (dropped) {
      // Snap instead of animating the ring backwards — a drop means a new
      // target reacquiring, not the same lock easing down.
      progressArc.style.transition = 'none';
      progressArc.style.strokeDashoffset = `${PROGRESS_ARC_C * (1 - progress)}`;
      progressArc.getBoundingClientRect(); // force reflow before re-enabling
      progressArc.style.transition = 'stroke-dashoffset 300ms ease, opacity 200ms ease';
    } else {
      progressArc.style.strokeDashoffset = `${PROGRESS_ARC_C * (1 - progress)}`;
    }
    lastDisplayedProgress[id] = progress;
  }
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

// Ammo block is a persistent sibling element (like the SVG turret) — updated
// in place rather than torn down every MQTT tick, so its CSS animations
// (reload stripe, low-ammo pulse) actually run instead of restarting from
// frame 0 on every state message.
function ammoBlockHtml(id) {
  return `
    <div class="tr-field-col tr-ammo-block" id="tr-ammo-block-${id}" style="display:none">
      <span class="tr-lbl" id="tr-ammo-lbl-${id}">AMMO</span>
      <div class="tr-ammo-bar-track">
        <div class="tr-ammo-bar-fill" id="tr-ammo-fill-${id}"></div>
      </div>
      <div class="tr-ammo-count" id="tr-ammo-count-${id}"></div>
    </div>`;
}

function updateAmmoBlock(id, s) {
  const block = document.getElementById(`tr-ammo-block-${id}`);
  if (!block) return;
  if (!s || !s.ammo_remaining || !s.ammo_remaining.length) {
    block.style.display = 'none';
    return;
  }
  block.style.display = '';

  const loaded  = s.ammo_remaining.find((a) => a.type === s.ammo_loaded);
  const count   = loaded ? loaded.count : null;
  const max     = loaded ? loaded.max   : null;
  const ammoPct = max ? Math.min(100, (count / max) * 100) : null;
  const countCls = s.reloading ? 'tr-ammo-count--dim'
                  : ammoPct == null ? ''
                  : ammoPct <= 10 ? 'tr-ammo-count--low'
                  : ammoPct <= 30 ? 'tr-ammo-count--warn' : '';

  const lbl = document.getElementById(`tr-ammo-lbl-${id}`);
  if (lbl) lbl.textContent = `AMMO — ${s.ammo_loaded || '—'}${s.reloading ? ' (RELOADING)' : ''}`;

  const fill = document.getElementById(`tr-ammo-fill-${id}`);
  if (fill) {
    const wasReloadingFill = fill.classList.contains('tr-ammo-bar-fill--reloading');
    // While reloading, the stripe covers the whole track (it signals "working",
    // not remaining ammo) — otherwise it tracks the actual remaining pct.
    fill.style.width = s.reloading ? '100%' : ammoPct == null ? '0%' : `${ammoPct.toFixed(1)}%`;
    fill.classList.toggle('tr-ammo-bar-fill--reloading', !!s.reloading);
    if (wasReloadingFill && !s.reloading) {
      fill.classList.add('tr-reload-done-flash');
      fill.addEventListener('animationend', () => fill.classList.remove('tr-reload-done-flash'), { once: true });
    }
  }

  const countEl = document.getElementById(`tr-ammo-count-${id}`);
  if (countEl) {
    countEl.textContent = count == null ? '—' : max ? `${count} / ${max}` : `${count}`;
    countEl.className = `tr-ammo-count ${countCls}`;
  }
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
      <div class="tr-field-row">
        <span class="tr-lbl">ELEV</span>
        <span class="tr-val${s.elevation_deg == null ? ' tr-val--dim' : ''}">${s.elevation_deg == null ? '—' : elevationText(s.elevation_deg)}</span>
      </div>
    </div>`;
}

function colHtml(id, s) {
  return colBadgesHtml(id, s)
    + `<div class="tr-svg-wrap">${buildTurretSvg(id)}</div>`
    + statusStripHtml(id, s)
    + ammoBlockHtml(id);
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
          <span class="tr-detail-ammo-count">${a.max ? `${a.count} / ${a.max}` : a.count}</span>
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

    <div class="tr-detail-section">AMMO${s.reloading ? ' <span class="tr-detail-note">RELOADING</span>' : ''}</div>
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

  // Ammo block — persistent element, updated in place (see updateAmmoBlock).
  updateAmmoBlock(id, s);
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
