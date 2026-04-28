// ============================================================
// Timing constants (arithmetically independent cadence/spawn values).
// ------------------------------------------------------------
// Extracted from store/reducer.ts. Pure literal constants only.
// Re-exported by reducer.ts for backward-compatible
// `from "../store/reducer"` consumers.
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialisation cycle.
// ============================================================

export const SAPLING_GROW_MS = 30_000;
export const NATURAL_SPAWN_MS = 60_000;
export const NATURAL_SPAWN_CHANCE = 0.2;
export const NATURAL_SPAWN_CAP = 30;
export const SAPLING_DROP_CHANCE = 0.6;

/** Logistics tick interval (ms) - shared by auto-miners and conveyors */
export const LOGISTICS_TICK_MS = 500;

/** How often the crafting job queue is advanced (ms). One tick per interval. */
export const CRAFTING_TICK_MS = 500;

/** Tick interval for the drone state machine (ms). */
export const DRONE_TICK_MS = 500;
