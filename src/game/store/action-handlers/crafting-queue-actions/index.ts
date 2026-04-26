// ============================================================
// Crafting / Queue action handler
// ------------------------------------------------------------
// Dispatcher over 6 phase modules that mutate the crafting queue
// and closely related slices (network reservations, keep-in-stock
// targets, recipe automation policies). The reducer switch
// delegates these action cases to this module.
//
// Behaviour is intentionally byte-equivalent to the prior inline
// case bodies — no new abstractions, no logic changes.
// ============================================================

import type { GameState } from "../../types";
import type { GameAction } from "../../actions";
import type { CraftingQueueActionDeps } from "./deps";
import { HANDLED_ACTION_TYPES, type CraftingQueueHandledAction } from "./types";
import {
  runNetworkReservationsPhase,
  runCraftRequestPhase,
  runJobEnqueuePhase,
  runQueueManagementPhase,
  runKeepStockTargetPhase,
  runRecipePolicyPhase,
} from "./phases";

export type { CraftingQueueActionDeps } from "./deps";

export function isCraftingQueueAction(
  action: GameAction,
): action is CraftingQueueHandledAction {
  return HANDLED_ACTION_TYPES.has(action.type);
}

/**
 * Handles all crafting/queue cluster actions. Returns the next state
 * if the action belongs to this cluster, or `null` to signal the
 * reducer should fall through to its remaining switch cases.
 */
export function handleCraftingQueueAction(
  state: GameState,
  action: GameAction,
  deps: CraftingQueueActionDeps,
): GameState | null {
  switch (action.type) {
    // -----------------------------------------------------------------
    // Inventory-network reservations (Step 2)
    // -----------------------------------------------------------------
    case "NETWORK_RESERVE_BATCH":
    case "NETWORK_COMMIT_RESERVATION":
    case "NETWORK_COMMIT_BY_OWNER":
    case "NETWORK_CANCEL_RESERVATION":
    case "NETWORK_CANCEL_BY_OWNER": {
      return runNetworkReservationsPhase({ state, action });
    }

    // -----------------------------------------------------------------
    // Crafting jobs (Step 3)
    // -----------------------------------------------------------------
    case "CRAFT_REQUEST_WITH_PREREQUISITES": {
      return runCraftRequestPhase({ state, action, deps });
    }

    case "JOB_ENQUEUE": {
      return runJobEnqueuePhase({ state, action, deps });
    }

    case "JOB_CANCEL":
    case "JOB_MOVE":
    case "JOB_SET_PRIORITY":
    case "JOB_TICK": {
      return runQueueManagementPhase({ state, action, deps });
    }

    case "SET_KEEP_STOCK_TARGET": {
      return runKeepStockTargetPhase({ state, action, deps });
    }

    case "SET_RECIPE_AUTOMATION_POLICY": {
      return runRecipePolicyPhase({ state, action, deps });
    }

    default:
      return null;
  }
}
