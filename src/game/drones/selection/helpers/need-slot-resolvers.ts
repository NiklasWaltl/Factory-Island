import type { CraftingJob } from "../../../crafting/types";
import { getBuildingInputConfig } from "../../../store/constants/buildings";
import {
  MAX_DRONES_PER_BUILDING_SUPPLY,
  MAX_DRONES_PER_CONSTRUCTION_TARGET,
  MAX_DRONES_PER_HUB_RESTOCK_RESOURCE,
} from "../../../store/constants/drone-assignment-caps";
import { DRONE_CAPACITY } from "../../../store/constants/drone-config";
import type {
  CollectableItemType,
  ConstructionSite,
  GameState,
  StarterDroneState,
} from "../../../store/types";

export interface NeedSlotResolverDeps {
  getOpenConstructionDroneSlots: (
    state: Pick<GameState, "drones" | "constructionSites">,
    siteId: string,
    excludeDroneId?: string,
  ) => number;
  getAssignedConstructionDroneCount: (
    state: Pick<GameState, "drones">,
    siteId: string,
    excludeDroneId?: string,
  ) => number;
  getRemainingConstructionNeed: (
    state: Pick<GameState, "drones" | "collectionNodes" | "constructionSites">,
    siteId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getRemainingHubRestockNeed: (
    state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
    hubId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getOpenHubRestockDroneSlots: (
    state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
    hubId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getRemainingBuildingInputDemand: (
    state: Pick<GameState, "assets" | "generators" | "drones" | "collectionNodes">,
    assetId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getOpenBuildingSupplyDroneSlots: (
    state: Pick<GameState, "assets" | "generators" | "drones">,
    assetId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getAssignedBuildingSupplyDroneCount: (
    state: Pick<GameState, "drones">,
    assetId: string,
    excludeDroneId?: string,
  ) => number;
  getWorkbenchJobInputAmount: (
    job: CraftingJob,
    itemId: CraftingJob["ingredients"][number]["itemId"],
  ) => number;
  getAssignedWorkbenchInputDroneCount: (
    state: Pick<GameState, "drones">,
    reservationId: string,
    excludeDroneId?: string,
  ) => number;
  getAssignedWorkbenchDeliveryDroneCount: (
    state: Pick<GameState, "drones">,
    jobId: string,
    excludeDroneId?: string,
  ) => number;
}

function hasHubUpgradeConstructionSite(
  state: Pick<GameState, "constructionSites">,
  hubId: string,
): boolean {
  const site = state.constructionSites[hubId];
  return !!site && site.buildingType === "service_hub";
}

function getBuildingInputCurrent(
  state: Pick<GameState, "assets" | "generators">,
  assetId: string,
): number {
  const asset = state.assets[assetId];
  if (!asset) return 0;
  if (asset.type === "generator") return state.generators[assetId]?.fuel ?? 0;
  return 0;
}

type WorkbenchTaskNodeId =
  | { kind: "input"; workbenchId: string; jobId: string; reservationId: string }
  | { kind: "output"; workbenchId: string; jobId: string };

function parseWorkbenchTaskNodeId(nodeId: string | null | undefined): WorkbenchTaskNodeId | null {
  if (!nodeId) return null;

  if (nodeId.startsWith("workbench_input:")) {
    const [, workbenchId, jobId, reservationId] = nodeId.split(":");
    if (!workbenchId || !jobId || !reservationId) return null;
    return { kind: "input", workbenchId, jobId, reservationId };
  }

  if (nodeId.startsWith("workbench:")) {
    const [, workbenchId, jobId] = nodeId.split(":");
    if (!workbenchId || !jobId) return null;
    return { kind: "output", workbenchId, jobId };
  }

  return null;
}

export function getInboundHubRestockAmount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.hubId !== hubId) continue;
    if (drone.currentTaskType !== "hub_restock") continue;

    if (drone.cargo?.itemType === itemType) {
      total += drone.cargo.amount;
      continue;
    }

    if ((drone.status === "moving_to_collect" || drone.status === "collecting") && drone.targetNodeId) {
      const node = state.collectionNodes[drone.targetNodeId];
      if (node?.itemType === itemType && node.reservedByDroneId === drone.droneId) {
        total += Math.min(DRONE_CAPACITY, node.amount);
      }
    }
  }
  return total;
}

export function getInboundHubRestockDroneCount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.hubId !== hubId) continue;
    if (drone.currentTaskType !== "hub_restock") continue;

    if (drone.cargo?.itemType === itemType) {
      total++;
      continue;
    }

    if ((drone.status === "moving_to_collect" || drone.status === "collecting") && drone.targetNodeId) {
      const node = state.collectionNodes[drone.targetNodeId];
      if (node?.itemType === itemType && node.reservedByDroneId === drone.droneId) {
        total++;
      }
    }
  }
  return total;
}

