// ============================================================
// Energy/auto-smelter coupled constants.
// ------------------------------------------------------------
// Extracted from store/reducer.ts as one package to keep formula
// coupling explicit and avoid drift.
// Re-exported by reducer.ts for backward-compatible
// `from "../store/reducer"` consumers.
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialisation cycle.
// ============================================================

/** Tick interval for the energy network balance calculation (ms) */
export const ENERGY_NET_TICK_MS = 2000;

export const AUTO_SMELTER_IDLE_ENERGY_PER_SEC = 2.5; // 2.5 J/s = 5 J/period (ENERGY_NET_TICK_MS=2000ms)
export const AUTO_SMELTER_PROCESSING_ENERGY_PER_SEC = 2.5; // 2.5 J/s = 5 J/period - same target drain as idle
export const AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD = Math.round((AUTO_SMELTER_IDLE_ENERGY_PER_SEC * ENERGY_NET_TICK_MS) / 1000);
export const AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD = Math.round((AUTO_SMELTER_PROCESSING_ENERGY_PER_SEC * ENERGY_NET_TICK_MS) / 1000);
