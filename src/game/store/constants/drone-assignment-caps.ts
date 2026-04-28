// ============================================================
// Drone assignment cap constants
// ------------------------------------------------------------
// Pure numeric caps for concurrent drone assignments.
// MUST NOT runtime-import from ../reducer to avoid ESM cycles.
// ============================================================

/** Hard cap to prevent a single construction target from mobilizing the entire drone fleet. */
export const MAX_DRONES_PER_CONSTRUCTION_TARGET = 4;

/** Hard cap for concurrent restock trips of the same resource into one hub. */
export const MAX_DRONES_PER_HUB_RESTOCK_RESOURCE = 4;

/** Hard cap for concurrent supply trips into the same building input buffer. */
export const MAX_DRONES_PER_BUILDING_SUPPLY = 4;