export function getRemainingHubRestockNeed(
  state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  const hubEntry = state.serviceHubs[hubId];
  if (!hubEntry) return 0;
  const current = hubEntry.inventory[itemType] ?? 0;
  const target = hubEntry.targetStock[itemType] ?? 0;
  const upgradeNeed = hasHubUpgradeConstructionSite(state, hubId)
    ? 0
    : (hubEntry.pendingUpgrade?.[itemType] ?? 0);
  const effectiveTarget = target + upgradeNeed;
  const inbound = getInboundHubRestockAmount(state, hubId, itemType, excludeDroneId);
  return Math.max(0, effectiveTarget - current - inbound);
}

export function getOpenHubRestockDroneSlots(
  state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  const hubEntry = state.serviceHubs[hubId];
  if (!hubEntry) return 0;
  const current = hubEntry.inventory[itemType] ?? 0;
  const target = hubEntry.targetStock[itemType] ?? 0;
  const upgradeNeed = hasHubUpgradeConstructionSite(state, hubId)
    ? 0
    : (hubEntry.pendingUpgrade?.[itemType] ?? 0);
  const rawNeed = Math.max(0, target + upgradeNeed - current);
  const desiredDrones = Math.min(MAX_DRONES_PER_HUB_RESTOCK_RESOURCE, Math.ceil(rawNeed / DRONE_CAPACITY));
  const assignedDrones = getInboundHubRestockDroneCount(state, hubId, itemType, excludeDroneId);
  return Math.max(0, desiredDrones - assignedDrones);
}

export function getInboundHubDispatchAmount(
  state: Pick<GameState, "drones">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.currentTaskType !== "hub_dispatch") continue;
    if (!drone.targetNodeId?.startsWith(`hub:${hubId}:`)) continue;
    const [, , resource] = drone.targetNodeId.split(":");
    if (resource !== itemType) continue;
    total += DRONE_CAPACITY;
  }
  return total;
}

export function getInboundWarehouseDispatchAmount(
  state: Pick<GameState, "drones">,
  warehouseId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  let total = 0;
  const prefix = `wh:${warehouseId}:`;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.currentTaskType !== "hub_dispatch" && drone.currentTaskType !== "building_supply") continue;
    if (!drone.targetNodeId?.startsWith(prefix)) continue;
    const [, , resource] = drone.targetNodeId.split(":");
    if (resource !== itemType) continue;
    total += DRONE_CAPACITY;
  }
  return total;
}

export function getInboundConstructionAmount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  siteId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.deliveryTargetId !== siteId) continue;

    if (drone.currentTaskType === "hub_dispatch" && (drone.targetNodeId?.startsWith("hub:") || drone.targetNodeId?.startsWith("wh:"))) {
      const [, , resource] = drone.targetNodeId.split(":");
      if (resource === itemType) total += DRONE_CAPACITY;
      continue;
    }

    if (drone.currentTaskType !== "construction_supply") continue;

    if (drone.cargo?.itemType === itemType) {
      total += drone.cargo.amount;
      continue;
    }

    if ((drone.status === "moving_to_collect" || drone.status === "collecting") && drone.targetNodeId) {
      const node = state.collectionNodes[drone.targetNodeId];
      if (node?.itemType === itemType && node.reservedByDroneId === drone.droneId) {
        total += Math.min(DRONE_CAPACITY, node.amount);
      }
    }
  }
  return total;
}

export function getAssignedConstructionDroneCount(
  state: Pick<GameState, "drones">,
  siteId: string,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.deliveryTargetId !== siteId) continue;
    if (drone.currentTaskType === "construction_supply" || drone.currentTaskType === "hub_dispatch") {
      total++;
    }
  }
  return total;
}

function getDesiredConstructionDroneCount(site: ConstructionSite): number {
  let desired = 0;
  for (const amount of Object.values(site.remaining)) {
    if ((amount ?? 0) <= 0) continue;
    desired += Math.ceil((amount ?? 0) / DRONE_CAPACITY);
  }
  return Math.min(MAX_DRONES_PER_CONSTRUCTION_TARGET, desired);
}

export function getRemainingConstructionNeed(
  state: Pick<GameState, "drones" | "collectionNodes" | "constructionSites">,
  siteId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  const site = state.constructionSites[siteId];
  if (!site) return 0;
  const remaining = site.remaining[itemType] ?? 0;
  const inbound = getInboundConstructionAmount(state, siteId, itemType, excludeDroneId);
  return Math.max(0, remaining - inbound);
}

