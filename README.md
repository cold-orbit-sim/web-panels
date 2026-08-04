# Cold Orbit — aux-display-client

Static web server for Cold Orbit's browser-based auxiliary screens. No build
step, no framework, no runtime dependencies beyond Python 3 (stdlib) and a
Mosquitto broker.

## Project layout

```
server.py                   Entry point — serves public/ and hardpoint-panel/
public/
  index.html                Touchscreen client (single-page app)
  css/style.css             ECAM-style dark theme
  js/
    config.js               Broker URL, topic names, mode list
    app.js                  MQTT shell: connects, subscribes, drives view-swap
    views/
      hardpoints.js         Hardpoints view: per-slot in-place updates
  vendor/
    mqtt.min.js             MQTT.js 5.15.2 browser bundle (vendored, MIT)
hardpoint-panel/
  index.html                Placeholder (coming soon) for the 4 utility panels
docs/
  hardpoints-mqtt-contract.md   Topic/payload contract — READ BEFORE touching sim-core
  mosquitto-local.conf          Local dev broker config
mock/
  publish-hardpoints.sh     Mock publisher for hardpoint state + telemetry
  set-mode.sh               Publish a retained mode-select message
```

## Quick start

### 1. Local MQTT broker (one terminal)

```bash
mosquitto -c docs/mosquitto-local.conf
```

This opens port 1883 for native MQTT (mosquitto_pub) and port 9001 for
WebSocket (the browser). Both share the same broker state.

If port 1883 is already in use (e.g. by a system Mosquitto instance), edit
`docs/mosquitto-local.conf` to use different ports and update the mock scripts.

### 2. Static server (another terminal)

```bash
python3 server.py
```

Default port 8080. Optional argument overrides: `python3 server.py 9000`.

### 3. Mock publisher (another terminal)

```bash
mock/publish-hardpoints.sh
```

Publishes initial state for all 4 hardpoint slots, then loops emitting
telemetry jitter and periodic module changes so the display live-updates
without a real sim integration.

To also set the display mode (sub for the physical mode-select panel):

```bash
mock/set-mode.sh hardpoints
```

### 4. Open in browser

```
http://localhost:8080/
```

The page will show "LINK DOWN" until the broker is reachable. On connect it
updates live. Append `?mode=hardpoints` to force a view without publishing
the mode topic (useful during development).

For dev with a non-default broker port, append `?broker=ws://localhost:9001`
(or whatever you're using) to override `BROKER_URL` in config.js without
editing the file.

The hardpoint utility panel placeholder:

```
http://localhost:8080/hardpoint-panel/
```

## Changing the broker URL for production

Edit one line in `public/js/config.js`:

```js
export const BROKER_URL = "ws://<broker-host>:9001";
```

Or override at load time via the `?broker=` URL param (see above) — the
server never touches the MQTT connection, so no server-side config change
is needed.

## MQTT contract

See `docs/hardpoints-mqtt-contract.md` for the full topic/payload spec.
**This contract is not yet implemented by sim-core** — it's the agreed
surface the sim needs to match. Flag any changes to the master plan.

## Licence

Software: MIT  
Content: CC BY-SA  
Hardware: CERN-OHL
