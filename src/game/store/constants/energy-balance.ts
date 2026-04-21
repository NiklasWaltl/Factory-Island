// ============================================================
// Energy balance constants.
// ------------------------------------------------------------
// Extracted from store/reducer.ts as a single balance rule.
// Re-exported by reducer.ts for backward-compatible
// imports from "../store/reducer".
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialization cycle.
// ============================================================

/**
 * Energy consumed per ENERGY_NET_TICK period by each machine type.
 * One period = ENERGY_NET_TICK_MS = 2000 ms.
 */
export const ENERGY_DRAIN: Record<string, number> = {
  smithy: 2,
  auto_miner: 5,
  conveyor: 1,
  conveyor_corner: 1,
  auto_smelter: 5, // 5 J/period; actual drain computed dynamically in getConnectedConsumerDrainEntries
};