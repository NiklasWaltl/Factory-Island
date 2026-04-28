// ============================================================
// Crafting / Queue action handler
// ------------------------------------------------------------
// Handles:     NETWORK_RESERVE_BATCH, NETWORK_COMMIT_RESERVATION,
//              NETWORK_COMMIT_BY_OWNER, NETWORK_CANCEL_RESERVATION,
//              NETWORK_CANCEL_BY_OWNER, CRAFT_REQUEST_WITH_PREREQUISITES,
//              JOB_ENQUEUE, JOB_CANCEL, JOB_MOVE, JOB_SET_PRIORITY,
//              JOB_TICK, SET_KEEP_STOCK_TARGET, SET_RECIPE_AUTOMATION_POLICY
// Reads:       state.crafting, state.network, state.warehouseInventories,
//              state.inventory, state.assets, state.serviceHubs,
//              state.keepStockByWorkbench, state.recipeAutomationPolicies
// Writes:      state.crafting, state.network, physical inventories
//              (warehouseInventories / inventory / serviceHubs)
//              on commit, state.keepStockByWorkbench,
//              state.recipeAutomationPolicies
// Depends on:  ./phases (6 phase modules), ./deps (reducer-internal
//              helpers injected to avoid ESM cycle with reducer.ts)
// Notes:       JOB_TICK is split into Planning + Execution
//              (see ../../crafting/tickPhases.ts). Only the
//              Planning phase is allowed to enqueue new jobs.
//              Largest cluster — see crafting/README.md for the
//              job-lifecycle overview.
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
