# Cold Orbit — Handback: Comms View

Session: 2026-08-04  
Built by: Claude Code (claude-sonnet-4-6)  
Previous session: Engineering view — see git history for that handback's content.

---

## 1. What was built

### Files touched / created

| File | Change |
|------|--------|
| `public/js/views/comms.js` | **New** — full Comms view module |
| `public/css/style.css` | Added `/* Comms view */` section (~210 lines) |
| `public/index.html` | Replaced `<section class="view-stub" data-view="comms">` with the full two-column view |
| `public/js/config.js` | Added `TOPICS.commsLog` and `TOPICS.commsTargets` |
| `public/js/app.js` | Import + init `comms.js`; subscribed to both comms topics; routing in message handler |
| `mock/publish-comms.sh` | **New** — seed + streaming publisher for log and contacts |
| `docs/comms-mqtt-contract.md` | **New** — full contract doc |

### Layout

Two-column flex layout, full viewport height below the topbar:

- **Left column (55%)** — scrollable comms message log. Newest message at top; older messages scroll off the bottom. A "RECENT FIRST" label appears next to the column header. Incoming messages are left-aligned with a blue left-border accent; outgoing messages right-aligned with a green right-border accent. Auto-scroll resets to the top on each new message unless the user has scrolled down to read history, in which case a "↓ NEW MESSAGE" nudge button appears.
- **Right column (45%)** — pageable contacts-in-range list. 5 entries visible at a time. Large ▲ PREV / ▼ NEXT buttons span the full column width (80px tall). Tapping a contact opens a detail popup. The popup is anchored to the right column (which has `position: relative`) so the log remains readable alongside it.

### Comms log scroll behaviour

`_userScrolled` is `true` when `scrollTop > 20` (user has scrolled down from the top). On each new log message:
- If `!_userScrolled`: set `scrollTop = 0` so the newest message stays visible.
- If `_userScrolled`: show nudge button; don't jump the user.
Nudge button click: `scrollTop = 0`, hides itself, clears `_userScrolled`.

### Target list paging

`_targetOffset` (integer, default 0) tracks the current page start. Prev/Next buttons shift it by `PAGE_SIZE = 5`. `_renderTargets()` slices `_targets.slice(_targetOffset, _targetOffset + 5)`. Buttons are `disabled` at the ends of the list. The list uses `overflow: hidden` — native scroll is intentionally disabled.

### Target popup

Centered on the **right column** (not the full screen). Decision: keeps the comms log visible and readable while a contact is selected, which is more useful than covering the whole panel. Placement is `position: absolute; inset: 0` on `.comms-popup-backdrop`, which anchors to `.comms-targets-col` (`position: relative`).

Behaviour:
- Tap a contact → opens popup for that contact
- Tap the same contact again → closes popup
- Tap a different contact → switches popup to that contact
- ✕ button or tap-outside (backdrop click) → closes

Range value in the popup is live: `handleCommsTargets()` updates `_popupRangeEl.textContent` directly whenever a new targets message arrives while the popup is open, without re-rendering the popup card.

---

## 2. MQTT contract as implemented

### `coldorbit/output/comms/log`

| Property | Value |
|---|---|
| QoS | 1 |
| Retain | yes |
| Direction | sim-core → touchscreen |

Full message log array. Sim-core republishes the entire array when a new message is appended. Retain ensures the display gets full history on reconnect.

**Design decision — full array vs per-message topics:** per-message retained topics (`comms/message/<id>`) were considered but rejected: they require client-side assembly, have no clean deletion mechanism, and complicate ordering. At expected log sizes (< 50 messages) a full array is simpler and reconnect-correct. If the log grows large, sim-core should truncate to the last N before publishing.

