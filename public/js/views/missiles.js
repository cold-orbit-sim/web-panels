// Missiles status view — four fixed launch tubes in a 3-column layout.
// Left col: Fore Port (top) + Aft Port (bottom).  Centre: top-down ship schematic (SVG).
// Right col: Fore Starboard (top) + Aft Starboard (bottom).
// Tap a tube block to open a detail panel; tap again or backdrop to close.
// Loadout mode (loadout-unlocked = true): missile type selector in detail panel.

// MOCK — replace with sim-core data when available.
const MISSILE_TYPES = [
  { type: 'Dumbfire',        desc: 'MOCK: Unguided, high speed, short range' },
  { type: 'Seeking',         desc: 'MOCK: Target-tracking, slower' },
  { type: 'EMP Burst',       desc: 'MOCK: Disables systems, minimal hull damage' },
  { type: 'Fragmentation',   desc: 'MOCK: Area effect, short range' },
  { type: 'Armour Piercing', desc: 'MOCK: Single target, high hull damage' },
];

const TUBE_IDS   = ['fore_port', 'fore_starboard', 'aft_port', 'aft_starboard'];
const TUBE_LABEL = {
  fore_port:       'FORE PORT',
  fore_starboard:  'FORE STBD',
  aft_port:        'AFT PORT',
  aft_starboard:   'AFT STBD',
};

const state = { fore_port: null, fore_starboard: null, aft_port: null, aft_starboard: null };

let openDetail      = null;
let loadoutUnlocked = false;
let publishType     = null;

const missileIndex = { fore_port: 0, fore_starboard: 0, aft_port: 0, aft_starboard: 0 };

let container  = null;
let backdropEl = null;
let popupEl    = null;
const blockEls = {};

// ── Colour helpers ─────────────────────────────────────────────────────────────

function lockColor(lockState, armed) {
  if (lockState === 'locked')    return armed ? '#5fffaa' : 'var(--green)';
  if (lockState === 'acquiring') return 'var(--amber)';
  return 'var(--dim)';
}

// ── Schematic SVG — top-down hull, bow at top ─────────────────────────────────
// Hull polygon: bow tip (130,22) → starboard edge → stern → port edge.
// Tube markers: small housing rects with direction arrowheads (fore = up, aft = down).
// Lock-state rings encircle each tube; coloured/animated by updateMarker().

