import type { GameAction } from "../../reducer";
import type {
  BuildingType,
  CollectableItemType,
  DroneStatus,
  DroneTaskType,
  GameState,
  Inventory,
  PlacedAsset,
  UIPanel,
} from "../../types";
import { BUILDING_COSTS } from "../../constants/buildings";
import { ASSET_LABELS } from "../../constants/assets";
import { cellKey } from "../../cell-key";
import { addResources } from "../../inventory-ops";
import { removeAsset } from "../../asset-mutation";
import { reassignBuildingSourceIds } from "../../../buildings/warehouse/warehouse-assignment";
import { computeConnectedAssetIds } from "../../../logistics/connectivity";
import {
  type BuildingPlacementIoDeps,
  logPlacementInvariantWarnings,
} from "./shared";

type RemoveAssetEligibilityDecision =
  | {
    kind: "eligible";
    targetAsset: PlacedAsset;
    buildingType: BuildingType;
  }
  | {
    kind: "blocked";
    blockReason:
      | "remove_tool_inactive"
      | "asset_missing"
      | "type_not_removable"
      | "fixed_asset";
  };

function decideRemoveAssetEligibility(input: {
  buildMode: boolean;
  activeHotbarToolKind: string | null | undefined;
  assets: Record<string, PlacedAsset>;
  assetId: string;
  removableTypes: ReadonlySet<string>;
}): RemoveAssetEligibilityDecision {
  const {
    buildMode,
    activeHotbarToolKind,
    assets,
    assetId,
    removableTypes,
  } = input;

  const removeToolActive = buildMode || activeHotbarToolKind === "building";
  if (!removeToolActive) {
    return { kind: "blocked", blockReason: "remove_tool_inactive" };
  }

  const targetAsset = assets[assetId];
  if (!targetAsset) {
    return { kind: "blocked", blockReason: "asset_missing" };
  }

  if (!removableTypes.has(targetAsset.type)) {
    return { kind: "blocked", blockReason: "type_not_removable" };
  }

  if (targetAsset.fixed) {
    return { kind: "blocked", blockReason: "fixed_asset" };
  }

  return {
    kind: "eligible",
    targetAsset,
    buildingType: targetAsset.type as BuildingType,
  };
}

function deriveInitialRemovalRefundMap(input: {
  costs: Partial<Record<keyof Inventory, number>>;
  isStillConstructionSite: boolean;
}): Partial<Record<keyof Inventory, number>> {
  const { costs, isStillConstructionSite } = input;
  const refundMap: Partial<Record<keyof Inventory, number>> = {};

  if (!isStillConstructionSite) {
    for (const [res, amt] of Object.entries(costs)) {
      refundMap[res as keyof Inventory] = Math.max(1, Math.floor((amt ?? 0) / 3));
    }
  }

  return refundMap;
}

function deriveDeliveredRefundForConstructionSite(input: {
  totalCost: Partial<Record<keyof Inventory, number>>;
  remaining: Partial<Record<CollectableItemType, number>>;
}): Partial<Record<keyof Inventory, number>> {
  const { totalCost, remaining } = input;
  const deliveredRefund: Partial<Record<keyof Inventory, number>> = {};

  for (const [res, totalAmt] of Object.entries(totalCost)) {
    const rem = remaining[res as CollectableItemType] ?? 0;
    const delivered = (totalAmt ?? 0) - rem;
    if (delivered > 0) {
      deliveredRefund[res as keyof Inventory] = Math.max(1, Math.floor(delivered / 3));
    }
  }

  return deliveredRefund;
}

