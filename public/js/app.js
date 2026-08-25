// Touchscreen shell: connects to the broker, subscribes to the mode-select
// topic and the hardpoint state topics, and swaps the active view in place.
// There is no page reload/navigation involved in a mode change — ever.
import { BROKER_URL, MQTT_OPTIONS, TOPICS, MODES, HARDPOINT_TOPIC_RE, ENGINEERING_TOPIC_RE, TURRET_TOPIC_RE, MISSILE_TOPIC_RE } from "./config.js";
import { initHardpoints, handleHardpointModule, handleHardpointTelemetry } from "./views/hardpoints.js";
import { initLoadout } from "./views/loadout.js";
import { initEngineering, handleEngineeringState, handleRepairQueue } from "./views/engineering.js";
import { initComms, handleCommsLog, handleCommsTargets } from "./views/comms.js";
import { initAlerts, handleAlerts } from "./views/alerts.js";
import { initPropulsion, handlePropulsionState } from "./views/propulsion.js";
import { initFtl, handleFtlState } from "./views/ftl.js";
import { initTurrets, handleTurretState, setTurretsLoadoutMode } from "./views/turrets.js";
import { initMissiles, handleMissileState, setMissilesLoadoutMode } from "./views/missiles.js";
import { initMap, handleFtlTarget, handleFtlSystem } from "./views/map.js";

const params = new URLSearchParams(location.search);
const brokerUrl = params.get("broker") || BROKER_URL;
const forcedMode = params.get("mode"); // dev/demo convenience, see README

const statusEl   = document.getElementById("conn-status");
const viewTitleEl = document.getElementById("view-title");
const viewEls    = document.querySelectorAll("[data-view]");

const VIEW_TITLES = {
  engineering: "MASTER SYSTEMS DISPLAY",
  propulsion:  "PROPULSION",
  ftl:         "FTL DRIVE",
  turrets:     "TURRETS",
  missiles:    "MISSILES",
  comms:       "COMMS — CONTACTS & LOG",
  hardpoints:  "HARDPOINTS",
  map:         "NAVIGATION — DRIFT MAP",
};

// When true the loadout screen overrides all normal mode routing.
let loadoutUnlocked = false;

function setMode(mode) {
  if (!MODES.includes(mode)) {
    console.warn(`Unknown mode "${mode}" on ${TOPICS.mode}, ignoring`);
    return;
  }
  viewEls.forEach((el) => el.classList.toggle("active", el.dataset.view === mode));
  viewTitleEl.textContent = VIEW_TITLES[mode] || "";
}

function setLoadoutMode(unlocked) {
  const wasUnlocked = loadoutUnlocked;
  loadoutUnlocked = unlocked;
  setTurretsLoadoutMode(unlocked);
  setMissilesLoadoutMode(unlocked);
  if (unlocked) {
    viewEls.forEach((el) => el.classList.remove("active"));
    document.getElementById("view-loadout").classList.add("active");
  } else {
    document.getElementById("view-loadout").classList.remove("active");
    // Only snap to the default view on an actual close (true -> false).
    // loadout-unlocked is retained, so a reconnect/refresh redelivers the
    // last "false" even when nothing changed — that must not clobber
    // whatever the mode topic already restored.
    if (wasUnlocked) setMode(forcedMode || "hardpoints");
  }
}

initAlerts(document.querySelector(".topbar"));
initEngineering(document.getElementById("view-engineering"));
initPropulsion(document.getElementById("view-propulsion"));
initFtl(document.getElementById("view-ftl"));
initTurrets(document.getElementById("view-turrets"), (turretId, payload) => {
  client.publish(
    `${TOPICS.turretAmmoBase}/${turretId}/ammo`,
    JSON.stringify(payload),
    { qos: 1, retain: true },
  );
});
initMissiles(document.getElementById("view-missiles"), (tubeId, payload) => {
  client.publish(
    `${TOPICS.missileTypeBase}/${tubeId}/type`,
    JSON.stringify(payload),
    { qos: 1, retain: true },
  );
});
initComms(document.getElementById("view-comms"));
initMap(document.getElementById("view-map"));
initHardpoints(document.getElementById("view-hardpoints"));
initLoadout(document.getElementById("view-loadout"), (payload) => {
  client.publish(
    TOPICS.loadoutConfirm,
    JSON.stringify(payload),
    { qos: 1, retain: true },
  );
});

if (forcedMode) {
  setMode(forcedMode);
} else {
  document.querySelector('[data-view="waiting"]').classList.add("active");
}

const client = mqtt.connect(brokerUrl, MQTT_OPTIONS);

client.on("connect", () => {
  statusEl.title = `LINK OK — ${brokerUrl}`;
  statusEl.classList.remove("down", "reconnecting");
  client.subscribe(
    [
      TOPICS.mode,
      TOPICS.hardpointModule,
      TOPICS.hardpointTelemetry,
      TOPICS.loadoutUnlocked,
      TOPICS.engineeringState,
      TOPICS.repairQueue,
      TOPICS.commsLog,
      TOPICS.commsTargets,
      TOPICS.alerts,
      TOPICS.propulsionState,
      TOPICS.ftlState,
      TOPICS.ftlTarget,
      TOPICS.ftlSystem,
      TOPICS.turretState,
      TOPICS.missileState,
    ],
    { qos: 1 },
  );
});

client.on("reconnect", () => {
  statusEl.title = "RECONNECTING…";
  statusEl.classList.remove("down");
  statusEl.classList.add("reconnecting");
});

client.on("offline", () => {
  statusEl.title = "LINK DOWN";
  statusEl.classList.remove("reconnecting");
  statusEl.classList.add("down");
});

client.on("error", (err) => {
  console.error("MQTT error:", err);
});

client.on("message", (topic, payloadBuf) => {
  const raw = payloadBuf.toString();

  if (topic === TOPICS.loadoutUnlocked) {
    setLoadoutMode(raw.trim() === "true");
    return;
  }

  if (topic === TOPICS.mode) {
    if (!forcedMode && !loadoutUnlocked) setMode(raw.trim());
    return;
  }

  if (topic === TOPICS.alerts) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleAlerts(data);
    return;
  }

  if (topic === TOPICS.propulsionState) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handlePropulsionState(data);
    return;
  }

  if (topic === TOPICS.ftlState) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleFtlState(data);
    return;
  }

  if (topic === TOPICS.ftlTarget) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleFtlTarget(data);
    return;
  }

  if (topic === TOPICS.ftlSystem) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleFtlSystem(data);
    return;
  }

  if (topic === TOPICS.commsLog) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleCommsLog(data);
    return;
  }

  if (topic === TOPICS.commsTargets) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleCommsTargets(data);
    return;
  }

  const turretMatch = topic.match(TURRET_TOPIC_RE);
  if (turretMatch) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleTurretState(turretMatch[1], data);
    return;
  }

  const missileMatch = topic.match(MISSILE_TOPIC_RE);
  if (missileMatch) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleMissileState(missileMatch[1], data);
    return;
  }

  if (topic === TOPICS.repairQueue) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleRepairQueue(data);
    return;
  }

  const engMatch = topic.match(ENGINEERING_TOPIC_RE);
  if (engMatch) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    handleEngineeringState(engMatch[1], data);
    return;
  }

  const match = topic.match(HARDPOINT_TOPIC_RE);
  if (!match) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.warn(`Bad JSON on ${topic}:`, raw);
    return;
  }

  const [, slotStr, kind] = match;
  const slot = Number(slotStr);
  if (kind === "module") handleHardpointModule(slot, data);
  else handleHardpointTelemetry(slot, data);
});
