// ============================================================
// Drone tick action handler
// ------------------------------------------------------------
// Extracts the DRONE_TICK reducer case.
// Behaviour is intentionally byte-equivalent to the prior inline
// case body - no new abstractions, no logic changes.
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
