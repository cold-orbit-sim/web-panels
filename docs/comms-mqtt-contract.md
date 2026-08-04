# Comms View — MQTT Contract

Session: 2026-08-04  
Status: mock-only (sim-core does not publish real Comms state yet)

---

## Topics

### `coldorbit/output/comms/log`

| Property | Value |
|---|---|
| QoS | 1 |
| Retain | **yes** |
| Publisher | sim-core (or mock script) |
| Subscriber | touchscreen client |

Full message log as a JSON array. Sim-core republishes the entire array whenever a new message is appended. The retained flag ensures a reconnecting client receives the full log immediately without needing to track per-message state.

**Tradeoff considered:** per-message topics (`coldorbit/output/comms/message/<id>` retained) would keep individual payloads tiny but would require the client to assemble the log in order and handle deletions. At the expected log size (~50 messages, each under 200 bytes), a full-array retained payload is simpler and reconnect-correct. If the log grows large, sim-core can truncate to the last N messages before publishing.

**Payload shape:**
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

**Fields:**

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable unique identifier per message |
| `direction` | `"incoming"` \| `"outgoing"` | Controls left/right alignment in UI |
| `sender` | string | Display name. For outgoing, the client renders "YOU"; `sender` is still included for future logging |
| `text` | string | Message body text |
| `timestamp_s` | integer | Mission time in seconds since mission start. Displayed as `T+HH:MM:SS` |

**Timestamp source choice:** mission time (seconds) was chosen over wall clock. Simpler to mock, no clock-sync dependency, and fits the game's diegetic fiction better.

---

### `coldorbit/output/comms/targets`

| Property | Value |
|---|---|
| QoS | 1 |
| Retain | **yes** |
| Publisher | sim-core (or mock script) |
| Subscriber | touchscreen client |

Full contacts-in-range list as a JSON array. Sim-core republishes the entire array whenever any contact is added, removed, or has a range change significant enough to surface. Live range updates while a popup is open are handled client-side by re-reading from the latest payload.

**Payload shape:**
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

**Fields:**

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable contact identifier. Used to track popup selection across re-renders |
| `name` | string | Display name |
| `alliance` | string | e.g. `"Independent"`, `"Frontier Collective"`, `"Unknown"` |
| `vessel_class` | string | e.g. `"Light Freighter"`, `"Interceptor"` |
| `range_m` | integer | Distance in metres. Client formats as `X.X km` above 1000 m |

**Popup detail source:** the popup reads its four fields directly from this list payload — no separate per-contact detail topic. If richer popup data is needed later (signal strength, IFF status, bounty flag, etc.), add a `coldorbit/output/comms/target/<id>/detail` topic per contact and wire a subscription on popup open.

---

## Mock tooling

`mock/publish-comms.sh` — seeds 8 log messages and 7 contacts (enough to force scrolling in the targets list), then streams:

- Range updates every ~5 s (re-publishes full targets array)
- New incoming messages every ~15 s (appends to log, re-publishes)

```bash
# Seed only, then exit
mock/publish-comms.sh --seed

# Seed and stream (runs until Ctrl-C)
mock/publish-comms.sh
```

Set mode before running:
```bash
mock/set-mode.sh comms
```
