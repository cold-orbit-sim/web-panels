# Cold Orbit — Agent Guidance

This document is for any AI agent working on Cold Orbit. Read it before doing anything else.

---

## What this project is

Cold Orbit is an open-source physical starship bridge simulator. A real seated console with custom hardware panels, HOTAS, pedals, and screens. The player remotely operates a bounty-hunting drone ship. Everything is original IP — not an existing universe.

The project is fully open source from day one: MIT (software), CC BY-SA (content), CERN-OHL (hardware). Everything lives in git with no "clean it up before I publish" phase.

---

## The master plan is the canonical truth

The master project plan lives in the Project Knowledge Base as `master-project-plan-<version>.md`. It is the authoritative reference across all work-streams. Before doing anything, read it in full.

**When the Knowledge Base version differs from anything in your context, the Knowledge Base version wins. Adopt it automatically without asking.**

Every time you update the master plan:
- Increment the version number
- Add a changelog entry (most recent first, one line is enough)
- Reread the entire file before editing — never assume your context copy is current
- Generate the complete updated file as a downloadable artifact at `/mnt/user-data/outputs/`

---

## How work is organized

This project runs in multiple separate Claude conversations, one per work-stream:

- **Master planning** — architecture decisions, cross-cutting concerns, MQTT contracts, master plan updates
- **sim-core** — Godot 4.7 / C# / .NET 8 simulation and main screen
- **aux-display-client** — browser-based HTML/JS touchscreen and hardpoint panel pages
- **hardware** — CAD, panel firmware, wiring
- **setting/lore** — world-building, story, lore
- **docs** — documentation

Decisions made in one work-stream conversation feed back to the master planning conversation, which updates the master plan. The Knowledge Base is the mechanism that shares context across conversations.

---

## The handover/handback pattern

When handing off to Claude Code, write a handover doc. When Claude Code is done, it writes a handback doc. These pass context cleanly without relying on conversation history.

**Handover doc (planning → Claude Code) must include:**
- What to build, with enough detail that no design decisions need to be invented
- All relevant MQTT topic paths, payload shapes, QoS, retain flags
- What must NOT change
- A request for a handback doc in the same format

**Handback doc (Claude Code → planning) must include:**
1. Every file touched and what changed
2. MQTT contracts as actually implemented (may differ from spec — document what landed)
3. Calls made on open items, with brief reasoning
4. How to smoke-test locally — full sequence from a clean shell
5. Anything unexpected, flagged risks, or things worth reconsidering
6. The instruction to write a handover doc for the next session in the same format

**Never update the master plan from a handover alone. Wait for the handback, confirm what actually landed, then update.**

---

## MQTT architecture

The single most important architectural decision. All MQTT traffic follows a two-namespace convention:

- **`coldorbit/input/…`** — hardware publishes raw physical state (switch moved, button pressed, encoder turned). Sim-core subscribes. Panel firmware never reads display state.
- **`coldorbit/output/…`** — sim-core publishes what should be *displayed*, after applying game logic (damage states, disabled conditions, overrides). Displays subscribe and render faithfully.

Physical controls and display state are not the same thing. A guarded Arm switch may be physically set to armed, but sim-core may override the effective state (e.g. slot damaged, module not loaded). Sim-core is the single source of truth for everything shown on a display.

**Performance:** don't optimise. Controls publish on change only; telemetry is small JSON at moderate rates; the broker is local and wired. Message volume at this scale is not a concern.

### Topic naming conventions

```
coldorbit/output/hardpoints/<slot>/module      slot = 1|2|3|4
coldorbit/output/hardpoints/<slot>/telemetry
coldorbit/input/hardpoints/<slot>/arm
coldorbit/input/hardpoints/<slot>/softkey
coldorbit/input/hardpoints/<slot>/encoder_a
coldorbit/input/hardpoints/<slot>/encoder_b
coldorbit/output/touchscreen/mode             bare string, retained
coldorbit/output/ship/loadout-unlocked        boolean, retained
coldorbit/input/ship/loadout                  retained
coldorbit/output/engineering/<system>/state   system = weapons|engines|ftl|reactor|utility_1–4|hull
coldorbit/output/repair/queue                 retained
coldorbit/input/engineering/repair_priority
coldorbit/output/propulsion/state             retained, 10 Hz
coldorbit/output/ftl/state                    retained, 10 Hz
coldorbit/output/ftl/target                   retained
coldorbit/output/ftl/system                   retained
coldorbit/output/alerts                       retained
coldorbit/input/comms/master_warn
coldorbit/input/comms/master_caut
coldorbit/input/alerts/acknowledge
coldorbit/output/comms/log                    retained
coldorbit/output/comms/targets                retained
coldorbit/output/turrets/<turret>/state       turret = dorsal|ventral, retained
coldorbit/input/turrets/<turret>/ammo
coldorbit/output/missiles/<tube>/state        tube = fore_port|fore_starboard|aft_port|aft_starboard, retained
coldorbit/input/missiles/<tube>/type
```

Full payload specs for all topics live in the master plan §3.1b. When in doubt, read the master plan — do not invent topic shapes.

---

## The aux-display-client

A static webserver (`server.py`) serving two types of pages:

**`public/index.html`** — the touchscreen. A single-page app with 8 views (Engineering, Propulsion, FTL, Turrets, Missiles, Comms, Hardpoints, Map) plus a Loadout overlay. Mode-switching is driven by the MQTT mode topic — never a page reload. The page subscribes to `coldorbit/output/touchscreen/mode` on connect and calls `setMode()` on every message.

