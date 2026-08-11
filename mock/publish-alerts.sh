#!/usr/bin/env bash
# Publishes alerts array to the local broker.
#
# All alerts carry an "acknowledged" boolean. Flash state in the client is
# driven entirely by that field — the client never publishes an ack.
# This script simulates sim-core acknowledging alerts so the flash-stop
# behaviour can be verified without the physical Master Warn/Caution buttons.
#
# Cycle phases:
#   1. No alerts
#   2. Caution (unacked) → amber flash
#   3. Warning added (unacked) → red flash supersedes
#   4. Second warning added
#   5. Sim-core acks the warnings → flash stops, entries go dim in popup
#   6. Warnings clear, unacked caution returns → amber flash
#   7. Sim-core acks caution → flash stops
#   8. All clear
#
# Topic: coldorbit/output/alerts  (retain, QoS 1)
#
# Usage:
#   mock/publish-alerts.sh           # runs indefinitely (Ctrl-C to stop)
#   mock/publish-alerts.sh --seed    # publish initial state then exit

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

PUB="mosquitto_pub -h $HOST -p $PORT -q 1 -r"
TOPIC="coldorbit/output/alerts"

pub() {
  $PUB -t "$TOPIC" -m "$1"
  echo "  → $1"
}

echo "=== Cold Orbit alert mock publisher ==="
echo "    topic: $TOPIC"
echo ""

step() {
  local label="$1"
  local payload="$2"
  echo "[$(date +%T)] $label"
  pub "$payload"
}

# Seed: no alerts
step "No alerts" '[]'

if [[ "${1:-}" == "--seed" ]]; then
  exit 0
fi

while true; do
  sleep 4

  # Phase 2 — caution, unacked → amber flash
  step "Caution (unacked): FTL charge interrupted" \
    '[{"id":"alert_001","severity":"caution","system":"ftl","message":"FTL CHARGE INTERRUPTED","timestamp_s":3698,"acknowledged":false}]'
  sleep 5

  # Phase 3 — warning added, unacked → red flash supersedes amber
  step "Warning added (unacked): engine 2 overheat" \
    '[{"id":"alert_001","severity":"caution","system":"ftl","message":"FTL CHARGE INTERRUPTED","timestamp_s":3698,"acknowledged":false},{"id":"alert_002","severity":"warning","system":"engines","message":"ENGINE 2 OVERHEAT","timestamp_s":3720,"acknowledged":false}]'
  sleep 5

  # Phase 4 — second warning, unacked
  step "Second warning (unacked): reactor temp critical" \
    '[{"id":"alert_001","severity":"caution","system":"ftl","message":"FTL CHARGE INTERRUPTED","timestamp_s":3698,"acknowledged":false},{"id":"alert_002","severity":"warning","system":"engines","message":"ENGINE 2 OVERHEAT","timestamp_s":3720,"acknowledged":false},{"id":"alert_003","severity":"warning","system":"reactor","message":"REACTOR TEMP CRITICAL","timestamp_s":3755,"acknowledged":false}]'
  sleep 5

  # Phase 5 — sim-core acks both warnings; red flash stops, entries go dim
  step "Sim-core acks warnings → flash stops, warnings dim in popup" \
    '[{"id":"alert_001","severity":"caution","system":"ftl","message":"FTL CHARGE INTERRUPTED","timestamp_s":3698,"acknowledged":false},{"id":"alert_002","severity":"warning","system":"engines","message":"ENGINE 2 OVERHEAT","timestamp_s":3720,"acknowledged":true},{"id":"alert_003","severity":"warning","system":"reactor","message":"REACTOR TEMP CRITICAL","timestamp_s":3755,"acknowledged":true}]'
  sleep 5

  # Phase 6 — warnings clear; unacked caution remains → amber flash resumes
  step "Warnings cleared — unacked caution → amber flash" \
    '[{"id":"alert_001","severity":"caution","system":"ftl","message":"FTL CHARGE INTERRUPTED","timestamp_s":3698,"acknowledged":false}]'
  sleep 4

  # Phase 7 — sim-core acks the caution → flash stops, bar stays amber
  step "Sim-core acks caution → flash stops" \
    '[{"id":"alert_001","severity":"caution","system":"ftl","message":"FTL CHARGE INTERRUPTED","timestamp_s":3698,"acknowledged":true}]'
  sleep 4

  # Phase 8 — all clear
  step "All alerts cleared" '[]'
  sleep 4

  echo ""
  echo "--- cycle complete, looping ---"
  echo ""
done
