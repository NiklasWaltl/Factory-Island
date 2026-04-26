// ============================================================
// Auto-smelter action handler
// ------------------------------------------------------------
// Extracts the AUTO_SMELTER_SET_RECIPE reducer case.
// Behaviour is intentionally byte-equivalent to the prior inline
// case body — no new abstractions, no logic changes.
// ============================================================

import type { GameAction } from "../../actions";
import type { GameState } from "../../types";
import { HANDLED_ACTION_TYPES, type AutoSmelterAction } from "./types";
import { runAutoSmelterSetRecipePhase } from "./phases/auto-smelter-set-recipe-phase";

export function isAutoSmelterAction(
  action: GameAction,
): action is AutoSmelterAction {
  return HANDLED_ACTION_TYPES.has(action.type);
}

/**
 * Handles auto-smelter actions. Returns the next state if the action
 * belongs to this cluster, or `null` to signal reducer fallback.
 */
export function handleAutoSmelterAction(
  state: GameState,
  action: GameAction,
): GameState | null {
  switch (action.type) {
    case "AUTO_SMELTER_SET_RECIPE": {
      return runAutoSmelterSetRecipePhase({ state, action });
    }

    default:
      return null;
  }
}
