#!/usr/bin/env bash
# Simulate the game opening or closing the loadout selection screen.
#
# Usage:
#   mock/set-loadout-unlocked.sh true    # open loadout screen on touchscreen
#   mock/set-loadout-unlocked.sh false   # return to Hardpoints status view
#
#   MQTT_HOST=192.168.1.10 mock/set-loadout-unlocked.sh true
#
# Publishes a retained message to coldorbit/output/ship/loadout-unlocked.
# Requires mosquitto_pub (mosquitto-clients / mosquitto brew package).

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

if [[ $# -ne 1 || ( "$1" != "true" && "$1" != "false" ) ]]; then
  echo "Usage: $0 true|false" >&2
  exit 1
fi

mosquitto_pub \
  -h "$HOST" -p "$PORT" \
  -t "coldorbit/output/ship/loadout-unlocked" \
  -m "$1" \
  -q 1 -r

echo "Published loadout-unlocked=$1 to ${HOST}:${PORT}"
