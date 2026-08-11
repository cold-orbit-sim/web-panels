#!/usr/bin/env bash
# Publishes Engineering subsystem state to the local broker.
#
# Phase 1: seeds all 9 subsystems with retained initial state.
# Phase 2: streams slow health jitter + occasional repair queue reorders
#           so all visual states (nominal / degraded / critical / disabled)
#           are exercisable without touching sim-core.
#
# Topic pattern: coldorbit/output/engineering/<system>/state  (retain, QoS 1)
#
# Usage:
#   mock/publish-engineering.sh          # runs indefinitely (Ctrl-C to stop)
#   mock/publish-engineering.sh --seed   # seed only, then exit

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

PUB="mosquitto_pub -h $HOST -p $PORT -q 1 -r"

pub() {
  local system="$1"
  local payload="$2"
  $PUB -t "coldorbit/output/engineering/${system}/state" -m "$payload"
}

pub_queue() {
  local payload="$1"
  $PUB -t "coldorbit/output/repair/queue" -m "$payload"
}

# ── initial seed values ──────────────────────────────────────────────────────

seed() {
  echo "Seeding engineering state…"

  pub weapons   '{"system":"weapons",   "health":82,"power_allocated":220,"power_unit":"kW","power_max":400,"disabled":false,"repair_queue_position":null}'
  pub engines   '{"system":"engines",   "health":48,"power_allocated":340,"power_unit":"kW","power_max":500,"disabled":false,"repair_queue_position":1}'
  pub ftl       '{"system":"ftl",       "health":61,"power_allocated":180,"power_unit":"kW","power_max":300,"disabled":false,"repair_queue_position":2}'
  pub reactor   '{"system":"reactor",   "health":91,"power_allocated":null,"power_unit":null,"power_max":null,"disabled":false,"repair_queue_position":null}'
  pub utility_1 '{"system":"utility_1", "health":100,"power_allocated":40,"power_unit":"kW","power_max":80,"disabled":false,"repair_queue_position":null}'
  pub utility_2 '{"system":"utility_2", "health":0,  "power_allocated":0,  "power_unit":"kW","power_max":80,"disabled":true, "repair_queue_position":null}'
  pub utility_3 '{"system":"utility_3", "health":74,"power_allocated":60,"power_unit":"kW","power_max":80,"disabled":false,"repair_queue_position":null}'
  pub utility_4 '{"system":"utility_4", "health":22,"power_allocated":20,"power_unit":"kW","power_max":80,"disabled":false,"repair_queue_position":3}'
  pub hull      '{"system":"hull",      "health":68,"power_allocated":null,"power_unit":null,"power_max":null,"disabled":false,"repair_queue_position":null}'

  # Seed the canonical repair queue:
  # engines = in_progress (180s), ftl = queued (60s), utility_4 = blocked (null)
  pub_queue '[{"system":"engines","status":"in_progress","repair_eta_seconds":180,"health":48},{"system":"ftl","status":"queued","repair_eta_seconds":60,"health":61},{"system":"utility_4","status":"blocked","repair_eta_seconds":null,"health":22}]'

  echo "Seed complete."
}

seed

if [[ "${1:-}" == "--seed" ]]; then
  exit 0
fi

# ── jitter loop ──────────────────────────────────────────────────────────────
# Holds mutable state in bash variables, drifts health values slowly.

h_weapons=82
h_engines=48
h_ftl=61
h_reactor=91
h_util1=100
h_util3=74
h_util4=22
h_hull=68

p_weapons=220
p_engines=340
p_ftl=180
p_util1=40
p_util3=60
p_util4=20

q_engines=1
q_ftl=2
q_util4=3

tick=0

clamp() {
  local v="$1" lo="$2" hi="$3"
  if   (( v < lo )); then echo "$lo"
  elif (( v > hi )); then echo "$hi"
  else echo "$v"
  fi
}

# Emits the value as JSON — 0 becomes null (no queue position)
q_val() { [[ "$1" == "0" ]] && echo "null" || echo "$1"; }

jitter() {
  # Returns -delta..+delta random integer
  local delta="$1"
  echo $(( (RANDOM % (delta * 2 + 1)) - delta ))
}

echo "Streaming jitter — Ctrl-C to stop."

