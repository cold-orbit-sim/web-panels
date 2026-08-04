#!/usr/bin/env bash
# Publishes Comms view state to the local broker.
#
# Phase 1: seeds a retained comms log (8 messages, mix of in/out) and a
#           retained targets list (7 contacts — enough to test scrolling).
# Phase 2: streams new incoming messages every ~15s and drifts contact
#           ranges every ~5s, so all interactive states are exercisable.
#
# Topics:
#   coldorbit/output/comms/log      (retain, QoS 1) — full message array
#   coldorbit/output/comms/targets  (retain, QoS 1) — full contacts array
#
# Usage:
#   mock/publish-comms.sh           # runs indefinitely (Ctrl-C to stop)
#   mock/publish-comms.sh --seed    # seed only, then exit

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

PUB="mosquitto_pub -h $HOST -p $PORT -q 1 -r"

# ── initial seed ─────────────────────────────────────────────────────────────

echo "Seeding comms log…"

LOG_JSON='[
  {"id":"msg_001","direction":"incoming","sender":"Harlan Voss","text":"Nighthawk, this is Voss. You in position?","timestamp_s":3600},
  {"id":"msg_002","direction":"outgoing","sender":"player","text":"Affirmative. Holding at waypoint delta.","timestamp_s":3618},
  {"id":"msg_003","direction":"incoming","sender":"Harlan Voss","text":"Copy that. Stand by — we have a contact bearing zero-four-zero.","timestamp_s":3641},
  {"id":"msg_004","direction":"incoming","sender":"Frontier Control","text":"All vessels: nav beacon updated sector 7. Adjust heading accordingly.","timestamp_s":3700},
  {"id":"msg_005","direction":"outgoing","sender":"player","text":"Control, Nighthawk. Acknowledged. Updating chart now.","timestamp_s":3712},
  {"id":"msg_006","direction":"incoming","sender":"Ryn Aldecoa","text":"Nighthawk, Aldecoa. We are 2.1 km off your port. No hostile intent.","timestamp_s":3760},
  {"id":"msg_007","direction":"outgoing","sender":"player","text":"Aldecoa, copy. Keep your transponder live and we are fine.","timestamp_s":3775},
  {"id":"msg_008","direction":"incoming","sender":"Frontier Control","text":"Nighthawk: docking window at Callisto Station opens in T+00:12:00. Confirm ETA.","timestamp_s":3820}
]'

$PUB -t "coldorbit/output/comms/log" -m "$LOG_JSON"
echo "  comms/log seeded (8 messages)"

echo "Seeding contacts list…"

# 7 contacts — 5 visible initially, scroll down shows 2 more
TARGETS_JSON='[
  {"id":"contact_001","name":"Harlan Voss","alliance":"Independent","vessel_class":"Light Freighter","range_m":1240},
  {"id":"contact_002","name":"Ryn Aldecoa","alliance":"Frontier Collective","vessel_class":"Scout Corvette","range_m":2100},
  {"id":"contact_003","name":"Unknown Vessel","alliance":"Unknown","vessel_class":"Unknown","range_m":4800},
  {"id":"contact_004","name":"Frontier Control","alliance":"Frontier Collective","vessel_class":"Station","range_m":12400},
  {"id":"contact_005","name":"Kael Morrow","alliance":"Independent","vessel_class":"Salvage Tug","range_m":870},
  {"id":"contact_006","name":"ISV Marchetti","alliance":"Interstellar Corp","vessel_class":"Heavy Freighter","range_m":9300},
  {"id":"contact_007","name":"DSV Phantom Run","alliance":"Unknown","vessel_class":"Interceptor","range_m":6150}
]'

$PUB -t "coldorbit/output/comms/targets" -m "$TARGETS_JSON"
echo "  comms/targets seeded (7 contacts)"

echo "Seed complete."

if [[ "${1:-}" == "--seed" ]]; then
  exit 0
fi

# ── streaming loop ───────────────────────────────────────────────────────────
# Appends a new incoming message every ~15s.
# Drifts contact ranges every ~5s.

echo "Streaming comms updates — Ctrl-C to stop."

# Mutable range state (metres)
r1=1240   # Harlan Voss
r2=2100   # Ryn Aldecoa
r3=4800   # Unknown Vessel
r4=12400  # Frontier Control
r5=870    # Kael Morrow
r6=9300   # ISV Marchetti
r7=6150   # DSV Phantom Run

