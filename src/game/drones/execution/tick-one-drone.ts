import type { CraftingJob } from "../../crafting/types";
import type {
  CollectableItemType,
  CollectionNode,
  ConstructionSite,
  DroneCargoItem,
  DroneTaskType,
  GameNotification,
  GameState,
  HubTier,
  Inventory,
  PlacedAsset,
  ServiceHubEntry,
  ServiceHubInventory,
  StarterDroneState,
} from "../../store/types";
import type { createEmptyHubInventory as CreateEmptyHubInventoryFn, finalizeHubTier2Upgrade as FinalizeHubTier2UpgradeFn } from "../../buildings/service-hub/hub-upgrade-workflow";
import type { computeConnectedAssetIds as ComputeConnectedAssetIdsFn } from "../../logistics/connectivity";
import type { getBuildingInputConfig as GetBuildingInputConfigFn } from "../../store/constants/buildings";
import type { decideHubDispatchExecutionAction as DecideHubDispatchExecutionActionFn } from "../../store/workflows/hub-dispatch-execution";
import type { getDroneDockOffset as GetDroneDockOffsetFn } from "../drone-dock-geometry";
import type { droneTravelTicks as DroneTravelTicksFn } from "../drone-movement";
import type { SelectedDroneTask } from "../selection/select-drone-task";
import type {
  FinalizeWorkbenchDeliveryFn,
  FinalizeWorkbenchInputDeliveryFn,
  WorkbenchInputTask,
} from "./workbench-finalizers";

type WorkbenchTaskNodeId =
  | WorkbenchInputTask
  | { kind: "output"; workbenchId: string; jobId: string };

type WorkbenchReservation = {
  id: string;
  itemId: CraftingJob["ingredients"][number]["itemId"];
  amount: number;
};

interface TickOneDroneDebugLog {
  inventory: (message: string) => void;
  building: (message: string) => void;
  mining: (message: string) => void;
}

