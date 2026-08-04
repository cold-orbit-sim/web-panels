#!/usr/bin/env bash
# Publish a retained mode-select message, standing in for the physical
# 7-button mode panel while it doesn't exist yet. See
# docs/hardpoints-mqtt-contract.md section 1.
#
# Usage: mock/set-mode.sh hardpoints

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"
MODE="${1:?usage: set-mode.sh <engineering|propulsion|ftl|turrets|missiles|comms|hardpoints>}"

mosquitto_pub -h "$HOST" -p "$PORT" -t "coldorbit/output/touchscreen/mode" -m "$MODE" -q 1 -r
echo "Published mode: $MODE"
