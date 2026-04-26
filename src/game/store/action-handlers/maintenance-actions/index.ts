// ============================================================
// Maintenance / no-op action handler
// ------------------------------------------------------------
// Extracts low-coupling maintenance and no-op reducer cases:
// - CRAFT_WORKBENCH
// - REMOVE_BUILDING
// - REMOVE_POWER_POLE
// - DEBUG_SET_STATE
// - EXPIRE_NOTIFICATIONS
//
// Behaviour is intentionally byte-equivalent to the prior inline
// case bodies — no new abstractions, no logic changes.
// ============================================================

import type { GameAction } from "../../reducer";
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
