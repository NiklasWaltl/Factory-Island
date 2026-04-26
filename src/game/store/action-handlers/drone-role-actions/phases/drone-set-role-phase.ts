import type { GameState } from "../../../types";
import type { DroneRoleActionDeps } from "../deps";
import type { DroneSetRoleAction } from "../types";

export interface DroneSetRoleContext {
  state: GameState;
  action: DroneSetRoleAction;
  deps: DroneRoleActionDeps;
}

function applyRole(drone: GameState["starterDrone"], role: DroneSetRoleAction["role"]) {
  return { ...drone, role };
}

export function runDroneSetRolePhase(ctx: DroneSetRoleContext): GameState {
  const { state, action, deps } = ctx;
  const { droneId, role } = action;
  // Invariants:
  // 1) starterDrone is authoritative for starter updates.
  // 2) unknown non-starter IDs are strict no-op.
  // 3) only the role field is changed.
  // 4) syncDrones keeps drones.starter === starterDrone.
  if (droneId === state.starterDrone.droneId) {
    const updated = applyRole(state.starterDrone, role);
    return deps.syncDrones({ ...state, starterDrone: updated });
  }
  const target = state.drones[droneId];
  if (!target) return state;
  return deps.syncDrones({
    ...state,
    drones: { ...state.drones, [droneId]: applyRole(target, role) },
  });
}
