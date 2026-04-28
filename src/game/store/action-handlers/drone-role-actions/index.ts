// ============================================================
// Drone role action handler
// ------------------------------------------------------------
// Handles:     DRONE_SET_ROLE
// Reads:       state.drones, state.starterDrone, state.serviceHubs
// Writes:      state.drones[id].role, state.starterDrone (kept in
//              sync via deps.syncDrones)
// Depends on:  ./phases/drone-set-role-phase, deps.syncDrones
// Notes:       Role drives task-selection priorities — see
//              ../../../drones/selection/select-drone-task.ts
//              (`DRONE_ROLE_BONUS` is added per-candidate when the
//              drone's role matches: "construction" → construction
//              candidates, "supply" → hub-restock candidates).
//              Role change ONLY mutates `drone.role` (see
//              ./phases/drone-set-role-phase.ts) — it does NOT
//              cancel an in-flight task, drop cargo, or clear
//              `deliveryTargetId`. The new role only takes effect
//              the next time the drone is idle and re-evaluates
//              tasks via select-drone-task.ts.
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
