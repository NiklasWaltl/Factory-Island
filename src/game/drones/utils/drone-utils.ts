import type { CraftingJob } from "../../crafting/types";
import type {
  CollectableItemType,
  DroneTaskType,
  GameState,
  Inventory,
  PlacedAsset,
  ServiceHubEntry,
  StarterDroneState,
} from "../../store/types";
import type { WorkbenchInputTask } from "../execution/workbench-finalizers";

export type WorkbenchTaskNodeId =
  | WorkbenchInputTask
  | { kind: "output"; workbenchId: string; jobId: string };

export type WorkbenchReservation = {
  id: string;
  itemId: CraftingJob["ingredients"][number]["itemId"];
  amount: number;
};

export interface TickOneDroneDebugLog {
  inventory: (message: string) => void;
  building: (message: string) => void;
  mining: (message: string) => void;
}

export type SourceInventoryPickupEligibilityDecision =
  | {
      kind: "blocked";
      reason: "source_missing" | "source_empty" | "no_remaining_need";
    }
  | {
      kind: "ready";
      pickupAmount: number;
    };

export function decideSourceInventoryPickupEligibility(input: {
  sourceExists: boolean;
  availableInSource: number;
  remainingNeed: number;
  carryCapacity: number;
}): SourceInventoryPickupEligibilityDecision {
  const { sourceExists, availableInSource, remainingNeed, carryCapacity } = input;

  if (!sourceExists) return { kind: "blocked", reason: "source_missing" };
  if (availableInSource <= 0) return { kind: "blocked", reason: "source_empty" };
  if (remainingNeed <= 0) return { kind: "blocked", reason: "no_remaining_need" };

  return {
    kind: "ready",
    pickupAmount: Math.min(carryCapacity, availableInSource, remainingNeed),
  };
}

export type CollectionNodePickupPlanDecision =
  | {
      kind: "blocked";
      reason: "no_remaining_need";
    }
  | {
      kind: "ready";
      pickupAmount: number;
    };

export function decideCollectionNodePickupPlan(input: {
  taskType: DroneTaskType | null;
  nodeItemType: CollectableItemType;
  nodeAmount: number;
  droneId: string;
  deliveryTargetId: string | null;
  hubId: string | null;
  carryCapacity: number;
  getHubRemainingNeed: (hubId: string, itemType: CollectableItemType, droneId: string) => number;
  getConstructionRemainingNeed: (
    deliveryTargetId: string,
    itemType: CollectableItemType,
    droneId: string,
  ) => number;
  getBuildingRemainingNeed: (
    deliveryTargetId: string,
    itemType: CollectableItemType,
    droneId: string,
  ) => number;
}): CollectionNodePickupPlanDecision {
  const {
    taskType,
    nodeItemType,
    nodeAmount,
    droneId,
    deliveryTargetId,
    hubId,
    carryCapacity,
    getHubRemainingNeed,
    getConstructionRemainingNeed,
    getBuildingRemainingNeed,
  } = input;

  let pickupAmount = Math.min(carryCapacity, nodeAmount);

  if (taskType === "hub_restock" && hubId) {
    const remainingNeed = getHubRemainingNeed(hubId, nodeItemType, droneId);
    if (remainingNeed <= 0) return { kind: "blocked", reason: "no_remaining_need" };
    pickupAmount = Math.min(pickupAmount, remainingNeed);
  } else if (taskType === "construction_supply" && deliveryTargetId) {
    const remainingNeed = getConstructionRemainingNeed(deliveryTargetId, nodeItemType, droneId);
    if (remainingNeed <= 0) return { kind: "blocked", reason: "no_remaining_need" };
    pickupAmount = Math.min(pickupAmount, remainingNeed);
  } else if (taskType === "building_supply" && deliveryTargetId) {
    const remainingNeed = getBuildingRemainingNeed(deliveryTargetId, nodeItemType, droneId);
    if (remainingNeed <= 0) return { kind: "blocked", reason: "no_remaining_need" };
    pickupAmount = Math.min(pickupAmount, remainingNeed);
  }

  return { kind: "ready", pickupAmount };
}

export type InventorySourceTravelTargetDecision =
  | {
      kind: "blocked";
      reason: "source_missing";
    }
  | {
      kind: "ready";
      sourceId: string;
      targetX: number;
      targetY: number;
    };

export function decideInventorySourceTravelTarget(input: {
  taskType: DroneTaskType | null;
  targetNodeId: string | null;
  assets: Record<string, PlacedAsset>;
}): InventorySourceTravelTargetDecision {
  const { taskType, targetNodeId, assets } = input;

  const isInventorySourceTask =
    taskType === "hub_dispatch" || taskType === "building_supply";
  const isInventorySourceNode =
    !!targetNodeId &&
    (targetNodeId.startsWith("hub:") || targetNodeId.startsWith("wh:"));
  if (!isInventorySourceTask || !isInventorySourceNode) {
    return { kind: "blocked", reason: "source_missing" };
  }

  const [, sourceId] = targetNodeId.split(":");
  const sourceAsset = sourceId ? assets[sourceId] : null;
  if (!sourceAsset) return { kind: "blocked", reason: "source_missing" };

  return {
    kind: "ready",
    sourceId,
    targetX: sourceAsset.x,
    targetY: sourceAsset.y,
  };
}

