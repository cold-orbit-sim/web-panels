#!/usr/bin/env bash
# Mock publisher for the Hardpoints MQTT contract (docs/hardpoints-mqtt-contract.md).
#
# Publishes an initial state for all 4 slots, then loops publishing
# telemetry jitter and occasional module changes so you can watch the
# touchscreen client update live without touching sim-core (which doesn't
# implement this yet).
#
# Usage:
#   mock/publish-hardpoints.sh                    # localhost:1883
#   MQTT_HOST=192.168.1.10 MQTT_PORT=1883 mock/publish-hardpoints.sh
#
# Requires mosquitto_pub (part of the mosquitto-clients / mosquitto brew
# package). Talks to the broker's normal MQTT listener, NOT the websocket
# listener the browser uses — see docs/mosquitto-local.conf.

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

pub() {
  local topic="$1" payload="$2" retain="$3"
  local args=(-h "$HOST" -p "$PORT" -t "$topic" -m "$payload" -q 1)
  [[ "$retain" == "retain" ]] && args+=(-r)
  mosquitto_pub "${args[@]}"
}

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

publish_module() {
  local slot="$1" category="$2" name="$3" armed="$4"
  local name_json
  if [[ "$name" == "null" ]]; then name_json="null"; else name_json="\"$name\""; fi
  pub "coldorbit/output/hardpoints/${slot}/module" \
    "{\"slot\":${slot},\"category\":\"${category}\",\"name\":${name_json},\"armed\":${armed},\"updated_at\":\"$(now)\"}" \
    retain
}

publish_telemetry() {
  local slot="$1" label="$2" value="$3" unit="$4" min="$5" max="$6"
  pub "coldorbit/output/hardpoints/${slot}/telemetry" \
    "{\"slot\":${slot},\"label\":\"${label}\",\"value\":${value},\"unit\":\"${unit}\",\"min\":${min},\"max\":${max}}" \
    no
}

echo "Publishing initial hardpoint state to ${HOST}:${PORT} ..."

publish_module 1 "sensor_ew" "Tractor Beam" true
publish_telemetry 1 "Gain" 62 "%" 0 100

publish_module 2 "defense" "Shields" true
publish_telemetry 2 "Power" 340 "kW" 0 500

publish_module 3 "empty" "null" false

publish_module 4 "utility_tool" "Mining Laser" false
publish_telemetry 4 "Range" 1200 "m" 0 2000

echo "Initial state published. Streaming telemetry jitter + periodic module changes."
echo "Ctrl-C to stop."

i=0
while true; do
  sleep 2
  i=$((i + 1))

  # Jitter telemetry on the two armed slots.
  gain=$(( (RANDOM % 100) ))
  publish_telemetry 1 "Gain" "$gain" "%" 0 100

  power=$(( 250 + (RANDOM % 200) ))
  publish_telemetry 2 "Power" "$power" "kW" 0 500

  # Every ~20s, mount something into slot 3 and later unmount it again,
  # to demonstrate a category/name/armed change (not just telemetry).
  if (( i % 10 == 0 )); then
    if (( (i / 10) % 2 == 1 )); then
      publish_module 3 "cargo_storage" "Salvage Pod" false
      publish_telemetry 3 "Capacity" 40 "%" 0 100
    else
      publish_module 3 "empty" "null" false
    fi
  fi

  # Every ~30s, toggle slot 4's arm state.
  if (( i % 15 == 0 )); then
    if (( (i / 15) % 2 == 1 )); then
      publish_module 4 "utility_tool" "Mining Laser" true
    else
      publish_module 4 "utility_tool" "Mining Laser" false
    fi
  fi
done
