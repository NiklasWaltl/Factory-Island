// ============================================================
// Hub-target action handler
// ------------------------------------------------------------
// Extracts the SET_HUB_TARGET_STOCK reducer case.
// Behaviour is intentionally byte-equivalent to the prior inline
// case body — no new abstractions, no logic changes.
// ============================================================

import type { GameAction } from "../../actions";
import type { GameState } from "../../types";
import { HANDLED_ACTION_TYPES, type HubTargetAction } from "./types";
import { runSetHubTargetStockPhase } from "./phases/set-hub-target-stock-phase";

export function isHubTargetAction(
  action: GameAction,
): action is HubTargetAction {
  return HANDLED_ACTION_TYPES.has(action.type);
}

/**
 * Handles hub-target actions. Returns the next state if the action
 * belongs to this cluster, or `null` to signal reducer fallback.
 */
export function handleHubTargetAction(
  state: GameState,
  action: GameAction,
): GameState | null {
  switch (action.type) {
    case "SET_HUB_TARGET_STOCK": {
      return runSetHubTargetStockPhase({ state, action });
    }

    default:
      return null;
  }
}
