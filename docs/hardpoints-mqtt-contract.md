# Hardpoints MQTT contract

**Status: canonical — matches master plan §3.1b (v33).**
This is the authoritative spec for the topics this repo publishes to and
subscribes from. Any change here must be reflected in the master plan, and
vice versa.

All MQTT traffic is split into two namespaces (per §3.1b):

- `coldorbit/input/…`  — raw hardware state, published by panel firmware
- `coldorbit/output/…` — display state, published by sim-core after applying
  game logic

Displays (including the touchscreen) subscribe to **`output`** topics only.
This repo does not publish to `input` or `output` in production; in local
development the mock scripts in `mock/` stand in for the missing firmware and
sim-core publishers.

## 1. Display mode select

Published by the 7-button mode-select panel firmware (a separate Pico, not
in this repo). The touchscreen client subscribes to receive mode changes and
swaps its active view in place — no page reload.

```
Topic:   coldorbit/output/touchscreen/mode
Retain:  true
QoS:     1
Payload: bare UTF-8 string, one of:
         engineering | propulsion | ftl | turrets | missiles | comms | hardpoints
```

Retained so the touchscreen recovers the correct view on reconnect/reboot
without waiting for the next button press.

> **Open question (carry forward):** The contract assumes the 7-button panel
> publishes a bare retained string. If the firmware plan specifies a different
> payload shape or topic path, `app.js`'s message handler will need updating —
> confirm against that panel's spec before wiring it up.

## 2. Hardpoint module state (per slot)

Published by sim-core whenever a module is mounted, unmounted, or its arm
state changes. Low frequency — not for streaming telemetry.

```
Topic:   coldorbit/output/hardpoints/<slot>/module      slot = 1 | 2 | 3 | 4
Retain:  true
QoS:     1
```

Payload:

```json
{
  "slot": 1,
  "category": "sensor_ew",
  "name": "Tractor Beam",
  "armed": true,
  "updated_at": "2026-08-04T04:56:00Z"
}
```

| Field        | Type            | Notes |
|--------------|-----------------|-------|
| `slot`       | integer 1–4     | Redundant with the topic; included so payloads are self-describing when logged/replayed. |
| `category`   | string enum     | One of `utility_tool`, `cargo_storage`, `sensor_ew`, `defense`, `empty`. Drives the client's badge colour. Unknown values degrade to `utility_tool` styling without errors, so new categories are safe to add on the sim-core side before the client is updated. |
| `name`       | string or `null`| Human-readable module name. `null` when `category` is `empty`. |
| `armed`      | boolean         | Mirrors the physical hardpoint panel's guarded Arm switch. `false` (not `null`) for empty slots. |
| `updated_at` | ISO-8601 string | Sim-core clock. Not currently used beyond display. |

Empty slot example:

```json
{ "slot": 3, "category": "empty", "name": null, "armed": false, "updated_at": "2026-08-04T04:50:00Z" }
```

## 3. Hardpoint telemetry (per slot)

High-frequency, per-module live value (power draw, gain, range, capacity —
whichever the module uses). Separated from `module` so fast updates don't
force a full slot re-render, only the readout bar.

```
Topic:   coldorbit/output/hardpoints/<slot>/telemetry   slot = 1 | 2 | 3 | 4
Retain:  false
QoS:     0
```

Payload:

```json
{
  "slot": 2,
  "label": "Power",
  "value": 340,
  "unit": "kW",
  "min": 0,
  "max": 500
}
```

Not retained: on reconnect the readout bar stays empty/dashed until the next
sample arrives rather than showing a stale value. QoS 0 because missing one
sample of a continuously-updating value is inconsequential.

The client renders `value` as a bar between `min` and `max` plus the raw
number with `unit` appended. `label` and `unit` are rendered as-is — no
fixed vocabulary enforced client-side, so sim-core can use whatever string
makes sense per module type.

## 4. Subscription pattern

The client subscribes with MQTT wildcards rather than 8 individual
subscriptions:

```
coldorbit/output/hardpoints/+/module
coldorbit/output/hardpoints/+/telemetry
```

Slot number is read from the payload's `slot` field (the canonical source
of truth). Topic segment parsing is used only as a routing fallback.

## Open questions for sim-core / master plan

- Should `armed: false` gate telemetry (i.e. does a disarmed module stop
  publishing, or publish zeros)? The client renders whatever it receives
  regardless of `armed` — this is sim-core's call.
- `telemetry.unit` has no enforced vocabulary yet. A shared list across
  panels would improve consistency once real module types are defined.