function buildSchematicSvg() {
  return `
<svg id="ms-schematic-svg" viewBox="0 0 260 440" xmlns="http://www.w3.org/2000/svg"
     preserveAspectRatio="xMidYMid meet"
     style="width:100%;height:100%;max-height:100%;overflow:visible;
            font-family:ui-monospace,'SF Mono',monospace;">

  <!-- Hull silhouette: elongated, wider amidships, bow at top -->
  <polygon
    points="130,22 162,52 182,96 190,150 192,220 190,290 178,334 162,372 148,394 112,394 98,372 82,334 70,290 68,220 70,150 78,96 98,52"
    fill="#0a1318" stroke="var(--dim)" stroke-width="1.6" stroke-linejoin="round"/>

  <!-- Faint centreline -->
  <line x1="130" y1="22" x2="130" y2="394"
    stroke="var(--dim)" stroke-width="0.5" stroke-dasharray="6 4" opacity="0.22"/>

  <!-- Bridge / command block (mid-fore) -->
  <rect x="116" y="148" width="28" height="36" rx="2"
    fill="#0d1e24" stroke="var(--dim)" stroke-width="1" opacity="0.55"/>

  <!-- Engine nozzles (stern) -->
  <ellipse cx="112" cy="392" rx="11" ry="8"
    fill="#0a1318" stroke="var(--dim)" stroke-width="1.2" opacity="0.6"/>
  <ellipse cx="148" cy="392" rx="11" ry="8"
    fill="#0a1318" stroke="var(--dim)" stroke-width="1.2" opacity="0.6"/>

  <!-- ── TUBE: Fore Port (FP) — upper-left ── -->
  <!-- Housing 22×28, center (84,79). Direction line points forward (up). -->
  <g id="ms-marker-fore_port">
    <circle cx="84" cy="79" r="22" fill="none"
      stroke="transparent" stroke-width="2.2" id="ms-ring-fore_port"/>
    <line x1="84" y1="65" x2="84" y2="46"
      stroke="var(--dim)" stroke-width="2" id="ms-dir-fore_port"/>
    <polygon points="84,44 80,54 88,54"
      fill="var(--dim)" id="ms-arrow-fore_port"/>
    <rect x="73" y="65" width="22" height="28" rx="3"
      fill="#0a1318" stroke="var(--dim)" stroke-width="2" id="ms-rect-fore_port"/>
    <rect x="80" y="72" width="9" height="14" rx="1"
      fill="var(--dim)" id="ms-inner-fore_port"/>
    <text x="71" y="99" text-anchor="end" font-size="9" letter-spacing="1.5"
      fill="var(--dim)" id="ms-lbl-fore_port">FP</text>
  </g>

  <!-- ── TUBE: Fore Starboard (FS) — upper-right ── -->
  <g id="ms-marker-fore_starboard">
    <circle cx="176" cy="79" r="22" fill="none"
      stroke="transparent" stroke-width="2.2" id="ms-ring-fore_starboard"/>
    <line x1="176" y1="65" x2="176" y2="46"
      stroke="var(--dim)" stroke-width="2" id="ms-dir-fore_starboard"/>
    <polygon points="176,44 172,54 180,54"
      fill="var(--dim)" id="ms-arrow-fore_starboard"/>
    <rect x="165" y="65" width="22" height="28" rx="3"
      fill="#0a1318" stroke="var(--dim)" stroke-width="2" id="ms-rect-fore_starboard"/>
    <rect x="171" y="72" width="9" height="14" rx="1"
      fill="var(--dim)" id="ms-inner-fore_starboard"/>
    <text x="189" y="99" text-anchor="start" font-size="9" letter-spacing="1.5"
      fill="var(--dim)" id="ms-lbl-fore_starboard">FS</text>
  </g>

  <!-- ── TUBE: Aft Port (AP) — lower-left ── -->
  <!-- Housing 22×28, center (84,341). Direction line points aft (down). -->
  <g id="ms-marker-aft_port">
    <circle cx="84" cy="341" r="22" fill="none"
      stroke="transparent" stroke-width="2.2" id="ms-ring-aft_port"/>
    <line x1="84" y1="355" x2="84" y2="374"
      stroke="var(--dim)" stroke-width="2" id="ms-dir-aft_port"/>
    <polygon points="84,378 80,368 88,368"
      fill="var(--dim)" id="ms-arrow-aft_port"/>
    <rect x="73" y="327" width="22" height="28" rx="3"
      fill="#0a1318" stroke="var(--dim)" stroke-width="2" id="ms-rect-aft_port"/>
    <rect x="80" y="334" width="9" height="14" rx="1"
      fill="var(--dim)" id="ms-inner-aft_port"/>
    <text x="71" y="325" text-anchor="end" font-size="9" letter-spacing="1.5"
      fill="var(--dim)" id="ms-lbl-aft_port">AP</text>
  </g>

  <!-- ── TUBE: Aft Starboard (AS) — lower-right ── -->
  <g id="ms-marker-aft_starboard">
    <circle cx="176" cy="341" r="22" fill="none"
      stroke="transparent" stroke-width="2.2" id="ms-ring-aft_starboard"/>
    <line x1="176" y1="355" x2="176" y2="374"
      stroke="var(--dim)" stroke-width="2" id="ms-dir-aft_starboard"/>
    <polygon points="176,378 172,368 180,368"
      fill="var(--dim)" id="ms-arrow-aft_starboard"/>
    <rect x="165" y="327" width="22" height="28" rx="3"
      fill="#0a1318" stroke="var(--dim)" stroke-width="2" id="ms-rect-aft_starboard"/>
    <rect x="171" y="334" width="9" height="14" rx="1"
      fill="var(--dim)" id="ms-inner-aft_starboard"/>
    <text x="189" y="325" text-anchor="start" font-size="9" letter-spacing="1.5"
      fill="var(--dim)" id="ms-lbl-aft_starboard">AS</text>
  </g>

</svg>`;
}

