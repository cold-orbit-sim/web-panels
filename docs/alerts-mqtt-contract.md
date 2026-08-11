# Alerts MQTT Contract

## Output topic — client subscribes

| Field | Value |
|---|---|
| Topic | `coldorbit/output/alerts` |
| Publisher | sim-core |
| Subscriber | display client (read-only) |
| QoS | 1 |
| Retain | true |

### Payload shape

```json
[
  {
    "id": "alert_001",
    "severity": "warning",
    "system": "engines",
    "message": "ENGINE 2 OVERHEAT",
    "timestamp_s": 3720,
    "acknowledged": false
  },
  {
    "id": "alert_002",
    "severity": "caution",
    "system": "ftl",
    "message": "FTL CHARGE INTERRUPTED",
    "timestamp_s": 3698,
    "acknowledged": true
  }
]
```

An empty array `[]` means no active alerts.

#### Field notes

- **`id`** — stable identifier for an alert instance; used to correlate repeated publishes of the same event.
- **`severity`** — `"warning"` or `"caution"`.
- **`system`** — free-form system name (underscores allowed); display client renders it uppercased.
- **`timestamp_s`** — mission elapsed time in seconds when the alert was raised.
- **`acknowledged`** — set by sim-core when the physical Master Warn or Master Caution button is pressed. The display client **never** sets this field.

### Client behaviour

- Flash blinks continuously while any alert with `acknowledged: false` exists.
- Warning (red) flash takes priority over caution (amber) flash.
- Flash stops when all active alerts have `acknowledged: true`; the title-bar colour remains as long as any alert exists.
- Acknowledged alerts appear in the popup in a dimmed/muted style, sorted after unacknowledged entries.

---

## Input topics — for sim-core only (client does NOT subscribe or publish)

These topics are pressed by the physical Master Warn/Caution buttons on the Comms panel. sim-core listens for them and responds by setting `acknowledged: true` on matching severity entries and republishing the alerts array.

| Topic | Purpose |
|---|---|
| `coldorbit/input/comms/ack-warning` | Acks all active `severity: "warning"` entries |
| `coldorbit/input/comms/ack-caution` | Acks all active `severity: "caution"` entries |

| Field | Value |
|---|---|
| Publisher | Comms hardware panel |
| Subscriber | sim-core only |
| QoS | 1 |
| Retain | false |
| Payload | `{}` (bare pulse) |

The display client has no subscription or publish logic for these topics.
