// ============================================================
// Drone tick action handler
// ------------------------------------------------------------
// Handles:     DRONE_TICK
// Reads:       state.drones, state.starterDrone, state.assets,
//              state.serviceHubs, state.warehouseInventories,
//              state.constructionSites, state.crafting,
//              state.collectionNodes
// Writes:      state.drones (movement / status / cargo),
//              state.starterDrone, target inventories on
//              collect/deposit, state.crafting (input buffer +
//              delivery transitions), state.collectionNodes
// Depends on:  ./phases/drone-tick-phase, deps.tickOneDrone
//              (orchestrator from ../../../drones/execution/tick-one-drone)
// Notes:       Hottest path. Iterates every drone every 500 ms.
//              Task selection deps live in ../../../drones/selection/.
// ============================================================

import type { GameAction } from "../../actions";
import type { GameState } from "../../types";
import type { DroneTickActionDeps } from "./deps";
import {
  HANDLED_ACTION_TYPES,
  type DroneTickHandledAction,
} from "./types";
import { runDroneTickPhase } from "./phases/drone-tick-phase";

export type { DroneTickActionDeps } from "./deps";

export function isDroneTickAction(
  action: GameAction,
): action is DroneTickHandledAction {
  return HANDLED_ACTION_TYPES.has(action.type);
}

/**
 * Handles drone-tick actions. Returns the next state if the action
 * belongs to this cluster, or `null` to signal reducer fallback.
 */
export function handleDroneTickAction(
  state: GameState,
  action: GameAction,
  deps: DroneTickActionDeps,
): GameState | null {
  switch (action.type) {
    case "DRONE_TICK": {
      return runDroneTickPhase({ state, action, deps });
    }

    default:
      return null;
  }
}
