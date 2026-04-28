import {
  DRONE_COLLECT_TICKS,
  DRONE_DEPOSIT_TICKS,
  DRONE_SPEED_TILES_PER_TICK,
} from "../../store/constants/drone-config";
import type {
  GameState,
  StarterDroneState,
} from "../../store/types";
import { droneTravelTicks, moveDroneToward, nudgeAwayFromDrones } from "../drone-movement";
import { decideInventorySourceTravelTarget } from "../utils/drone-utils";
import { applyDroneUpdate } from "../drone-state-helpers";
import {
  getCraftingJobById,
  getCraftingReservationById,
  parseWorkbenchTaskNodeId,
} from "../../store/workbench-task-utils";
import { resolveWorkbenchInputPickup } from "../../store/workbench-input-pickup";
import { resolveDroneDropoff } from "../resolve-drone-dropoff";
import { finalizeWorkbenchDelivery } from "./workbench-finalizer-bindings";
import type { TickOneDroneIoDeps } from "./tick-one-drone";

type DroneMovementDeps = TickOneDroneIoDeps;

export function handleMovingToCollectStatus(
  state: GameState,
  droneId: string,
  drone: StarterDroneState,
  deps: DroneMovementDeps,
): GameState {
  const rem = drone.ticksRemaining - 1;

  const workbenchTask = parseWorkbenchTaskNodeId(drone.targetNodeId);

  if (drone.currentTaskType === "workbench_delivery" && workbenchTask?.kind === "input") {
    const job = getCraftingJobById(state.crafting, workbenchTask.jobId);
    const reservation = getCraftingReservationById(state.network, workbenchTask.reservationId);
    const pickup = job && reservation ? resolveWorkbenchInputPickup(state, job, reservation) : null;
    if (!job || job.status !== "reserved" || !reservation || !pickup) {
      return applyDroneUpdate(state, droneId, {
        ...drone,
        status: "idle",
        targetNodeId: null,
        cargo: null,
        ticksRemaining: 0,
        currentTaskType: null,
        deliveryTargetId: null,
        craftingJobId: null,
      });
    }
    if (rem > 0) {
      const { x: nextX, y: nextY } = moveDroneToward(drone.tileX, drone.tileY, pickup.x, pickup.y, DRONE_SPEED_TILES_PER_TICK);
      const { x: sepX, y: sepY } = nudgeAwayFromDrones(nextX, nextY, pickup.x, pickup.y, state.drones, drone.droneId);
      return applyDroneUpdate(state, droneId, { ...drone, tileX: sepX, tileY: sepY, ticksRemaining: rem });
    }
    return applyDroneUpdate(state, droneId, {
      ...drone,
      tileX: pickup.x,
      tileY: pickup.y,
      status: "collecting",
      ticksRemaining: DRONE_COLLECT_TICKS,
    });
  }

  if (drone.currentTaskType === "workbench_delivery" && workbenchTask?.kind === "output") {
    const workbenchAsset = state.assets[workbenchTask.workbenchId];
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
      return finalizeWorkbenchDelivery(state, droneId, workbenchTask.jobId ?? drone.craftingJobId, idleDrone);
    }
    if (rem > 0) {
      const { x: nextX, y: nextY } = moveDroneToward(drone.tileX, drone.tileY, workbenchAsset.x, workbenchAsset.y, DRONE_SPEED_TILES_PER_TICK);
      const { x: sepX, y: sepY } = nudgeAwayFromDrones(nextX, nextY, workbenchAsset.x, workbenchAsset.y, state.drones, drone.droneId);
      return applyDroneUpdate(state, droneId, { ...drone, tileX: sepX, tileY: sepY, ticksRemaining: rem });
    }
    return applyDroneUpdate(state, droneId, {
      ...drone,
      tileX: workbenchAsset.x,
      tileY: workbenchAsset.y,
      status: "collecting",
      ticksRemaining: DRONE_COLLECT_TICKS,
    });
  }

  // hub_dispatch / warehouse-dispatch: navigate toward the source asset position
  if (drone.currentTaskType === "hub_dispatch" && (drone.targetNodeId?.startsWith("hub:") || drone.targetNodeId?.startsWith("wh:"))) {
    const sourceTravelTarget = decideInventorySourceTravelTarget({
      taskType: drone.currentTaskType,
      targetNodeId: drone.targetNodeId,
      assets: state.assets,
    });
    if (sourceTravelTarget.kind === "blocked") {
      // Source removed mid-flight - abort
      return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
    }
    if (rem > 0) {
      const { x: nextX, y: nextY } = moveDroneToward(drone.tileX, drone.tileY, sourceTravelTarget.targetX, sourceTravelTarget.targetY, DRONE_SPEED_TILES_PER_TICK);
      const { x: sepX, y: sepY } = nudgeAwayFromDrones(nextX, nextY, sourceTravelTarget.targetX, sourceTravelTarget.targetY, state.drones, drone.droneId);
      return applyDroneUpdate(state, droneId, { ...drone, tileX: sepX, tileY: sepY, ticksRemaining: rem });
    }
    // Arrived at source - snap and start collecting
    return applyDroneUpdate(state, droneId, {
      ...drone,
      tileX: sourceTravelTarget.targetX,
      tileY: sourceTravelTarget.targetY,
      status: "collecting",
      ticksRemaining: DRONE_COLLECT_TICKS,
    });
  }

  // building_supply with hub or warehouse source: same flight pattern
  if (drone.currentTaskType === "building_supply" && (drone.targetNodeId?.startsWith("hub:") || drone.targetNodeId?.startsWith("wh:"))) {
    const sourceTravelTarget = decideInventorySourceTravelTarget({
      taskType: drone.currentTaskType,
      targetNodeId: drone.targetNodeId,
      assets: state.assets,
    });
    if (sourceTravelTarget.kind === "blocked") {
      return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
    }
    if (rem > 0) {
      const { x: nextX, y: nextY } = moveDroneToward(drone.tileX, drone.tileY, sourceTravelTarget.targetX, sourceTravelTarget.targetY, DRONE_SPEED_TILES_PER_TICK);
      const { x: sepX, y: sepY } = nudgeAwayFromDrones(nextX, nextY, sourceTravelTarget.targetX, sourceTravelTarget.targetY, state.drones, drone.droneId);
      return applyDroneUpdate(state, droneId, { ...drone, tileX: sepX, tileY: sepY, ticksRemaining: rem });
    }
    return applyDroneUpdate(state, droneId, {
      ...drone,
      tileX: sourceTravelTarget.targetX,
      tileY: sourceTravelTarget.targetY,
      status: "collecting",
      ticksRemaining: DRONE_COLLECT_TICKS,
    });
  }

  if (rem > 0) {
    // Interpolate position toward target node each tick
    const targetNode = drone.targetNodeId ? state.collectionNodes[drone.targetNodeId] : null;
    if (targetNode) {
      const { x: nextX, y: nextY } = moveDroneToward(drone.tileX, drone.tileY, targetNode.tileX, targetNode.tileY, DRONE_SPEED_TILES_PER_TICK);
      const { x: sepX, y: sepY } = nudgeAwayFromDrones(nextX, nextY, targetNode.tileX, targetNode.tileY, state.drones, drone.droneId);
      return applyDroneUpdate(state, droneId, { ...drone, tileX: sepX, tileY: sepY, ticksRemaining: rem });
    }
    return applyDroneUpdate(state, droneId, { ...drone, ticksRemaining: rem });
  }

  const node = drone.targetNodeId ? state.collectionNodes[drone.targetNodeId] : null;
  if (!node || node.amount <= 0) {
    // Node gone - release claim, go idle
    const newNodes = drone.targetNodeId && state.collectionNodes[drone.targetNodeId]
      ? { ...state.collectionNodes, [drone.targetNodeId]: { ...state.collectionNodes[drone.targetNodeId], reservedByDroneId: null } }
      : state.collectionNodes;
    return applyDroneUpdate(
      { ...state, collectionNodes: newNodes },
      droneId,
      { ...drone, status: "idle", targetNodeId: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null },
    );
  }

  return applyDroneUpdate(state, droneId, {
    ...drone,
    tileX: node.tileX,
    tileY: node.tileY,
    status: "collecting",
    ticksRemaining: DRONE_COLLECT_TICKS,
  });
}