**`hardpoint-panel/index.html?panel=1–4`** — the four generic utility hardpoint panel pages. One design, four instances. Module detection via `category` + `name` fields from the module state topic. Soft-key labels and encoder values rendered around a central SVG graphic.

### Key patterns in the codebase

- All topic strings live in `public/js/config.js` — never scattered in view files
- Topic regexes (for wildcard subscriptions) also live in `config.js`
- Views are ES modules imported into `app.js`; each exports `init<View>(el)` and `handle<Topic>(data)` functions
- DOM updates are surgical — never rebuild the whole view on every tick; update only what changed
- Retained topics restore state on reconnect — design for this
- Mock scripts in `mock/` simulate all topics for development without a running sim-core

### Things that are approved — do not change without review

- FTL ring SVG graphic (`views/ftl.js`) — seven-layer concentric rings, CSS-animated
- Drift star map SVG (`views/map.js`) — hardcoded 26-system layout traced from `drift_star_map_v2.png`
- Missiles hull schematic SVG
- All 12 hardpoint module vector graphics
- Turret top-down mechanical drawing SVGs

---

## The sim-core (Godot 4.7 / C# / .NET 8)

The simulation runs in Godot. `SimBus.cs` is an autoload that decouples the simulation from the UI — it owns all MQTT state and publishes it. Panels subscribe to `SimBus` properties rather than reading `PlayerShip` directly.

`SimBus` is structured into nested classes per panel (e.g. `SimBus.Propulsion`, `SimBus.Ftl`). When a new panel gets wired, give it its own nested class.

Sim-core publishes to `output` topics and subscribes to `input` topics. It is the sole source of truth for all display state — it never mirrors hardware state directly to displays.

**Important Godot constraints:**
- Single-precision floats break down at planetary/interstellar distances — each planet is its own isolated local scene
- `_IntegrateForces` runs on the physics thread — no SimBus calls from inside it; use a pending-field pattern
- `embed_subwindows=false` gives a separate OS window for the control panel UI

---

## Hardware constraints

These are fixed from day one and never change:

- **Hand tools only** — hacksaw, coping saw, hand drill. Enclosures are hand-cut plywood with butt joints, glue blocks, removable front panels.
- **Wired MQTT, no wireless anywhere in the input chain**
- **Microcontroller: Raspberry Pi Pico + WIZnet W5500-EVB-Pico** (RP2040 + W5500 Ethernet) for most panels
- **Exception: the 4 generic hardpoint panels use a Raspberry Pi** — they need a full browser for the aux-display-client
- **I/O expansion: MCP23017 I2C expanders** (DIP-28, not DIP-16)
- **Analog input: MCP3008 SPI ADC** (DIP-16)
- **Addressable LED rings: WS2812-style, daisy-chained on a single Pico data pin** — never via MCP23017
- **W5500-EVB-Pico: GP16–21 are hardwired to the W5500** — never assign them to other peripherals
- **Modular and transportable** — whole rig breaks down to fit in a car trunk in one trip

---

## Things that are locked in — don't relitigate

Everything in the master plan §3 (Architecture Decisions) is decided. Key ones:

- Wired MQTT broker-centric topology — no wireless
- Godot 4.7 / C# / .NET 8 for sim-core and main screen
- Browser-based HTML/Canvas for aux displays (MQTT over WebSocket)
- `coldorbit/input/…` vs `coldorbit/output/…` namespace split
- Arm gates the control stack on all armed panels — always first in physical sequence
- The 12 hardpoint modules across 4 categories (utility tool, cargo/storage, sensor/EW, defense)
- All 9 touchscreen panel control designs (§7.1–§7.9)
- The Drift — 26 star systems, 80 planets, all named (§2)
- FTL mechanic: jump drive, instantaneous translation, spool-up charges with distance, mandatory cooldown, signal-lag mechanic
- Multi-planet/multi-system scene architecture: each planet is its own local scene, no shared coordinate space

---

## Things that are explicitly not yet designed

Don't invent answers for these — flag them as open:

- Subsystem-level damage/disable model (needed by FTL interrupt condition, Engineering repair, Propulsion overheat)
- Shield power balancing across facings
- Grapple-throw gameplay model (`attached` field currently always `false`)
- Ore type filter list (currently hardcoded MOCK strings client-side)
- `coldorbit/output/ship/callsign` topic (callsign hardcoded as "Cold Orbit" throughout)
- Encoder B input topic for hardpoint panels (defined in contract but not yet subscribed in sim-core)
- Whether incoming missile-lock warning raises a general Alert or stays panel-local only

---

## Flag, don't silently resolve

If you encounter a conflict between the master plan and a repo, surface it. If you discover a design tension while implementing, flag it rather than quietly picking one path. The master plan has an explicit open-item tracking convention — use it.

The one exception: if the Knowledge Base master plan differs from something in your context, adopt the KB version without asking.

---

## What "approved" means

Several SVG graphics and schematics are marked "approved — do not change without review." This means the human has signed off on their visual design and any modification needs an explicit decision, not a silent update. When in doubt, produce a preview file and flag it for review rather than committing a change.

---

## Practical notes for Claude Code sessions

- Mock scripts in `mock/` are the test harness — keep them up to date when topics change
- `mock/mock-everything.sh` runs all publishers — add new scripts to its `PUBLISHERS` array
- For new visual elements (SVGs, schematics), produce a standalone preview HTML in `mock/` and flag it in the handback for review before considering the work done
- `node --check` and `bash -n` are your friends before declaring done
- The broker config for local dev is `docs/mosquitto-local.conf` — needs both a native MQTT listener (1883) and a WebSocket listener (9001)
- `?mode=<view>` URL parameter forces a view without the broker, useful for isolated testing