export type DepositingTaskRoute =
  | { kind: "workbench_input" }
  | { kind: "workbench_output" }
  | { kind: "no_cargo" }
  | { kind: "building_supply_target"; targetId: string }
  | { kind: "construction_supply_target"; targetId: string }
  | { kind: "hub_or_global" };

export function decideDepositingTaskRoute(input: {
  currentTaskType: DroneTaskType | null;
  workbenchTaskKind?: WorkbenchTaskNodeId["kind"];
  hasCargo: boolean;
  deliveryTargetId?: string | null;
}): DepositingTaskRoute {
  const { currentTaskType, workbenchTaskKind, hasCargo, deliveryTargetId } = input;

  if (currentTaskType === "workbench_delivery" && workbenchTaskKind === "input") {
    return { kind: "workbench_input" };
  }
  if (currentTaskType === "workbench_delivery") {
    return { kind: "workbench_output" };
  }
  if (!hasCargo) {
    return { kind: "no_cargo" };
  }
  if (currentTaskType === "building_supply" && deliveryTargetId) {
    return { kind: "building_supply_target", targetId: deliveryTargetId };
  }
  if (currentTaskType === "construction_supply" && deliveryTargetId) {
    return { kind: "construction_supply_target", targetId: deliveryTargetId };
  }

  return { kind: "hub_or_global" };
}

export type ReturningToDockWorkbenchUrgentRouteDecision =
  | {
      kind: "blocked";
      reason: "not_workbench_task" | "input_not_ready" | "output_target_missing";
    }
  | {
      kind: "ready";
      routeKind: "input" | "output";
      targetX: number;
      targetY: number;
      targetNodeId?: string;
      deliveryTargetId?: string;
      craftingJobId?: string;
    };

export function decideReturningToDockWorkbenchUrgentRoute(input: {
  currentTaskType: DroneTaskType | null;
  urgentTaskNodeId: string;
  urgentDeliveryTargetId?: string | null;
  crafting: Pick<GameState, "crafting">["crafting"];
  network: Pick<GameState, "network">["network"];
  assets: Record<string, PlacedAsset>;
  workbenchPickupState: Pick<GameState, "assets" | "warehouseInventories" | "serviceHubs" | "network">;
  parseWorkbenchTaskNodeId: (nodeId: string | null | undefined) => WorkbenchTaskNodeId | null;
  getCraftingJobById: (crafting: Pick<GameState, "crafting">["crafting"], jobId: string | null) => CraftingJob | null;
  getCraftingReservationById: (
    network: Pick<GameState, "network">["network"],
    reservationId: string,
  ) => WorkbenchReservation | null;
  resolveWorkbenchInputPickup: (
    state: Pick<GameState, "assets" | "warehouseInventories" | "serviceHubs" | "network">,
    job: CraftingJob,
    reservation: WorkbenchReservation,
  ) => { x: number; y: number; sourceKind: "warehouse" | "hub"; sourceId: string } | null;
}): ReturningToDockWorkbenchUrgentRouteDecision {
  const {
    currentTaskType,
    urgentTaskNodeId,
    urgentDeliveryTargetId,
    crafting,
    network,
    assets,
    workbenchPickupState,
    parseWorkbenchTaskNodeId,
    getCraftingJobById,
    getCraftingReservationById,
    resolveWorkbenchInputPickup,
  } = input;

  if (currentTaskType !== "workbench_delivery") {
    return { kind: "blocked", reason: "not_workbench_task" };
  }

  const workbenchTask = parseWorkbenchTaskNodeId(urgentTaskNodeId);
  if (!workbenchTask) {
    return { kind: "blocked", reason: "not_workbench_task" };
  }

  if (workbenchTask.kind === "input") {
    const job = getCraftingJobById(crafting, workbenchTask.jobId);
    const reservation = getCraftingReservationById(network, workbenchTask.reservationId);
    const pickup = job && reservation
      ? resolveWorkbenchInputPickup(workbenchPickupState, job, reservation)
      : null;
    if (!(job && job.status === "reserved" && reservation && pickup)) {
      return { kind: "blocked", reason: "input_not_ready" };
    }

    return {
      kind: "ready",
      routeKind: "input",
      targetX: pickup.x,
      targetY: pickup.y,
      targetNodeId: urgentTaskNodeId,
      deliveryTargetId: urgentDeliveryTargetId ?? undefined,
      craftingJobId: workbenchTask.jobId,
    };
  }

  const workbenchAsset = assets[workbenchTask.workbenchId];
  if (workbenchAsset?.type !== "workbench") {
    return { kind: "blocked", reason: "output_target_missing" };
  }

  return {
    kind: "ready",
    routeKind: "output",
    targetX: workbenchAsset.x,
    targetY: workbenchAsset.y,
    targetNodeId: urgentTaskNodeId,
    deliveryTargetId: urgentDeliveryTargetId ?? undefined,
    craftingJobId: workbenchTask.jobId,
  };
}
