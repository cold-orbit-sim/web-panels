#!/usr/bin/env bash
# mock/publish-turrets.sh
# Seeds both turrets with retained state then streams continuous updates:
#   - bearing rotation (tracking a target)
#   - lock state cycling: none → acquiring → locked
#   - heat rising when armed+locked, cooling otherwise
#   - occasional target changes and arm toggling
#
# Requires mosquitto_pub. Usage: bash mock/publish-turrets.sh [<broker-host>]
# Default broker: localhost

set -euo pipefail
BROKER="${1:-localhost}"
PUB="mosquitto_pub -h $BROKER -q 1"

BASE="coldorbit/output/turrets"

# ── Seed both turrets with retained initial state ─────────────────────────────

echo "[turrets] seeding retained state..."

$PUB -r -t "$BASE/dorsal/state" -m '{
  "turret":"dorsal",
  "armed":true,
  "fire_mode":"lethal",
  "lock_state":"locked",
  "bearing_deg":30.0,
  "lock_progress":1.0,
  "elevation_deg":6.2,
  "target_name":"Harlan Voss",
  "target_class":"Light Freighter",
  "target_alliance":"Independent",
  "target_range_m":840,
  "ammo_loaded":"Kinetic Slug",
  "ammo_remaining":[
    {"type":"Kinetic Slug","count":142,"max":170}
  ],
  "heat":0.34
}'

$PUB -r -t "$BASE/ventral/state" -m '{
  "turret":"ventral",
  "armed":false,
  "fire_mode":"non_lethal",
  "lock_state":"none",
  "bearing_deg":null,
  "lock_progress":0.0,
  "elevation_deg":null,
  "target_name":null,
  "target_class":null,
  "target_alliance":null,
  "target_range_m":null,
  "ammo_loaded":"Kinetic Slug",
  "ammo_remaining":[
    {"type":"Kinetic Slug","count":60,"max":170}
  ],
  "heat":0.05
}'

echo "[turrets] streaming updates — Ctrl-C to stop"

# ── State variables ────────────────────────────────────────────────────────────

D_BEARING=30
D_LOCK="locked"
D_ARMED=true
D_HEAT=0.34
D_TARGET="Harlan Voss"
D_CLASS="Light Freighter"
D_ALLIANCE="Independent"
D_RANGE=840

V_BEARING=0
V_LOCK="none"
V_ARMED=false
V_HEAT=0.05
V_TARGET="null"
V_CLASS="null"
V_ALLIANCE="null"
V_RANGE="null"

LOCK_STEPS=("none" "acquiring" "acquiring" "locked" "locked" "locked")
# lock_progress per step: ramps 0 -> 1 while acquiring, snaps to 1.0 on locked
PROGRESS_STEPS=("0.0" "0.35" "0.7" "1.0" "1.0" "1.0")
D_STEP=2   # start at locked
V_STEP=0   # start at none
D_ELEV=6.2
V_ELEV="null"

# Reload cycling: dorsal reloads every 40 ticks, takes 20 ticks (~2s @ 10Hz)
D_RELOADING=false
D_RELOAD_TICK=0
RELOAD_DURATION=20

# Dorsal Kinetic Slug depletes while armed+locked, refills on reload completion
# — drives the low-ammo flash and the reload-stripe demo end to end.
D_KINETIC_MAX=170
D_KINETIC_COUNT=142

TICK=0