while true; do
  sleep 4

  tick=$(( tick + 1 ))

  # Drift health values
  h_engines=$(clamp $(( h_engines + $(jitter 3) )) 30 65)
  h_ftl=$(clamp     $(( h_ftl     + $(jitter 2) )) 45 75)
  h_hull=$(clamp    $(( h_hull    + $(jitter 2) )) 50 80)
  h_util4=$(clamp   $(( h_util4   + $(jitter 3) )) 10 35)
  h_weapons=$(clamp $(( h_weapons + $(jitter 1) )) 70 95)
  h_reactor=$(clamp $(( h_reactor + $(jitter 1) )) 85 100)
  h_util3=$(clamp   $(( h_util3   + $(jitter 2) )) 60 90)

  # Drift power values
  p_engines=$(clamp $(( p_engines + $(jitter 15) )) 280 420)
  p_ftl=$(clamp     $(( p_ftl     + $(jitter 10) )) 140 240)
  p_util4=$(clamp   $(( p_util4   + $(jitter 5)  )) 10  40)

  pub engines   "{\"system\":\"engines\",   \"health\":$h_engines,\"power_allocated\":$p_engines,\"power_unit\":\"kW\",\"power_max\":500,\"disabled\":false,\"repair_queue_position\":$(q_val $q_engines)}"
  pub ftl       "{\"system\":\"ftl\",       \"health\":$h_ftl,\"power_allocated\":$p_ftl,\"power_unit\":\"kW\",\"power_max\":300,\"disabled\":false,\"repair_queue_position\":$(q_val $q_ftl)}"
  pub hull      "{\"system\":\"hull\",      \"health\":$h_hull,\"power_allocated\":null,\"power_unit\":null,\"power_max\":null,\"disabled\":false,\"repair_queue_position\":null}"
  pub utility_4 "{\"system\":\"utility_4\", \"health\":$h_util4,\"power_allocated\":$p_util4,\"power_unit\":\"kW\",\"power_max\":80,\"disabled\":false,\"repair_queue_position\":$(q_val $q_util4)}"
  pub weapons   "{\"system\":\"weapons\",   \"health\":$h_weapons,\"power_allocated\":$p_weapons,\"power_unit\":\"kW\",\"power_max\":400,\"disabled\":false,\"repair_queue_position\":null}"
  pub reactor   "{\"system\":\"reactor\",   \"health\":$h_reactor,\"power_allocated\":null,\"power_unit\":null,\"power_max\":null,\"disabled\":false,\"repair_queue_position\":null}"
  pub utility_3 "{\"system\":\"utility_3\", \"health\":$h_util3,\"power_allocated\":$p_util3,\"power_unit\":\"kW\",\"power_max\":80,\"disabled\":false,\"repair_queue_position\":null}"

  # Queue phase cycles every 5 ticks, giving 4 phases for ~80s full cycle:
  #   Phase 0 (ticks 1-5):  engines in_progress, ftl queued, util4 blocked
  #   Phase 1 (ticks 6-10): engines repaired — ftl in_progress, hull queued
  #   Phase 2 (ticks 11-15): ftl repaired — hull in_progress only
  #   Phase 3 (ticks 16-20): empty queue (ALL SYSTEMS NOMINAL)
  queue_phase=$(( (tick / 5) % 4 ))

  # Derive a rough ETA countdown within each phase (counts down over 5 ticks)
  phase_tick=$(( tick % 5 ))
  eta_engines=$(( 180 - phase_tick * 20 ))
  eta_ftl=$(( 60  - phase_tick * 8  ))
  eta_hull=$(( 120 - phase_tick * 15 ))

  case $queue_phase in
    0)
      pub_queue "[{\"system\":\"engines\",\"status\":\"in_progress\",\"repair_eta_seconds\":$eta_engines,\"health\":$h_engines},{\"system\":\"ftl\",\"status\":\"queued\",\"repair_eta_seconds\":$eta_ftl,\"health\":$h_ftl},{\"system\":\"utility_4\",\"status\":\"blocked\",\"repair_eta_seconds\":null,\"health\":$h_util4}]"
      echo "  [tick $tick] queue phase 0: engines=in_progress ftl=queued util4=blocked"
      ;;
    1)
      pub_queue "[{\"system\":\"ftl\",\"status\":\"in_progress\",\"repair_eta_seconds\":$eta_ftl,\"health\":$h_ftl},{\"system\":\"hull\",\"status\":\"queued\",\"repair_eta_seconds\":$eta_hull,\"health\":$h_hull}]"
      echo "  [tick $tick] queue phase 1: ftl=in_progress hull=queued"
      ;;
    2)
      pub_queue "[{\"system\":\"hull\",\"status\":\"in_progress\",\"repair_eta_seconds\":$eta_hull,\"health\":$h_hull}]"
      echo "  [tick $tick] queue phase 2: hull=in_progress only"
      ;;
    3)
      pub_queue '[]'
      echo "  [tick $tick] queue phase 3: empty (ALL SYSTEMS NOMINAL)"
      ;;
  esac

  # Update per-system state queue positions to stay roughly consistent with phase
  case $queue_phase in
    0) q_engines=1; q_ftl=2; q_util4=3 ;;
    1) q_engines=0; q_ftl=1; q_util4=0 ;;
    2) q_engines=0; q_ftl=0; q_util4=0 ;;
    3) q_engines=0; q_ftl=0; q_util4=0 ;;
  esac

  echo "  [tick $tick] engines=${h_engines}% engines_pwr=${p_engines}kW hull=${h_hull}% util4=${h_util4}%"
done
