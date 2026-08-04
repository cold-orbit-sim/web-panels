// Broker + topic configuration for the touchscreen client.
//
// Broker URL defaults to the same host that served the page so the panel
// works when accessed from any machine on the network. Override per-load
// without touching this file: http://<host>:8080/?broker=ws://192.168.1.50:9001
//
// Browsers can only speak MQTT over WebSocket (ws:// / wss://), never raw
// MQTT/TCP — this must point at a broker's *websocket* listener, not its
// normal MQTT port (e.g. Mosquitto's `protocol websockets` listener, see
// docs/mosquitto-local.conf for a local example on port 9001).
export const BROKER_URL = `ws://${location.hostname}:9001`;

export const MQTT_OPTIONS = {
  clientId: "touchscreen-" + Math.random().toString(16).slice(2, 10),
  reconnectPeriod: 2000,
  connectTimeout: 10000,
};

// See docs/hardpoints-mqtt-contract.md for the full contract.
// Topic paths match master plan §3.1b (v34): output/ namespace for all
// display-side subscriptions; input/ namespace for player-initiated actions.
export const TOPICS = {
  mode: "coldorbit/output/touchscreen/mode",
  hardpointModule: "coldorbit/output/hardpoints/+/module",
  hardpointTelemetry: "coldorbit/output/hardpoints/+/telemetry",
  // Sim-core publishes true/false (retained) when docked loadout changes are permitted.
  loadoutUnlocked: "coldorbit/output/ship/loadout-unlocked",
  // Client publishes here when the player confirms a new loadout (input namespace).
  loadoutConfirm: "coldorbit/input/ship/loadout",
  // Wildcard subscription for all engineering subsystem state messages.
  // See docs/engineering-mqtt-contract.md for the full payload shape.
  engineeringState: "coldorbit/output/engineering/+/state",
  // Comms view — see docs/comms-mqtt-contract.md for full payload shapes.
  // Full log array, retained — republished whenever a new message is added.
  commsLog: "coldorbit/output/comms/log",
  // Full contacts array, retained — republished whenever the list or any range changes.
  commsTargets: "coldorbit/output/comms/targets",
};

// Regex for routing incoming hardpoint messages — kept here so there is
// exactly one place in the codebase where the hardpoint topic structure
// is encoded.
export const HARDPOINT_TOPIC_RE = /^coldorbit\/output\/hardpoints\/(\d)\/(module|telemetry)$/;

// Engineering wildcard router: extracts the system id from the topic.
// Matches: coldorbit/output/engineering/<system>/state
export const ENGINEERING_TOPIC_RE = /^coldorbit\/output\/engineering\/([^/]+)\/state$/;

export const MODES = [
  "engineering",
  "propulsion",
  "ftl",
  "turrets",
  "missiles",
  "comms",
  "hardpoints",
];
