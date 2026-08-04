// Hardpoints status view. Each of the 4 slot sections is updated in place
// from its own MQTT messages — a message for slot 2 only ever touches slot
// 2's DOM nodes, never a full re-render of the view.

const CATEGORY_LABELS = {
  utility_tool: "Utility Tool",
  cargo_storage: "Cargo Storage",
  sensor_ew: "Sensor / EW",
  defense: "Defense",
  empty: "Empty",
};

const slots = new Map();

export function initHardpoints(root) {
  if (!root) return;
  root.querySelectorAll(".hp-slot").forEach((el) => {
    const slot = Number(el.dataset.slot);
    slots.set(slot, {
      root: el,
      category: el.querySelector(".hp-category"),
      name: el.querySelector(".hp-name"),
      armed: el.querySelector(".hp-armed"),
      readoutLabel: el.querySelector(".hp-readout-label"),
      readoutValue: el.querySelector(".hp-readout-value"),
      readoutBarFill: el.querySelector(".hp-readout-bar-fill"),
    });
  });
}

export function handleHardpointModule(slot, data) {
  const refs = slots.get(slot);
  if (!refs || !data) return;

  const category = data.category in CATEGORY_LABELS ? data.category : "utility_tool";
  refs.root.dataset.category = category;
  refs.root.classList.toggle("is-empty", data.category === "empty");
  refs.category.textContent = CATEGORY_LABELS[category];
  refs.name.textContent = data.name || "— empty —";
  refs.armed.textContent = data.armed ? "ARMED" : "SAFE";
  refs.armed.classList.toggle("armed", !!data.armed);
}

export function handleHardpointTelemetry(slot, data) {
  const refs = slots.get(slot);
  if (!refs || !data) return;

  refs.readoutLabel.textContent = data.label || "—";
  const unit = data.unit || "";
  refs.readoutValue.textContent = `${data.value}${unit}`;

  const min = typeof data.min === "number" ? data.min : 0;
  const max = typeof data.max === "number" ? data.max : 100;
  const pct = Math.max(0, Math.min(100, ((data.value - min) / (max - min)) * 100));
  refs.readoutBarFill.style.width = `${pct}%`;
}