// ── Update schematic tube marker ───────────────────────────────────────────────

function updateMarker(id, s) {
  if (!container) return;
  const lockSt  = s ? (s.lock_state || 'none') : 'none';
  const armed   = s ? !!s.armed : false;
  const color   = lockColor(lockSt, armed);
  const markerEl = container.querySelector(`#ms-marker-${id}`);
  if (!markerEl) return;

  const rect  = markerEl.querySelector(`#ms-rect-${id}`);
  const inner = markerEl.querySelector(`#ms-inner-${id}`);
  const dir   = markerEl.querySelector(`#ms-dir-${id}`);
  const arrow = markerEl.querySelector(`#ms-arrow-${id}`);
  const lbl   = markerEl.querySelector(`#ms-lbl-${id}`);
  const ring  = markerEl.querySelector(`#ms-ring-${id}`);

  if (rect)  rect.setAttribute('stroke', color);
  if (inner) inner.setAttribute('fill',  color);
  if (dir)   dir.setAttribute('stroke',  color);
  if (arrow) arrow.setAttribute('fill',  color);
  if (lbl)   lbl.setAttribute('fill',    color);

  if (ring) {
    if (lockSt === 'locked') {
      ring.setAttribute('stroke', color);
      ring.removeAttribute('stroke-dasharray');
      ring.setAttribute('opacity', '0.5');
    } else if (lockSt === 'acquiring') {
      ring.setAttribute('stroke', color);
      ring.setAttribute('stroke-dasharray', '14 10');
      ring.setAttribute('opacity', '0.55');
    } else {
      ring.setAttribute('stroke', 'transparent');
    }
  }

  markerEl.style.animation = lockSt === 'acquiring'
    ? 'ms-acquiring-pulse 1.2s ease-in-out infinite'
    : '';
}

// ── Tube status block HTML ────────────────────────────────────────────────────

function tubeBlockHtml(id, s) {
  const label   = TUBE_LABEL[id];
  const armed   = s ? !!s.armed : false;
  const status  = s ? (s.status       || 'empty') : '—';
  const lockSt  = s ? (s.lock_state   || 'none')  : 'none';
  const mType   = s ? (s.missile_type || '—')      : '—';
  const target  = s ? (s.target_name  || '—')      : '—';
  const range   = s && s.target_range_m != null ? `${s.target_range_m} m` : '—';

  const armedCls  = armed ? 'ms-armed-pill--armed' : '';
  const lockCls   = lockSt === 'locked'    ? 'ms-lock--locked'
                  : lockSt === 'acquiring' ? 'ms-lock--acquiring'
                  : '';
  const lockLabel = lockSt === 'none'      ? 'NO LOCK'
                  : lockSt === 'acquiring' ? 'ACQUIRING'
                  : 'LOCKED';
  const statusCls = status === 'loaded'    ? 'ms-status--loaded'
                  : status === 'reloading' ? 'ms-status--reloading'
                  : 'ms-status--empty';

  return `
    <div class="ms-tube-label">${label}</div>
    <div class="ms-tube-badges">
      <span class="ms-armed-pill ${armedCls}">${armed ? 'ARMED' : 'SAFE'}</span>
      <span class="ms-lock ${lockCls}">${lockLabel}</span>
    </div>
    <div class="ms-field-row">
      <span class="ms-lbl">STATUS</span>
      <span class="ms-val ms-status ${statusCls}">${status.toUpperCase()}</span>
    </div>
    <div class="ms-field-row">
      <span class="ms-lbl">TYPE</span>
      <span class="ms-val">${mType}</span>
    </div>
    <div class="ms-field-row">
      <span class="ms-lbl">TARGET</span>
      <span class="ms-val ms-val--target">${target}</span>
    </div>
    <div class="ms-field-row">
      <span class="ms-lbl">RANGE</span>
      <span class="ms-val">${range}</span>
    </div>`;
}