export interface TickOneDroneDeps {
  applyDroneUpdate: (state: GameState, droneId: string, updated: StarterDroneState) => GameState;
  createEmptyHubInventory: typeof CreateEmptyHubInventoryFn;
  createDefaultProtoHubTargetStock: () => Record<CollectableItemType, number>;
  selectDroneTask: (state: GameState, droneOverride?: StarterDroneState) => SelectedDroneTask | null;
  getDroneHomeDock: (
    drone: StarterDroneState,
    state: Pick<GameState, "assets" | "serviceHubs">,
  ) => { x: number; y: number } | null;
  droneTravelTicks: typeof DroneTravelTicksFn;
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
  finalizeWorkbenchDelivery: FinalizeWorkbenchDeliveryFn;
  moveDroneToward: (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    maxStep: number,
  ) => { x: number; y: number };
  nudgeAwayFromDrones: (
    nextX: number,
    nextY: number,
    toX: number,
    toY: number,
    allDrones: Record<string, StarterDroneState>,
    selfId: string,
  ) => { x: number; y: number };
  getRemainingConstructionNeed: (
    state: Pick<GameState, "drones" | "collectionNodes" | "constructionSites">,
    siteId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getRemainingBuildingInputDemand: (
    state: Pick<GameState, "assets" | "generators" | "drones" | "collectionNodes">,
    assetId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getRemainingHubRestockNeed: (
    state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
    hubId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  commitWorkbenchInputReservation: (
    state: GameState,
    job: CraftingJob,
    reservationId: string,
  ) => {
    nextState: GameState;
    itemType: CollectableItemType;
    amount: number;
    sourceKind: "warehouse" | "hub";
    sourceId: string;
  } | null;
  resolveDroneDropoff: (
    drone: StarterDroneState,
    assets: Record<string, PlacedAsset>,
    serviceHubs?: Record<string, ServiceHubEntry>,
    warehouseInventories?: Record<string, Inventory>,
    crafting?: Pick<GameState, "crafting">["crafting"],
  ) => { x: number; y: number };
  decideHubDispatchExecutionAction: typeof DecideHubDispatchExecutionActionFn;
  getBuildingInputConfig: typeof GetBuildingInputConfigFn;
  addResources: (inv: Inventory, items: Partial<Record<keyof Inventory, number>>) => Inventory;
  computeConnectedAssetIds: typeof ComputeConnectedAssetIdsFn;
  finalizeHubTier2Upgrade: typeof FinalizeHubTier2UpgradeFn;
  makeId: () => string;
  getDroneDockOffset: typeof GetDroneDockOffsetFn;
  addNotification: (notifications: GameNotification[], resource: string, amount: number) => GameNotification[];
  syncDrones: (state: GameState) => GameState;
  getMaxDrones: (tier: HubTier) => number;
  isHubUpgradeDeliverySatisfied: (hub: ServiceHubEntry | undefined | null) => boolean;
  finalizeWorkbenchInputDelivery: FinalizeWorkbenchInputDeliveryFn;
  debugLog: TickOneDroneDebugLog;
  DRONE_SPEED_TILES_PER_TICK: number;
  DRONE_COLLECT_TICKS: number;
  DRONE_DEPOSIT_TICKS: number;
  DRONE_CAPACITY: number;
}

export function tickOneDrone(state: GameState, droneId: string, deps: TickOneDroneDeps): GameState {
  const {
    applyDroneUpdate,
    createEmptyHubInventory,
    createDefaultProtoHubTargetStock,
    selectDroneTask,
    getDroneHomeDock,
    droneTravelTicks,
    parseWorkbenchTaskNodeId,
    getCraftingJobById,
    getCraftingReservationById,
    resolveWorkbenchInputPickup,
    finalizeWorkbenchDelivery,
    moveDroneToward,
    nudgeAwayFromDrones,
    getRemainingConstructionNeed,
    getRemainingBuildingInputDemand,
    getRemainingHubRestockNeed,
    commitWorkbenchInputReservation,
    resolveDroneDropoff,
    decideHubDispatchExecutionAction,
    getBuildingInputConfig,
    addResources,
    computeConnectedAssetIds,
    finalizeHubTier2Upgrade,
    makeId,
    getDroneDockOffset,
    addNotification,
    syncDrones,
    getMaxDrones,
    isHubUpgradeDeliverySatisfied,
    finalizeWorkbenchInputDelivery,
    debugLog,
    DRONE_SPEED_TILES_PER_TICK,
    DRONE_COLLECT_TICKS,
    DRONE_DEPOSIT_TICKS,
    DRONE_CAPACITY,
  } = deps;

  const drone = state.drones[droneId];
  if (!drone) return state;

  switch (drone.status) {
    case "idle": {
      // Self-heal: if hubId points to a valid hub asset but serviceHubs entry is missing, recreate it
      let currentState = state;
      if (drone.hubId && !state.serviceHubs[drone.hubId] && state.assets[drone.hubId]?.type === "service_hub") {
        debugLog.inventory(`[Drone] Self-healed missing hub entry for ${drone.hubId}`);
        currentState = {
          ...state,
          serviceHubs: { ...state.serviceHubs, [drone.hubId]: { inventory: createEmptyHubInventory(), targetStock: createDefaultProtoHubTargetStock(), tier: 1, droneIds: [drone.droneId] } },
        };
      }
      const task = selectDroneTask(currentState, drone);
      if (!task) {
        // No work to do — return to homeHub dock if not already there
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
      // from inventory. No collectionNode involvement — navigate to source asset position.
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
      if (task.taskType === "building_supply" && (task.nodeId.startsWith("hub:") || task.nodeId.startsWith("wh:"))) {
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

        const workbenchAsset = currentState.assets[workbenchTask.workbenchId];
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
          return finalizeWorkbenchDelivery(currentState, droneId, workbenchTask.jobId ?? null, idleDrone);
        }
        debugLog.inventory(`[Drone] workbench_delivery: flying to workbench ${workbenchTask.workbenchId} for job ${workbenchTask.jobId}`);
        return applyDroneUpdate(currentState, droneId, {
          ...drone,
          status: "moving_to_collect",
          targetNodeId: task.nodeId,
          currentTaskType: "workbench_delivery",
          deliveryTargetId: task.deliveryTargetId || null,
          craftingJobId: workbenchTask.jobId ?? null,
          ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, workbenchAsset.x, workbenchAsset.y),
        });
      }

      const node = currentState.collectionNodes[task.nodeId];
      if (!node) return currentState;

      // Claim the node so no other drone selects it while this one is en route
      const claimedNode: CollectionNode = { ...node, reservedByDroneId: drone.droneId };
      return applyDroneUpdate(
        { ...currentState, collectionNodes: { ...currentState.collectionNodes, [task.nodeId]: claimedNode } },
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

    case "moving_to_collect": {
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
        const [, sourceId] = drone.targetNodeId.split(":");
        const sourceAsset = state.assets[sourceId];
        if (!sourceAsset) {
          // Source removed mid-flight — abort
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        if (rem > 0) {
          const { x: nextX, y: nextY } = moveDroneToward(drone.tileX, drone.tileY, sourceAsset.x, sourceAsset.y, DRONE_SPEED_TILES_PER_TICK);
          const { x: sepX, y: sepY } = nudgeAwayFromDrones(nextX, nextY, sourceAsset.x, sourceAsset.y, state.drones, drone.droneId);
          return applyDroneUpdate(state, droneId, { ...drone, tileX: sepX, tileY: sepY, ticksRemaining: rem });
        }
        // Arrived at source — snap and start collecting
        return applyDroneUpdate(state, droneId, {
          ...drone,
          tileX: sourceAsset.x,
          tileY: sourceAsset.y,
          status: "collecting",
          ticksRemaining: DRONE_COLLECT_TICKS,
        });
      }

      // building_supply with hub or warehouse source: same flight pattern
      if (drone.currentTaskType === "building_supply" && (drone.targetNodeId?.startsWith("hub:") || drone.targetNodeId?.startsWith("wh:"))) {
        const [, sourceId] = drone.targetNodeId.split(":");
        const sourceAsset = state.assets[sourceId];
        if (!sourceAsset) {
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        if (rem > 0) {
          const { x: nextX, y: nextY } = moveDroneToward(drone.tileX, drone.tileY, sourceAsset.x, sourceAsset.y, DRONE_SPEED_TILES_PER_TICK);
          const { x: sepX, y: sepY } = nudgeAwayFromDrones(nextX, nextY, sourceAsset.x, sourceAsset.y, state.drones, drone.droneId);
          return applyDroneUpdate(state, droneId, { ...drone, tileX: sepX, tileY: sepY, ticksRemaining: rem });
        }
        return applyDroneUpdate(state, droneId, {
          ...drone,
          tileX: sourceAsset.x,
          tileY: sourceAsset.y,
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
        // Node gone — release claim, go idle
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

    case "collecting": {
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
        if (!inv) {
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        const itemType = resource as CollectableItemType;
        const available = (inv as unknown as Record<string, number>)[itemType] ?? 0;
        if (available <= 0) {
          debugLog.inventory(`[Drone] hub_dispatch: warehouse ${whId} has no ${itemType} on arrival — aborting (will reselect; hub fallback may apply)`);
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        const remainingNeed = drone.deliveryTargetId
          ? getRemainingConstructionNeed(state, drone.deliveryTargetId, itemType, drone.droneId)
          : 0;
        if (remainingNeed <= 0) {
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        const pickup = Math.min(DRONE_CAPACITY, available, remainingNeed);
        const updatedWhInv: Inventory = { ...inv, [itemType]: available - pickup };
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
        if (!inv) {
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        const itemType = resource as CollectableItemType;
        const available = (inv as unknown as Record<string, number>)[itemType] ?? 0;
        if (available <= 0) {
          debugLog.inventory(`[Drone] building_supply: warehouse ${whId} has no ${itemType} on arrival — aborting (will reselect; hub fallback may apply)`);
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        const remainingNeed = drone.deliveryTargetId
          ? getRemainingBuildingInputDemand(state, drone.deliveryTargetId, itemType, drone.droneId)
          : 0;
        if (remainingNeed <= 0) {
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        const pickup = Math.min(DRONE_CAPACITY, available, remainingNeed);
        const updatedWhInv: Inventory = { ...inv, [itemType]: available - pickup };
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
        if (!hubEntry) {
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        const itemType = resource as CollectableItemType;
        const available = hubEntry.inventory[itemType] ?? 0;
        if (available <= 0) {
          debugLog.inventory(`[Drone] building_supply: hub ${hubId} has no ${itemType} on arrival — aborting`);
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        const remainingNeed = drone.deliveryTargetId
          ? getRemainingBuildingInputDemand(state, drone.deliveryTargetId, itemType, drone.droneId)
          : 0;
        if (remainingNeed <= 0) {
          return applyDroneUpdate(state, droneId, { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
        }
        const pickup = Math.min(DRONE_CAPACITY, available, remainingNeed);
        const updatedHubInv: ServiceHubInventory = { ...hubEntry.inventory, [itemType]: available - pickup };
        // Clear targetNodeId so the inbound calc switches from hub-bound to cargo-bound counting.
        const droneAfterPickup: StarterDroneState = { ...drone, targetNodeId: null, cargo: { itemType, amount: pickup } };
        const dropoff = resolveDroneDropoff(droneAfterPickup, state.assets, state.serviceHubs, state.warehouseInventories, state.crafting);
        debugLog.inventory(`[Drone] building_supply: collected ${pickup}× ${itemType} from hub ${hubId} → delivering to building ${drone.deliveryTargetId} at (${dropoff.x},${dropoff.y})`);
        return applyDroneUpdate(
          { ...state, serviceHubs: { ...state.serviceHubs, [hubId]: { ...hubEntry, inventory: updatedHubInv } } },
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
      let pickup = Math.min(DRONE_CAPACITY, node.amount);
      if (drone.currentTaskType === "hub_restock" && drone.hubId) {
        const remainingNeed = getRemainingHubRestockNeed(state, drone.hubId, node.itemType, drone.droneId);
        if (remainingNeed <= 0) {
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
        pickup = Math.min(pickup, remainingNeed);
      } else if (drone.currentTaskType === "construction_supply" && drone.deliveryTargetId) {
        const remainingNeed = getRemainingConstructionNeed(state, drone.deliveryTargetId, node.itemType, drone.droneId);
        if (remainingNeed <= 0) {
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
        pickup = Math.min(pickup, remainingNeed);
      } else if (drone.currentTaskType === "building_supply" && drone.deliveryTargetId) {
        const remainingNeed = getRemainingBuildingInputDemand(state, drone.deliveryTargetId, node.itemType, drone.droneId);
        if (remainingNeed <= 0) {
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
        pickup = Math.min(pickup, remainingNeed);
      }
      const remaining = node.amount - pickup;
      // Build updated nodes: remove if empty, otherwise keep with reservation cleared
      const newNodes: Record<string, CollectionNode> =
        remaining <= 0
          ? Object.fromEntries(Object.entries(state.collectionNodes).filter(([k]) => k !== node.id))
          : { ...state.collectionNodes, [node.id]: { ...node, amount: remaining, reservedByDroneId: null } };
      debugLog.mining(`Drone collected ${pickup}× ${node.itemType} from node ${node.id}`);

      // Resolve dropoff position — task-type-aware, never silently defaults to trader
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

    case "moving_to_dropoff": {
      const rem = drone.ticksRemaining - 1;
      // Resolve dropoff position — task-type-aware, consistent with collecting transition
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

    case "depositing": {
      const rem = drone.ticksRemaining - 1;
      if (rem > 0) return applyDroneUpdate(state, droneId, { ...drone, ticksRemaining: rem });
      const idleDrone: StarterDroneState = { ...drone, status: "idle", targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null };
      const workbenchTask = parseWorkbenchTaskNodeId(drone.targetNodeId);
      if (drone.currentTaskType === "workbench_delivery" && workbenchTask?.kind === "input") {
        return finalizeWorkbenchInputDelivery(state, droneId, workbenchTask, idleDrone);
      }
      if (drone.currentTaskType === "workbench_delivery") {
        return finalizeWorkbenchDelivery(state, droneId, drone.craftingJobId, idleDrone);
      }
      if (!drone.cargo) {
        return applyDroneUpdate(state, droneId, { ...drone, status: "idle", ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null });
      }
      const { itemType, amount } = drone.cargo;

      // Route by task type
      if (drone.currentTaskType === "building_supply" && drone.deliveryTargetId) {
        const deliveryId = drone.deliveryTargetId;
        const targetAsset = state.assets[deliveryId];
        const cfg = targetAsset ? getBuildingInputConfig(targetAsset.type) : null;
        if (targetAsset && cfg && cfg.resource === itemType && targetAsset.type === "generator") {
          const gen = state.generators[deliveryId];
          if (gen) {
            const space = Math.max(0, cfg.capacity - gen.fuel);
            const applied = Math.min(amount, space);
            const leftover = amount - applied;
            const nextRequested = Math.max(0, (gen.requestedRefill ?? 0) - applied);
            const newGenerators = { ...state.generators, [deliveryId]: { ...gen, fuel: gen.fuel + applied, requestedRefill: nextRequested } };
            const newInv = leftover > 0 ? addResources(state.inventory, { [itemType]: leftover }) : state.inventory;
            debugLog.inventory(
              `Drone deposited ${applied}× ${itemType} into generator ${deliveryId} (fuel ${gen.fuel} → ${gen.fuel + applied}/${cfg.capacity})` +
                (leftover > 0 ? ` (${leftover} overflow → global)` : ""),
            );
            return applyDroneUpdate(
              { ...state, generators: newGenerators, inventory: newInv },
              droneId,
              idleDrone,
            );
          }
        }
        // Building gone or no input slot — fall back to global pool
        debugLog.inventory(`[Drone] building_supply target ${deliveryId} gone or invalid; depositing ${amount}× ${itemType} → global`);
        return applyDroneUpdate(
          { ...state, inventory: addResources(state.inventory, { [itemType]: amount }) },
          droneId,
          idleDrone,
        );
      }

      if (drone.currentTaskType === "construction_supply" && drone.deliveryTargetId) {
        const deliveryId = drone.deliveryTargetId;
        const site = state.constructionSites[deliveryId];
        if (site) {
          const needed = site.remaining[itemType] ?? 0;
          const applied = Math.min(amount, needed);
          const leftover = amount - applied;
          const newRemaining = { ...site.remaining };
          const newNeeded = needed - applied;
          if (newNeeded <= 0) {
            delete newRemaining[itemType];
          } else {
            newRemaining[itemType] = newNeeded;
          }
          // Check if construction is complete
          const isComplete = Object.values(newRemaining).every((v) => (v ?? 0) <= 0);
          const isHubUpgradeSite =
            site.buildingType === "service_hub" &&
            !!state.serviceHubs[deliveryId]?.pendingUpgrade;
          let newSites: Record<string, ConstructionSite>;
          if (isComplete) {
            const { [deliveryId]: _, ...rest } = state.constructionSites;
            newSites = rest;
            debugLog.building(`[Drone] Construction site ${deliveryId} completed`);
          } else {
            newSites = { ...state.constructionSites, [deliveryId]: { ...site, remaining: newRemaining } };
          }
          // Any leftover goes to global inventory
          const newInv = leftover > 0 ? addResources(state.inventory, { [itemType]: leftover }) : state.inventory;
          debugLog.inventory(`Drone deposited ${applied}× ${itemType} into construction site ${deliveryId}` + (leftover > 0 ? ` (${leftover} overflow → global)` : ""));
          if (import.meta.env.DEV && isHubUpgradeSite) {
            const remainingAfter = newRemaining[itemType] ?? 0;
            debugLog.building(
              `[HubUpgrade] Delivery applied to ${deliveryId}: ${applied}× ${itemType}, remaining ${itemType}=${remainingAfter}`,
            );
          }
          let completionState = applyDroneUpdate(
            { ...state, constructionSites: newSites, inventory: newInv },
            droneId,
            idleDrone,
          );
          // Recompute energy grid when a construction finishes (cables/poles/generators may now conduct)
          if (isComplete) {
            completionState = { ...completionState, connectedAssetIds: computeConnectedAssetIds(completionState) };
            const completedAsset = completionState.assets[deliveryId];
            if (completedAsset?.type === "service_hub") {
              const hubEntry = completionState.serviceHubs[deliveryId];
              if (hubEntry?.pendingUpgrade) {
                if (import.meta.env.DEV) {
                  debugLog.building(
                    `[HubUpgrade] Upgrade demand for ${deliveryId} fully delivered via construction flow — finalizing tier upgrade.`,
                  );
                }
                completionState = finalizeHubTier2Upgrade(
                  completionState,
                  deliveryId,
                  {
                    makeId,
                    getDroneDockOffset,
                    addNotification,
                    syncDrones,
                  },
                  {
                    deductPendingFromHubInventory: false,
                  },
                );
              } else if (hubEntry && hubEntry.droneIds.length < getMaxDrones(hubEntry.tier)) {
                // New Proto-Hub construction: spawn its first drone after completion.
                const newDroneId = `drone-${makeId()}`;
                const dockSlot = hubEntry.droneIds.length;
                const offset = getDroneDockOffset(dockSlot);
                const spawnedDrone: StarterDroneState = {
                  status: "idle",
                  tileX: completedAsset.x + offset.dx,
                  tileY: completedAsset.y + offset.dy,
                  targetNodeId: null,
                  cargo: null,
                  ticksRemaining: 0,
                  hubId: deliveryId,
                  currentTaskType: null,
                  deliveryTargetId: null,
                  craftingJobId: null,
                  droneId: newDroneId,
                };
                completionState = {
                  ...completionState,
                  drones: { ...completionState.drones, [newDroneId]: spawnedDrone },
                  serviceHubs: {
                    ...completionState.serviceHubs,
                    [deliveryId]: { ...hubEntry, droneIds: [...hubEntry.droneIds, newDroneId] },
                  },
                };
                debugLog.building(`[Drone] Drohne ${newDroneId} für neuen Hub ${deliveryId} gespawnt nach Bauabschluss.`);
              }
            }
          }
          return completionState;
        }
        // Site gone — deposit to global
        debugLog.inventory(`Drone construction target gone, depositing ${amount}× ${itemType} into global inventory`);
        return applyDroneUpdate(
          { ...state, inventory: addResources(state.inventory, { [itemType]: amount }) },
          droneId,
          idleDrone,
        );
      }

      // hub_restock: deposit into hub inventory when assigned
      let hubEntry = drone.hubId ? state.serviceHubs[drone.hubId] ?? null : null;
      let depositState = state;
      // Self-heal: hub asset exists but serviceHubs entry is missing
      if (!hubEntry && drone.hubId && state.assets[drone.hubId]?.type === "service_hub") {
        debugLog.inventory(`[Drone] Hub entry missing for ${drone.hubId} during deposit — self-healing`);
        hubEntry = { inventory: createEmptyHubInventory(), targetStock: createDefaultProtoHubTargetStock(), tier: 1, droneIds: [drone.droneId] };
        depositState = { ...state, serviceHubs: { ...state.serviceHubs, [drone.hubId]: hubEntry } };
      }
      if (hubEntry && drone.hubId) {
        const updatedHubInv: ServiceHubInventory = {
          ...hubEntry.inventory,
          [itemType]: (hubEntry.inventory[itemType] ?? 0) + amount,
        };
        debugLog.inventory(`Drone deposited ${amount}× ${itemType} into Service-Hub`);
        const afterDeposit: GameState = {
          ...depositState,
          serviceHubs: { ...depositState.serviceHubs, [drone.hubId]: { ...hubEntry, inventory: updatedHubInv } },
        };
        // Finalize a pending tier-2 upgrade once the hub holds the full cost.
        const updatedHubEntry = afterDeposit.serviceHubs[drone.hubId];
        const finalized = isHubUpgradeDeliverySatisfied(updatedHubEntry)
          ? finalizeHubTier2Upgrade(afterDeposit, drone.hubId, {
              makeId,
              getDroneDockOffset,
              addNotification,
              syncDrones,
            })
          : afterDeposit;
        return applyDroneUpdate(finalized, droneId, idleDrone);
      }
      // Fallback: global inventory
      debugLog.inventory(`Drone deposited ${amount}× ${itemType} into Startmodul`);
      // DEV: warn if a workbench job could be waiting on these resources
      if (import.meta.env.DEV) {
        const waitingJob = (state.crafting?.jobs ?? []).find(
          (j) =>
            (j.status === "queued" || j.status === "reserved") &&
            j.ingredients.some((ing) => ing.itemId === itemType),
        );
        if (waitingJob) {
          debugLog.inventory(
            `[Drone] Drohne ${drone.droneId}: delivering ${amount}× ${itemType} for Job ${waitingJob.id} (${waitingJob.status}) → global pool`,
          );
        }
      }
      return applyDroneUpdate(
        { ...state, inventory: addResources(state.inventory, { [itemType]: amount }) },
        droneId,
        idleDrone,
      );
    }

    case "returning_to_dock": {
      const dock = getDroneHomeDock(drone, state);
      if (!dock) {
        // homeHub gone — reset to idle in place
        return applyDroneUpdate(state, droneId, { ...drone, status: "idle", ticksRemaining: 0 });
      }

      // If a task appears while returning, abort the return and take it immediately
      const urgentTask = selectDroneTask(state, drone);
      if (urgentTask) {
        if (urgentTask.taskType === "workbench_delivery") {
          const workbenchTask = parseWorkbenchTaskNodeId(urgentTask.nodeId);
          if (workbenchTask?.kind === "input") {
            const job = getCraftingJobById(state.crafting, workbenchTask.jobId);
            const reservation = getCraftingReservationById(state.network, workbenchTask.reservationId);
            const pickup = job && reservation ? resolveWorkbenchInputPickup(state, job, reservation) : null;
            if (job && job.status === "reserved" && reservation && pickup) {
              return applyDroneUpdate(state, droneId, {
                ...drone,
                status: "moving_to_collect",
                targetNodeId: urgentTask.nodeId,
                currentTaskType: "workbench_delivery",
                deliveryTargetId: urgentTask.deliveryTargetId || null,
                craftingJobId: workbenchTask.jobId,
                ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, pickup.x, pickup.y),
              });
            }
          }
          const workbenchAsset = workbenchTask ? state.assets[workbenchTask.workbenchId] : null;
          if (workbenchTask?.kind === "output" && workbenchAsset?.type === "workbench") {
            return applyDroneUpdate(state, droneId, {
              ...drone,
              status: "moving_to_collect",
              targetNodeId: urgentTask.nodeId,
              currentTaskType: "workbench_delivery",
              deliveryTargetId: urgentTask.deliveryTargetId || null,
              craftingJobId: workbenchTask.jobId ?? null,
              ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, workbenchAsset.x, workbenchAsset.y),
            });
          }
        }
        const urgentNode = state.collectionNodes[urgentTask.nodeId];
        if (urgentNode) {
          const claimedNode: CollectionNode = { ...urgentNode, reservedByDroneId: drone.droneId };
          return applyDroneUpdate(
            { ...state, collectionNodes: { ...state.collectionNodes, [urgentTask.nodeId]: claimedNode } },
            droneId,
            {
              ...drone,
              status: "moving_to_collect",
              targetNodeId: urgentTask.nodeId,
              currentTaskType: urgentTask.taskType,
              deliveryTargetId: urgentTask.deliveryTargetId || null,
              craftingJobId: null,
              ticksRemaining: droneTravelTicks(drone.tileX, drone.tileY, urgentNode.tileX, urgentNode.tileY),
            },
          );
        }
      }

      const rem = drone.ticksRemaining - 1;
      if (rem > 0) {
        const { x: nextX, y: nextY } = moveDroneToward(drone.tileX, drone.tileY, dock.x, dock.y, DRONE_SPEED_TILES_PER_TICK);
        const { x: sepX, y: sepY } = nudgeAwayFromDrones(nextX, nextY, dock.x, dock.y, state.drones, drone.droneId);
        return applyDroneUpdate(state, droneId, { ...drone, tileX: sepX, tileY: sepY, ticksRemaining: rem });
      }
      // Arrived at dock — snap and go idle
      debugLog.inventory(`[Drone] Returned to dock (${dock.x},${dock.y})`);
      return applyDroneUpdate(state, droneId, { ...drone, tileX: dock.x, tileY: dock.y, status: "idle", ticksRemaining: 0 });
    }

    default:
      return state;
  }
}



