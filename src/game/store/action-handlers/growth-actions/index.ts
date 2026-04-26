// ============================================================
// Growth action handler
// ------------------------------------------------------------
// Handles:     GROW_SAPLING, GROW_SAPLINGS, NATURAL_SPAWN
// Reads:       state.assets, state.cellMap, state.saplingGrowAt,
//              state.floorMap
// Writes:      state.assets (sapling -> tree replacement, naturally
//              spawned trees), state.cellMap, state.saplingGrowAt
// Depends on:  ./phases (3 phase modules); no deps injection
// Notes:       NATURAL_SPAWN runs every 60 s (constants/timing.ts:
//              NATURAL_SPAWN_MS). GROW_SAPLINGS is dispatched
//              every 1 s from FactoryApp; only saplings whose
//              saplingGrowAt has matured are passed in.
// ============================================================

import type { GameAction } from "../../actions";
import type { GameState } from "../../types";
import { HANDLED_ACTION_TYPES, type GrowthHandledAction } from "./types";
import {
  runGrowSaplingPhase,
  runGrowSaplingsPhase,
  runNaturalSpawnPhase,
} from "./phases";

export function isGrowthAction(
  action: GameAction,
): action is GrowthHandledAction {
  return HANDLED_ACTION_TYPES.has(action.type);
}

/**
 * Handles growth/spawn actions. Returns the next state if the
 * action belongs to this cluster, or `null` to signal reducer fallback.
 */
export function handleGrowthAction(
  state: GameState,
  action: GameAction,
): GameState | null {
  switch (action.type) {
    case "GROW_SAPLING": {
      return runGrowSaplingPhase({ state, action });
    }

    case "GROW_SAPLINGS": {
      return runGrowSaplingsPhase({ state, action });
    }

    case "NATURAL_SPAWN": {
      return runNaturalSpawnPhase({ state, action });
    }

    default:
      return null;
  }
}
