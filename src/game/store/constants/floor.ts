// ============================================================
// Floor tile constants (costs, labels, emojis, descriptions).
// ------------------------------------------------------------
// Extracted from store/reducer.ts. Pure data tables keyed by
// FloorTileType. Re-exported by reducer.ts for backward-compatible
// `from "../store/reducer"` consumers.
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialisation cycle.
// Type-only imports are fine (erased at runtime).
// ============================================================

import type { FloorTileType, Inventory } from "../types";

/** Floor tile costs (paid from inventory) */
export const FLOOR_TILE_COSTS: Record<FloorTileType, Partial<Record<keyof Inventory, number>>> = {
  stone_floor: { stone: 2 },
  grass_block: { sapling: 1 },
};

export const FLOOR_TILE_LABELS: Record<FloorTileType, string> = {
  stone_floor: "Steinboden",
  grass_block: "Grasblock",
};

export const FLOOR_TILE_EMOJIS: Record<FloorTileType, string> = {
  stone_floor: "\u{1FAA8}",  // 🪨
  grass_block: "\u{1F7E9}",  // 🟩
};

export const FLOOR_TILE_DESCRIPTIONS: Record<FloorTileType, string> = {
  stone_floor: "Legt Steinboden auf ein Grasfeld. Manche Gebäude benötigen Steinboden.",
  grass_block: "Wandelt Steinboden zurück in Gras um. Nur auf freiem Steinboden verwendbar.",
};
