// ============================================================
// Growth action handler
// ------------------------------------------------------------
// Extracts growth/spawn reducer cases:
// - GROW_SAPLING
// - GROW_SAPLINGS
// - NATURAL_SPAWN
// Behaviour is intentionally byte-equivalent to the prior inline
// case bodies — no new abstractions, no logic changes.
// ============================================================

import type { GameAction } from "../../reducer";
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
