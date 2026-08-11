#!/usr/bin/env bash
# Mock publisher for all hardpoint module categories:
#   utility_tool, cargo_storage, sensor_ew, defense
#
# Cycles through all 9 new modules on slots 1–4 plus the original 3 utility
# tools, so every state is testable via the hardpoint-panel.
#
# Usage:
#   mock/publish-hardpoints.sh                    # localhost:1883
#   MQTT_HOST=192.168.1.10 MQTT_PORT=1883 mock/publish-hardpoints.sh
#
# Requires mosquitto_pub (mosquitto-clients / mosquitto brew package).

set -euo pipefail

HOST="${MQTT_HOST:-localhost}"
PORT="${MQTT_PORT:-1883}"

pub() {
  local topic="$1" payload="$2" retain="$3"
  local args=(-h "$HOST" -p "$PORT" -t "$topic" -m "$payload" -q 1)
  [[ "$retain" == "retain" ]] && args+=(-r)
  mosquitto_pub "${args[@]}"
}

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# publish_module <slot> <category> <name> <armed> <extra_json>
# extra_json: additional JSON fields without leading comma — or empty string
publish_module() {
  local slot="$1" category="$2" name="$3" armed="$4" extra="${5:-}"
  local sep="" ; [[ -n "$extra" ]] && sep=","
  pub "coldorbit/output/hardpoints/${slot}/module" \
    "{\"slot\":${slot},\"category\":\"${category}\",\"name\":\"${name}\",\"armed\":${armed}${sep}${extra},\"updated_at\":\"$(now)\"}" \
    retain
}

publish_telemetry() {
  # publish_telemetry <slot> <label> <value> <unit> <min> <max> <active> [extra_json]
  local slot="$1" label="$2" value="$3" unit="$4" min="$5" max="$6" active="$7" extra="${8:-}"
  local sep="" ; [[ -n "$extra" ]] && sep=","
  pub "coldorbit/output/hardpoints/${slot}/telemetry" \
    "{\"slot\":${slot},\"label\":\"${label}\",\"value\":${value},\"unit\":\"${unit}\",\"min\":${min},\"max\":${max},\"active\":${active}${sep}${extra}}" \
    no
}

echo "Publishing initial hardpoint state to ${HOST}:${PORT} ..."

# ── Initial state ─────────────────────────────────────────────────────────────
# Slot 1: Mining Laser (utility_tool)
publish_module 1 "utility_tool" "Mining Laser" true '"mode":null,"attached":null'
publish_telemetry 1 "Intensity" 45 "%" 0 100 true

# Slot 2: Cutting/Welding Torch (utility_tool)
publish_module 2 "utility_tool" "Cutting/Welding Torch" true '"mode":"weld","attached":null'
publish_telemetry 2 "Intensity" 35 "%" 0 100 true '"mode":"weld"'

# Slot 3: Grapple/Winch Rig (utility_tool)
publish_module 3 "utility_tool" "Grapple/Winch Rig" false '"mode":null,"attached":null'
publish_telemetry 3 "Cable" 0 "%" 0 100 false

# Slot 4: Standard Pod (cargo_storage)
publish_module 4 "cargo_storage" "Standard Pod" true \
  '"fill_pct":62,"contents":"GENERAL CARGO"'

echo "Initial state published. Cycling all 12 module types + telemetry jitter."
echo "Ctrl-C to stop."

# ── Module rotation schedule (slots 1–4, period ~60 steps / 120 s) ───────────
# Slot 1 cycles through: Mining Laser → Reefer Pod → Long-range Scanner Array
#                         → Deflector Shield Generator → (back)
# Slot 2 cycles through: Cutting/Welding Torch → Ore Hopper → Prospecting Suite
#                         → Point-Defense Turret Pod → (back)
# Slot 3 cycles through: Grapple/Winch Rig → (no change, static utility demo)
# Slot 4 cycles through: Standard Pod → Stealth/ECM Package → Decoy/Flare Dispenser
#                         → (back)

ORE_TYPES=("MOCK: Iron Oxide" "MOCK: Silicate" "MOCK: Rare Earth" "MOCK: Carbonite" "MOCK: Crystalline")
SHIELD_FACINGS=("fore" "aft" "port" "starboard")

i=0
# Track sub-states
torch_mode="weld"
grapple_attached=null
scanner_active=true ; scanner_beam=false
shield_on=true      ; shield_facing_idx=0
pd_engaged=false
stealth_on=false
decoy_count=16
missile_lock=false
ore_idx=0
reefer_temp=-18

