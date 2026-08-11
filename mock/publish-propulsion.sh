#!/usr/bin/env bash
# Publishes propulsion system state to the local broker.
#
# Phase 1: seeds retained state.
# Phase 2: streams throttle sweeps, temperature lag, mix variation, toggle flips,
#           and velocity/acceleration tracking, so all visual states are exercisable.
#
# Topic: coldorbit/output/propulsion/state  (retain, QoS 1)
#
# Usage:
#   mock/publish-propulsion.sh           # runs indefinitely (Ctrl-C to stop)
#   mock/publish-propulsion.sh --seed    # seed only, then exit

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

PUB="mosquitto_pub -h $HOST -p $PORT -q 1 -r"
TOPIC="coldorbit/output/propulsion/state"

# ── helpers ──────────────────────────────────────────────────────────────────

clamp() {
  local v="$1" lo="$2" hi="$3"
  if   (( v < lo )); then echo "$lo"
  elif (( v > hi )); then echo "$hi"
  else echo "$v"
  fi
}

jitter() {
  local delta="$1"
  echo $(( (RANDOM % (delta * 2 + 1)) - delta ))
}

# Format integer as 0.XX decimal (0–100 → 0.00–1.00)
pct_to_dec() {
  local p="$1"
  printf "%d.%02d" $(( p / 100 )) $(( p % 100 ))
}

pub_state() {
  local thr_pct="$1"   # 0–100
  local mix_pct="$2"   # 0–100
  local port_kw="$3"
  local ctr_kw="$4"
  local stbd_kw="$5"
  local port_tc="$6"
  local ctr_tc="$7"
  local stbd_tc="$8"
  local vel="$9"        # m/s integer
  local acc="${10}"     # m/s² integer
  local armed="${11}"   # true|false
  local rcs="${12}"     # true|false
  local damp="${13}"    # true|false
  local rev="${14}"     # true|false

  local thr_dec mix_dec vel_dec acc_dec
  thr_dec=$(pct_to_dec "$thr_pct")
  mix_dec=$(pct_to_dec "$mix_pct")
  vel_dec="${vel}.0"
  acc_dec="${acc}.0"

  local payload
  payload=$(printf \
    '{"armed":%s,"throttle":%s,"mix":%s,"rcs_enabled":%s,"dampeners_enabled":%s,"reverse_enabled":%s,"engines":[{"id":"port","power_kw":%d,"temp_c":%d},{"id":"centre","power_kw":%d,"temp_c":%d},{"id":"starboard","power_kw":%d,"temp_c":%d}],"velocity_ms":%s,"acceleration_ms2":%s,"soi_body":"Kerath Prime"}' \
    "$armed" "$thr_dec" "$mix_dec" "$rcs" "$damp" "$rev" \
    "$port_kw" "$port_tc" "$ctr_kw" "$ctr_tc" "$stbd_kw" "$stbd_tc" \
    "$vel_dec" "$acc_dec")

  $PUB -t "$TOPIC" -m "$payload"
}

# ── seed ─────────────────────────────────────────────────────────────────────

echo "Seeding propulsion state…"
pub_state 72 65 340 380 340 640 710 635 1240 18 false true true false
echo "  seed complete."

if [[ "${1:-}" == "--seed" ]]; then
  exit 0
fi

echo "Streaming propulsion updates — Ctrl-C to stop."

# ── mutable state ─────────────────────────────────────────────────────────────

throttle=72      # 0–100 (integer %)
mix=65           # 0–100
direction=1      # 1 = rising, -1 = falling

# Temperatures lag behind throttle target; start at seed values
port_tc=640
ctr_tc=710
stbd_tc=635

velocity=1240    # m/s
armed=false
rcs=true
damp=true
rev=false

tick=0

while true; do
  sleep 1
  tick=$(( tick + 1 ))

  # Sweep throttle 0→100→0 in steps of 3
  throttle=$(( throttle + direction * 3 ))
  if (( throttle >= 100 )); then throttle=100; direction=-1; fi
  if (( throttle <=   0 )); then throttle=0;   direction=1;  fi

  # Mix drifts slowly
  mix=$(clamp $(( mix + $(jitter 4) )) 20 80)

  # Target temps: 280 at idle, 950 at full throttle, with per-engine offsets
  target_port=$(( 280 + throttle * 7 - 10 ))
  target_ctr=$(( 280  + throttle * 7 + 30 ))
  target_stbd=$(( 280 + throttle * 7 - 5  ))

  # Lag: approach target by at most 25°C per tick (heating) / 18°C (cooling)
  heat_or_cool() {
    local cur="$1" tgt="$2"
    if (( cur < tgt )); then
      cur=$(( cur + 25 ))
      (( cur > tgt )) && cur=$tgt
    elif (( cur > tgt )); then
      cur=$(( cur - 18 ))
      (( cur < tgt )) && cur=$tgt
    fi
    echo "$cur"
  }
  port_tc=$(heat_or_cool "$port_tc" "$target_port")
  ctr_tc=$(heat_or_cool  "$ctr_tc"  "$target_ctr")
  stbd_tc=$(heat_or_cool "$stbd_tc" "$target_stbd")

  # Per-engine power: linear with throttle + small constant offsets
  port_kw=$(( 20  + throttle * 4 ))
  ctr_kw=$(( 60   + throttle * 4 ))
  stbd_kw=$(( 15  + throttle * 4 ))

  # Velocity tracks throttle loosely (not a real physics integral — just demo feel)
  vel_target=$(( throttle * 50 ))
  if (( velocity < vel_target )); then
    velocity=$(( velocity + 30 ))
    (( velocity > vel_target )) && velocity=$vel_target
  elif (( velocity > vel_target )); then
    velocity=$(( velocity - 20 ))
    (( velocity < vel_target )) && velocity=$vel_target
  fi

  # Acceleration proportional to throttle
  accel=$(( throttle / 4 ))

  # Every ~20 ticks flip armed state briefly
  if (( tick % 21 == 0 )); then
    armed=true
    echo "  [tick $tick] ARMED"
  elif (( tick % 21 == 5 )); then
    armed=false
    echo "  [tick $tick] disarmed"
  fi

  # Every ~30 ticks toggle RCS
  if (( tick % 31 == 0 )); then
    if [[ "$rcs" == "true" ]]; then rcs=false; else rcs=true; fi
    echo "  [tick $tick] RCS → $rcs"
  fi

  # Every ~45 ticks toggle dampeners
  if (( tick % 47 == 0 )); then
    if [[ "$damp" == "true" ]]; then damp=false; else damp=true; fi
    echo "  [tick $tick] DAMPENERS → $damp"
  fi

  pub_state "$throttle" "$mix" \
    "$port_kw" "$ctr_kw" "$stbd_kw" \
    "$port_tc" "$ctr_tc" "$stbd_tc" \
    "$velocity" "$accel" \
    "$armed" "$rcs" "$damp" "$rev"

  if (( tick % 10 == 0 )); then
    echo "  [tick $tick] thr=${throttle}% port=${port_tc}°C ctr=${ctr_tc}°C vel=${velocity}m/s"
  fi
done
