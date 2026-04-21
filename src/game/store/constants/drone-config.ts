// ============================================================
// Drone/logistics configuration constants.
// ------------------------------------------------------------
// Extracted from store/reducer.ts as a single domain package.
// Re-exported by reducer.ts for backward-compatible
// from "../store/reducer" consumers.
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialization cycle.
// ============================================================

/** Chebyshev tiles covered per tick while moving. */
export const DRONE_SPEED_TILES_PER_TICK = 2;

/** Ticks the drone spends collecting from a node. */
export const DRONE_COLLECT_TICKS = 2;

/** Ticks the drone spends depositing at the dropoff. */
export const DRONE_DEPOSIT_TICKS = 2;

/** Number of logistics ticks for one auto-miner production cycle (6 x 500ms = 3s). */
export const AUTO_MINER_PRODUCE_TICKS = 6;