# Next message timestamp (seconds, mission time)
ts=3840

# Pool of additional incoming messages to drip in
incoming_msgs=(
  "Check your six — that unknown just changed bearing."
  "Nighthawk, Aldecoa again. Fuel situation is nominal on our end."
  "Control: weather system on Callisto has cleared. Docking approach is nominal."
  "Harlan Voss: we are pushing to 1.8 km. Heading to the beacon."
  "Unknown vessel has gone dark — transponder off. Watch it."
  "Control: Callisto Station confirms your docking slot. Proceed when ready."
  "Kael Morrow: any of you salvagers near grid G-12? Good wreck out here."
  "Frontier Control: all vessels in sector, please maintain comm discipline."
)
msg_idx=0
msg_counter=9  # continue from msg_008

loop_tick=0

clamp() {
  local v="$1" lo="$2" hi="$3"
  (( v < lo )) && echo "$lo" && return
  (( v > hi )) && echo "$hi" && return
  echo "$v"
}

jitter() {
  local delta="$1"
  echo $(( (RANDOM % (delta * 2 + 1)) - delta ))
}

rebuild_targets() {
  printf '[{"id":"contact_001","name":"Harlan Voss","alliance":"Independent","vessel_class":"Light Freighter","range_m":%d},{"id":"contact_002","name":"Ryn Aldecoa","alliance":"Frontier Collective","vessel_class":"Scout Corvette","range_m":%d},{"id":"contact_003","name":"Unknown Vessel","alliance":"Unknown","vessel_class":"Unknown","range_m":%d},{"id":"contact_004","name":"Frontier Control","alliance":"Frontier Collective","vessel_class":"Station","range_m":%d},{"id":"contact_005","name":"Kael Morrow","alliance":"Independent","vessel_class":"Salvage Tug","range_m":%d},{"id":"contact_006","name":"ISV Marchetti","alliance":"Interstellar Corp","vessel_class":"Heavy Freighter","range_m":%d},{"id":"contact_007","name":"DSV Phantom Run","alliance":"Unknown","vessel_class":"Interceptor","range_m":%d}]' \
    "$r1" "$r2" "$r3" "$r4" "$r5" "$r6" "$r7"
}

while true; do
  sleep 5
  loop_tick=$(( loop_tick + 1 ))

  # Drift ranges
  r1=$(clamp $(( r1 + $(jitter 80)  ))  400  2000)
  r2=$(clamp $(( r2 + $(jitter 120) )) 1000  4000)
  r3=$(clamp $(( r3 + $(jitter 200) )) 2000  8000)
  r5=$(clamp $(( r5 + $(jitter 60)  ))  300  1800)
  r6=$(clamp $(( r6 + $(jitter 150) )) 6000 14000)
  r7=$(clamp $(( r7 + $(jitter 180) )) 3000  9000)

  $PUB -t "coldorbit/output/comms/targets" -m "$(rebuild_targets)"
  echo "  [tick $loop_tick] ranges updated: Voss=${r1}m Aldecoa=${r2}m Morrow=${r5}m"

  # Append a new message every 3 ticks (~15s)
  if (( loop_tick % 3 == 0 && msg_idx < ${#incoming_msgs[@]} )); then
    ts=$(( ts + 25 + (RANDOM % 20) ))
    msg_counter=$(( msg_counter + 1 ))
    msg_id="$(printf 'msg_%03d' "$msg_counter")"

    # Pick sender — alternate a few contacts
    case $(( msg_idx % 3 )) in
      0) sender="Harlan Voss"      ;;
      1) sender="Frontier Control" ;;
      2) sender="Ryn Aldecoa"      ;;
    esac

    msg_text="${incoming_msgs[$msg_idx]}"
    msg_idx=$(( msg_idx + 1 ))

    NEW_MSG="{\"id\":\"${msg_id}\",\"direction\":\"incoming\",\"sender\":\"${sender}\",\"text\":\"${msg_text}\",\"timestamp_s\":${ts}}"
    # Strip trailing ] and append new message
    LOG_JSON="${LOG_JSON%]},${NEW_MSG}]"
    $PUB -t "coldorbit/output/comms/log" -m "$LOG_JSON"
    echo "  [tick $loop_tick] new message from ${sender}: ${msg_text}"
  fi
done
