// ============================================================
// Hub-target action handler
// ------------------------------------------------------------
// Handles:     SET_HUB_TARGET_STOCK
// Reads:       state.serviceHubs[hubId]
// Writes:      state.serviceHubs[hubId].targetStock[resource]
// Depends on:  ./phases/set-hub-target-stock-phase
// Notes:       Target stock drives drone restock candidate
//              selection (see ../../../drones/candidates/
//              hub-restock-candidates.ts). Tier-aware caps live in
//              ../../hub-tier-selectors.ts (getMaxTargetStockForTier).
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