// ── Popup HTML ────────────────────────────────────────────────────────────────

function typeSelectorHtml(id) {
  const cur = MISSILE_TYPES[missileIndex[id]];
  return `
    <div class="ms-detail-section">MISSILE TYPE <span class="ms-detail-note">MOCK — loadout mode</span></div>
    <div class="ms-type-sel-row">
      <button class="ms-type-prev" data-tube="${id}">&#9664;</button>
      <span class="ms-type-name">${cur.type}</span>
      <button class="ms-type-next" data-tube="${id}">&#9654;</button>
    </div>
    <div class="ms-type-desc">${cur.desc}</div>
    <button class="ms-type-confirm" data-tube="${id}">CONFIRM</button>`;
}

function popupHtml(id, s) {
  if (!s) return `<div class="ms-popup-no-data">NO DATA</div>`;

  const armed   = s.armed;
  const armedCls = armed ? 'ms-armed-pill--armed' : '';
  const lockSt   = s.lock_state || 'none';
  const lockCls  = lockSt === 'locked'    ? 'ms-lock--locked'
                 : lockSt === 'acquiring' ? 'ms-lock--acquiring'
                 : '';
  const lockLabel = lockSt === 'none'      ? 'NO LOCK'
                  : lockSt === 'acquiring' ? 'ACQUIRING'
                  : 'LOCKED';

  const mTypeObj = MISSILE_TYPES.find((m) => m.type === s.missile_type);
  const mDesc    = mTypeObj ? mTypeObj.desc : (s.missile_type ? `MOCK: ${s.missile_type}` : '');

  return `
    <div class="ms-popup-head">
      <span class="ms-popup-title">${TUBE_LABEL[id]}</span>
      <button class="ms-popup-close" id="ms-popup-close">✕</button>
    </div>

    <div class="ms-field-row">
      <span class="ms-lbl">ARMED</span>
      <span class="ms-armed-pill ${armedCls}">${armed ? 'ARMED' : 'SAFE'}</span>
    </div>
    <div class="ms-field-row">
      <span class="ms-lbl">STATUS</span>
      <span class="ms-val">${(s.status || 'empty').toUpperCase()}</span>
    </div>
    <div class="ms-field-row">
      <span class="ms-lbl">LOCK</span>
      <span class="ms-lock ${lockCls}">${lockLabel}</span>
    </div>
    <div class="ms-field-row">
      <span class="ms-lbl">TARGET</span>
      <span class="ms-val">${s.target_name || '—'}</span>
    </div>
    <div class="ms-field-row">
      <span class="ms-lbl">CLASS</span>
      <span class="ms-val">${s.target_class || '—'}</span>
    </div>
    <div class="ms-field-row">
      <span class="ms-lbl">ALLIANCE</span>
      <span class="ms-val">${s.target_alliance || '—'}</span>
    </div>
    ${s.target_range_m != null
      ? `<div class="ms-field-row">
           <span class="ms-lbl">RANGE</span>
           <span class="ms-val">${s.target_range_m} m</span>
         </div>`
      : ''}

    <div class="ms-detail-section">MISSILE TYPE</div>
    <div class="ms-field-row">
      <span class="ms-val">${s.missile_type || '—'}</span>
    </div>
    ${mDesc ? `<div class="ms-type-detail-desc">${mDesc}</div>` : ''}
    <div class="ms-field-row">
      <span class="ms-lbl">BLAST RADIUS</span>
      <span class="ms-val">MOCK — 80 m</span>
    </div>

    ${loadoutUnlocked ? typeSelectorHtml(id) : ''}`;
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
  const closeBtn = document.getElementById('ms-popup-close');
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePopup(); });

  popupEl.querySelectorAll('.ms-type-prev').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    missileIndex[id] = (missileIndex[id] - 1 + MISSILE_TYPES.length) % MISSILE_TYPES.length;
    popupEl.innerHTML = popupHtml(id, state[id]);
    bindPopupButtons(id);
  }));
  popupEl.querySelectorAll('.ms-type-next').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    missileIndex[id] = (missileIndex[id] + 1) % MISSILE_TYPES.length;
    popupEl.innerHTML = popupHtml(id, state[id]);
    bindPopupButtons(id);
  }));

  const confirmBtn = popupEl.querySelector('.ms-type-confirm');
  if (confirmBtn) confirmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (publishType) publishType(id, { type: MISSILE_TYPES[missileIndex[id]].type });
    confirmBtn.textContent = 'SENT ✓';
    confirmBtn.disabled = true;
    setTimeout(() => {
      if (confirmBtn) { confirmBtn.textContent = 'CONFIRM'; confirmBtn.disabled = false; }
    }, 1500);
  });
}

