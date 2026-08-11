# Cold Orbit — MQTT Contract: Repair Queue

**Version:** 1.0
**Date:** 2026-08-09
**Status:** Canonical — for sim-core implementation and Engineering panel wiring

This document defines the MQTT topics governing the repair queue: the
ordered list of subsystems awaiting or undergoing repair, and the inputs
that change priority. It complements the per-system Engineering state
contract (§3.1b `coldorbit/output/engineering/<system>/state`) — that
contract carries per-system health and damage effects; this contract carries
the ordered work list.

---

## Relationship to the Engineering state contract

Two contracts work together to describe repair state:

- **Per-system topic** (`coldorbit/output/engineering/<system>/state`) —
  carries `health`, `effects`, `disabled`, `power_allocated`, and
  `repair_queue_position` (1-based position in the queue, or null if not
  queued). This is what the touchscreen Engineering view already subscribes
  to and renders.

- **Queue topic** (`coldorbit/output/repair/queue`) — carries the ordered
  list of queued systems, their repair status, and ETAs. This is the
  canonical source of queue order. Sim-core derives
  `repair_queue_position` in each per-system publish from this queue.

A system not in the queue has `repair_queue_position: null` in its state
topic and does not appear in the queue array.

---

## Output topic — queue state

```
coldorbit/output/repair/queue
Retain: true   QoS: 1
```

Published whenever the queue changes (system added, removed, promoted,
status changes, ETA updates). Full array on every publish — not a diff.
Empty array `[]` when no systems are queued.

```json
[
  {
    "system": "engines",
    "status": "in_progress",
    "repair_eta_seconds": 180,
    "health": 35
  },
  {
    "system": "ftl",
    "status": "queued",
    "repair_eta_seconds": 60,
    "health": 70
  },
  {
    "system": "hull",
    "status": "blocked",
    "repair_eta_seconds": null,
    "health": 12
  }
]
```

Array position = repair priority. Index 0 is highest priority (currently
being worked on or next to be worked on). Sim-core owns queue ordering.

| Field | Type | Notes |
|-------|------|-------|
| `system` | string | `weapons` \| `engines` \| `ftl` \| `reactor` \| `utility_1`–`utility_4` \| `hull` — matches Engineering state topic system IDs |
| `status` | string | `in_progress` — actively being repaired (only one system at a time); `queued` — waiting; `blocked` — queued but repair cannot proceed (missing parts, requires docking, etc.) |
| `repair_eta_seconds` | integer \| null | Estimated seconds until repair complete. `null` when unknown, blocked, or not yet calculable |
| `health` | integer 0–100 | Current health % of this system — redundant with the per-system topic but allows queue subscribers to render health without also subscribing to all 9 engineering state topics |

Constraints:
- At most one entry may have `status: "in_progress"` at any time.
- `status: "in_progress"` must be the first entry (index 0). If the
  highest-priority system is blocked, it may have `status: "blocked"` at
  index 0 — sim-core should still attempt to work on the next non-blocked
  entry in that case, and may choose to re-order the array accordingly or
  keep the blocked system at position 0 and mark the actual working system
  with `in_progress`. Flag your decision in the handback when implementing.
- `repair_eta_seconds` should be `null` for `blocked` entries.
- A system with `health: 100` must not appear in the queue.

---

## Input topic — priority change

```
coldorbit/input/engineering/repair_priority
Retain: false   QoS: 1
```

Published by the Engineering panel's repair-priority buttons (§7.8 —
8 momentary buttons, one per subsystem). Pressing a button promotes that
system to the top of the queue (position 0). If the system is not in the
queue, it is added at position 0.

```json
{ "system": "ftl", "updated_at": 1754561234567 }
```

| Field | Type | Notes |
|-------|------|-------|
| `system` | string | Same system ID set as above |
| `updated_at` | integer | Unix timestamp in milliseconds |

On receipt, sim-core:
1. Moves the named system to position 0 in the queue (adds it if not
   present, sets `status: "queued"` if it was absent).
2. Demotes the previously-highest-priority system to position 1 (if any).
3. Updates `status` of displaced `in_progress` system back to `"queued"` —
   repair is interrupted, not completed.
4. Publishes the updated queue to `coldorbit/output/repair/queue`.
5. Publishes updated `repair_queue_position` for all affected systems to
   their respective `coldorbit/output/engineering/<system>/state` topics.

**Note:** if the named system has `health: 100` (undamaged), sim-core
ignores the message — a healthy system cannot be queued.

---

## Input topic — remove from queue

```
coldorbit/input/engineering/repair_cancel
Retain: false   QoS: 1
```

Published to remove a system from the queue entirely (e.g. the player
decides not to repair a low-priority system). Not currently wired to a
physical button — admin panel only for now.

```json
{ "system": "weapons", "updated_at": 1754561234567 }
```

On receipt, sim-core removes the named system from the queue, republishes
the queue, and sets `repair_queue_position: null` in that system's state
topic.

---

## Sync rules

Sim-core must keep `repair_queue_position` in the per-system Engineering
state topics consistent with the queue array at all times:

- When the queue changes, republish the state topic for every system whose
  `repair_queue_position` has changed (both promoted and demoted systems).
- When a system is removed from the queue, set `repair_queue_position: null`
  in its state topic.
- `repair_eta_seconds` in the state topic must match the queue entry for
  that system.

The two topics are not independent — the queue topic is the source of
truth; the per-system fields are derived from it.

---

## Open items

- **`in_progress` with blocked predecessor** — if the highest-priority
  system is blocked, should the queue reorder to put the actual working
  system first, or leave the blocked system at position 0 and let the
  display infer the working system from `status`? Needs a decision when
  implementing; flag in handback.
- **Repair rate / ETA calculation** — not yet designed. The damage model
  (§2) is the prerequisite. Until then, `repair_eta_seconds` is always
  `null` or a hardcoded placeholder.
- **Parts / docking requirement for `blocked` status** — the `blocked`
  state is defined but the conditions that trigger it are not. To be
  specified when the repair/economy model is designed.
- **LED state on Engineering panel priority buttons (§7.8)** — each button
  has an LED. The lit state is not yet defined — candidates are: lit when
  that system is queued, lit only when `in_progress`, or lit when health
  is below a threshold. To be decided when Engineering panel firmware is
  wired.
- **`utility_1`–`utility_4` queue identity** — the queue uses `utility_1`
  etc. as system IDs, but hardpoint slots can change module at any time via
  loadout. Whether the repair queue tracks the slot or the mounted module
  is an open design question (repairing a slot that now has a different
  module in it is ambiguous). Defer until the damage model exists.
