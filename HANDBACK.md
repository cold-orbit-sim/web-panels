# Cold Orbit — Handback: Engineering View Repair Queue Integration
Session: 2026-08-09

---

## Files touched

### `public/js/config.js`
Added `repairQueue: "coldorbit/output/repair/queue"` to the `TOPICS` export. Addition only — no other paths changed.

### `public/js/app.js`
- Added `handleRepairQueue` to the import from `./views/engineering.js`.
- Added `TOPICS.repairQueue` to the `client.subscribe(...)` array on connect.
- Added a message handler branch: when `topic === TOPICS.repairQueue`, parses the payload and calls `handleRepairQueue(data)`. Placed just before the `engMatch` wildcard block.

### `public/js/views/engineering.js`
Four areas of change:
1. Added `let queueState = [];` module variable.
2. Added three helper functions: `formatEta`, `healthColorFromHealth`, `statusBadgeHtml`.
3. Replaced `renderQueue()` — now reads `queueState` directly instead of assembling from per-system state.
4. Added `export function handleRepairQueue(data)`.
5. Updated `renderDetail()` — cross-references `queueState` for queue position, status badge, and ETA.
6. Removed `renderQueue()` call from `handleEngineeringState` — queue only updates via the queue topic now.

### `public/css/style.css`
Updated the queue sidebar styles:
- `.eng-queue-item` changed from `flex-direction: row` to `flex-direction: column`.
- Added `.eng-queue-main` (horizontal inner row: pos + name + eta).
- Added `.eng-queue-eta` (right-edge ETA, `color: var(--dim)`).
- Added `.eng-queue-sub` (badge row, indented under name).
- Added `.eng-queue-badge`, `.eng-queue-badge--active` (green, pulsing), `.eng-queue-badge--queued` (dim), `.eng-queue-badge--blocked` (amber).
- Added `@keyframes badge-pulse` for the IN PROGRESS badge.

### `mock/publish-engineering.sh`
- Added `pub_queue()` helper that publishes to `coldorbit/output/repair/queue` (retained, QoS 1).
- Added `q_val()` helper that converts `0` to JSON `null` (used when per-system `repair_queue_position` is unset across phases).
- `seed()` now also publishes an initial queue: engines `in_progress` / ftl `queued` / utility_4 `blocked`.
- Jitter loop replaced the old rotate-positions logic with a 4-phase queue cycle (one `pub_queue` call per tick):
  - Phase 0 (ticks 0–4): `[engines in_progress, ftl queued, utility_4 blocked]`
  - Phase 1 (ticks 5–9): `[ftl in_progress, hull queued]`
  - Phase 2 (ticks 10–14): `[hull in_progress]`
  - Phase 3 (ticks 15–19): `[]` → ALL SYSTEMS NOMINAL
  - Repeats from Phase 0.
- ETAs count down within each phase based on `phase_tick`.

---

## Data flow: sidebar

```
MQTT broker publishes coldorbit/output/repair/queue
  └─► app.js client.on("message")
        └─► topic === TOPICS.repairQueue
              └─► handleRepairQueue(data)  [engineering.js]
                    ├─► queueState = data   (module-level array)
                    ├─► renderQueue()        (rebuilds sidebar DOM from queueState)
                    └─► renderDetail(activeDetail)  (if panel is open, refreshes it)
```

`renderQueue()` iterates `queueState` in array order (index 0 = priority 1). For each entry it reads `health` for colour, `repair_eta_seconds` for the ETA column, and `status` for the badge. It does not touch the per-system `state` object at all.

---

## Detail panel cross-reference

When `renderDetail(id)` runs, it calls:
```js
const queueEntry = queueState.find((e) => e.system === id);
```
- **Found:** position shown as `#N` (1-based indexOf + 1), ETA from `queueEntry.repair_eta_seconds`, status badge injected into `eng-det-meta`.
- **Not found:** "NOT IN QUEUE", ETA "—", no badge. This is authoritative — even if the per-system state still carries a stale `repair_queue_position`, the detail panel ignores it.

