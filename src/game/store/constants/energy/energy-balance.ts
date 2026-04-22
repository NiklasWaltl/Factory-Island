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

import type { AssetType, MachinePriority } from "../../types";

/** Default machine priority used when a consumer has no explicit user-set priority. */
export const DEFAULT_MACHINE_PRIORITY: MachinePriority = 3;

/** Asset types that conduct power through cable BFS graph traversal. */
export const POWER_CABLE_CONDUCTOR_TYPES = new Set<AssetType>([
  "cable",
  "generator",
  "power_pole",
]);

/** Asset types that can be reached and powered in power-pole range BFS. */
export const POWER_POLE_RANGE_TYPES = new Set<AssetType>([
  "power_pole",
  "battery",
  "smithy",
  "auto_miner",
  "conveyor",
  "conveyor_corner",
  "auto_smelter",
]);

/**
 * Tie-break order for machines with the same user priority.
 * Lower rank is served first so transport stays alive before downstream processing.
 */
export const ENERGY_ALLOCATION_RANK: Partial<Record<AssetType, number>> = {
  conveyor: 0,
  conveyor_corner: 0,
  auto_miner: 1,
  smithy: 2,
  auto_smelter: 3,
};

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
