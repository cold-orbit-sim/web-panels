#!/usr/bin/env bash
# Subscribe to the loadout confirm topic and print each payload received.
# Use this to verify the touchscreen's CONFIRM LOADOUT button is publishing.
#
# Usage:
#   mock/dump-loadout.sh                    # localhost:1883
#   MQTT_HOST=192.168.1.10 mock/dump-loadout.sh
#
# Ctrl-C to stop. Requires mosquitto_sub (mosquitto-clients / mosquitto brew).

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

echo "Watching coldorbit/input/ship/loadout on ${HOST}:${PORT} — Ctrl-C to stop"
echo "---"

mosquitto_sub \
  -h "$HOST" -p "$PORT" \
  -t "coldorbit/input/ship/loadout" \
  -q 1 -v