// ── Block update ──────────────────────────────────────────────────────────────

function updateBlock(id, s) {
  const el = blockEls[id];
  if (!el) return;
  el.innerHTML = tubeBlockHtml(id, s);
  updateMarker(id, s);
}

// ── init ──────────────────────────────────────────────────────────────────────

export function initMissiles(el, onTypeConfirm) {
  container   = el;
  publishType = onTypeConfirm;

  container.innerHTML = `
<div class="ms-inner">

  <div class="ms-col ms-col--port">
    <div class="ms-tube-block" id="ms-block-fore_port"      data-tube="fore_port"></div>
    <div class="ms-col-divider"></div>
    <div class="ms-tube-block" id="ms-block-aft_port"       data-tube="aft_port"></div>
  </div>

  <div class="ms-schematic-col">
    ${buildSchematicSvg()}
  </div>

  <div class="ms-col ms-col--stbd">
    <div class="ms-tube-block" id="ms-block-fore_starboard" data-tube="fore_starboard"></div>
    <div class="ms-col-divider"></div>
    <div class="ms-tube-block" id="ms-block-aft_starboard"  data-tube="aft_starboard"></div>
  </div>

  <div class="ms-popup-backdrop" id="ms-popup-backdrop" hidden>
    <div class="ms-popup" id="ms-popup"></div>
  </div>

</div>`;

  TUBE_IDS.forEach((id) => {
    blockEls[id] = container.querySelector(`#ms-block-${id}`);
    blockEls[id].innerHTML = tubeBlockHtml(id, null);

    blockEls[id].addEventListener('click', () => {
      if (openDetail === id) { closePopup(); return; }
      openPopup(id);
    });
  });

  backdropEl = container.querySelector('#ms-popup-backdrop');
  popupEl    = container.querySelector('#ms-popup');

  backdropEl.addEventListener('click', (e) => {
    if (e.target === backdropEl) closePopup();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setMissilesLoadoutMode(unlocked) {
  loadoutUnlocked = unlocked;
  if (openDetail) {
    popupEl.innerHTML = popupHtml(openDetail, state[openDetail]);
    bindPopupButtons(openDetail);
  }
}

export function handleMissileState(tubeId, data) {
  if (!TUBE_IDS.includes(tubeId)) return;
  state[tubeId] = data;
  updateBlock(tubeId, data);
  if (openDetail === tubeId) {
    popupEl.innerHTML = popupHtml(tubeId, data);
    bindPopupButtons(tubeId);
  }
}
