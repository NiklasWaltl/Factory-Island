import type { GameNotification, GameState } from "../../store/types";
import type { TickOneDroneDebugLog } from "../utils/drone-utils";
import {
  handleIdleStatus,
  handleReturningToDockStatus,
} from "./drone-task-transition";
import {
  handleMovingToCollectStatus,
  handleMovingToDropoffStatus,
} from "./drone-movement";
import {
  handleCollectingStatus,
  handleDepositingStatus,
} from "./drone-finalization";

/**
 * Minimal I/O surface for tick-one-drone. Pure helpers (state derivations,
 * geometry, decision logic) are imported directly by the phase modules.
 * Only side-effecting / runtime I/O remains here.
 */
export interface TickOneDroneIoDeps {
  makeId: () => string;
  addNotification: (
    notifications: GameNotification[],
    resource: string,
    amount: number,
  ) => GameNotification[];
  debugLog: TickOneDroneDebugLog;
}

export function tickOneDrone(
  state: GameState,
  droneId: string,
  deps: TickOneDroneIoDeps,
): GameState {
  const drone = state.drones[droneId];
  if (!drone) return state;

  switch (drone.status) {
    case "idle":
      return handleIdleStatus(state, droneId, drone, deps);

    case "moving_to_collect":
      return handleMovingToCollectStatus(state, droneId, drone, deps);

    case "collecting":
      return handleCollectingStatus(state, droneId, drone, deps);

    case "moving_to_dropoff":
      return handleMovingToDropoffStatus(state, droneId, drone, deps);

    case "depositing":
      return handleDepositingStatus(state, droneId, drone, deps);

    case "returning_to_dock":
      return handleReturningToDockStatus(state, droneId, drone, deps);

    default:
      return state;
  }
}