```json
[
  {
    "id": "msg_001",
    "direction": "incoming",
    "sender": "Harlan Voss",
    "text": "Nighthawk, this is Voss. You in position?",
    "timestamp_s": 3600
  },
  {
    "id": "msg_002",
    "direction": "outgoing",
    "sender": "player",
    "text": "Affirmative. Holding at waypoint delta.",
    "timestamp_s": 3618
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable per-message identifier |
| `direction` | `"incoming"` \| `"outgoing"` | Controls left/right alignment |
| `sender` | string | Displayed for incoming; outgoing renders as "YOU" |
| `text` | string | Message body |
| `timestamp_s` | integer | Mission time in seconds. Displayed as `T+HH:MM:SS`. Wall clock was not used — mission time is simpler to mock and fits the fiction. |

### `coldorbit/output/comms/targets`

| Property | Value |
|---|---|
| QoS | 1 |
| Retain | yes |
| Direction | sim-core → touchscreen |

Full contacts-in-range list. Republished whenever the list changes or ranges update significantly. The popup reads all four of its fields from this payload — no separate per-contact detail topic. If richer popup data is needed later (IFF status, bounty flag, signal strength), add `coldorbit/output/comms/target/<id>/detail` per contact and subscribe on popup open.

```json
[
  {
    "id": "contact_001",
    "name": "Harlan Voss",
    "alliance": "Independent",
    "vessel_class": "Light Freighter",
    "range_m": 1240
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable contact id — used to track popup selection across re-renders |
| `name` | string | Display name |
| `alliance` | string | e.g. `"Independent"`, `"Frontier Collective"`, `"Unknown"` |
| `vessel_class` | string | e.g. `"Light Freighter"`, `"Interceptor"` |
| `range_m` | integer | Metres. Client formats as `X.X km` above 1000 m |

Full contract reference: `docs/comms-mqtt-contract.md`.

---

## 3. Calls made on open items

**Timestamp source — mission time.** Timestamps are `timestamp_s` (seconds since mission start), displayed as `T+HH:MM:SS`. Wall clock was not used: no clock-sync dependency, simpler to mock, and fits the game fiction. If the player callsign/ship name ever comes from config or MQTT, swap the hardcoded `"YOU"` label in `_renderLog()` in `comms.js`.

**Popup placement — right column.** Popup is anchored to the right column (not the full screen), so the log stays readable. If the right column is too narrow on the target hardware, change `.comms-popup-backdrop` to `position: fixed; inset: 0` and it will centre over the full viewport instead.

**Log topic design — full array, retained.** See §2 above for the tradeoff. The decision can be revisited cheaply: the client only cares about the array it receives, so the publisher-side approach can change without any client-side changes.

**Callsign placeholder.** Outgoing messages display "YOU" unconditionally. A player callsign field could come from a config topic (e.g. `coldorbit/output/ship/callsign`, retained) — read it once in `app.js` and pass it to `initComms` as an option if needed.

**No "comms active channel" indicator.** The physical Comms panel manages channel selection; this view is display-only. If sim-core later publishes an active channel or frequency, a small header line in the log column is a natural place for it.

---

## 4. How to smoke-test locally

Start three terminals from the repo root:

```bash
# Terminal 1 — broker
mosquitto -c web-panels/docs/mosquitto-local.conf
```

```bash
# Terminal 2 — dev server
python3 web-panels/server.py
```

```bash
# Terminal 3 — set mode and seed
web-panels/mock/set-mode.sh comms
web-panels/mock/publish-comms.sh
```

Open `http://localhost:8080` (or `http://localhost:8080/?mode=comms` to skip the mode message).

**Expected initial state:**
- Left column: 8 seeded messages, newest (Frontier Control re docking) at top
- Right column: 7 contacts; 5 visible (Harlan Voss through Kael Morrow); ▼ NEXT scrolls to show ISV Marchetti and DSV Phantom Run
- ▲ PREV disabled on load; ▼ NEXT enabled

**Things to exercise:**
- Tap a contact → popup appears with name, alliance, class, range
- Tap same contact again → popup closes
- Tap ✕ or backdrop → popup closes
- Tap a different contact while popup is open → switches to that contact
- Ranges in popup update live every ~5 s (watch the range value change without reopening popup)
- Scroll down in log → nudge button appears → tap it → jumps back to top
- After ~15 s: new incoming message arrives at top of log (if you're scrolled down, nudge appears)

**Seed only (no streaming):**
```bash
web-panels/mock/publish-comms.sh --seed
```

**Clear retained messages to test empty state:**
```bash
mosquitto_pub -h localhost -p 1883 -t "coldorbit/output/comms/log" -n -r
mosquitto_pub -h localhost -p 1883 -t "coldorbit/output/comms/targets" -n -r
```

---

## 5. Risks and things worth reconsidering

**Log grows unbounded on the publisher side.** The mock script appends messages to `LOG_JSON` in memory and republishes. Sim-core should enforce a maximum log length (e.g. last 50 messages) before publishing, or the retained payload will grow without bound over a long session.

**Right column popup on narrow hardware.** The popup is `width: 90%; max-width: 480px` anchored inside the right column (~45% of viewport). On a narrow panel (< ~500px wide viewport) the popup will be very tight. Change `position` to `fixed; inset: 0` on `.comms-popup-backdrop` to span the full screen if the hardware warrants it.

**Five-visible paging with < 5 contacts.** If sim-core delivers fewer than 5 contacts, empty slots appear as blank space — the list just doesn't fill. This is fine visually but worth a check if sim-core could deliver 0 contacts (empty list renders cleanly; both buttons are disabled).

**No loading / empty state messaging.** If the broker delivers no retained messages (fresh broker, no mock running), both columns are blank. A "AWAITING DATA" placeholder in each column would be friendlier, but it wasn't in scope.

**`_userScrolled` resets on re-render.** `_renderLog` replaces `innerHTML`, which fires the scroll event handler as the browser re-lays out content. This is guarded by the `atTop` check — if `scrollTop` is 0 after the DOM replace, `_userScrolled` is cleared correctly. Worth a look if scroll behaviour feels wrong on the target browser.

---

## 6. Handover instruction

When your work on this repo is done, write a handback doc for the next session in this same format and save it as `HANDBACK.md` in the repo root (replacing this file). Include: files touched, how the key mechanisms work, full topic strings as implemented, calls made on open items, smoke-test sequence, and risks. That keeps context passing cleanly between sessions without relying on conversation history.