export function getOpenConstructionDroneSlots(
  state: Pick<GameState, "drones" | "constructionSites">,
  siteId: string,
  excludeDroneId?: string,
): number {
  const site = state.constructionSites[siteId];
  if (!site) return 0;
  const desired = getDesiredConstructionDroneCount(site);
  const assigned = getAssignedConstructionDroneCount(state, siteId, excludeDroneId);
  return Math.max(0, desired - assigned);
}

export function getInboundBuildingSupplyAmount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  assetId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.deliveryTargetId !== assetId) continue;
    if (drone.currentTaskType !== "building_supply") continue;

    if (drone.cargo?.itemType === itemType) {
      total += drone.cargo.amount;
      continue;
    }
    if (drone.targetNodeId?.startsWith("hub:") || drone.targetNodeId?.startsWith("wh:")) {
      const [, , resource] = drone.targetNodeId.split(":");
      if (resource === itemType) total += DRONE_CAPACITY;
      continue;
    }
    if ((drone.status === "moving_to_collect" || drone.status === "collecting") && drone.targetNodeId) {
      const node = state.collectionNodes[drone.targetNodeId];
      if (node?.itemType === itemType && node.reservedByDroneId === drone.droneId) {
        total += Math.min(DRONE_CAPACITY, node.amount);
      }
    }
  }
  return total;
}

export function getInboundHubBuildingSupplyAmount(
  state: Pick<GameState, "drones">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.currentTaskType !== "building_supply") continue;
    if (!drone.targetNodeId?.startsWith(`hub:${hubId}:`)) continue;
    const [, , resource] = drone.targetNodeId.split(":");
    if (resource !== itemType) continue;
    total += DRONE_CAPACITY;
  }
  return total;
}

export function getRemainingBuildingInputDemand(
  state: Pick<GameState, "assets" | "generators" | "drones" | "collectionNodes">,
  assetId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  const asset = state.assets[assetId];
  if (!asset) return 0;
  const cfg = getBuildingInputConfig(asset.type);
  if (!cfg || cfg.resource !== itemType) return 0;
  const current = getBuildingInputCurrent(state, assetId);
  const inbound = getInboundBuildingSupplyAmount(state, assetId, itemType, excludeDroneId);
  let raw = Math.max(0, cfg.capacity - current - inbound);
  if (asset.type === "generator") {
    const requested = state.generators[assetId]?.requestedRefill ?? 0;
    const requestedRemaining = Math.max(0, requested - inbound);
    raw = Math.min(raw, requestedRemaining);
  }
  return raw;
}

export function getAssignedBuildingSupplyDroneCount(
  state: Pick<GameState, "drones">,
  assetId: string,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.deliveryTargetId !== assetId) continue;
    if (drone.currentTaskType === "building_supply") total++;
  }
  return total;
}

export function getOpenBuildingSupplyDroneSlots(
  state: Pick<GameState, "assets" | "generators" | "drones">,
  assetId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  const asset = state.assets[assetId];
  if (!asset) return 0;
  const cfg = getBuildingInputConfig(asset.type);
  if (!cfg || cfg.resource !== itemType) return 0;
  const current = getBuildingInputCurrent(state, assetId);
  let rawNeed = Math.max(0, cfg.capacity - current);
  if (asset.type === "generator") {
    const requested = state.generators[assetId]?.requestedRefill ?? 0;
    rawNeed = Math.min(rawNeed, requested);
  }
  const desiredDrones = Math.min(MAX_DRONES_PER_BUILDING_SUPPLY, Math.ceil(rawNeed / DRONE_CAPACITY));
  const assigned = getAssignedBuildingSupplyDroneCount(state, assetId, excludeDroneId);
  return Math.max(0, desiredDrones - assigned);
}

export function getAssignedWorkbenchDeliveryDroneCount(
  state: Pick<GameState, "drones">,
  jobId: string,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.currentTaskType !== "workbench_delivery") continue;
    if (drone.craftingJobId !== jobId) continue;
    total++;
  }
  return total;
}

export function getAssignedWorkbenchInputDroneCount(
  state: Pick<GameState, "drones">,
  reservationId: string,
  excludeDroneId?: string,
): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.droneId === excludeDroneId) continue;
    if (drone.currentTaskType !== "workbench_delivery") continue;
    const task = parseWorkbenchTaskNodeId(drone.targetNodeId);
    if (task?.kind !== "input") continue;
    if (task.reservationId !== reservationId) continue;
    total++;
  }
  return total;
}

export function getWorkbenchJobInputAmount(
  job: CraftingJob,
  itemId: CraftingJob["ingredients"][number]["itemId"],
): number {
  return (job.inputBuffer ?? []).reduce(
    (sum, stack) => sum + (stack.itemId === itemId ? stack.count : 0),
    0,
  );
}
