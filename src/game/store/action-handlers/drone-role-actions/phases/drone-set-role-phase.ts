import type { GameState } from "../../../types";
import type { DroneRoleActionDeps } from "../deps";
import type { DroneSetRoleAction } from "../types";

export interface DroneSetRoleContext {
  state: GameState;
  action: DroneSetRoleAction;
  deps: DroneRoleActionDeps;
}

export function runDroneSetRolePhase(ctx: DroneSetRoleContext): GameState {
  const { state, action, deps } = ctx;
  const { droneId, role } = action;
  // Update whichever drone record is authoritative.
  if (droneId === state.starterDrone.droneId) {
    const updated = { ...state.starterDrone, role };
    return deps.syncDrones({ ...state, starterDrone: updated });
  }
  const target = state.drones[droneId];
  if (!target) return state;
  return deps.syncDrones({
    ...state,
    drones: { ...state.drones, [droneId]: { ...target, role } },
  });
}
