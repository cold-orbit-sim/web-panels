#!/usr/bin/env bash
# Publishes FTL navigation target + active system for the map view.
# Cycles: no target → star targets on the starmap → drill into a system and
# step through its planets → back out to the starmap.
#
# Topics (both retain, QoS 1):
#   coldorbit/output/ftl/target   — details panel + reticule
#   coldorbit/output/ftl/system   — non-null system_id switches to system view
#
# Usage:
#   mock/publish-ftl-map.sh           # runs indefinitely (Ctrl-C to stop)
#   mock/publish-ftl-map.sh --seed    # seed only (Kerath star target), then exit

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

PUB="mosquitto_pub -h $HOST -p $PORT -q 1 -r"
MODE_TOPIC="coldorbit/output/touchscreen/mode"
TARGET_TOPIC="coldorbit/output/ftl/target"
SYSTEM_TOPIC="coldorbit/output/ftl/system"

# ── helpers ───────────────────────────────────────────────────────────────────

pub_no_target() {
  $PUB -t "$TARGET_TOPIC" -m '{"type":"none"}'
}

pub_star() {
  local sys_id="$1" name="$2" star_type="$3" planets="$4" dist="$5" spool="$6"
  $PUB -t "$TARGET_TOPIC" -m "$(printf \
    '{"type":"star","system_id":"%s","name":"%s","star_type":"%s","planet_count":%d,"distance_au":%s,"spool_time_s":%d}' \
    "$sys_id" "$name" "$star_type" "$planets" "$dist" "$spool")"
}

pub_planet() {
  local sys_id="$1" sys_name="$2" name="$3" ptype="$4" dist="$5" spool="$6"
  $PUB -t "$TARGET_TOPIC" -m "$(printf \
    '{"type":"planet","system_id":"%s","system_name":"%s","name":"%s","star_type":"%s","distance_au":%s,"spool_time_s":%d}' \
    "$sys_id" "$sys_name" "$name" "$ptype" "$dist" "$spool")"
}

pub_system_none() {
  $PUB -t "$SYSTEM_TOPIC" -m '{"system_id":null}'
}

pub_system() {
  local sys_id="$1" star_name="$2" planets_json="$3"
  $PUB -t "$SYSTEM_TOPIC" -m "$(printf \
    '{"system_id":"%s","star_name":"%s","planets":%s}' \
    "$sys_id" "$star_name" "$planets_json")"
}

KERATH_PLANETS='[{"name":"Kerath I"},{"name":"Kerath II"},{"name":"Kerath III"},{"name":"Kerath IV"}]'

# ── seed mode ─────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--seed" ]]; then
  pub_system_none
  pub_star K "Kerath" "K-type main sequence" 4 "1.4" 95
  echo "Seeded: Kerath star target on the starmap."
  exit 0
fi

# Only switch the display when run standalone — inside mock-everything.sh the
# mode topic is contended (publish-ftl.sh also drives it), so set it via
# MAP_SET_MODE=1 (or run mock/set-mode.sh map) when you want this view up.
if [[ "${MAP_SET_MODE:-0}" == "1" ]]; then
  $PUB -t "$MODE_TOPIC" -m "map"
  echo "Mode → map."
fi
echo "Publishing navigation targets (Ctrl-C to stop)…"
echo

while true; do

  # ── 1. No target ──────────────────────────────────────────────────────────
  echo "[starmap] no target"
  pub_system_none
  pub_no_target
  sleep 3

  # ── 2. Star targets around the map ────────────────────────────────────────
  echo "[starmap] target → Kerath (K)"
  pub_star K "Kerath" "K-type main sequence" 4 "1.4" 95
  sleep 3

  echo "[starmap] target → Nyxaros (N)"
  pub_star N "Nyxaros" "Pulsar" 1 "8.2" 310
  sleep 3

  echo "[starmap] target → Xelgrave (X)"
  pub_star X "Xelgrave" "Black hole" 0 "12.8" 420
  sleep 3

  echo "[starmap] target → Duskane (D)"
  pub_star D "Duskane" "Red giant" 6 "5.1" 240
  sleep 3

  # ── 3. Drill into Kerath, step through its planets ───────────────────────
  echo "[system] entering Kerath"
  pub_star K "Kerath" "K-type main sequence" 4 "1.4" 95
  pub_system K "Kerath" "$KERATH_PLANETS"
  sleep 2

  for n in I II III IV; do
    echo "  planet → Kerath $n"
    case "$n" in
      I)   pub_planet K "Kerath" "Kerath I"   "Molten / no atmosphere"   "1.4" 92  ;;
      II)  pub_planet K "Kerath" "Kerath II"  "Rocky / trace atmosphere" "1.5" 98  ;;
      III) pub_planet K "Kerath" "Kerath III" "Rocky / thin atmosphere"  "1.6" 110 ;;
      IV)  pub_planet K "Kerath" "Kerath IV"  "Gas giant"                "2.3" 165 ;;
    esac
    sleep 2.5
  done

  # ── 4. Back out to the starmap ────────────────────────────────────────────
  echo "[starmap] leaving system"
  pub_system_none
  pub_star K "Kerath" "K-type main sequence" 4 "1.4" 95
  sleep 3

  echo
  echo "── cycle complete, restarting ──"
  echo

done
