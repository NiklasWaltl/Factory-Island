// ============================================================
// Drone role action handler
// ------------------------------------------------------------
// Extracts the DRONE_SET_ROLE reducer case.
// Behaviour is intentionally byte-equivalent to the prior inline
// case body — no new abstractions, no logic changes.
// ============================================================

import type { GameAction } from "../../actions";
import type { GameState } from "../../types";
import type { DroneRoleActionDeps } from "./deps";
import {
  HANDLED_ACTION_TYPES,
  type DroneRoleHandledAction,
} from "./types";
import { runDroneSetRolePhase } from "./phases/drone-set-role-phase";

export type { DroneRoleActionDeps } from "./deps";

export function isDroneRoleAction(
  action: GameAction,
): action is DroneRoleHandledAction {
  return HANDLED_ACTION_TYPES.has(action.type);
}

/**
 * Handles drone-role actions. Returns the next state if the action
 * belongs to this cluster, or `null` to signal reducer fallback.
 */
export function handleDroneRoleAction(
  state: GameState,
  action: GameAction,
  deps: DroneRoleActionDeps,
): GameState | null {
  switch (action.type) {
    case "DRONE_SET_ROLE": {
      return runDroneSetRolePhase({ state, action, deps });
    }

    default:
      return null;
  }
}
