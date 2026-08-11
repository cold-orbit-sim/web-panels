# Cold Orbit — Handback: Navigation / Drift Map View
Session: 2026-08-11

---

## Summary

New read-only **Map** status view (`mode` = `map`). Renders the 26-system Drift
starmap with an amber reticule on the currently-targeted system, plus a details
panel driven by the FTL nav target. When an active system is published the map
area swaps in place (no animation) to a per-system planet view. All target
selection happens on the physical FTL panel — this view only renders MQTT state.

New MQTT topics consumed (both retained, QoS 1):
- `coldorbit/output/ftl/target` — details panel + reticule
- `coldorbit/output/ftl/system` — non-null `system_id` switches to system view

---

## Files touched

### `public/js/config.js`
- Added `ftlTarget: "coldorbit/output/ftl/target"` and
  `ftlSystem: "coldorbit/output/ftl/system"` to the `TOPICS` export.
- Added `"map"` to the `MODES` array.

### `public/js/views/map.js` (new)
- `SYSTEMS` — canonical 26-system table (id, name, kind, x/y, labelY, deco),
  positions extracted from `drift_star_map_v2.svg` (viewBox `0 0 680 640`).
- `FIELD_STARS` — decorative background starfield.
- `starIcon(sys, scale)` — renders each star kind (b/a/f/g/k/m-type, binary,
  white/brown dwarf, red giant, pulsar, black hole) + deco flourishes
  (flare/disc/nebula/ring/green-ring/halo/oblate). Returns SVG string.
- `reticule(x, y, gap, len)` — four diagonal corner ticks.
- `buildStarmapSvg()` — **exported**, reused by the preview page.
- `initMap(el)` — builds the DOM (details panel + map area with starmap and
  hidden system wraps), caches refs, initial render.
- `handleFtlTarget(data)` — stores target, re-renders details + reticule/planet.
- `handleFtlSystem(data)` — stores system, toggles starmap ⇆ system view.
- `renderSystemView()` — parent star at left, planets in a row; reticule on the
  targeted planet (matched by `lastTarget.name`); "NO PLANETS" when empty.

### `public/index.html`
Added `<section id="view-map" class="view-map" data-view="map"></section>`
immediately before `view-comms`.

### `public/js/app.js`
- Imported `initMap, handleFtlTarget, handleFtlSystem` from `./views/map.js`.
- `VIEW_TITLES.map = "NAVIGATION — DRIFT MAP"`.
- `initMap(document.getElementById("view-map"))` after `initComms(...)`.
- Added `TOPICS.ftlTarget` and `TOPICS.ftlSystem` to the subscribe array.
- Added two message-handler branches (after the `ftlState` branch): parse JSON
  and call `handleFtlTarget` / `handleFtlSystem`.

### `public/css/style.css`
Appended a `MAP VIEW` block:
- `.view-map` (flex row, `.active` toggles display), `.map-details` (left 26%
  panel), `.map-target-name`, `.map-field*`, `.map-no-target`.
- `.map-area`, `.map-starmap-wrap` / `.map-system-wrap` (hidden toggling),
  `.map-starmap-svg` / `.map-system-svg`, `.map-sys-label`.
- `.map-reticule line` (amber, matches FTL selection).
- Star-icon classes `ms-*` — panel-palette translation of the original
  saturated map (hot→white+blue halo, warm→warm white, mid→amber, cool→red).
- System-view classes `.map-planet`, `.map-sysview-label*`, `.map-no-planets`.

### `mock/publish-ftl-map.sh` (new, executable)
Publishes nav target + active system. Cycles: no target → star targets around
the map → drill into Kerath and step through its 4 planets → back out.
- `--seed` publishes a single Kerath star target then exits.
- Does **not** set the display mode by default (the mode topic is contended
  with `publish-ftl.sh`). Set `MAP_SET_MODE=1` env, or run `mock/set-mode.sh map`,
  to switch the display when running standalone.

### `mock/mock-everything.sh`
Added `publish-ftl-map.sh` to the `PUBLISHERS` array (after `publish-ftl.sh`).

### `mock/map-starmap-preview.html` (new)
Standalone preview importing `map.js` + the real `style.css`. Buttons switch
between: no target, star target (Kerath / Xelgrave), system view with a planet
target, and system view with no planets.

---

## Payload shapes

`coldorbit/output/ftl/target`:
```json
{ "type": "none" }
{ "type": "star",   "system_id": "K", "name": "Kerath", "star_type": "K-type main sequence",
  "planet_count": 4, "distance_au": 1.4, "spool_time_s": 95 }
{ "type": "planet", "system_id": "K", "system_name": "Kerath", "name": "Kerath III",
  "star_type": "Rocky / thin atmosphere", "distance_au": 1.6, "spool_time_s": 110 }
```

`coldorbit/output/ftl/system`:
```json
{ "system_id": null }
{ "system_id": "K", "star_name": "Kerath",
  "planets": [ { "name": "Kerath I" }, { "name": "Kerath II" } ] }
```

---

## Data flow

```
coldorbit/output/ftl/target ─► app.js message handler ─► handleFtlTarget(data) [map.js]
                                                            ├─ renderDetails()   (left panel)
                                                            └─ renderMapArea()   (reticule / planet)
coldorbit/output/ftl/system ─► app.js message handler ─► handleFtlSystem(data) [map.js]
                                                            └─ renderMapArea()   (starmap ⇆ system)
```

`renderMapArea()` shows the system view when `lastSystem.system_id != null`,
otherwise the starmap with the reticule on `lastTarget.system_id`.

---

## Verification done
- `node --check` on `map.js`, `app.js`, `config.js` — all pass.
- Headless render of `buildStarmapSvg()` — 145 elements, no `NaN`/`undefined`.
- `bash -n` on `publish-ftl-map.sh` and `mock-everything.sh` — pass.
- Mock JSON payloads parse via `JSON.parse`.
- **Not run:** `test_server.py` — the `python`/`python3` shim hung on
  auto-install in this environment. Server code was not modified, so this is
  unaffected, but re-run it in a real env to be safe.

## Suggested manual check
Open `mock/map-starmap-preview.html` in a browser and click through the five
scenarios, or run `MAP_SET_MODE=1 mock/publish-ftl-map.sh` against a broker.
