#!/usr/bin/env bash
# Publishes FTL drive state, cycling through the full phase sequence.
# Signal lag ramps up during charge, spikes randomly above 1 s (triggering
# the orange flash on the lag panel), and settles during cooldown.
#
# Topic: coldorbit/output/ftl/state  (retain, QoS 1)
#
# Usage:
#   mock/publish-ftl.sh           # runs indefinitely (Ctrl-C to stop)
#   mock/publish-ftl.sh --seed    # seed only (charging @ 74%), then exit

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

PUB="mosquitto_pub -h $HOST -p $PORT -q 1 -r"
MODE_TOPIC="coldorbit/output/touchscreen/mode"
FTL_TOPIC="coldorbit/output/ftl/state"

# ── helpers ───────────────────────────────────────────────────────────────────

pub_ftl() {
  local armed="$1" phase="$2" progress="$3"
  local destination="$4" range_au="$5"
  local signal_lag_s="$6" power_kw="$7" power_max_kw="${8:-500}"

  local dest_field
  if [[ "$destination" == "null" ]]; then
    dest_field='"destination":null'
  else
    dest_field="\"destination\":\"${destination}\""
  fi

  local payload
  payload=$(printf \
    '{"armed":%s,"phase":"%s","progress":%s,%s,"range_au":%s,"signal_lag_s":%s,"power_kw":%d,"power_max_kw":%d}' \
    "$armed" "$phase" "$progress" \
    "$dest_field" "$range_au" \
    "$signal_lag_s" "$power_kw" "$power_max_kw")

  $PUB -t "$FTL_TOPIC" -m "$payload"
}

# Random jitter: outputs an integer in [-delta, +delta]
jitter() { echo $(( (RANDOM % ($1 * 2 + 1)) - $1 )); }

# ── seed ─────────────────────────────────────────────────────────────────────

echo "Seeding FTL state (charging @ 74%, lag 3.1 s)…"
pub_ftl true charging 0.74 "Kerath System" "1.40" "3.1" 340
echo "  seed complete."

if [[ "${1:-}" == "--seed" ]]; then exit 0; fi

# Switch display to FTL so the view is visible
$PUB -t "$MODE_TOPIC" -m "ftl"
echo "Mode set to: ftl"
echo "Cycling FTL phases — Ctrl-C to stop."
echo

# ── phase cycle ───────────────────────────────────────────────────────────────
# One full cycle ≈ 37 s
#
# Lag behaviour:
#   idle:      0.0 s (below threshold — panel calm)
#   charging:  ramps 0.0 → 1.2 s by 25%, then spikes 1.2–6.5 s with ±0.8 s
#              jitter → panel flashes orange most of the charging phase
#   ready:     held at a high spiking value (~5–7 s)
#   jumping:   reset to 0.3 s (jump compresses the lag briefly)
#   cooldown:  settles 2.5 → 0.0 s over the cooldown window

while true; do

  # ── 1. Idle, no destination ───────────────────────────────────────────────
  echo "[idle] No destination"
  for _ in 1 2 3 4 5; do
    pub_ftl false idle 0.00 null 0.00 "0.0" 0
    sleep 1
  done

  # ── 2. Idle, destination acquired ─────────────────────────────────────────
  echo "[idle] Destination: Kerath System"
  for _ in 1 2 3 4 5; do
    pub_ftl true idle 0.00 "Kerath System" "1.40" "0.0" 0
    sleep 1
  done

  # ── 3. Charging 0% → 100% (16 steps × 1 s) ───────────────────────────────
  echo "[charging] Spinning up…"
  BASE_LAG=0
  for i in $(seq 0 16); do
    prog=$(awk "BEGIN{printf \"%.2f\", $i/16}")
    power=$(awk "BEGIN{printf \"%d\", int($i * 31.25)}")

    # Lag ramps: 0→1.2 s over first 25%, then spikes 1.2–6.5 s with jitter
    if (( i <= 4 )); then
      lag=$(awk "BEGIN{printf \"%.1f\", $i * 0.30}")
    else
      # Base grows 1.2 → 5.5 s, add ±0.8 s noise
      base=$(awk "BEGIN{printf \"%.2f\", 1.2 + ($i - 4) * 0.34}")
      noise=$(awk "BEGIN{printf \"%.1f\", ($(jitter 8)) * 0.1}")
      lag=$(awk "BEGIN{v=$base + $noise; if(v<1.0)v=1.0; if(v>6.5)v=6.5; printf \"%.1f\", v}")
    fi

    pub_ftl true charging "$prog" "Kerath System" "1.40" "$lag" "$power"
    if (( i % 4 == 0 )); then
      echo "  progress=$prog  lag=${lag}s  pwr=${power}kW"
    fi
    sleep 1
  done

  # ── 4. Ready (3 s with high spiking lag) ─────────────────────────────────
  echo "[ready] JUMP READY"
  for _ in 1 2 3; do
    noise=$(awk "BEGIN{printf \"%.1f\", ($(jitter 12)) * 0.1}")
    lag=$(awk "BEGIN{v=5.5 + $noise; if(v<4.8)v=4.8; if(v>7.0)v=7.0; printf \"%.1f\", v}")
    pub_ftl true ready 1.00 "Kerath System" "1.40" "$lag" 500
    echo "  lag=${lag}s"
    sleep 1
  done

  # ── 5. Jumping (1 s — lag snaps to near-zero) ─────────────────────────────
  echo "[jumping] JUMP"
  pub_ftl true jumping 0.00 "Kerath System" "0.00" "0.3" 500
  sleep 1

  # ── 6. Cooldown 100% → 0% (13 steps × 0.6 s, lag settles) ───────────────
  echo "[cooldown] Winding down…"
  STEPS=13
  for i in $(seq 0 "$STEPS"); do
    prog=$(awk "BEGIN{printf \"%.2f\", 1.0 - $i/$STEPS}")
    lag=$(awk "BEGIN{v=2.5 - $i * 0.19; if(v<0.0)v=0.0; printf \"%.1f\", v}")
    power=$(awk "BEGIN{printf \"%d\", int(500 - $i * 38.5)}")
    pub_ftl true cooldown "$prog" "Kerath System" "0.00" "$lag" "$power"
    if (( i % 3 == 0 )); then
      echo "  progress=$prog  lag=${lag}s  pwr=${power}kW"
    fi
    sleep 0.6
  done

  echo
  echo "── cycle complete, restarting ──"
  echo

done
