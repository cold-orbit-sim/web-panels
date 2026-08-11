// Loadout selection view — shown when sim-core signals that loadout changes
// are permitted (coldorbit/output/ship/loadout-unlocked = true).
//
// Module list is hardcoded until sim-core publishes an available-modules
// topic. Selections persist across open/close cycles within a page session.

const MODULES = [
  { category: "empty",         name: null },
  { category: "utility_tool",  name: "Mining Laser" },
  { category: "utility_tool",  name: "Cutting/Welding Torch" },
  { category: "utility_tool",  name: "Grapple/Winch Rig" },
  { category: "cargo_storage", name: "Cargo Pod" },
  { category: "sensor_ew",    name: "Tractor Beam" },
  { category: "sensor_ew",    name: "Tracking Suite" },
  { category: "sensor_ew",    name: "Prospecting Array" },
  { category: "sensor_ew",    name: "Stealth Package" },
  { category: "defense",      name: "Shields" },
  { category: "defense",      name: "Point Defense" },
  { category: "defense",      name: "Armor Plating" },
];

const CATEGORY_LABELS = {
  utility_tool:   "Utility Tool",
  cargo_storage:  "Cargo Storage",
  sensor_ew:      "Sensor / EW",
  defense:        "Defense",
  empty:          "Empty",
};

// Default: one module per category, sensible starting loadout.
const DEFAULT_INDEXES = [1, 4, 6, 9]; // Mining Laser, Cargo Pod, Tracking Suite, Shields

// Per-slot selected index into MODULES[]. Persists across open/close.
const selections = [...DEFAULT_INDEXES];

const slotRefs = new Map(); // slot (1-4) → { category, name, prevBtn, nextBtn }
let confirmBtn = null;

export function initLoadout(root, onConfirm) {
  if (!root) return;

  root.querySelectorAll(".lo-slot").forEach((el) => {
    const slot = Number(el.dataset.slot);
    const refs = {
      root:     el,
      category: el.querySelector(".lo-category"),
      name:     el.querySelector(".lo-name"),
      prevBtn:  el.querySelector(".lo-prev"),
      nextBtn:  el.querySelector(".lo-next"),
    };
    slotRefs.set(slot, refs);

    refs.prevBtn.addEventListener("click", () => cycle(slot, -1));
    refs.nextBtn.addEventListener("click", () => cycle(slot, +1));

    renderSlot(slot);
  });

  confirmBtn = root.querySelector(".lo-confirm-btn");
  confirmBtn.addEventListener("click", () => {
    const payload = buildPayload();
    onConfirm(payload);
    flashConfirm();
  });
}

function cycle(slot, delta) {
  const idx = slotRefs.has(slot) ? selections[slot - 1] : 0;
  selections[slot - 1] = (idx + delta + MODULES.length) % MODULES.length;
  renderSlot(slot);
}

function renderSlot(slot) {
  const refs = slotRefs.get(slot);
  if (!refs) return;
  const mod = MODULES[selections[slot - 1]];
  refs.root.dataset.category = mod.category;
  refs.category.textContent = CATEGORY_LABELS[mod.category] || mod.category;
  refs.name.textContent = mod.name || "— empty —";
}

function buildPayload() {
  const slots = {};
  for (let s = 1; s <= 4; s++) {
    const mod = MODULES[selections[s - 1]];
    slots[String(s)] = { category: mod.category, name: mod.name };
  }
  return { slots };
}

function flashConfirm() {
  confirmBtn.textContent = "TRANSMITTED";
  confirmBtn.classList.add("transmitted");
  setTimeout(() => {
    confirmBtn.textContent = "CONFIRM LOADOUT";
    confirmBtn.classList.remove("transmitted");
  }, 1800);
}
