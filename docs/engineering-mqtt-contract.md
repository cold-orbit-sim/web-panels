# Engineering MQTT Contract

Session: 2026-08-04  
Status: **Defined this session — sim-core does not publish yet. Mock publisher exercises all states.**

---

## Subscription

The touchscreen client subscribes with a wildcard:

```
coldorbit/output/engineering/+/state
```

QoS 1, retain true (sim-core should publish retained so the display recovers correct state after reconnect).

---

## Topic pattern

```
coldorbit/output/engineering/<system>/state
```

`<system>` is one of:

| Value | Displayed label |
|-------|----------------|
| `weapons` | WEAPONS |
| `engines` | ENGINES |
| `ftl` | FTL DRIVE |
| `reactor` | REACTOR |
| `utility_1` | UTIL 1 |
| `utility_2` | UTIL 2 |
| `utility_3` | UTIL 3 |
| `utility_4` | UTIL 4 |
| `hull` | HULL |

Unknown system IDs are silently dropped by the client.

---

## Payload

```json
{
  "system": "engines",
  "health": 62,
  "power_allocated": 340,
  "power_unit": "kW",
  "power_max": 500,
  "disabled": false,
  "repair_queue_position": 1
}
```

### Field reference

| Field | Type | Notes |
|-------|------|-------|
| `system` | string | Must match the system id in the topic path. Client ignores the field body but it aids debugging. |
| `health` | integer 0–100 | Percentage. |
| `power_allocated` | number \| null | Current draw. `null` for `hull` and `reactor` (they don't draw from the allocation pool). |
| `power_unit` | string \| null | Unit label, e.g. `"kW"`. `null` when `power_allocated` is null. |
| `power_max` | number \| null | Maximum draw for this system. `null` when `power_allocated` is null. |
| `disabled` | boolean | Explicit disable flag — a system can be disabled without health = 0 (scripted events, player action). When true the client renders a pulsing dim-red state regardless of health value. |
| `repair_queue_position` | integer \| null | 1-based position in the repair queue. `null` if the system is not queued for repair. |

### Visual state mapping

| Condition | Colour | Class |
|-----------|--------|-------|
| No message received | dim grey (`--dim`) | — |
| `disabled: true` OR `health === 0` | red (`--red`) | `sys-disabled` (pulsing animation) |
| `health < 30` | red (`--red`) | — |
| `health` 30–70 | amber (`--amber`) | — |
| `health > 70` | green (`--green`) | — |

---

## Repair queue

The client builds the repair queue sidebar by collecting all systems where `repair_queue_position !== null` and sorting ascending. The sidebar is **display-only** — the physical Engineering panel's buttons control the queue; this client never publishes to the queue topic.

---

## Mock publisher

`mock/publish-engineering.sh` seeds all 9 systems with retained state, then streams slow jitter every 4 seconds. Initial seed state includes:

- `utility_2`: disabled (`health: 0, disabled: true`) — exercises the disabled visual state
- `utility_4`: health 22% — exercises the critical (< 30%) visual state
- `engines`, `ftl`, `hull`: health 48–68% — exercises the degraded state
- `weapons`, `reactor`, `utility_1`, `utility_3`: health > 70% — exercises nominal state

Run with `--seed` flag to seed once and exit (useful for resetting state during testing).