export function handleRemoveAssetAction(
  state: GameState,
  action: Extract<GameAction, { type: "BUILD_REMOVE_ASSET" }>,
  deps: BuildingPlacementIoDeps,
): GameState {
  const { debugLog } = deps;

  const activeHotbarSlot = state.hotbarSlots[state.activeSlot];
  // Only buildings can be removed via build mode; resources and map_shop are off-limits
  const removableTypes = new Set<string>(["workbench", "warehouse", "smithy", "generator", "cable", "battery", "power_pole", "auto_miner", "conveyor", "conveyor_corner", "manual_assembler", "auto_smelter", "service_hub"]);
  const removeEligibilityDecision = decideRemoveAssetEligibility({
    buildMode: state.buildMode,
    activeHotbarToolKind: activeHotbarSlot?.toolKind,
    assets: state.assets,
    assetId: action.assetId,
    removableTypes,
  });
  if (removeEligibilityDecision.kind === "blocked") return state;

  const { targetAsset, buildingType: bTypeR } = removeEligibilityDecision;

  debugLog.building(`[BuildMode] Removed ${ASSET_LABELS[targetAsset.type]} at (${targetAsset.x},${targetAsset.y}) – ~1/3 refund`);
  const removedB = removeAsset(state, action.assetId);
  const costsR = BUILDING_COSTS[bTypeR];
  // Only refund building cost when the building was NOT placed via construction site
  // (player never paid resources for construction site buildings — the drone delivers them).
  const isStillConstructionSite = !!state.constructionSites?.[action.assetId];
  const refundMap = deriveInitialRemovalRefundMap({
    costs: costsR,
    isStillConstructionSite,
  });
  const newInvR = addResources(state.inventory, refundMap);

  let partialRemove: GameState;
  if (bTypeR === "warehouse") {
    const newWarehouseInventories = { ...state.warehouseInventories };
    delete newWarehouseInventories[action.assetId];
    // Reassign affected building→warehouse mappings to nearest remaining warehouse (or drop → global)
    const stateForReassign: GameState = { ...state, warehouseInventories: newWarehouseInventories };
    const reassignedSources = reassignBuildingSourceIds(state.buildingSourceWarehouseIds, stateForReassign, action.assetId);
    partialRemove = {
      ...state,
      ...removedB,
      inventory: newInvR,
      warehousesPlaced: state.warehousesPlaced - 1,
      warehousesPurchased: state.warehousesPurchased - 1,
      warehouseInventories: newWarehouseInventories,
      buildingSourceWarehouseIds: reassignedSources,
      selectedWarehouseId: state.selectedWarehouseId === action.assetId ? null : state.selectedWarehouseId,
      openPanel: null as UIPanel,
    };
  } else if (bTypeR === "cable") {
    partialRemove = { ...state, ...removedB, inventory: newInvR, cablesPlaced: state.cablesPlaced - 1, openPanel: null as UIPanel };
  } else if (bTypeR === "power_pole") {
    partialRemove = { ...state, ...removedB, inventory: newInvR, powerPolesPlaced: state.powerPolesPlaced - 1, openPanel: null as UIPanel, selectedPowerPoleId: null };
  } else if (bTypeR === "auto_miner") {
    const minerState = state.autoMiners[action.assetId];
    const newAutoMiners = { ...state.autoMiners };
    delete newAutoMiners[action.assetId];
    // Restore deposit cell in cellMap
    const restoredCellMap = minerState
      ? { ...removedB.cellMap, [cellKey(targetAsset.x, targetAsset.y)]: minerState.depositId }
      : removedB.cellMap;
    partialRemove = {
      ...state,
      ...removedB,
      cellMap: restoredCellMap,
      inventory: newInvR,
      autoMiners: newAutoMiners,
      openPanel: null as UIPanel,
      selectedAutoMinerId: null,
    };
  } else if (bTypeR === "conveyor" || bTypeR === "conveyor_corner") {
    const newConveyors = { ...state.conveyors };
    delete newConveyors[action.assetId];
    partialRemove = { ...state, ...removedB, inventory: newInvR, conveyors: newConveyors, openPanel: null as UIPanel };
  } else if (bTypeR === "generator") {
    const newGenerators = { ...state.generators };
    delete newGenerators[action.assetId];
    partialRemove = {
      ...state,
      ...removedB,
      inventory: newInvR,
      generators: newGenerators,
      selectedGeneratorId: state.selectedGeneratorId === action.assetId ? null : state.selectedGeneratorId,
      openPanel: null as UIPanel,
    };
  } else if (bTypeR === "manual_assembler") {
    partialRemove = {
      ...state,
      ...removedB,
      inventory: newInvR,
      placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR),
      purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR),
      openPanel: null as UIPanel,
      manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
    };
  } else if (bTypeR === "auto_smelter") {
    const newAutoSmelters = { ...state.autoSmelters };
    delete newAutoSmelters[action.assetId];
    partialRemove = {
      ...state,
      ...removedB,
      inventory: newInvR,
      autoSmelters: newAutoSmelters,
      selectedAutoSmelterId: state.selectedAutoSmelterId === action.assetId ? null : state.selectedAutoSmelterId,
      placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR),
      purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR),
      openPanel: null as UIPanel,
    };
  } else if (bTypeR === "service_hub") {
    // Release the drone: fall back to start module delivery
    const droneAfterRemoval = state.starterDrone.hubId === action.assetId
      ? { ...state.starterDrone, hubId: null, status: "idle" as DroneStatus, targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null as DroneTaskType | null, deliveryTargetId: null as string | null, craftingJobId: null, droneId: state.starterDrone.droneId }
      : state.starterDrone;
    // Transfer hub inventory back into global inventory
    const hubEntry = state.serviceHubs[action.assetId];
    const invAfterHubRemoval = hubEntry
      ? addResources(newInvR, hubEntry.inventory)
      : newInvR;
    const { [action.assetId]: _hubRemoved, ...remainingHubs } = state.serviceHubs;
    partialRemove = {
      ...state,
      ...removedB,
      inventory: invAfterHubRemoval,
      placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR),
      purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR),
      openPanel: null as UIPanel,
      starterDrone: droneAfterRemoval,
      serviceHubs: remainingHubs,
    };
  } else {
    partialRemove = { ...state, ...removedB, inventory: newInvR, placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR), purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR), openPanel: null as UIPanel };
  }
  // Clean up zone assignment for the removed building
  if (partialRemove.buildingZoneIds[action.assetId]) {
    const { [action.assetId]: _z, ...restZoneIds } = partialRemove.buildingZoneIds;
    partialRemove = { ...partialRemove, buildingZoneIds: restZoneIds };
  }
  // Clean up construction site and refund delivered resources
  if (partialRemove.constructionSites?.[action.assetId]) {
    const site = partialRemove.constructionSites[action.assetId];
    // Refund resources that were already delivered (total cost - remaining)
    const totalCost = BUILDING_COSTS[site.buildingType];
    const deliveredRefund = deriveDeliveredRefundForConstructionSite({
      totalCost,
      remaining: site.remaining,
    });
    const invAfterSiteRefund = addResources(partialRemove.inventory, deliveredRefund);
    const { [action.assetId]: _site, ...restSites } = partialRemove.constructionSites;
    partialRemove = { ...partialRemove, constructionSites: restSites, inventory: invAfterSiteRefund };
  }
  // If the drone was delivering to this removed asset, reset it
  if (state.starterDrone?.deliveryTargetId === action.assetId && partialRemove.starterDrone.status !== "idle") {
    partialRemove = {
      ...partialRemove,
      starterDrone: { ...partialRemove.starterDrone, status: "idle" as DroneStatus, targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null, droneId: partialRemove.starterDrone.droneId },
    };
  }
  const nextState = { ...partialRemove, connectedAssetIds: computeConnectedAssetIds(partialRemove) };
  logPlacementInvariantWarnings(nextState, action.type, debugLog);
  return nextState;
}
