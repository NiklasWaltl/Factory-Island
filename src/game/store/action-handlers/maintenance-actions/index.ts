// ============================================================
// Maintenance / no-op action handler
// ------------------------------------------------------------
// Handles:     CRAFT_WORKBENCH (deprecated — use JOB_ENQUEUE),
//              REMOVE_BUILDING, REMOVE_POWER_POLE,
//              DEBUG_SET_STATE, EXPIRE_NOTIFICATIONS
// Reads:       state.assets, state.notifications, state.inventory,
//              state.placedBuildings, state.purchasedBuildings,
//              state.cellMap (REMOVE_*); whole state on DEBUG_SET_STATE
// Writes:      state.notifications (EXPIRE), state.assets +
//              state.cellMap + state.placedBuildings (REMOVE_*),
//              full state replacement (DEBUG_SET_STATE)
// Depends on:  ./phases (5 phase modules); no deps injection
// Notes:       Heterogeneous bucket — these cases share only "low
//              coupling to other clusters". DEBUG_SET_STATE bypasses
//              every invariant; intended for tests + debug panel.
//              EXPIRE_NOTIFICATIONS fires every 500 ms.
// ============================================================

import type { GameAction } from "../../actions";
import type { GameState } from "../../types";
import { HANDLED_ACTION_TYPES, type MaintenanceHandledAction } from "./types";
import {
  runCraftWorkbenchPhase,
  runRemoveBuildingPhase,
  runRemovePowerPolePhase,
  runDebugSetStatePhase,
  runExpireNotificationsPhase,
} from "./phases";

export function isMaintenanceAction(
  action: GameAction,
): action is MaintenanceHandledAction {
  return HANDLED_ACTION_TYPES.has(action.type);
}

/**
 * Handles maintenance/no-op cluster actions. Returns the next state
 * if the action belongs to this cluster, or `null` to signal the
 * reducer should fall through to its remaining switch cases.
 */
export function handleMaintenanceAction(
  state: GameState,
  action: GameAction,
): GameState | null {
  switch (action.type) {
    case "CRAFT_WORKBENCH": {
      return runCraftWorkbenchPhase({ state, action });
    }

    case "REMOVE_BUILDING": {
      return runRemoveBuildingPhase({ state, action });
    }

    case "REMOVE_POWER_POLE": {
      return runRemovePowerPolePhase({ state, action });
    }

    case "DEBUG_SET_STATE": {
      return runDebugSetStatePhase({ state, action });
    }

    case "EXPIRE_NOTIFICATIONS": {
      return runExpireNotificationsPhase({ state, action });
    }

    default:
      return null;
  }
}