publish_dorsal() {
  local target_json range_json
  if [ "$D_TARGET" = "null" ]; then
    target_json="null"; range_json="null"
  else
    target_json="\"$D_TARGET\""; range_json=$D_RANGE
  fi
  local class_json alliance_json
  [ "$D_CLASS" = "null" ] && class_json="null" || class_json="\"$D_CLASS\""
  [ "$D_ALLIANCE" = "null" ] && alliance_json="null" || alliance_json="\"$D_ALLIANCE\""

  local bearing_json
  [ "$D_LOCK" = "none" ] && bearing_json="null" || bearing_json=$(printf "%.1f" "$D_BEARING")

  local elev_json
  [ "$D_ELEV" = "null" ] && elev_json="null" || elev_json=$(printf "%.1f" "$D_ELEV")

  local reload_progress
  if [ "$D_RELOADING" = "true" ]; then
    reload_progress=$(echo "scale=3; $D_RELOAD_TICK / $RELOAD_DURATION" | bc)
  else
    reload_progress="0.0"
  fi

  $PUB -r -t "$BASE/dorsal/state" -m "{
    \"turret\":\"dorsal\",
    \"armed\":$D_ARMED,
    \"fire_mode\":\"lethal\",
    \"lock_state\":\"$D_LOCK\",
    \"bearing_deg\":$bearing_json,
    \"lock_progress\":${PROGRESS_STEPS[$D_STEP]},
    \"elevation_deg\":$elev_json,
    \"target_name\":$target_json,
    \"target_class\":$class_json,
    \"target_alliance\":$alliance_json,
    \"target_range_m\":$range_json,
    \"ammo_loaded\":\"Kinetic Slug\",
    \"ammo_remaining\":[
      {\"type\":\"Kinetic Slug\",\"count\":$D_KINETIC_COUNT,\"max\":$D_KINETIC_MAX}
    ],
    \"heat\":$(printf "%.2f" "$D_HEAT"),
    \"reloading\":$D_RELOADING,
    \"reload_progress\":$reload_progress
  }"
}

publish_ventral() {
  local target_json range_json
  [ "$V_TARGET" = "null" ] && target_json="null" || target_json="\"$V_TARGET\""
  [ "$V_RANGE" = "null" ]  && range_json="null"  || range_json=$V_RANGE
  local class_json alliance_json
  [ "$V_CLASS" = "null" ]    && class_json="null"    || class_json="\"$V_CLASS\""
  [ "$V_ALLIANCE" = "null" ] && alliance_json="null" || alliance_json="\"$V_ALLIANCE\""

  local bearing_json
  [ "$V_LOCK" = "none" ] && bearing_json="null" || bearing_json=$(printf "%.1f" "$V_BEARING")

  local elev_json
  [ "$V_ELEV" = "null" ] && elev_json="null" || elev_json=$(printf "%.1f" "$V_ELEV")

  $PUB -r -t "$BASE/ventral/state" -m "{
    \"turret\":\"ventral\",
    \"armed\":$V_ARMED,
    \"fire_mode\":\"non_lethal\",
    \"lock_state\":\"$V_LOCK\",
    \"bearing_deg\":$bearing_json,
    \"lock_progress\":${PROGRESS_STEPS[$V_STEP]},
    \"elevation_deg\":$elev_json,
    \"target_name\":$target_json,
    \"target_class\":$class_json,
    \"target_alliance\":$alliance_json,
    \"target_range_m\":$range_json,
    \"ammo_loaded\":\"Kinetic Slug\",
    \"ammo_remaining\":[
      {\"type\":\"Kinetic Slug\",\"count\":60,\"max\":170}
    ],
    \"heat\":$(printf "%.2f" "$V_HEAT"),
    \"reloading\":false,
    \"reload_progress\":0.0
  }"
}

# ── Streaming loop ─────────────────────────────────────────────────────────────

