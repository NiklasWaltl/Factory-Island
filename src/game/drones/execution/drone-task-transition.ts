import { droneTravelTicks } from "../drone-movement";
import { DRONE_SPEED_TILES_PER_TICK } from "../../store/constants/drone-config";
import {
  decideReturningToDockWorkbenchUrgentRoute,
  type WorkbenchTaskNodeId,
} from "../utils/drone-utils";
import { runIdleHubSelfHeal } from "./drone-preflight";
import type { TickOneDroneDeps } from "./tick-one-drone";
import type {
  CollectionNode,
  GameState,
  StarterDroneState,
} from "../../store/types";

type DroneTaskTransitionDeps = Pick<
  TickOneDroneDeps,
  | "applyDroneUpdate"
  | "createEmptyHubInventory"
  | "createDefaultProtoHubTargetStock"
  | "selectDroneTask"
  | "getDroneHomeDock"
  | "parseWorkbenchTaskNodeId"
  | "getCraftingJobById"
  | "getCraftingReservationById"
  | "resolveWorkbenchInputPickup"
  | "finalizeWorkbenchDelivery"
  | "moveDroneToward"
  | "nudgeAwayFromDrones"
  | "debugLog"
>;

export function handleIdleStatus(
  state: GameState,
  droneId: string,
  drone: StarterDroneState,
  deps: DroneTaskTransitionDeps,
): GameState {
  const {
    applyDroneUpdate,
    createEmptyHubInventory,
    createDefaultProtoHubTargetStock,
    selectDroneTask,
    getDroneHomeDock,
    parseWorkbenchTaskNodeId,
    getCraftingJobById,
    getCraftingReservationById,
    resolveWorkbenchInputPickup,
    finalizeWorkbenchDelivery,
    debugLog,
  } = deps;

  // Self-heal: if hubId points to a valid hub asset but serviceHubs entry is missing, recreate it
  const currentState = runIdleHubSelfHeal(state, drone, {
    createEmptyHubInventory,
    createDefaultProtoHubTargetStock,
    debugLog,
  });

  const task = selectDroneTask(currentState, drone);
  if (!task) {
    // No work to do - return to homeHub dock if not already there
    const dock = getDroneHomeDock(drone, currentState);
    if (dock && (drone.tileX !== dock.x || drone.tileY !== dock.y)) {
      return applyDroneUpdate(currentState, droneId, {
        ...drone,
        status: "returning_to_dock",
        ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, dock.x, dock.y),
      });
    }
    return currentState;
  }

  // hub_dispatch: drone flies to hub OR warehouse to pick up resources directly
  // from inventory. No collectionNode involvement - navigate to source asset position.
  // Source is encoded in the synthetic nodeId prefix: "hub:" or "wh:".
  if (task.taskType === "hub_dispatch") {
    const [, sourceId] = task.nodeId.split(":");
    const sourceAsset = currentState.assets[sourceId];
    if (!sourceAsset) return currentState; // source gone
    const sourceKind = task.nodeId.startsWith("wh:") ? "warehouse" : "hub";
    debugLog.inventory(`[Drone] hub_dispatch: flying to ${sourceKind} ${sourceId} for ${task.nodeId.split(":")[2]} → site ${task.deliveryTargetId}`);
    return applyDroneUpdate(currentState, droneId, {
      ...drone,
      status: "moving_to_collect",
      targetNodeId: task.nodeId,
      currentTaskType: "hub_dispatch",
      deliveryTargetId: task.deliveryTargetId || null,
      craftingJobId: null,
      ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, sourceAsset.x, sourceAsset.y),
    });
  }

  // building_supply with hub or warehouse source: drone flies to the source and withdraws
  // from its inventory before delivering to the building's input buffer.
  if (
    task.taskType === "building_supply" &&
    (task.nodeId.startsWith("hub:") || task.nodeId.startsWith("wh:"))
  ) {
    const [, sourceId, resource] = task.nodeId.split(":");
    const sourceAsset = currentState.assets[sourceId];
    if (!sourceAsset) return currentState;
    const sourceKind = task.nodeId.startsWith("wh:") ? "warehouse" : "hub";
    debugLog.inventory(`[Drone] building_supply: flying to ${sourceKind} ${sourceId} for ${resource} → building ${task.deliveryTargetId}`);
    return applyDroneUpdate(currentState, droneId, {
      ...drone,
      status: "moving_to_collect",
      targetNodeId: task.nodeId,
      currentTaskType: "building_supply",
      deliveryTargetId: task.deliveryTargetId || null,
      craftingJobId: null,
      ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, sourceAsset.x, sourceAsset.y),
    });
  }

  if (task.taskType === "workbench_delivery") {
    const workbenchTask = parseWorkbenchTaskNodeId(task.nodeId);
    if (!workbenchTask) return currentState;

    if (workbenchTask.kind === "input") {
      const job = getCraftingJobById(currentState.crafting, workbenchTask.jobId);
      const reservation = getCraftingReservationById(currentState.network, workbenchTask.reservationId);
      const pickup = job && reservation ? resolveWorkbenchInputPickup(currentState, job, reservation) : null;
      if (!job || job.status !== "reserved" || !reservation || !pickup) {
        return currentState;
      }
      debugLog.inventory(
        `[Drone] workbench_input: flying to source for ${workbenchTask.reservationId} on job ${workbenchTask.jobId}`,
      );
      return applyDroneUpdate(currentState, droneId, {
        ...drone,
        status: "moving_to_collect",
        targetNodeId: task.nodeId,
        currentTaskType: "workbench_delivery",
        deliveryTargetId: task.deliveryTargetId || null,
        craftingJobId: workbenchTask.jobId,
        ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, pickup.x, pickup.y),
      });
    }

    const outputTask = workbenchTask as Extract<WorkbenchTaskNodeId, { kind: "output" }>;
    const workbenchAsset = currentState.assets[outputTask.workbenchId];
    if (!workbenchAsset || workbenchAsset.type !== "workbench") {
      const idleDrone: StarterDroneState = {
        ...drone,
        status: "idle",
        targetNodeId: null,
        cargo: null,
        ticksRemaining: 0,
        currentTaskType: null,
        deliveryTargetId: null,
        craftingJobId: null,
      };
      return finalizeWorkbenchDelivery(
        currentState,
        droneId,
        outputTask.jobId ?? null,
        idleDrone,
      );
    }

    debugLog.inventory(`[Drone] workbench_delivery: flying to workbench ${outputTask.workbenchId} for job ${outputTask.jobId}`);
    return applyDroneUpdate(currentState, droneId, {
      ...drone,
      status: "moving_to_collect",
      targetNodeId: task.nodeId,
      currentTaskType: "workbench_delivery",
      deliveryTargetId: task.deliveryTargetId || null,
      craftingJobId: outputTask.jobId ?? null,
      ticksRemaining: droneTravelTicks(
        drone.tileX,
        drone.tileY,
        workbenchAsset.x,
        workbenchAsset.y,
      ),
    });
  }

  const node = currentState.collectionNodes[task.nodeId];
  if (!node) return currentState;

  // Claim the node so no other drone selects it while this one is en route
  const claimedNode: CollectionNode = { ...node, reservedByDroneId: drone.droneId };
  return applyDroneUpdate(
    {
      ...currentState,
      collectionNodes: {
        ...currentState.collectionNodes,
        [task.nodeId]: claimedNode,
      },
    },
    droneId,
    {
      ...drone,
      status: "moving_to_collect",
      targetNodeId: task.nodeId,
      currentTaskType: task.taskType,
      deliveryTargetId: task.deliveryTargetId || null,
      craftingJobId: null,
      ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, node.tileX, node.tileY),
    },
  );
}