while true; do
  sleep 2
  i=$((i + 1))

  # ── Determine slot 1 module (period 60 steps) ────────────────────────────
  slot1_phase=$(( (i / 60) % 4 ))
  case "$slot1_phase" in
    0) slot1_module="Mining Laser"               ; slot1_cat="utility_tool"  ;;
    1) slot1_module="Reefer Pod"                 ; slot1_cat="cargo_storage" ;;
    2) slot1_module="Long-range Scanner Array"   ; slot1_cat="sensor_ew"     ;;
    3) slot1_module="Deflector Shield Generator" ; slot1_cat="defense"       ;;
  esac

  # ── Determine slot 2 module (period 60 steps, offset 15) ────────────────
  slot2_phase=$(( ((i + 15) / 60) % 4 ))
  case "$slot2_phase" in
    0) slot2_module="Cutting/Welding Torch"  ; slot2_cat="utility_tool"  ;;
    1) slot2_module="Ore Hopper"             ; slot2_cat="cargo_storage" ;;
    2) slot2_module="Prospecting Suite"      ; slot2_cat="sensor_ew"     ;;
    3) slot2_module="Point-Defense Turret Pod" ; slot2_cat="defense"     ;;
  esac

  # ── Determine slot 4 module (period 60 steps, offset 30) ────────────────
  slot4_phase=$(( ((i + 30) / 60) % 3 ))
  case "$slot4_phase" in
    0) slot4_module="Standard Pod"          ; slot4_cat="cargo_storage" ;;
    1) slot4_module="Stealth/ECM Package"   ; slot4_cat="sensor_ew"     ;;
    2) slot4_module="Decoy/Flare Dispenser" ; slot4_cat="defense"       ;;
  esac

  # ── Advance sub-states ────────────────────────────────────────────────────

  # Torch mode cycles every 20 steps
  torch_mode="weld" ; (( (i / 20) % 2 == 1 )) && torch_mode="cut"

  # Grapple walk phases (4 steps each)
  cable_phase=$(( (i / 5) % 4 ))
  case "$cable_phase" in
    0) cable_pct=0;                           grapple_active=false; grapple_attached=null  ;;
    1) cable_pct=$(( (RANDOM % 40) + 10 ));   grapple_active=true;  grapple_attached=null  ;;
    2) cable_pct=$(( (RANDOM % 30) + 60 ));   grapple_active=false; grapple_attached=true  ;;
    3) cable_pct=$(( (RANDOM % 30) + 10 ));   grapple_active=true;  grapple_attached=false ;;
  esac

  # Scanner mode combination cycles every 10 steps
  scanner_combo=$(( (i / 10) % 4 ))
  case "$scanner_combo" in
    0) scanner_active=true  ; scanner_beam=false ;;
    1) scanner_active=true  ; scanner_beam=true  ;;
    2) scanner_active=false ; scanner_beam=false ;;
    3) scanner_active=false ; scanner_beam=true  ;;
  esac
  scanner_range=$(( 20 + (RANDOM % 80) ))
  scanner_bearing=$(( RANDOM % 360 ))

  # Ore type cycles every 8 steps
  ore_idx=$(( (i / 8) % 5 ))
  aim_x=$(( -45 + (RANDOM % 91) ))
  aim_y=$(( -45 + (RANDOM % 91) ))
  prospect_scanning=false ; (( (i / 4) % 3 == 2 )) && prospect_scanning=true

  # Reefer temperature drifts
  reefer_temp=$(( -22 + (RANDOM % 12) ))

  # Ore hopper fill cycles 0→100→0
  hopper_fill=$(( (i * 3) % 200 ))
  (( hopper_fill > 100 )) && hopper_fill=$(( 200 - hopper_fill ))

  # Stealth toggles every 15 steps
  stealth_on=false ; (( (i / 15) % 2 == 1 )) && stealth_on=true
  freq_val=$(( 880 + (RANDOM % 220) ))
  intns_val=$(( 20 + (RANDOM % 80) ))

  # Shield: facing cycles every 8 steps, strengths jitter
  shield_facing_idx=$(( (i / 8) % 4 ))
  shield_facing="${SHIELD_FACINGS[$shield_facing_idx]}"
  sh_fore=$(awk "BEGIN{printf \"%.2f\", $(( RANDOM % 100 ))/100}")
  sh_aft=$(awk  "BEGIN{printf \"%.2f\", $(( RANDOM % 100 ))/100}")
  sh_port=$(awk "BEGIN{printf \"%.2f\", $(( RANDOM % 100 ))/100}")
  sh_stbd=$(awk "BEGIN{printf \"%.2f\", $(( RANDOM % 100 ))/100}")
  shield_on=true ; (( (i / 30) % 3 == 2 )) && shield_on=false

  # PD turret toggles every 12 steps
  pd_engaged=false ; (( (i / 12) % 2 == 1 )) && pd_engaged=true

  # Decoy count decrements, resets at 0; lock warning flashes periodically
  if (( i % 10 == 0 && decoy_count > 0 )); then decoy_count=$(( decoy_count - 1 )); fi
  if (( decoy_count == 0 )); then decoy_count=16; fi
  missile_lock=false ; (( (i / 6) % 8 == 7 )) && missile_lock=true

  # ── Publish slot 1 ────────────────────────────────────────────────────────
  case "$slot1_module" in
    "Mining Laser")
      arm1=true ; (( (i / 15) % 2 == 1 )) && arm1=false
      publish_module 1 "utility_tool" "Mining Laser" $arm1 '"mode":null,"attached":null'
      intns1=$(( 30 + (RANDOM % 70) ))
      publish_telemetry 1 "Intensity" "$intns1" "%" 0 100 true
      ;;
    "Reefer Pod")
      temp_min=-25 ; temp_max=-15
      publish_module 1 "cargo_storage" "Reefer Pod" true \
        "\"fill_pct\":72,\"contents\":\"MOCK: Frozen Goods\",\"temp_c\":${reefer_temp},\"temp_min\":${temp_min},\"temp_max\":${temp_max}"
      ;;
    "Long-range Scanner Array")
      publish_module 1 "sensor_ew" "Long-range Scanner Array" true \
        "\"scanner_mode_active\":${scanner_active},\"scanner_mode_beam\":${scanner_beam}"
      publish_telemetry 1 "RANGE" "$scanner_range" "AU" 0 100 true
      publish_telemetry 1 "BEARING" "$scanner_bearing" "°" 0 360 false
      ;;
    "Deflector Shield Generator")
      publish_module 1 "defense" "Deflector Shield Generator" true \
        "\"shield_on\":${shield_on},\"shield_selected_facing\":\"${shield_facing}\",\"shield_strengths\":{\"fore\":${sh_fore},\"aft\":${sh_aft},\"port\":${sh_port},\"starboard\":${sh_stbd}}"
      ;;
  esac

  # ── Publish slot 2 ────────────────────────────────────────────────────────
  case "$slot2_module" in
    "Cutting/Welding Torch")
      publish_module 2 "utility_tool" "Cutting/Welding Torch" true \
        "\"mode\":\"${torch_mode}\",\"attached\":null"
      intns2=$(( 20 + (RANDOM % 70) ))
      publish_telemetry 2 "Intensity" "$intns2" "%" 0 100 true "\"mode\":\"${torch_mode}\""
      ;;
    "Ore Hopper")
      ore_name="${ORE_TYPES[$ore_idx]}"
      publish_module 2 "cargo_storage" "Ore Hopper" true \
        "\"fill_pct\":${hopper_fill},\"contents\":\"${ore_name}\""
      ;;
    "Prospecting Suite")
      publish_module 2 "sensor_ew" "Prospecting Suite" true ''
      publish_telemetry 2 "AIM-X" "$aim_x" "°" -90 90 "$prospect_scanning" \
        "\"ore_filter_index\":${ore_idx}"
      publish_telemetry 2 "AIM-Y" "$aim_y" "°" -90 90 "$prospect_scanning"
      ;;
    "Point-Defense Turret Pod")
      publish_module 2 "defense" "Point-Defense Turret Pod" true \
        "\"pd_engaged\":${pd_engaged}"
      ;;
  esac

  # ── Publish slot 3 (Grapple/Winch Rig — static) ──────────────────────────
  if (( i % 5 == 0 )); then
    publish_module 3 "utility_tool" "Grapple/Winch Rig" true \
      "\"mode\":null,\"attached\":${grapple_attached}"
  fi
  publish_telemetry 3 "Cable" "$cable_pct" "%" 0 100 "$grapple_active"

  # ── Publish slot 4 ────────────────────────────────────────────────────────
  case "$slot4_module" in
    "Standard Pod")
      fill4=$(( 10 + (RANDOM % 90) ))
      publish_module 4 "cargo_storage" "Standard Pod" true \
        "\"fill_pct\":${fill4},\"contents\":\"GENERAL CARGO\""
      ;;
    "Stealth/ECM Package")
      publish_module 4 "sensor_ew" "Stealth/ECM Package" true \
        "\"stealth_on\":${stealth_on}"
      publish_telemetry 4 "FREQ"  "$freq_val"  "MHz" 500 2000 false
      publish_telemetry 4 "INTNS" "$intns_val" "%"   0   100  false
      ;;
    "Decoy/Flare Dispenser")
      publish_module 4 "defense" "Decoy/Flare Dispenser" true \
        "\"missile_lock_warning\":${missile_lock},\"decoy_count\":${decoy_count}"
      ;;
  esac

done