while true; do
  TICK=$((TICK + 1))

  # Dorsal bearing: sweep 0→360 over ~36 ticks (10 ticks/sec → ~3.6 s/revolution)
  D_BEARING=$(echo "$D_BEARING + 4" | bc)
  if (( $(echo "$D_BEARING >= 360" | bc -l) )); then D_BEARING=0; fi

  # Ventral bearing: slower, different direction
  V_BEARING=$(echo "$V_BEARING - 2.5" | bc)
  if (( $(echo "$V_BEARING < 0" | bc -l) )); then V_BEARING=$(echo "$V_BEARING + 360" | bc); fi

  # Dorsal heat: rises when armed+locked, cools otherwise
  if [ "$D_ARMED" = "true" ] && [ "$D_LOCK" = "locked" ]; then
    D_HEAT=$(echo "scale=4; $D_HEAT + 0.008" | bc)
    (( $(echo "$D_HEAT > 1.0" | bc -l) )) && D_HEAT=1.0
  else
    D_HEAT=$(echo "scale=4; $D_HEAT - 0.012" | bc)
    (( $(echo "$D_HEAT < 0.0" | bc -l) )) && D_HEAT=0.0
  fi

  # Ventral heat: slower rise when armed, fast cool
  if [ "$V_ARMED" = "true" ]; then
    V_HEAT=$(echo "scale=4; $V_HEAT + 0.005" | bc)
    (( $(echo "$V_HEAT > 1.0" | bc -l) )) && V_HEAT=1.0
  else
    V_HEAT=$(echo "scale=4; $V_HEAT - 0.010" | bc)
    (( $(echo "$V_HEAT < 0.0" | bc -l) )) && V_HEAT=0.0
  fi

  # Every 20 ticks: advance dorsal lock state
  if (( TICK % 20 == 0 )); then
    D_STEP=$(( (D_STEP + 1) % ${#LOCK_STEPS[@]} ))
    D_LOCK="${LOCK_STEPS[$D_STEP]}"
    if [ "$D_LOCK" = "none" ]; then
      D_TARGET="null"; D_CLASS="null"; D_ALLIANCE="null"; D_RANGE="null"; D_ELEV="null"
    elif [ "$D_ELEV" = "null" ]; then
      D_ELEV=6.2
    fi
  fi

  # Every 30 ticks: advance ventral lock state
  if (( TICK % 30 == 0 )); then
    V_STEP=$(( (V_STEP + 1) % ${#LOCK_STEPS[@]} ))
    V_LOCK="${LOCK_STEPS[$V_STEP]}"
    if [ "$V_LOCK" = "acquiring" ] && [ "$V_TARGET" = "null" ]; then
      V_TARGET="Mara Okafor"; V_CLASS="Hauler"; V_ALLIANCE="Syndicate"; V_RANGE=1240; V_ELEV=-3.8
    elif [ "$V_LOCK" = "none" ]; then
      V_TARGET="null"; V_CLASS="null"; V_ALLIANCE="null"; V_RANGE="null"; V_ELEV="null"
    fi
  fi

  # Every 50 ticks: toggle dorsal arm state
  if (( TICK % 50 == 0 )); then
    [ "$D_ARMED" = "true" ] && D_ARMED=false || D_ARMED=true
  fi

  # Every 40 ticks: toggle ventral arm state (only when locked)
  if (( TICK % 40 == 0 )) && [ "$V_LOCK" = "locked" ]; then
    [ "$V_ARMED" = "true" ] && V_ARMED=false || V_ARMED=true
  fi

  # Dorsal reload cycle: trigger every 40 ticks, runs for RELOAD_DURATION ticks
  if [ "$D_RELOADING" = "true" ]; then
    D_RELOAD_TICK=$((D_RELOAD_TICK + 1))
    if (( D_RELOAD_TICK >= RELOAD_DURATION )); then
      D_RELOADING=false
      D_RELOAD_TICK=0
      D_KINETIC_COUNT=$D_KINETIC_MAX
    fi
  elif (( TICK % 40 == 0 )); then
    D_RELOADING=true
    D_RELOAD_TICK=0
  fi

  # Kinetic Slug depletes while armed+locked (drives the low-ammo flash demo)
  if [ "$D_RELOADING" = "false" ] && [ "$D_ARMED" = "true" ] && [ "$D_LOCK" = "locked" ]; then
    D_KINETIC_COUNT=$((D_KINETIC_COUNT - 3))
    (( D_KINETIC_COUNT < 0 )) && D_KINETIC_COUNT=0
  fi

  # Every 60 ticks: change dorsal target (when not none)
  if (( TICK % 60 == 7 )) && [ "$D_LOCK" != "none" ]; then
    D_TARGET="Zev Calloway"; D_CLASS="Corvette"; D_ALLIANCE="Dominion"; D_RANGE=520
  elif (( TICK % 60 == 37 )) && [ "$D_LOCK" != "none" ]; then
    D_TARGET="Harlan Voss"; D_CLASS="Light Freighter"; D_ALLIANCE="Independent"; D_RANGE=840
  fi

  publish_dorsal
  publish_ventral

  sleep 0.1
done