export function handleReturningToDockStatus(
  state: GameState,
  droneId: string,
  drone: StarterDroneState,
  deps: DroneTaskTransitionDeps,
): GameState {
  const {
    applyDroneUpdate,
    selectDroneTask,
    getDroneHomeDock,
    parseWorkbenchTaskNodeId,
    getCraftingJobById,
    getCraftingReservationById,
    resolveWorkbenchInputPickup,
    moveDroneToward,
    nudgeAwayFromDrones,
    debugLog,
  } = deps;

  const dock = getDroneHomeDock(drone, state);
  if (!dock) {
    // homeHub gone - reset to idle in place
    return applyDroneUpdate(state, droneId, { ...drone, status: "idle", ticksRemaining: 0 });
  }

  // If a task appears while returning, abort the return and take it immediately
  const urgentTask = selectDroneTask(state, drone);
  if (urgentTask) {
    const urgentWorkbenchRoute = decideReturningToDockWorkbenchUrgentRoute({
      currentTaskType: urgentTask.taskType,
      urgentTaskNodeId: urgentTask.nodeId,
      urgentDeliveryTargetId: urgentTask.deliveryTargetId,
      crafting: state.crafting,
      network: state.network,
      assets: state.assets,
      workbenchPickupState: state,
      parseWorkbenchTaskNodeId,
      getCraftingJobById,
      getCraftingReservationById,
      resolveWorkbenchInputPickup,
    });
    if (urgentWorkbenchRoute.kind === "ready" && urgentWorkbenchRoute.routeKind === "input") {
      return applyDroneUpdate(state, droneId, {
        ...drone,
        status: "moving_to_collect",
        targetNodeId: urgentWorkbenchRoute.targetNodeId ?? urgentTask.nodeId,
        currentTaskType: "workbench_delivery",
        deliveryTargetId: urgentWorkbenchRoute.deliveryTargetId ?? null,
        craftingJobId: urgentWorkbenchRoute.craftingJobId ?? null,
        ticksRemaining: droneTravelTicks(
          drone.tileX,
          drone.tileY,
          urgentWorkbenchRoute.targetX,
          urgentWorkbenchRoute.targetY,
        ),
      });
    }
    if (urgentWorkbenchRoute.kind === "ready" && urgentWorkbenchRoute.routeKind === "output") {
      return applyDroneUpdate(state, droneId, {
        ...drone,
        status: "moving_to_collect",
        targetNodeId: urgentWorkbenchRoute.targetNodeId ?? urgentTask.nodeId,
        currentTaskType: "workbench_delivery",
        deliveryTargetId: urgentWorkbenchRoute.deliveryTargetId ?? null,
        craftingJobId: urgentWorkbenchRoute.craftingJobId ?? null,
        ticksRemaining: droneTravelTicks(
          drone.tileX,
          drone.tileY,
          urgentWorkbenchRoute.targetX,
          urgentWorkbenchRoute.targetY,
        ),
      });
    }

    const urgentNode = state.collectionNodes[urgentTask.nodeId];
    if (urgentNode) {
      const claimedNode: CollectionNode = { ...urgentNode, reservedByDroneId: drone.droneId };
      return applyDroneUpdate(
        {
          ...state,
          collectionNodes: {
            ...state.collectionNodes,
            [urgentTask.nodeId]: claimedNode,
          },
        },
        droneId,
        {
          ...drone,
          status: "moving_to_collect",
          targetNodeId: urgentTask.nodeId,
          currentTaskType: urgentTask.taskType,
          deliveryTargetId: urgentTask.deliveryTargetId || null,
          craftingJobId: null,
          ticksRemaining: droneTravelTicks(
            drone.tileX,
            drone.tileY,
            urgentNode.tileX,
            urgentNode.tileY,
          ),
        },
      );
    }
  }

  const rem = drone.ticksRemaining - 1;
  if (rem > 0) {
    const { x: nextX, y: nextY } = moveDroneToward(
      drone.tileX,
      drone.tileY,
      dock.x,
      dock.y,
      DRONE_SPEED_TILES_PER_TICK,
    );
    const { x: sepX, y: sepY } = nudgeAwayFromDrones(
      nextX,
      nextY,
      dock.x,
      dock.y,
      state.drones,
      drone.droneId,
    );
    return applyDroneUpdate(state, droneId, {
      ...drone,
      tileX: sepX,
      tileY: sepY,
      ticksRemaining: rem,
    });
  }

  // Arrived at dock - snap and go idle
  debugLog.inventory(`[Drone] Returned to dock (${dock.x},${dock.y})`);
  return applyDroneUpdate(state, droneId, {
    ...drone,
    tileX: dock.x,
    tileY: dock.y,
    status: "idle",
    ticksRemaining: 0,
  });
}
