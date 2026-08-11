#!/usr/bin/env bash
# Launches all mock publishers in parallel.
# Add new publisher scripts here when they're created.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PUBLISHERS=(
    publish-hardpoints.sh
    publish-engineering.sh
    publish-comms.sh
    publish-alerts.sh
    publish-propulsion.sh
    publish-ftl.sh
    publish-ftl-map.sh
    publish-turrets.sh
    publish-missiles.sh
)

pids=()
for script in "${PUBLISHERS[@]}"; do
    bash "$SCRIPT_DIR/$script" &
    pids+=($!)
    echo "Started $script (pid $!)"
done

echo "All mock publishers running. Press Ctrl-C to stop."

cleanup() {
    echo "Stopping all publishers..."
    for pid in "${pids[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
}
trap cleanup INT TERM

wait
