#!/usr/bin/env bash
# mock/publish-missiles.sh — seeds all four missile tube topics with retained
# state, then streams continuous simulation: lock-state cycling, fire events
# (loaded → empty → reloading → loaded), target/range changes, arm toggling.
# Tubes are staggered so all states are visible simultaneously.
#
# Usage:
#   ./mock/publish-missiles.sh                   # broker localhost:1883
#   MQTT_BROKER=192.168.1.50 ./mock/publish-missiles.sh

set -euo pipefail

BROKER="${MQTT_BROKER:-localhost}"
PORT="${MQTT_PORT:-1883}"
PUB="mosquitto_pub -h $BROKER -p $PORT"

BASE="coldorbit/output/missiles"

TARGETS=("Harlan Voss" "Mira Okafor" "The Sullen Drift" "Kovac Station" "Unknown Contact")
CLASSES=("Light Freighter" "Patrol Craft" "Heavy Transport" "Bulk Hauler" "Fighter")
ALLIANCES=("Independent" "Corp Sec" "Pirate" "Neutral" "Unknown")
TYPES=("Dumbfire" "Seeking" "EMP Burst" "Fragmentation" "Armour Piercing")

TUBES=(fore_port fore_starboard aft_port aft_starboard)

pub_tube() {
  local tube="$1"
  local armed="$2"
  local status="$3"
  local mtype="$4"
  local lock="$5"
  local target="$6"
  local class="$7"
  local alliance="$8"
  local range="$9"

  local null_or_type='null'
  if [ "$mtype" != "null" ]; then
    null_or_type="\"$mtype\""
  fi
  local null_or_target='null'
  if [ "$target" != "null" ]; then
    null_or_target="\"$target\""
  fi
  local null_or_class='null'
  if [ "$class" != "null" ]; then
    null_or_class="\"$class\""
  fi
  local null_or_alliance='null'
  if [ "$alliance" != "null" ]; then
    null_or_alliance="\"$alliance\""
  fi
  local null_or_range='null'
  if [ "$range" != "null" ]; then
    null_or_range="$range"
  fi

  $PUB -t "$BASE/$tube/state" -q 1 -r -m "{
  \"tube\": \"$tube\",
  \"armed\": $armed,
  \"status\": \"$status\",
  \"missile_type\": $null_or_type,
  \"lock_state\": \"$lock\",
  \"target_name\": $null_or_target,
  \"target_class\": $null_or_class,
  \"target_alliance\": $null_or_alliance,
  \"target_range_m\": $null_or_range
}"
}

# ── Initial seed ───────────────────────────────────────────────────────────────
echo "Seeding missile tube topics..."

# Stagger tubes so all lock states are visible immediately:
#   fore_port:       locked   (armed)
#   fore_starboard:  acquiring
#   aft_port:        none     (safe, empty)
#   aft_starboard:   locked   (unarmed)

pub_tube fore_port       true  loaded   "Seeking"         locked    "Harlan Voss"      "Light Freighter" "Independent" 2400
pub_tube fore_starboard  true  loaded   "Armour Piercing" acquiring "Mira Okafor"      "Patrol Craft"    "Corp Sec"    4100
pub_tube aft_port        false empty    null              none      null               null              null          null
pub_tube aft_starboard   false loaded   "Dumbfire"        locked    "The Sullen Drift" "Heavy Transport" "Pirate"      8800

echo "Seeds published. Streaming simulation — Ctrl-C to stop."
echo ""

# ── Simulation loop ────────────────────────────────────────────────────────────
# Each tube has its own cycle phase offset so transitions stagger naturally.
# Tick period: 2 seconds.

TICK=0

# Tube phases (lock cycle): fore_port starts at 8/12, fore_stbd at 4/12, etc.
LOCK_PHASE=(8 4 0 10)
# Arm toggling: each tube has an independent timer
ARM_TICK=(0 6 14 3)
# Reload state tracking (0=loaded, 1=empty, 2=reloading)
RELOAD_STATE=(0 0 2 0)
RELOAD_TICK=(0 0 1 18)

# Current target indices per tube
TARGET_IDX=(0 1 4 2)
RANGE=(2400 4100 0 8800)

while true; do
  for i in "${!TUBES[@]}"; do
    tube="${TUBES[$i]}"

    # ── Lock cycling (12-tick cycle: 6 none, 3 acquiring, 3 locked) ──
    lock_pos=$(( (TICK + LOCK_PHASE[$i]) % 12 ))
    if   [ "$lock_pos" -lt 6 ]; then lock=none
    elif [ "$lock_pos" -lt 9 ]; then lock=acquiring
    else                              lock=locked
    fi

    # ── Arm toggle every ~20 ticks ──
    arm_pos=$(( (TICK + ARM_TICK[$i]) % 20 ))
    if [ "$arm_pos" -lt 14 ]; then armed=true; else armed=false; fi

    # ── Reload cycle (every ~24 ticks: 16 loaded, 2 empty, 6 reloading) ──
    reload_pos=$(( (TICK + RELOAD_TICK[$i]) % 24 ))
    if   [ "$reload_pos" -lt 16 ]; then status=loaded
    elif [ "$reload_pos" -lt 18 ]; then status=empty
    else                                status=reloading
    fi

    # Missile type follows status
    if [ "$status" = "loaded" ]; then
      mtype="${TYPES[$i]}"
    else
      mtype=null
    fi

    # ── Target: slow drift in range, change contact every ~30 ticks ──
    target_change=$(( (TICK + i * 7) % 30 ))
    if [ "$target_change" -eq 0 ]; then
      TARGET_IDX[$i]=$(( (TARGET_IDX[$i] + 1) % ${#TARGETS[@]} ))
    fi

    if [ "$lock" = "none" ]; then
      target=null; tclass=null; talliance=null; range_val=null
    else
      tidx="${TARGET_IDX[$i]}"
      target="${TARGETS[$tidx]}"
      tclass="${CLASSES[$tidx]}"
      talliance="${ALLIANCES[$tidx]}"
      # Range drift
      base_range=$(( (tidx + 1) * 2200 ))
      drift=$(( (TICK * 37 + i * 113) % 1000 - 500 ))
      range_val=$(( base_range + drift ))
      if [ "$range_val" -lt 200 ]; then range_val=200; fi
    fi

    pub_tube "$tube" "$armed" "$status" "$mtype" "$lock" \
      "$target" "$tclass" "$talliance" "$range_val" &
  done

  wait
  TICK=$(( TICK + 1 ))
  sleep 2
done
