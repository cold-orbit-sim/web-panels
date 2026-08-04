// Touchscreen shell: connects to the broker, subscribes to the mode-select
// topic and the hardpoint state topics, and swaps the active view in place.
// There is no page reload/navigation involved in a mode change — ever.
import { BROKER_URL, MQTT_OPTIONS, TOPICS, MODES, HARDPOINT_TOPIC_RE, ENGINEERING_TOPIC_RE } from "./config.js";
import { initHardpoints, handleHardpointModule, handleHardpointTelemetry } from "./views/hardpoints.js";
import { initLoadout } from "./views/loadout.js";
import { initEngineering, handleEngineeringState } from "./views/engineering.js";
import { initComms, handleCommsLog, handleCommsTargets } from "./views/comms.js";

const params = new URLSearchParams(location.search);
const brokerUrl = params.get("broker") || BROKER_URL;
const forcedMode = params.get("mode"); // dev/demo convenience, see README

const statusEl   = document.getElementById("conn-status");
const viewTitleEl = document.getElementById("view-title");
const viewEls    = document.querySelectorAll("[data-view]");

const VIEW_TITLES = {
  engineering: "MASTER SYSTEMS DISPLAY",
  comms: "COMMS — CONTACTS & LOG",
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
  loadoutUnlocked = unlocked;
  if (unlocked) {
    viewEls.forEach((el) => el.classList.remove("active"));
    document.getElementById("view-loadout").classList.add("active");
  } else {
    document.getElementById("view-loadout").classList.remove("active");
    setMode(forcedMode || "hardpoints");
  }
}

initEngineering(document.getElementById("view-engineering"));
initComms(document.getElementById("view-comms"));
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
      TOPICS.commsLog,
      TOPICS.commsTargets,
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
