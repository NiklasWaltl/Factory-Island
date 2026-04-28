import { DRONE_CAPACITY } from "../../../store/constants/drone-config";
import { decideHubDispatchExecutionAction } from "../../../store/workflows/hub-dispatch-execution";
import type {
  CollectableItemType,
  CollectionNode,
  DroneTaskType,
  GameState,
  Inventory,
  ServiceHubEntry,
  ServiceHubInventory,
  StarterDroneState,
} from "../../../store/types";
import { droneTravelTicks } from "../../drone-movement";
import {
  getRemainingBuildingInputDemand,
  getRemainingConstructionNeed,
  getRemainingHubRestockNeed,
} from "../../selection/helpers/need-slot-resolvers";
import {
  decideCollectionNodePickupPlan,
  decideSourceInventoryPickupEligibility,
} from "../../utils/drone-utils";
import { applyDroneUpdate } from "../../drone-state-helpers";
import {
  getCraftingJobById,
  parseWorkbenchTaskNodeId,
} from "../../../store/workbench-task-utils";
import { commitWorkbenchInputReservation } from "../../../store/workbench-input-pickup";
import { resolveDroneDropoff } from "../../resolve-drone-dropoff";
import type { DroneFinalizationDeps } from "./types";

export function handleCollectingStatus(
  state: GameState,
  droneId: string,
  drone: StarterDroneState,
  deps: DroneFinalizationDeps,
): GameState {
  const { debugLog } = deps;

  const rem = drone.ticksRemaining - 1;
  if (rem > 0) return applyDroneUpdate(state, droneId, { ...drone, ticksRemaining: rem });

  const workbenchTask = parseWorkbenchTaskNodeId(drone.targetNodeId);

  if (drone.currentTaskType === "workbench_delivery" && workbenchTask?.kind === "input") {
    const job = getCraftingJobById(state.crafting, workbenchTask.jobId);
    if (!job || job.status !== "reserved") {
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
    const committed = commitWorkbenchInputReservation(state, job, workbenchTask.reservationId);
    if (!committed) {
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
    const dropoff = resolveDroneDropoff(
      {
        ...drone,
        targetNodeId: drone.targetNodeId,
        deliveryTargetId: job.workbenchId,
        craftingJobId: job.id,
      },
      committed.nextState.assets,
      committed.nextState.serviceHubs,
      committed.nextState.warehouseInventories,
      committed.nextState.crafting,
    );
    debugLog.inventory(
      `[Drone] workbench_input: picked up ${committed.amount}× ${committed.itemType} from ` +
        `${committed.sourceKind} ${committed.sourceId} for ${job.workbenchId} → (${dropoff.x},${dropoff.y})`,
    );
    return applyDroneUpdate(committed.nextState, droneId, {
      ...drone,
      status: "moving_to_dropoff",
      cargo: { itemType: committed.itemType, amount: committed.amount },
      targetNodeId: drone.targetNodeId,
      deliveryTargetId: job.workbenchId,
      craftingJobId: job.id,
      ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, dropoff.x, dropoff.y),
    });
  }

  if (drone.currentTaskType === "workbench_delivery" && workbenchTask?.kind === "output") {
    const job = getCraftingJobById(state.crafting, drone.craftingJobId);
    if (!job || job.status !== "delivering") {
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
    const dropoff = resolveDroneDropoff(drone, state.assets, state.serviceHubs, state.warehouseInventories, state.crafting);
    debugLog.inventory(`[Drone] workbench_delivery: picked up ${job.output.count}× ${job.output.itemId} from ${job.workbenchId} → (${dropoff.x},${dropoff.y})`);
    return applyDroneUpdate(state, droneId, {
      ...drone,
      status: "moving_to_dropoff",
      targetNodeId: null,
      ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, dropoff.x, dropoff.y),
    });
  }

  // hub_dispatch warehouse-source: arrived at warehouse — withdraw from warehouseInventories
  // and fly to construction site. Mirrors the hub branch below; warehouses are the PRIMARY
  // logistics source, hubs the fallback.
  if (drone.currentTaskType === "hub_dispatch" && drone.targetNodeId?.startsWith("wh:")) {
    const [, whId, resource] = drone.targetNodeId.split(":");
    const inv = state.warehouseInventories[whId];
    const itemType = resource as CollectableItemType;
    const available = inv
      ? (inv[itemType] ?? 0)
      : 0;
    const remainingNeed = inv && available > 0 && drone.deliveryTargetId
      ? getRemainingConstructionNeed(state, drone.deliveryTargetId, itemType, drone.droneId)
      : 0;
    const pickupDecision = decideSourceInventoryPickupEligibility({
      sourceExists: !!inv,
      availableInSource: available,
      remainingNeed,
      carryCapacity: DRONE_CAPACITY,
    });
    if (pickupDecision.kind === "blocked") {
      if (pickupDecision.reason === "source_empty") {
        debugLog.inventory(`[Drone] hub_dispatch: warehouse ${whId} has no ${itemType} on arrival — aborting (will reselect; hub fallback may apply)`);
      }
      return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
    }

    const pickup = pickupDecision.pickupAmount;
    const sourceInventory = inv as Inventory;
    const updatedWhInv: Inventory = { ...sourceInventory, [itemType]: available - pickup };
    const droneAsConstructionSupplier = { ...drone, currentTaskType: "construction_supply" as DroneTaskType };
    const dropoff = resolveDroneDropoff(droneAsConstructionSupplier, state.assets, state.serviceHubs, state.warehouseInventories, state.crafting);
    debugLog.inventory(`[Drone] hub_dispatch: collected ${pickup}× ${itemType} from warehouse ${whId} (PRIMARY) → delivering to site ${drone.deliveryTargetId} at (${dropoff.x},${dropoff.y})`);
    return applyDroneUpdate(
      { ...state, warehouseInventories: { ...state.warehouseInventories, [whId]: updatedWhInv } },
      droneId,
      {
        ...drone,
        status: "moving_to_dropoff",
        cargo: { itemType, amount: pickup },
        targetNodeId: null,
        currentTaskType: "construction_supply",
        ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, dropoff.x, dropoff.y),
      },
    );
  }

  // hub_dispatch: arrived at hub — withdraw from hub.inventory and fly to construction site
  if (drone.currentTaskType === "hub_dispatch" && drone.targetNodeId?.startsWith("hub:")) {
    const [, hubId, resource] = drone.targetNodeId.split(":");
    const itemType = resource as CollectableItemType;
    const hubEntry = state.serviceHubs[hubId];
    const remainingNeed = drone.deliveryTargetId
      ? getRemainingConstructionNeed(state, drone.deliveryTargetId, itemType, drone.droneId)
      : 0;
    const dispatchAction = decideHubDispatchExecutionAction({
      hubId,
      itemType,
      availableInHub: hubEntry ? (hubEntry.inventory[itemType] ?? 0) : null,
      remainingNeed,
    });

    if (dispatchAction.type === "abort_hub_dispatch") {
      if (dispatchAction.reason === "hub_empty") {
        // Hub ran out between task selection and arrival — abort
        debugLog.inventory(`[Drone] hub_dispatch: hub ${hubId} has no ${itemType} on arrival — aborting`);
      }
      return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
    }

    const nextHubEntry = state.serviceHubs[dispatchAction.hubId];
    if (!nextHubEntry) {
      return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
    }

    const pickup = dispatchAction.pickupAmount;
    const available = nextHubEntry.inventory[dispatchAction.itemType] ?? 0;
    const updatedHubInv: ServiceHubInventory = { ...nextHubEntry.inventory, [dispatchAction.itemType]: available - pickup };
    // Switch to construction_supply so depositing logic routes correctly to the site
    const droneAsConstructionSupplier = { ...drone, currentTaskType: dispatchAction.nextTaskType as DroneTaskType };
    const dropoff = resolveDroneDropoff(droneAsConstructionSupplier, state.assets, state.serviceHubs, state.warehouseInventories, state.crafting);
    debugLog.inventory(`[Drone] hub_dispatch: collected ${pickup}× ${dispatchAction.itemType} from hub ${dispatchAction.hubId} → delivering to site ${drone.deliveryTargetId} at (${dropoff.x},${dropoff.y})`);
    return applyDroneUpdate(
      { ...state, serviceHubs: { ...state.serviceHubs, [dispatchAction.hubId]: { ...nextHubEntry, inventory: updatedHubInv } } },
      droneId,
      {
        ...drone,
        status: "moving_to_dropoff",
        cargo: { itemType: dispatchAction.itemType, amount: pickup },
        targetNodeId: null,
        currentTaskType: dispatchAction.nextTaskType, // depositing case handles construction_supply
        ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, dropoff.x, dropoff.y),
      },
    );
  }

  // building_supply warehouse-source: arrived at warehouse — withdraw from warehouseInventories
  // and fly to building input buffer. Mirrors the hub branch below; warehouses PRIMARY.
  if (drone.currentTaskType === "building_supply" && drone.targetNodeId?.startsWith("wh:")) {
    const [, whId, resource] = drone.targetNodeId.split(":");
    const inv = state.warehouseInventories[whId];
    const itemType = resource as CollectableItemType;
    const available = inv
      ? (inv[itemType] ?? 0)
      : 0;
    const remainingNeed = inv && available > 0 && drone.deliveryTargetId
      ? getRemainingBuildingInputDemand(state, drone.deliveryTargetId, itemType, drone.droneId)
      : 0;
    const pickupDecision = decideSourceInventoryPickupEligibility({
      sourceExists: !!inv,
      availableInSource: available,
      remainingNeed,
      carryCapacity: DRONE_CAPACITY,
    });
    if (pickupDecision.kind === "blocked") {
      if (pickupDecision.reason === "source_empty") {
        debugLog.inventory(`[Drone] building_supply: warehouse ${whId} has no ${itemType} on arrival — aborting (will reselect; hub fallback may apply)`);
      }
      return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
    }

    const pickup = pickupDecision.pickupAmount;
    const sourceInventory = inv as Inventory;
    const updatedWhInv: Inventory = { ...sourceInventory, [itemType]: available - pickup };
    const droneAfterPickup: StarterDroneState = { ...drone, targetNodeId: null, cargo: { itemType, amount: pickup } };
    const dropoff = resolveDroneDropoff(droneAfterPickup, state.assets, state.serviceHubs, state.warehouseInventories, state.crafting);
    debugLog.inventory(`[Drone] building_supply: collected ${pickup}× ${itemType} from warehouse ${whId} (PRIMARY) → delivering to building ${drone.deliveryTargetId} at (${dropoff.x},${dropoff.y})`);
    return applyDroneUpdate(
      { ...state, warehouseInventories: { ...state.warehouseInventories, [whId]: updatedWhInv } },
      droneId,
      {
        ...droneAfterPickup,
        status: "moving_to_dropoff",
        ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, dropoff.x, dropoff.y),
      },
    );
  }

  // building_supply: arrived at hub — withdraw from hub.inventory and fly to building input buffer
  if (drone.currentTaskType === "building_supply" && drone.targetNodeId?.startsWith("hub:")) {
    const [, hubId, resource] = drone.targetNodeId.split(":");
    const hubEntry = state.serviceHubs[hubId];
    const itemType = resource as CollectableItemType;
    const available = hubEntry ? (hubEntry.inventory[itemType] ?? 0) : 0;
    const remainingNeed = hubEntry && available > 0 && drone.deliveryTargetId
      ? getRemainingBuildingInputDemand(state, drone.deliveryTargetId, itemType, drone.droneId)
      : 0;
    const pickupDecision = decideSourceInventoryPickupEligibility({
      sourceExists: !!hubEntry,
      availableInSource: available,
      remainingNeed,
      carryCapacity: DRONE_CAPACITY,
    });
    if (pickupDecision.kind === "blocked") {
      if (pickupDecision.reason === "source_empty") {
        debugLog.inventory(`[Drone] building_supply: hub ${hubId} has no ${itemType} on arrival — aborting`);
      }
      return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
    }

    const pickup = pickupDecision.pickupAmount;
    const sourceHubEntry = hubEntry as ServiceHubEntry;
    const updatedHubInv: ServiceHubInventory = { ...sourceHubEntry.inventory, [itemType]: available - pickup };
    // Clear targetNodeId so the inbound calc switches from hub-bound to cargo-bound counting.
    const droneAfterPickup: StarterDroneState = { ...drone, targetNodeId: null, cargo: { itemType, amount: pickup } };
    const dropoff = resolveDroneDropoff(droneAfterPickup, state.assets, state.serviceHubs, state.warehouseInventories, state.crafting);
    debugLog.inventory(`[Drone] building_supply: collected ${pickup}× ${itemType} from hub ${hubId} → delivering to building ${drone.deliveryTargetId} at (${dropoff.x},${dropoff.y})`);
    return applyDroneUpdate(
      { ...state, serviceHubs: { ...state.serviceHubs, [hubId]: { ...sourceHubEntry, inventory: updatedHubInv } } },
      droneId,
      {
        ...droneAfterPickup,
        status: "moving_to_dropoff",
        ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, dropoff.x, dropoff.y),
      },
    );
  }

  const node = drone.targetNodeId ? state.collectionNodes[drone.targetNodeId] : null;
  if (!node || node.amount <= 0) {
    // Node gone mid-collect — release any lingering reservation, go idle
    const newNodes = drone.targetNodeId && state.collectionNodes[drone.targetNodeId]
      ? { ...state.collectionNodes, [drone.targetNodeId]: { ...state.collectionNodes[drone.targetNodeId], reservedByDroneId: null } }
      : state.collectionNodes;
    return applyDroneUpdate(
      { ...state, collectionNodes: newNodes },
      droneId,
      { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null },
    );
  }

  const pickupPlan = decideCollectionNodePickupPlan({
    taskType: drone.currentTaskType,
    nodeItemType: node.itemType,
    nodeAmount: node.amount,
    droneId: drone.droneId,
    deliveryTargetId: drone.deliveryTargetId,
    hubId: drone.hubId,
    carryCapacity: DRONE_CAPACITY,
    getHubRemainingNeed: (hubId, itemType, dId) => getRemainingHubRestockNeed(state, hubId, itemType, dId),
    getConstructionRemainingNeed: (deliveryTargetId, itemType, dId) => getRemainingConstructionNeed(state, deliveryTargetId, itemType, dId),
    getBuildingRemainingNeed: (deliveryTargetId, itemType, dId) => getRemainingBuildingInputDemand(state, deliveryTargetId, itemType, dId),
  });
  if (pickupPlan.kind === "blocked") {
    const releasedNodes = {
      ...state.collectionNodes,
      [node.id]: { ...node, reservedByDroneId: null },
    };
    return applyDroneUpdate(
      { ...state, collectionNodes: releasedNodes },
      droneId,
      { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null },
    );
  }

  const pickup = pickupPlan.pickupAmount;
  const remaining = node.amount - pickup;
  // Build updated nodes: remove if empty, otherwise keep with reservation cleared
  const newNodes: Record<string, CollectionNode> =
    remaining <= 0
      ? Object.fromEntries(Object.entries(state.collectionNodes).filter(([k]) => k !== node.id))
      : { ...state.collectionNodes, [node.id]: { ...node, amount: remaining, reservedByDroneId: null } };
  debugLog.mining(`Drone collected ${pickup}× ${node.itemType} from node ${node.id}`);

  // Resolve dropoff position - task-type-aware, never silently defaults to trader
  const dropoff = resolveDroneDropoff(drone, state.assets, state.serviceHubs, state.warehouseInventories, state.crafting);
  debugLog.inventory(`[Drone] Dropoff resolved: (${dropoff.x},${dropoff.y}) | task=${drone.currentTaskType} deliveryTarget=${drone.deliveryTargetId} hubId=${drone.hubId}`);

  return applyDroneUpdate(
    { ...state, collectionNodes: newNodes },
    droneId,
    {
      ...drone,
      status: "moving_to_dropoff",
      cargo: { itemType: node.itemType, amount: pickup },
      targetNodeId: null,
      ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, dropoff.x, dropoff.y),
    },
  );
}
