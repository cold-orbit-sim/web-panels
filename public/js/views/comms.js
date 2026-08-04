// Comms status view — read-only display of comms log and contacts in range.
// Left column (~55%): scrollable message log, incoming left / outgoing right.
// Right column (~45%): pageable sensor contacts, 5 visible, tap for popup detail.
//
// Subscriptions (wired in app.js):
//   coldorbit/output/comms/log      (retained, QoS 1) — full message array
//   coldorbit/output/comms/targets  (retained, QoS 1) — full contacts array

const PAGE_SIZE = 5;

let _logEl      = null;
let _nudgeEl    = null;
let _listEl     = null;
let _prevBtn    = null;
let _nextBtn    = null;
let _backdropEl = null;
let _popupNameEl     = null;
let _popupAllianceEl = null;
let _popupClassEl    = null;
let _popupRangeEl    = null;

let _messages     = [];
let _targets      = [];
let _targetOffset = 0;
let _selectedId   = null;
let _userScrolled = false;

export function initComms(el) {
  _logEl      = el.querySelector("#comms-log-list");
  _nudgeEl    = el.querySelector("#comms-nudge-btn");
  _listEl     = el.querySelector("#comms-targets-list");
  _prevBtn    = el.querySelector("#comms-targets-prev");
  _nextBtn    = el.querySelector("#comms-targets-next");
  _backdropEl = el.querySelector("#comms-popup-backdrop");
  _popupNameEl     = el.querySelector("#comms-popup-name");
  _popupAllianceEl = el.querySelector("#comms-popup-alliance");
  _popupClassEl    = el.querySelector("#comms-popup-class");
  _popupRangeEl    = el.querySelector("#comms-popup-range");

  _logEl.addEventListener("scroll", () => {
    const atTop = _logEl.scrollTop < 20;
    _userScrolled = !atTop;
    if (atTop) _nudgeEl.hidden = true;
  });

  _nudgeEl.addEventListener("click", () => {
    _logEl.scrollTop = 0;
    _nudgeEl.hidden  = true;
    _userScrolled    = false;
  });

  _prevBtn.addEventListener("click", () => {
    _targetOffset = Math.max(0, _targetOffset - PAGE_SIZE);
    _renderTargets();
  });

  _nextBtn.addEventListener("click", () => {
    if (_targetOffset + PAGE_SIZE < _targets.length) {
      _targetOffset += PAGE_SIZE;
      _renderTargets();
    }
  });

  el.querySelector("#comms-popup-close").addEventListener("click", _closePopup);
  _backdropEl.addEventListener("click", (e) => {
    if (e.target === _backdropEl) _closePopup();
  });
}

export function handleCommsLog(messages) {
  _messages = messages;
  _renderLog();
}

export function handleCommsTargets(targets) {
  _targets = targets;
  // Clamp page offset in case the list shrank
  _targetOffset = Math.min(_targetOffset, Math.max(0, _targets.length - 1));
  _renderTargets();
  // Live-update range in popup if one is open
  if (_selectedId !== null) {
    const t = _targets.find((c) => c.id === _selectedId);
    if (t) _popupRangeEl.textContent = _fmtRange(t.range_m);
  }
}

// ── private ──────────────────────────────────────────────────────────────────

function _renderLog() {
  _logEl.innerHTML = "";
  for (const msg of [..._messages].reverse()) {
    const isOut = msg.direction === "outgoing";
    const div   = document.createElement("div");
    div.className = "comms-msg " + (isOut ? "comms-msg-out" : "comms-msg-in");
    div.innerHTML = `
      <div class="comms-msg-meta">
        <span class="comms-msg-sender">${_esc(isOut ? "YOU" : msg.sender)}</span>
        <span class="comms-msg-time">${_fmtTime(msg.timestamp_s)}</span>
      </div>
      <div class="comms-msg-text">${_esc(msg.text)}</div>`;
    _logEl.appendChild(div);
  }

  if (!_userScrolled) {
    _logEl.scrollTop = 0;
  } else {
    _nudgeEl.hidden = false;
  }
}

function _renderTargets() {
  _listEl.innerHTML = "";
  const visible = _targets.slice(_targetOffset, _targetOffset + PAGE_SIZE);
  for (const t of visible) {
    const div = document.createElement("div");
    div.className = "comms-target-item" + (t.id === _selectedId ? " selected" : "");
    div.innerHTML = `
      <div class="comms-target-name">${_esc(t.name)}</div>
      <div class="comms-target-sub">
        <span class="comms-target-class">${_esc(t.vessel_class)}</span>
        <span class="comms-target-range">${_fmtRange(t.range_m)}</span>
      </div>`;
    div.addEventListener("click", () => _openPopup(t));
    _listEl.appendChild(div);
  }

  _prevBtn.disabled = _targetOffset === 0;
  _nextBtn.disabled = _targetOffset + PAGE_SIZE >= _targets.length;
}

function _openPopup(t) {
  if (_selectedId === t.id) {
    _closePopup();
    return;
  }
  _selectedId = t.id;
  _popupNameEl.textContent     = t.name;
  _popupAllianceEl.textContent = t.alliance;
  _popupClassEl.textContent    = t.vessel_class;
  _popupRangeEl.textContent    = _fmtRange(t.range_m);
  _backdropEl.hidden = false;
  _renderTargets(); // refresh selected highlight
}

function _closePopup() {
  _selectedId        = null;
  _backdropEl.hidden = true;
  _renderTargets();
}

function _fmtRange(m) {
  if (m >= 1000) return (m / 1000).toFixed(1) + " km";
  return m + " m";
}

// Mission-time format: T+HH:MM:SS
function _fmtTime(s) {
  const h   = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `T+${_pad(h)}:${_pad(min)}:${_pad(sec)}`;
}

function _pad(n) { return String(n).padStart(2, "0"); }

function _esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