`renderDetail` is still called from `handleEngineeringState` (so the health bar and power row stay current), but the queue section now always reads from `queueState`, not from the per-system payload.

---

## Assembled-queue logic removed

The old `renderQueue()` collected all `state` entries where `repair_queue_position != null`, sorted by that field, and rendered them. That logic is completely gone — the function now reads `queueState` directly. The only remnant of `repair_queue_position` in the codebase is in the per-system state payloads (still published by the mock, still received by the client) but it is no longer read by the sidebar or the detail panel. `queueState` is the sole source.

---

## Smoke-test sequence

**Prerequisites:** broker running, `mock/publish-engineering.sh` running (no `--seed` flag so the jitter loop fires), Engineering view active.

1. **Initial load** — sidebar shows 3 entries:
   - `1 ENGINES   3:00  [IN PROGRESS]` (green, pulsing badge)
   - `2 FTL DRIVE 1:00  [QUEUED]` (amber, dim badge)
   - `3 UTIL 4    —     [BLOCKED]` (red/amber, amber badge)

2. **IN PROGRESS badge** — verify the green "IN PROGRESS" badge pulses (fades ~50% opacity on 1.4s cycle).

3. **QUEUED badge** — FTL DRIVE row shows dim "QUEUED" text with dim border.

4. **BLOCKED badge** — UTIL 4 row shows amber "BLOCKED" with ETA column showing "—".

5. **Detail panel — queued system** — tap FTL DRIVE on the schematic. Detail panel shows:
   - REPAIR QUEUE: #2
   - `[QUEUED]` badge
   - ETA: 1:00 (or current countdown value)

6. **Detail panel — system not in queue** — tap WEAPONS on the schematic. Detail panel shows:
   - REPAIR QUEUE: NOT IN QUEUE
   - No badge
   - ETA: —

7. **Phase transition (after ~20s)** — sidebar updates to Phase 1: ftl `in_progress`, hull `queued`. ENGINES row disappears. Hull appears.

8. **Empty queue (Phase 3, after ~60s)** — sidebar shows "ALL SYSTEMS / NOMINAL" in green.

9. **Detail panel during queue transition** — open the detail for ENGINES during Phase 0. When Phase 1 arrives (engines removed from queue), detail panel auto-refreshes: REPAIR QUEUE changes to "NOT IN QUEUE", badge disappears, ETA shows "—".

10. **ETA countdown** — within a single phase, ETA values should step down each tick (~4s) as `phase_tick` increments.

---

## Anything unexpected / worth reconsidering

- **ETA countdown is approximate.** The mock derives ETA from `phase_tick * constant` — it's a stepped simulation, not a real countdown. If a real sim-core publishes actual countdown values, the client handles it correctly (just formats `repair_eta_seconds`).

- **Two colour helpers co-exist.** `healthColor(id)` reads from per-system `state` (used by the schematic and detail panel). `healthColorFromHealth(health)` takes a raw integer (used by the sidebar, which gets health directly from the queue entry). They use identical thresholds. If the thresholds ever change, both need updating.

- **Sidebar width constraint.** The sidebar is `clamp(120px, 20%, 180px)`. With the new two-line layout (name + badge on separate lines) it renders cleanly at that width. Very long system names would overflow `.eng-queue-name` — nothing in SYSTEMS is long enough to be an issue currently.

- **`utility_2` disabled state.** The mock seeds `utility_2` as `disabled: true, health: 0` but it never appears in the repair queue. No change needed, but worth knowing if you later want to model a "disabled = queued" state.

- **Queue topic retained flag.** The broker retains the last `coldorbit/output/repair/queue` message. On fresh client connect (e.g. page reload), the client immediately receives the current queue state without waiting for the next publish. Correct behaviour — no changes needed.

---

*Whoever picks this up next: when your session is done, write a handover doc for the next session in the same format — files touched, data flow, smoke-test, and anything surprising. Keep context passing cleanly in both directions.*
