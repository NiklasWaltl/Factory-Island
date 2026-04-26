import type { GameAction } from "../reducer";
import type { DroneHubAssignmentPreflightResult } from "../helpers/droneAssignment";
import type {
  DroneStatus,
  GameNotification,
  GameState,
  StarterDroneState,
} from "../types";

export interface DroneAssignmentActionDeps {
  validateDroneHubAssignment(input: {
    droneId: string;
    hubId: string;
    hubs: GameState["serviceHubs"];
    assets: GameState["assets"];
    starterDrone: GameState["starterDrone"];
    drones: GameState["drones"];
  }): DroneHubAssignmentPreflightResult;
  addErrorNotification(
    notifications: GameNotification[],
    message: string,
  ): GameNotification[];
  syncDrones(state: GameState): GameState;
  debugLog: {
    building(message: string): void;
  };
}

export function handleDroneAssignmentAction(
  state: GameState,
  action: GameAction,
  deps: DroneAssignmentActionDeps,
): GameState | null {
  switch (action.type) {
    case "ASSIGN_DRONE_TO_HUB": {
      const { droneId, hubId } = action;
      const preflightDecision = deps.validateDroneHubAssignment({
        droneId,
        hubId,
        hubs: state.serviceHubs,
        assets: state.assets,
        starterDrone: state.starterDrone,
        drones: state.drones,
      });
      if (!preflightDecision || !preflightDecision.valid) {
        if (preflightDecision?.reason === "hub_full") {
          return {
            ...state,
            notifications: deps.addErrorNotification(
              state.notifications,
              "Hub hat keine freien Drohnen-Slots.",
            ),
          };
        }
        return state;
      }

      const targetHub = state.serviceHubs[hubId]!;

      // Look up the drone - starterDrone is authoritative for "starter"; fall back to drones record
      const drone =
        droneId === state.starterDrone.droneId
          ? state.starterDrone
          : (state.drones[droneId] as StarterDroneState);

      // Remove drone from its old hub's droneIds
      let newHubs = { ...state.serviceHubs };
      const oldHubId = drone.hubId;
      if (oldHubId && oldHubId !== hubId && newHubs[oldHubId]) {
        newHubs = {
          ...newHubs,
          [oldHubId]: {
            ...newHubs[oldHubId],
            droneIds: newHubs[oldHubId].droneIds.filter((id) => id !== droneId),
          },
        };
      }

      // Add drone to new hub (preserve order; skip if already there)
      const newDroneIds = targetHub.droneIds.includes(droneId)
        ? [...(newHubs[hubId]?.droneIds ?? [])]
        : [...(newHubs[hubId]?.droneIds ?? []), droneId];
      const dockSlot = newDroneIds.indexOf(droneId);
      const dockX = preflightDecision.dockPos.x;
      const dockY = preflightDecision.dockPos.y;
      newHubs = {
        ...newHubs,
        [hubId]: {
          ...newHubs[hubId]!,
          droneIds: newDroneIds,
        },
      };

      // Release any claimed collection node before resetting the drone
      let newNodes = state.collectionNodes;
      if (
        drone.targetNodeId &&
        newNodes[drone.targetNodeId]?.reservedByDroneId === droneId
      ) {
        newNodes = {
          ...newNodes,
          [drone.targetNodeId]: {
            ...newNodes[drone.targetNodeId],
            reservedByDroneId: null,
          },
        };
      }

      // Snap drone to new dock, reset to idle
      const assignedDrone: StarterDroneState = {
        ...drone,
        hubId,
        status: "idle" as DroneStatus,
        tileX: dockX,
        tileY: dockY,
        targetNodeId: null,
        cargo: null,
        ticksRemaining: 0,
        currentTaskType: null,
        craftingJobId: null,
        deliveryTargetId: null,
      };

      deps.debugLog.building(
        `[ASSIGN_DRONE_TO_HUB] Drone ${droneId} → hub ${hubId} (dock slot ${dockSlot}, pos ${dockX},${dockY})`,
      );

      let newState: GameState = {
        ...state,
        serviceHubs: newHubs,
        collectionNodes: newNodes,
        drones: { ...state.drones, [droneId]: assignedDrone },
      };
      // Keep starterDrone in sync
      if (droneId === state.starterDrone.droneId) {
        newState = { ...newState, starterDrone: assignedDrone };
      }
      return deps.syncDrones(newState);
    }

    default:
      return null;
  }
}