export function handleMovingToDropoffStatus(
  state: GameState,
  droneId: string,
  drone: StarterDroneState,
  deps: DroneMovementDeps,
): GameState {
  const { debugLog } = deps;

  const rem = drone.ticksRemaining - 1;
  // Resolve dropoff position - task-type-aware, consistent with collecting transition
  const { x: dropX, y: dropY } = resolveDroneDropoff(drone, state.assets, state.serviceHubs, state.warehouseInventories, state.crafting);

  if (rem > 0) {
    // Interpolate position toward dropoff target each tick
    const { x: nextX, y: nextY } = moveDroneToward(drone.tileX, drone.tileY, dropX, dropY, DRONE_SPEED_TILES_PER_TICK);
    const { x: sepX, y: sepY } = nudgeAwayFromDrones(nextX, nextY, dropX, dropY, state.drones, drone.droneId);
    return applyDroneUpdate(state, droneId, { ...drone, tileX: sepX, tileY: sepY, ticksRemaining: rem });
  }

  // Arrival: snap to target, enter depositing
  debugLog.inventory(`[Drone] Arrived at dropoff (${dropX},${dropY}), cargo: ${drone.cargo?.amount}× ${drone.cargo?.itemType}`);
  return applyDroneUpdate(state, droneId, {
    ...drone,
    tileX: dropX,
    tileY: dropY,
    status: "depositing",
    ticksRemaining: DRONE_DEPOSIT_TICKS,
  });
}
