// ============================================================
// Factory Island - Game State & Logic
// ============================================================

import { debugLog } from "../debug/debugLogger";
import { CELL_PX, GRID_H, GRID_W } from "../constants/grid";
import {
  GENERATOR_MAX_FUEL,
  getBuildingInputConfig,
  WAREHOUSE_CAPACITY,
} from "./constants/buildings";
import { CONVEYOR_TILE_CAPACITY } from "./constants/conveyor";
import {
  getManualAssemblerRecipe,
  getWorkbenchRecipe,
  getSmeltingRecipe,
  SMELTING_RECIPES,
} from "../simulation/recipes";
import {
  cancelJob as craftingCancelJob,
  enqueueJob as craftingEnqueueJob,
  createEmptyCraftingQueue,
  moveJob as craftingMoveJob,
  setJobPriority as craftingSetJobPriority,
} from "../crafting/queue";
import { buildWorkbenchAutoCraftPlan } from "../crafting/planner";
import { applyKeepStockRefills } from "../crafting/workflows/keepStockWorkflow";
import {
  applyPlanningTriggers,
  applyExecutionTick,
  type ExecutionTickDeps,
  type PlanningTriggerDeps,
} from "../crafting/tickPhases";
import {
  applyRecipeAutomationPolicyPatch,
  areRecipeAutomationPolicyEntriesEqual,
  checkRecipeAutomationPolicy,
  isRecipeAutomationPolicyEntryDefault,
  type RecipeAutomationPolicyPatch,
} from "../crafting/policies";
import { routeOutput } from "../crafting/output";
import {
  applyCraftingSourceInventory,
  getCraftingSourceInventory,
  resolveCraftingSource,
} from "../crafting/crafting-sources";
import { getConnectedConsumerDrainEntries } from "../power/energy-consumers";
import { getEnergyProductionPerPeriod } from "../power/energy-production";
import {
  getZoneAggregateInventory,
  getZoneWarehouseIds,
} from "../zones/production-zone-aggregation";
import { applyZoneDelta } from "../zones/production-zone-mutation";
import { cleanBuildingZoneIds } from "../zones/production-zone-cleanup";
import {
  cleanBuildingSourceIds,
  getNearestWarehouseId,
  reassignBuildingSourceIds,
} from "../buildings/warehouse/warehouse-assignment";
import {
  createEmptyHubInventory,
  finalizeHubTier2Upgrade,
} from "../buildings/service-hub/hub-upgrade-workflow";
import { getBuildingInputTargets } from "../buildings/building-input-targets";
import {
  consumeFromPhysicalStorage,
  hasResourcesInPhysicalStorage,
} from "../buildings/warehouse/warehouse-storage";
import {
  DRONE_NEARBY_WAREHOUSE_LIMIT,
  DRONE_WAREHOUSE_PRIORITY_BONUS,
  scoreDroneTask,
} from "../drones/candidates/scoring";
export {
  DRONE_NEARBY_WAREHOUSE_LIMIT,
  scoreDroneTask,
  DRONE_WAREHOUSE_PRIORITY_BONUS,
};
import {
  selectDroneTask as selectDroneTaskBinding,
} from "../drones/selection/select-drone-task-bindings";
import {
  getAssignedBuildingSupplyDroneCount as getAssignedBuildingSupplyDroneCountResolver,
  getAssignedConstructionDroneCount as getAssignedConstructionDroneCountResolver,
  getAssignedWorkbenchDeliveryDroneCount as getAssignedWorkbenchDeliveryDroneCountResolver,
  getAssignedWorkbenchInputDroneCount as getAssignedWorkbenchInputDroneCountResolver,
  getInboundBuildingSupplyAmount as getInboundBuildingSupplyAmountResolver,
  getInboundConstructionAmount as getInboundConstructionAmountResolver,
  getInboundHubRestockAmount as getInboundHubRestockAmountResolver,
  getInboundHubRestockDroneCount as getInboundHubRestockDroneCountResolver,
  getOpenBuildingSupplyDroneSlots as getOpenBuildingSupplyDroneSlotsResolver,
  getOpenConstructionDroneSlots as getOpenConstructionDroneSlotsResolver,
  getOpenHubRestockDroneSlots as getOpenHubRestockDroneSlotsResolver,
  getRemainingBuildingInputDemand as getRemainingBuildingInputDemandResolver,
  getRemainingConstructionNeed as getRemainingConstructionNeedResolver,
  getRemainingHubRestockNeed as getRemainingHubRestockNeedResolver,
} from "../drones/selection/helpers/need-slot-resolvers";
import {
  tickOneDrone as tickOneDroneExecution,
  type TickOneDroneIoDeps,
} from "../drones/execution/tick-one-drone";
import { droneTravelTicks } from "../drones/drone-movement";
import { getDroneDockOffset } from "../drones/drone-dock-geometry";
import { syncDrones } from "../drones/drone-state-helpers";
import { addErrorNotification, addNotification } from "./notifications";
import { directionOffset } from "./direction";
import { getWarehouseInputCell, isValidWarehouseInput } from "./warehouse-input";
import { isUnderConstruction } from "./asset-status";
import {
  EMPTY_HOTBAR_SLOT,
  createInitialHotbar,
  hotbarAdd,
  hotbarDecrement,
} from "./helpers/hotbar";
import { getAvailableResource } from "./helpers/inventory-queries";
import { computeConnectedAssetIds } from "../logistics/connectivity";
import {
  areZonesTransportCompatible,
  getConveyorZone,
} from "../logistics/conveyor-zone";
import { getConveyorZoneStatus } from "./selectors/conveyor-zone-status";
import { decideHubDispatchExecutionAction } from "./workflows/hub-dispatch-execution";
import {
  handleCraftingQueueAction,
  type CraftingQueueActionDeps,
} from "./action-handlers/crafting-queue-actions";
import { handleZoneAction } from "./action-handlers/zone-actions";
import { handleUiAction } from "./action-handlers/ui-actions";
import {
  handleBuildingPlacementAction,
  type BuildingPlacementIoDeps,
} from "./action-handlers/building-placement";
import {
  handleBuildingSiteAction,
  type BuildingSiteActionDeps,
} from "./action-handlers/building-site";
import {
  type UiCellPreludeDeps,
} from "./action-handlers/ui-cell-prelude";
import {
  handleMachineAction,
  type MachineActionDeps,
} from "./action-handlers/machine-actions";
import {
  type ClickCellToolActionDeps,
} from "./action-handlers/click-cell-tools";
import {
  handleClickCellAction,
  type ClickCellActionDeps,
} from "./action-handlers/click-cell";
import {
  handleWarehouseHotbarAction,
  type WarehouseHotbarActionDeps,
} from "./action-handlers/warehouse-hotbar-actions";
import {
  handleManualAssemblerAction,
  type ManualAssemblerActionDeps,
} from "./action-handlers/manual-assembler-actions";
import {
  handleFloorPlacementAction,
  type FloorPlacementActionDeps,
} from "./action-handlers/floor-placement";
import {
  handleShopAction,
  type ShopActionDeps,
} from "./action-handlers/shop";
import { handleMachineConfigAction } from "./action-handlers/machine-config";
import { handleBuildModeAction } from "./action-handlers/build-mode-actions";
import { handleMaintenanceAction } from "./action-handlers/maintenance-actions";
import { handleGrowthAction } from "./action-handlers/growth-actions";
import { handleHubTargetAction } from "./action-handlers/hub-target-actions";
import { handleAutoSmelterAction } from "./action-handlers/auto-smelter-actions";
import {
  handleDroneRoleAction,
  type DroneRoleActionDeps,
} from "./action-handlers/drone-role-actions";
import {
  handleDroneTickAction,
  type DroneTickActionDeps,
} from "./action-handlers/drone-tick-actions";
import {
  handleDroneAssignmentAction,
  type DroneAssignmentActionDeps,
} from "./action-handlers/drone-assignment";
import {
  handleLogisticsTickAction,
  type LogisticsTickIoDeps,
} from "./action-handlers/logistics-tick";
import {
  decideInitialWarehousePlacement,
  deriveDebugBootstrapLayout,
} from "./helpers/initialState";
import {
  checkFloorPlacementEligibility,
  mapFloorPlacementError,
} from "./helpers/floorPlacement";
import { validateDroneHubAssignment } from "./helpers/droneAssignment";
import { tryTogglePanelFromAsset } from "./helpers/ui-panel-toggle";
import {
  getActiveSmithyAsset,
  getSelectedCraftingAsset,
} from "./helpers/crafting-asset-lookup";
import { resolveShopItemTarget } from "./helpers/shop";
import { runEnergyNetTick } from "./energy-net-tick";
import {
  decideAutoSmelterTickEntryEligibility,
  decideAutoSmelterInputBeltEligibility,
  decideAutoSmelterNonPendingStatus,
  decideAutoSmelterOutputTarget,
  decideAutoSmelterPendingOutputStatus,
  decideAutoSmelterStartProcessingEligibility,
} from "./smelter-decisions";
import { consumeAutoSmelterPendingOutput } from "./smelter-mutations";
import {
  decideConveyorTickEligibility,
  decideConveyorTargetSelection,
} from "./conveyor-decisions";
import {
  decideAutoMinerOutputTarget,
  decideAutoMinerTickEligibility,
} from "./auto-miner-decisions";
import { getDroneStatusDetail as getDroneStatusDetailClassifier } from "./drone-status-detail";
import type { CraftingInventorySource } from "../crafting/types";

// ---- Core types ----------------------------------------------------------
// All shape declarations live in ./types. Imported for internal use and
// re-exported below for backward-compatible `from "../store/reducer"` consumers.
// GameAction moved to ./game-actions; re-exported below at the ACTIONS section.
import type {
  GameMode,
  AssetType,
  BuildingType,
  FloorTileType,
  MachinePriority,
  PlacedAsset,
  Inventory,
  ToolKind,
  HotbarSlot,
  SmithyState,
  ManualAssemblerState,
  Direction,
  AutoMinerEntry,
  ConveyorItem,
  ConveyorState,
  AutoSmelterStatus,
  AutoSmelterProcessing,
  AutoSmelterEntry,
  UIPanel,
  BatteryState,
  GeneratorState,
  GameNotification,
  AutoDeliveryEntry,
  CollectableItemType,
  CollectionNode,
  DroneRole,
  DroneStatus,
  DroneCargoItem,
  StarterDroneState,
  DroneTaskType,
  ConstructionSite,
  ServiceHubInventory,
  HubTier,
  ServiceHubEntry,
  KeepStockTargetEntry,
  KeepStockByWorkbench,
  RecipeAutomationPolicyEntry,
  RecipeAutomationPolicyMap,
  ProductionZone,
  CraftingSource,
  WorkbenchSource,
  GameState,
} from "./types";

export type {
  GameMode,
  AssetType,
  BuildingType,
  FloorTileType,
  MachinePriority,
  PlacedAsset,
  Inventory,
  ToolKind,
  HotbarSlot,
  SmithyState,
  ManualAssemblerState,
  Direction,
  AutoMinerEntry,
  ConveyorItem,
  ConveyorState,
  AutoSmelterStatus,
  AutoSmelterProcessing,
  AutoSmelterEntry,
  UIPanel,
  BatteryState,
  GeneratorState,
  GameNotification,
  AutoDeliveryEntry,
  CollectableItemType,
  CollectionNode,
  DroneRole,
  DroneStatus,
  DroneCargoItem,
  StarterDroneState,
  DroneTaskType,
  ConstructionSite,
  ServiceHubInventory,
  HubTier,
  ServiceHubEntry,
  KeepStockTargetEntry,
  KeepStockByWorkbench,
  RecipeAutomationPolicyEntry,
  RecipeAutomationPolicyMap,
  ProductionZone,
  CraftingSource,
  WorkbenchSource,
  GameState,
};

/** Returns true if the building with the given asset ID is still under construction. */
export { isUnderConstruction };

// ============================================================
// CONSTANTS
// ============================================================

// Conveyor constants live in ./constants/conveyor.
// Imported for internal use and re-exported for backward compatibility.
export { CONVEYOR_TILE_CAPACITY } from "./constants/conveyor";
export { GRID_W, GRID_H, CELL_PX };

// Building constants & input-buffer configuration live in ./constants/buildings.
// Re-exported here so existing `from "../store/reducer"` imports keep working.
export * from "./constants/buildings";

// Asset display tables (labels/colors/emojis) live in ./constants/assets.
// Re-exported for backward compatibility.
export * from "./constants/assets";

// Resource display tables (labels/emojis) live in ./constants/resources.
// Re-exported for backward compatibility.
export * from "./constants/resources";

// Floor tile constants live in ./constants/floor.
// Imported for internal use and re-exported for backward compatibility.
import { FLOOR_TILE_COSTS } from "./constants/floor";
export * from "./constants/floor";

// Timing constants live in ./constants/timing.
// Imported for internal use and re-exported for backward compatibility.
import {
  DRONE_TICK_MS,
  LOGISTICS_TICK_MS,
  NATURAL_SPAWN_CAP,
  NATURAL_SPAWN_CHANCE,
  SAPLING_GROW_MS,
} from "./constants/timing";
export * from "./constants/timing";

// Auto-delivery log limits live in ./constants/auto-delivery.
import {
  AUTO_DELIVERY_BATCH_WINDOW_MS,
  AUTO_DELIVERY_LOG_MAX,
} from "./constants/auto-delivery";

// Drone/logistics constants live in ./constants/drone-config.
// Imported for internal use and re-exported for backward compatibility.
import {
  AUTO_MINER_PRODUCE_TICKS,
  DRONE_COLLECT_TICKS,
  DRONE_DEPOSIT_TICKS,
  DRONE_SPEED_TILES_PER_TICK,
} from "./constants/drone-config";
export * from "./constants/drone-config";

// Energy/auto-smelter coupled constants live in ./constants/energy-smelter.
// Imported for internal use and re-exported for backward compatibility.
import {
  AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD,
  AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD,
  ENERGY_NET_TICK_MS,
} from "./constants/energy/energy-smelter";
export * from "./constants/energy/energy-smelter";

// Energy balance constants live in ./constants/energy-balance.
// Named import for reducer-internal helpers; full module re-exported below.
import {
  POWER_CABLE_CONDUCTOR_TYPES,
  POWER_POLE_RANGE_TYPES,
} from "./constants/energy/energy-balance";
export * from "./constants/energy/energy-balance";

export { BATTERY_CAPACITY } from "./constants/energy/battery";
export { POWER_POLE_RANGE } from "./constants/energy/power-pole";

// Generator constants live in ./constants/generator.
// Imported for internal use and re-exported for backward compatibility.
import {
  GENERATOR_ENERGY_PER_TICK,
  GENERATOR_TICK_MS,
  GENERATOR_TICKS_PER_WOOD,
} from "./constants/energy/generator";
export * from "./constants/energy/generator";

// Workbench/Smithy timing constants live in ./constants/workbench-timing.
// Imported for internal use and re-exported for backward compatibility.
import {
  MANUAL_ASSEMBLER_PROCESS_MS,
  MANUAL_ASSEMBLER_TICK_MS,
  SMITHY_PROCESS_MS,
  SMITHY_TICK_MS,
} from "./constants/workbench-timing";
export * from "./constants/workbench-timing";

// Service hub target-stock defaults live in ./constants/hub-target-stock.
// Imported for internal use and re-exported for backward compatibility.
import { SERVICE_HUB_TARGET_STOCK } from "./constants/hub/hub-target-stock";
export * from "./constants/hub/hub-target-stock";

// Service hub target-stock clamp constants live in ./constants/hub-target-stock-max.
// Imported for internal use and re-exported for backward compatibility.
export * from "./constants/hub/hub-target-stock-max";

// Service hub range constants live in ./constants/hub-range.
// Imported for internal use and re-exported for backward compatibility.
export * from "./constants/hub/hub-range";

// Service hub active-resource constants live in ./constants/hub-active-resources.
// Imported for internal use and re-exported for backward compatibility.
export * from "./constants/hub/hub-active-resources";

// Service hub max-drone constants live in ./constants/hub-max-drones.
// Imported for internal use and re-exported for backward compatibility.
export * from "./constants/hub/hub-max-drones";

// Hub tier selector helpers live in ./hub-tier-selectors.
// Imported for reducer-internal use and re-exported for backward compatibility.
import {
  getHubRange,
  getActiveResources,
  getMaxDrones,
  getMaxTargetStockForTier,
  getHubTierLabel,
} from "./hub-tier-selectors";
export {
  getHubRange,
  getActiveResources,
  getMaxDrones,
  getMaxTargetStockForTier,
  getHubTierLabel,
};

// Service hub upgrade cost lives in ./constants/hub-upgrade-cost.
// Imported for internal use and re-exported for backward compatibility.
import { HUB_UPGRADE_COST } from "./constants/hub/hub-upgrade-cost";
export * from "./constants/hub/hub-upgrade-cost";

// Deposit constants live in ./constants/deposit-positions.
// Re-exported for backward compatibility.
export * from "./constants/deposit-positions";

// Map shop offer constants live in ./constants/shop.
// Imported for internal use and re-exported for backward compatibility.
import { MAP_SHOP_ITEMS } from "./constants/shop";
export * from "./constants/shop";

/** Drop amount for all 1×1 harvestable resources (tree, stone, iron, copper). */
export const RESOURCE_1x1_DROP_AMOUNT = 10;
if (import.meta.env.DEV) console.log(`[FactoryIsland] Drop-Multiplikator auf ${RESOURCE_1x1_DROP_AMOUNT}x für 1x1-Ressourcen gesetzt.`);
export { HOTBAR_SIZE, HOTBAR_STACK_MAX } from "./constants/hotbar";
export const KEEP_STOCK_MAX_TARGET = 999;
export const KEEP_STOCK_OPEN_JOB_CAP = 2;

// Must stay in reducer.ts — crafting/tickPhases.ts imports GameState from
// store/types (transitively via reducer.ts), so moving these deps into
// crafting/ would create a circular module dependency:
//   crafting/tickPhases → store/reducer → crafting/tickPhases
// resolveBuildingSource and toCraftingJobInventorySource are reducer-internal
// helpers that depend on GameState; they cannot be declared in crafting/.
const PLANNING_TRIGGER_DEPS: PlanningTriggerDeps = {
  KEEP_STOCK_OPEN_JOB_CAP,
  KEEP_STOCK_MAX_TARGET,
  resolveBuildingSource,
  toCraftingJobInventorySource,
  getCraftingSourceInventory,
  isUnderConstruction,
};
const EXECUTION_TICK_DEPS: ExecutionTickDeps = {
  isUnderConstruction,
};

// ---- Energy / Generator ----

export function isPowerCableConductorType(type: AssetType): boolean {
  return POWER_CABLE_CONDUCTOR_TYPES.has(type);
}

export function isPowerPoleRangeType(type: AssetType): boolean {
  return POWER_POLE_RANGE_TYPES.has(type);
}

import { clampMachinePriority, isEnergyConsumerType, withDefaultMachinePriority } from "./machine-priority";
import { cellKey } from "./cell-key";
import { assetWidth, assetHeight, getAutoSmelterIoCells } from "./asset-geometry";
import { removeAsset, placeAsset } from "./asset-mutation";
import {
  COLLECTABLE_KEYS,
  createEmptyInventory,
  hasResources,
  addResources,
  getEffectiveBuildInventory,
  fullCostAsRemaining,
  consumeBuildResources,
} from "./inventory-ops";
import { createDefaultProtoHubTargetStock } from "./constants/hub/hub-target-stock";
export { isEnergyConsumerType };
export {
  getConnectedConsumerDrainEntries,
  getEnergyProductionPerPeriod,
};
export {
  getZoneAggregateInventory,
  getZoneWarehouseIds,
  cleanBuildingZoneIds,
};
export {
  getNearestWarehouseId,
  reassignBuildingSourceIds,
  cleanBuildingSourceIds,
  consumeFromPhysicalStorage,
  hasResourcesInPhysicalStorage,
};
export {
  computeConnectedAssetIds,
  getConveyorZone,
  getConveyorZoneStatus,
  areZonesTransportCompatible,
};
export type { ConveyorZoneStatus } from "./selectors/conveyor-zone-status";
export {
  resolveCraftingSource,
  getCraftingSourceInventory,
  applyCraftingSourceInventory,
};
export {
  createEmptyHubInventory,
};
export {
  getDroneDockOffset,
};

export function getConnectedDemandPerPeriod(
  state: Pick<GameState, "assets" | "connectedAssetIds" | "autoSmelters">
): number {
  return getConnectedConsumerDrainEntries(state).reduce((sum, entry) => sum + entry.drain, 0);
}

export { withDefaultMachinePriority };

// ---- Auto-Miner / Conveyor ----
// ---- Crafting job queue ----
// ---- Starter Drone ----
/** Max items carried per trip. */
export const DRONE_CAPACITY = 5;
/**
 * Chebyshev radius (tiles) within which drones repel each other.
 * Matches DRONE_SPEED_TILES_PER_TICK so a fast drone always sees its
 * nearest neighbour before crossing.
 */
export const DRONE_SEPARATION_RADIUS = 2;

// ---- Service Hub ----
/** Hard cap to prevent a single construction target from mobilizing the entire drone fleet. */
export const MAX_DRONES_PER_CONSTRUCTION_TARGET = 4;
/** Hard cap for concurrent restock trips of the same resource into one hub. */
export const MAX_DRONES_PER_HUB_RESTOCK_RESOURCE = 4;
/** Hard cap for concurrent supply trips into the same building input buffer. */
export const MAX_DRONES_PER_BUILDING_SUPPLY = 4;

/** Create default target stock for Tier 2 (Service-Hub). */
export function createDefaultHubTargetStock(): Record<CollectableItemType, number> {
  return { ...SERVICE_HUB_TARGET_STOCK };
}

export { createDefaultProtoHubTargetStock };

/** Get all drones assigned to a specific hub. */
export function getHubDrones(state: GameState, hubId: string): StarterDroneState[] {
  const hub = state.serviceHubs[hubId];
  if (!hub) return [];
  return hub.droneIds.map((id) => state.drones[id]).filter(Boolean);
}

export function getDroneDockSlotIndex(
  state: Pick<GameState, "serviceHubs">,
  hubId: string,
  droneId: string,
): number {
  const dockSlot = state.serviceHubs[hubId]?.droneIds.indexOf(droneId) ?? -1;
  return dockSlot >= 0 ? dockSlot : 0;
}

/** Produce a human-readable status detail for a drone (for UI display). */
export function getDroneStatusDetail(state: GameState, drone: StarterDroneState): { label: string; taskGoal?: string } {
  return getDroneStatusDetailClassifier(state, drone);
}


/**
 * Returns the tile position of the homeHub dock slot for a drone.
 * Returns null when the drone has no hub or the hub asset is gone.
 */
export function getDroneHomeDock(
  drone: StarterDroneState,
  state: Pick<GameState, "assets" | "serviceHubs">,
): { x: number; y: number } | null {
  if (!drone.hubId) return null;
  const hubAsset = state.assets[drone.hubId];
  if (!hubAsset) return null;
  const dockSlot = getDroneDockSlotIndex(state, drone.hubId, drone.droneId);
  const offset = getDroneDockOffset(dockSlot);
  return { x: hubAsset.x + offset.dx, y: hubAsset.y + offset.dy };
}

export function isDroneParkedAtHub(
  state: Pick<GameState, "assets" | "serviceHubs">,
  drone: StarterDroneState,
): boolean {
  const dock = getDroneHomeDock(drone, state);
  return !!dock && drone.status === "idle" && drone.tileX === dock.x && drone.tileY === dock.y;
}

export function getParkedDrones(
  state: Pick<GameState, "assets" | "serviceHubs" | "drones">,
  hubId: string,
): StarterDroneState[] {
  const hub = state.serviceHubs[hubId];
  if (!hub) return [];
  return hub.droneIds
    .map((droneId) => state.drones[droneId])
    .filter((drone): drone is StarterDroneState => !!drone)
    .filter((drone) => isDroneParkedAtHub(state, drone));
}

// costIsFullyCollectable, fullCostAsRemaining, COLLECTABLE_KEYS extracted to ./inventory-ops

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getInboundHubRestockAmount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundHubRestockAmountResolver(state, hubId, itemType, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getInboundHubRestockDroneCount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundHubRestockDroneCountResolver(state, hubId, itemType, excludeDroneId);
}

/**
 * True when the hub's own inventory already covers every resource still
 * outstanding in `pendingUpgrade`. Used to finalize a pending tier-2 upgrade
 * once drones have delivered the last of the required materials.
 */
function isHubUpgradeDeliverySatisfied(hub: ServiceHubEntry | undefined | null): boolean {
  if (!hub || !hub.pendingUpgrade) return false;
  for (const [k, v] of Object.entries(hub.pendingUpgrade)) {
    const needed = v ?? 0;
    if (needed <= 0) continue;
    const have = hub.inventory[k as CollectableItemType] ?? 0;
    if (have < needed) return false;
  }
  return true;
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getRemainingHubRestockNeed(
  state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getRemainingHubRestockNeedResolver(state, hubId, itemType, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getOpenHubRestockDroneSlots(
  state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getOpenHubRestockDroneSlotsResolver(state, hubId, itemType, excludeDroneId);
}


// ---------------------------------------------------------------------------
// Warehouse-as-pickup-source helpers (warehouse > hub priority).
// Mirror the hub-dispatch model: synthetic targetNodeId "wh:{whId}:{item}",
// inbound counting throttles per-warehouse availability. We deliberately do
// NOT subtract crafting reservations here — symmetric to the existing hub
// path, which also ignores them. If a craft commit later races and finds
// short stock, the existing reservation system handles it.
// ---------------------------------------------------------------------------

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
/** Counts in-flight drone trips heading to a specific warehouse for `itemType`,
 *  across both hub_dispatch and building_supply task types. */
function getInboundConstructionAmount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  siteId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundConstructionAmountResolver(state, siteId, itemType, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getAssignedConstructionDroneCount(
  state: Pick<GameState, "drones">,
  siteId: string,
  excludeDroneId?: string,
): number {
  return getAssignedConstructionDroneCountResolver(state, siteId, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getRemainingConstructionNeed(
  state: Pick<GameState, "drones" | "collectionNodes" | "constructionSites">,
  siteId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getRemainingConstructionNeedResolver(state, siteId, itemType, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getOpenConstructionDroneSlots(
  state: Pick<GameState, "drones" | "constructionSites">,
  siteId: string,
  excludeDroneId?: string,
): number {
  return getOpenConstructionDroneSlotsResolver(state, siteId, excludeDroneId);
}

// ---- Building Input Buffer helpers (drone supply targets) ------------------
//
// Mirrors the construction_supply helpers above, but targets a building's
// local input buffer (see BUILDING_INPUT_BUFFERS) instead of a construction
// site. Currently used by the wood generator.

/** Reads the current amount in a building's input buffer. */
export function getBuildingInputCurrent(
  state: Pick<GameState, "assets" | "generators">,
  assetId: string,
): number {
  const asset = state.assets[assetId];
  if (!asset) return 0;
  if (asset.type === "generator") return state.generators[assetId]?.fuel ?? 0;
  return 0;
}

/** Lists every placed asset that owns an input buffer, paired with its accepted resource. */
export { getBuildingInputTargets };

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
/** Counts in-flight building_supply cargo + reservations + hub-bound trips heading into `assetId`. */
export function getInboundBuildingSupplyAmount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  assetId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundBuildingSupplyAmountResolver(state, assetId, itemType, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
/** Open delivery demand for a building's input buffer (capacity − current − inbound).
 *  Generators are special: they only accept drone deliveries up to the player-issued
 *  `requestedRefill`. With no outstanding request, demand is 0 and no auto-refill happens. */
export function getRemainingBuildingInputDemand(
  state: Pick<GameState, "assets" | "generators" | "drones" | "collectionNodes">,
  assetId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getRemainingBuildingInputDemandResolver(state, assetId, itemType, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getAssignedBuildingSupplyDroneCount(
  state: Pick<GameState, "drones">,
  assetId: string,
  excludeDroneId?: string,
): number {
  return getAssignedBuildingSupplyDroneCountResolver(state, assetId, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getOpenBuildingSupplyDroneSlots(
  state: Pick<GameState, "assets" | "generators" | "drones">,
  assetId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getOpenBuildingSupplyDroneSlotsResolver(state, assetId, itemType, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getAssignedWorkbenchDeliveryDroneCount(
  state: Pick<GameState, "drones">,
  jobId: string,
  excludeDroneId?: string,
): number {
  return getAssignedWorkbenchDeliveryDroneCountResolver(state, jobId, excludeDroneId);
}

// Implementation: drones/selection/helpers/need-slot-resolvers.ts
function getAssignedWorkbenchInputDroneCount(
  state: Pick<GameState, "drones">,
  reservationId: string,
  excludeDroneId?: string,
): number {
  return getAssignedWorkbenchInputDroneCountResolver(state, reservationId, excludeDroneId);
}

/**
 * Selects the highest-scoring drone task from all valid candidates.
 *
 * Scoring: score = BASE_PRIORITY[taskType] − chebyshevDistanceDroneToNode + bonuses
 *
 * Bonuses applied per candidate:
 *   · Role bonus (DRONE_ROLE_BONUS = 30): added when the task type matches the drone's
 *     preferred role ("construction" → construction_supply; "supply" → hub_restock).
 *     "auto" role → no bonus. Roles never block fallback to other task types.
 *   · Sticky bonus (DRONE_STICKY_BONUS = 15): added when the node is already reserved
 *     by this drone. Prevents pointless task-hopping between nearby equal-score nodes.
 *   · Urgency bonus (0..DRONE_URGENCY_BONUS_MAX = 20): for hub_restock only, proportional
 *     to resource deficit (target − current). Favours the most-needed resource.
 *
 * Priority invariant (always holds):
 *   worst construction_supply score: 1000 - 79 + 0 = 921
 *   best workbench_delivery score:   300  -  0 + 15 = 315
 *   best hub_restock score:          100  -  0 + 30 + 15 + 20 = 165
 *   921 > 315 > 165 ✓ — construction wins; crafted tool pickup beats passive restock.
 *
 * Tie-break: ascending nodeId string — deterministic, stable across ticks.
 * Returns null if no valid task exists.
 */
export function selectDroneTask(state: GameState, droneOverride?: StarterDroneState): {
  taskType: DroneTaskType;
  nodeId: string;
  deliveryTargetId: string;
} | null {
  return selectDroneTaskBinding(state, droneOverride);
}

export { AUTO_SMELTER_BUFFER_CAPACITY } from "./constants/auto-smelter";

/**
 * Overclocking-Stufe 1: Zwei feste Modi (normal / boosted), nur für auto_miner
 * und auto_smelter. Multiplikator wirkt konsistent auf Strom UND Produktion.
 */
export const AUTO_MINER_BOOST_MULTIPLIER = 2;
export const AUTO_SMELTER_BOOST_MULTIPLIER = 2;

export { isBoostSupportedType } from "./machine-priority";

/** Effektiver Boost-Multiplikator für ein Asset. 1 wenn nicht boosted oder nicht unterstützt. */
export function getBoostMultiplier(asset: Pick<PlacedAsset, "type" | "boosted">): number {
  if (!asset.boosted) return 1;
  if (asset.type === "auto_miner") return AUTO_MINER_BOOST_MULTIPLIER;
  if (asset.type === "auto_smelter") return AUTO_SMELTER_BOOST_MULTIPLIER;
  return 1;
}

export { createEmptyInventory };

function getWarehouseCapacity(mode: GameMode): number {
  return mode === "debug" ? Infinity : WAREHOUSE_CAPACITY;
}

export function getCapacityPerResource(state: { mode: string; warehousesPlaced: number }): number {
  if (state.mode === "debug") return Infinity;
  return (state.warehousesPlaced + 1) * WAREHOUSE_CAPACITY;
}

// ============================================================
// INVENTORY WRAPPERS
// V1: operate on the global `state.inventory` pool.
// Future versions may aggregate per-warehouse inventories.
// ============================================================

export { getAvailableResource };

export { hasResources };

/**
 * Return a new Inventory with `costs` deducted.
 * DEV: warns if any resulting value becomes negative (indicates a missing hasResources check).
 */
export function consumeResources(inv: Inventory, costs: Partial<Record<keyof Inventory, number>>): Inventory {
  const result = { ...inv } as Record<string, number>;
  for (const [key, amt] of Object.entries(costs)) {
    result[key] = (result[key] ?? 0) - (amt ?? 0);
    if (import.meta.env.DEV && result[key] < 0) {
      console.warn(`[consumeResources] Negative value for "${key}": ${result[key]}. Missing hasResources() guard?`);
    }
  }
  return result as unknown as Inventory;
}

export { addResources };

export {
  selectBuildMenuInventoryView,
  selectGlobalInventoryView,
} from "./helpers/inventory-queries";

export { getEffectiveBuildInventory };
// consumeBuildResources extracted to ./inventory-ops

/**
 * DEV-only: assert no inventory field is negative.
 * Call after reducer transitions to catch silent corruption early.
 */
export function devAssertInventoryNonNegative(label: string, inv: Inventory): void {
  if (!import.meta.env.DEV) return;
  for (const [key, val] of Object.entries(inv)) {
    if ((val as number) < 0) {
      console.error(`[Invariant] ${label}: "${key}" is negative (${val})`);
    }
  }
}

// ============================================================
// CRAFTING SOURCE POLICY
//
// `CraftingSource` / `WorkbenchSource` are declared in ./types and
// re-exported above. Determines where a crafting device reads/writes resources.
// ============================================================

export function toCraftingJobInventorySource(
  state: GameState,
  source: CraftingSource,
): CraftingInventorySource {
  if (source.kind === "global") {
    return { kind: "global" };
  }
  if (source.kind === "zone") {
    return {
      kind: "zone",
      zoneId: source.zoneId,
      warehouseIds: getZoneWarehouseIds(state, source.zoneId),
    };
  }
  return { kind: "warehouse", warehouseId: source.warehouseId };
}

// ============================================================
// PRODUCTION ZONE HELPERS
// ============================================================

/**
 * Returns IDs of non-warehouse buildings (crafting devices) assigned to a zone.
 */
export function getZoneBuildingIds(state: GameState, zoneId: string): string[] {
  const result: string[] = [];
  for (const [bid, zid] of Object.entries(state.buildingZoneIds)) {
    if (zid !== zoneId) continue;
    if (state.assets[bid] && state.assets[bid].type !== "warehouse") {
      result.push(bid);
    }
  }
  return result.sort();
}

/**
 * Returns the total capacity per item for a zone (sum of warehouse capacities).
 */
export function getZoneItemCapacity(state: GameState, zoneId: string): number {
  if (state.mode === "debug") return Infinity;
  const count = getZoneWarehouseIds(state, zoneId).length;
  return count * WAREHOUSE_CAPACITY;
}

/**
 * Resolve crafting source for a specific building instance.
 * Priority: zone (if assigned + has warehouses) > legacy per-building warehouse > global.
 */
export function resolveBuildingSource(state: GameState, buildingId: string | null): CraftingSource {
  if (!buildingId) return { kind: "global" };
  // Zone takes priority
  const zoneId = state.buildingZoneIds[buildingId];
  if (zoneId && state.productionZones[zoneId]) {
    const whIds = getZoneWarehouseIds(state, zoneId);
    if (whIds.length > 0) {
      return { kind: "zone", zoneId };
    }
    // Zone exists but has no warehouses → fall through to legacy/global
  }
  // Legacy per-building warehouse mapping
  const whId = state.buildingSourceWarehouseIds[buildingId] ?? null;
  return resolveCraftingSource(state, whId);
}

/** @deprecated Use resolveBuildingSource */
export function resolveWorkbenchSource(state: GameState): CraftingSource {
  return resolveBuildingSource(state, state.selectedCraftingBuildingId);
}

type CraftingBuildingAssetType = "workbench" | "smithy" | "manual_assembler";

function getFirstCraftingAssetOfType(
  state: Pick<GameState, "assets">,
  assetType: CraftingBuildingAssetType,
): PlacedAsset | null {
  return Object.values(state.assets).find((asset) => asset.type === assetType) ?? null;
}

function logCraftingSelectionComparison(
  state: Pick<GameState, "assets" | "selectedCraftingBuildingId">,
  assetType: CraftingBuildingAssetType,
  selectedId: string | null | undefined = state.selectedCraftingBuildingId,
): void {
  if (!import.meta.env.DEV) return;
  const firstId = getFirstCraftingAssetOfType(state, assetType)?.id ?? "none";
  const resolvedSelectedId = selectedId ?? "none";
  if (resolvedSelectedId === firstId) return;
  const logger = assetType === "smithy" ? debugLog.smithy : debugLog.general;
  logger(`Selected: ${assetType}[${resolvedSelectedId}], first would have been [${firstId}]`);
}

// ============================================================
// SOURCE STATUS VIEW-MODEL
// Pure derivation for UI transparency — no side effects.
// ============================================================

export type { FallbackReason, SourceStatusInfo } from "./selectors/source-status";
export { hasStaleWarehouseAssignment, getSourceStatusInfo } from "./selectors/source-status";

export { MAP_SHOP_POS } from "./constants/map-layout";

/**
 * Manhattan distance between two grid positions.
 */
export function manhattanDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// ============================================================
// HELPERS
// ============================================================

// _smelterRecipesLogged moved into action-handlers/logistics-tick.ts together with the smelter phase.
// makeId lives in ./make-id (extracted so handler modules can value-import it
// directly without an ESM cycle through this file). Re-exported for backward
// compatibility with `from "../store/reducer"` consumers.
export { makeId } from "./make-id";
import { makeId } from "./make-id";

/**
 * Add `amount` of `itemType` to a collection node at (tileX, tileY). If a
 * matching node (same tile + same itemType) already exists, merge into it;
 * otherwise spawn a new one. Returns a fresh record — never mutates.
 */
export function addToCollectionNodeAt(
  nodes: Record<string, CollectionNode>,
  itemType: CollectableItemType,
  tileX: number,
  tileY: number,
  amount: number,
): Record<string, CollectionNode> {
  if (amount <= 0) return nodes;
  for (const node of Object.values(nodes)) {
    if (node.tileX === tileX && node.tileY === tileY && node.itemType === itemType) {
      return { ...nodes, [node.id]: { ...node, amount: node.amount + amount } };
    }
  }
  const id = makeId("cn");
  return {
    ...nodes,
    [id]: { id, itemType, amount, tileX, tileY, collectable: true, createdAt: Date.now(), reservedByDroneId: null },
  };
}

export { cellKey };

/** Returns [dx, dy] offset for a direction. */
export { directionOffset };

export { assetWidth, assetHeight, getAutoSmelterIoCells };

export { getWarehouseInputCell, isValidWarehouseInput };


// removeAsset extracted to ./asset-mutation

export { placeAsset };

/**
 * Appends (or batches into the latest matching entry) one unit delivered to a warehouse.
 * Same sourceId + resource within the batch window → increments amount.
 * Older entries are evicted when the log exceeds AUTO_DELIVERY_LOG_MAX.
 */
function addAutoDelivery(
  log: AutoDeliveryEntry[],
  sourceType: AutoDeliveryEntry["sourceType"],
  sourceId: string,
  resource: string,
  warehouseId: string,
): AutoDeliveryEntry[] {
  const now = Date.now();
  const lastIdx = log.length - 1;
  const last = lastIdx >= 0 ? log[lastIdx] : null;
  if (
    last &&
    last.sourceId === sourceId &&
    last.resource === resource &&
    now - last.timestamp <= AUTO_DELIVERY_BATCH_WINDOW_MS
  ) {
    return [
      ...log.slice(0, lastIdx),
      { ...last, amount: last.amount + 1, timestamp: now },
    ];
  }
  const entry: AutoDeliveryEntry = {
    id: makeId(),
    sourceType,
    sourceId,
    resource,
    amount: 1,
    warehouseId,
    timestamp: now,
  };
  return log.length >= AUTO_DELIVERY_LOG_MAX
    ? [...log.slice(1), entry]
    : [...log, entry];
}

export {
  EMPTY_HOTBAR_SLOT,
  createInitialHotbar,
  hotbarAdd,
  hotbarDecrement,
};

// ============================================================
// CONNECTIVITY
// ============================================================

// ============================================================
// INITIAL STATE
// ============================================================

export { createInitialState } from "./initial-state";

// ============================================================
// ACTIONS
// ============================================================

import type { GameAction } from "./game-actions";
export type { GameAction };

// ============================================================
// REDUCER
// ============================================================

/**
 * Tick one drone (identified by droneId) through its state machine for one step.
 * Reads from state.drones[droneId]; writes back via applyDroneUpdate so that
 * state.starterDrone stays in sync for the "starter" drone.
 * All other game-state fields (collectionNodes, serviceHubs, …) are updated in place.
 */
const TICK_ONE_DRONE_IO_DEPS: TickOneDroneIoDeps = {
  makeId,
  addNotification,
  debugLog,
};

function tickOneDrone(state: GameState, droneId: string): GameState {
  return tickOneDroneExecution(state, droneId, TICK_ONE_DRONE_IO_DEPS);
}

function getKeepStockByWorkbench(state: Pick<GameState, "keepStockByWorkbench">): KeepStockByWorkbench {
  return state.keepStockByWorkbench ?? {};
}

function getRecipeAutomationPolicies(
  state: Pick<GameState, "recipeAutomationPolicies">,
): RecipeAutomationPolicyMap {
  return state.recipeAutomationPolicies ?? {};
}

// Crafting-Job-Status-, Source-Vergleichs- und Cap-Helfer leben in
// ../crafting/jobStatus und werden oben importiert.
// Die Keep-in-stock-Refill-Orchestrierung liegt in
// ../crafting/workflows/keepStockWorkflow (applyKeepStockRefills).

const CRAFTING_QUEUE_ACTION_DEPS: CraftingQueueActionDeps = {
  KEEP_STOCK_MAX_TARGET,
  planningTriggerDeps: PLANNING_TRIGGER_DEPS,
  executionTickDeps: EXECUTION_TICK_DEPS,
  isUnderConstruction,
  resolveBuildingSource,
  toCraftingJobInventorySource,
  logCraftingSelectionComparison,
  addErrorNotification,
  getKeepStockByWorkbench,
  getRecipeAutomationPolicies,
};

const UI_CELL_PRELUDE_DEPS: UiCellPreludeDeps = {
  tryTogglePanelFromAsset,
};

const CLICK_CELL_TOOL_ACTION_DEPS: ClickCellToolActionDeps = {
  RESOURCE_1x1_DROP_AMOUNT,
  removeAsset,
  addToCollectionNodeAt,
  hotbarDecrement,
  getCapacityPerResource,
  hotbarAdd,
  addResources,
  addNotification,
  placeAsset,
  addErrorNotification,
  debugLog,
};

const CLICK_CELL_ACTION_DEPS: ClickCellActionDeps = {
  uiCellPreludeDeps: UI_CELL_PRELUDE_DEPS,
  clickCellToolActionDeps: CLICK_CELL_TOOL_ACTION_DEPS,
};

const MACHINE_ACTION_DEPS: MachineActionDeps = {
  getSelectedCraftingAsset,
  getActiveSmithyAsset,
  logCraftingSelectionComparison,
  isUnderConstruction,
  resolveBuildingSource,
  addErrorNotification,
  addNotification,
  consumeResources,
  addResources,
};

const WAREHOUSE_HOTBAR_ACTION_DEPS: WarehouseHotbarActionDeps = {
  EMPTY_HOTBAR_SLOT,
  hotbarAdd,
  addErrorNotification,
  isUnderConstruction,
  getAvailableResource,
  getWarehouseCapacity,
  consumeResources,
  addResources,
};

const MANUAL_ASSEMBLER_ACTION_DEPS: ManualAssemblerActionDeps = {
  getSelectedCraftingAsset,
  logCraftingSelectionComparison,
  isUnderConstruction,
  resolveBuildingSource,
  getCapacityPerResource,
  getZoneItemCapacity,
  addErrorNotification,
  addNotification,
  consumeResources,
  addResources,
  WAREHOUSE_CAPACITY,
};

const BUILDING_PLACEMENT_IO_DEPS: BuildingPlacementIoDeps = {
  makeId,
  addErrorNotification,
  debugLog,
};

const BUILDING_SITE_ACTION_DEPS: BuildingSiteActionDeps = {
  isUnderConstruction,
  addErrorNotification,
  fullCostAsRemaining,
  debugLog,
};

const FLOOR_PLACEMENT_ACTION_DEPS: FloorPlacementActionDeps = {
  GRID_W,
  GRID_H,
  FLOOR_TILE_COSTS,
  cellKey,
  hasResources,
  getEffectiveBuildInventory,
  addErrorNotification,
  checkFloorPlacementEligibility,
  mapFloorPlacementError,
  consumeBuildResources,
  debugLog,
};

const SHOP_ACTION_DEPS: ShopActionDeps = {
  MAP_SHOP_ITEMS,
  hasResources,
  consumeResources,
  addNotification,
  resolveShopItemTarget,
  hotbarAdd,
  addResources,
};

const DRONE_ASSIGNMENT_ACTION_DEPS: DroneAssignmentActionDeps = {
  validateDroneHubAssignment,
  addErrorNotification,
  syncDrones,
  debugLog,
};

const DRONE_ROLE_ACTION_DEPS: DroneRoleActionDeps = {
  syncDrones,
};

const DRONE_TICK_ACTION_DEPS: DroneTickActionDeps = {
  tickOneDrone,
};

const LOGISTICS_TICK_IO_DEPS: LogisticsTickIoDeps = {
  addNotification,
  addAutoDelivery,
};

// ============================================================
// DISPATCHER
// ------------------------------------------------------------
// `gameReducer` is structured as an early-return dispatch chain
// over action-handler clusters under ./action-handlers/*. Each
// `handle...Action(state, action, deps?)` returns either the next
// state (action belonged to its cluster) or `null` (fall through).
//
// The remaining inline `switch` only covers cases that have not
// been extracted (e.g. ENERGY_NET_TICK, LOGISTICS_TICK,
// AUTO_SMELTER_SET_RECIPE). All extracted cases are documented
// inline below via `// <ACTION> is handled above by handle<Cluster>Action`
// markers so the action surface remains greppable from this file.
//
// See PHASE 4.11 cluster set under src/game/store/action-handlers/.
// ============================================================
export function gameReducer(state: GameState, action: GameAction): GameState {
  const craftingQueueResult = handleCraftingQueueAction(state, action, CRAFTING_QUEUE_ACTION_DEPS);
  if (craftingQueueResult !== null) return craftingQueueResult;
  const zoneResult = handleZoneAction(state, action);
  if (zoneResult !== null) return zoneResult;
  const uiResult = handleUiAction(state, action);
  if (uiResult !== null) return uiResult;
  const buildingPlacementResult = handleBuildingPlacementAction(
    state,
    action,
    BUILDING_PLACEMENT_IO_DEPS,
  );
  if (buildingPlacementResult !== null) return buildingPlacementResult;
  const buildingSiteResult = handleBuildingSiteAction(
    state,
    action,
    BUILDING_SITE_ACTION_DEPS,
  );
  if (buildingSiteResult !== null) return buildingSiteResult;
  const machineResult = handleMachineAction(
    state,
    action,
    MACHINE_ACTION_DEPS,
  );
  if (machineResult !== null) return machineResult;
  const warehouseHotbarResult = handleWarehouseHotbarAction(
    state,
    action,
    WAREHOUSE_HOTBAR_ACTION_DEPS,
  );
  if (warehouseHotbarResult !== null) return warehouseHotbarResult;
  const manualAssemblerResult = handleManualAssemblerAction(
    state,
    action,
    MANUAL_ASSEMBLER_ACTION_DEPS,
  );
  if (manualAssemblerResult !== null) return manualAssemblerResult;
  const floorPlacementResult = handleFloorPlacementAction(
    state,
    action,
    FLOOR_PLACEMENT_ACTION_DEPS,
  );
  if (floorPlacementResult !== null) return floorPlacementResult;
  const shopResult = handleShopAction(
    state,
    action,
    SHOP_ACTION_DEPS,
  );
  if (shopResult !== null) return shopResult;
  const machineConfigResult = handleMachineConfigAction(state, action);
  if (machineConfigResult !== null) return machineConfigResult;
  const buildModeResult = handleBuildModeAction(state, action);
  if (buildModeResult !== null) return buildModeResult;
  const maintenanceResult = handleMaintenanceAction(state, action);
  if (maintenanceResult !== null) return maintenanceResult;
  const growthResult = handleGrowthAction(state, action);
  if (growthResult !== null) return growthResult;
  const hubTargetResult = handleHubTargetAction(state, action);
  if (hubTargetResult !== null) return hubTargetResult;
  const autoSmelterResult = handleAutoSmelterAction(state, action);
  if (autoSmelterResult !== null) return autoSmelterResult;
  const droneRoleResult = handleDroneRoleAction(
    state,
    action,
    DRONE_ROLE_ACTION_DEPS,
  );
  if (droneRoleResult !== null) return droneRoleResult;
  const droneTickResult = handleDroneTickAction(
    state,
    action,
    DRONE_TICK_ACTION_DEPS,
  );
  if (droneTickResult !== null) return droneTickResult;
  const droneAssignmentResult = handleDroneAssignmentAction(
    state,
    action,
    DRONE_ASSIGNMENT_ACTION_DEPS,
  );
  if (droneAssignmentResult !== null) return droneAssignmentResult;
  const clickCellResult = handleClickCellAction(
    state,
    action,
    CLICK_CELL_ACTION_DEPS,
  );
  if (clickCellResult !== null) return clickCellResult;
  switch (action.type) {
    // NETWORK_*, CRAFT_REQUEST_WITH_PREREQUISITES, JOB_*,
    // SET_KEEP_STOCK_TARGET and SET_RECIPE_AUTOMATION_POLICY are handled
    // above by handleCraftingQueueAction
    // (see action-handlers/crafting-queue-actions/index.ts).

    // CLICK_CELL is handled above by
    // handleClickCellAction (see action-handlers/click-cell.ts).

    // SET_ACTIVE_SLOT is handled above by
    // handleUiAction (see action-handlers/ui-actions.ts).

    // BUY_MAP_SHOP_ITEM is handled above by
    // handleShopAction (see action-handlers/shop.ts).

    // CRAFT_WORKBENCH, REMOVE_BUILDING, EXPIRE_NOTIFICATIONS,
    // DEBUG_SET_STATE and REMOVE_POWER_POLE are handled above by
    // handleMaintenanceAction (see action-handlers/maintenance-actions/index.ts).

    // TOGGLE_PANEL and CLOSE_PANEL are handled above by
    // handleUiAction (see action-handlers/ui-actions.ts).

    // GROW_SAPLING, GROW_SAPLINGS and NATURAL_SPAWN are handled above by
    // handleGrowthAction (see action-handlers/growth-actions/index.ts).

    case "ENERGY_NET_TICK": {
      return runEnergyNetTick(state);
    }

    // AUTO_SMELTER_SET_RECIPE is handled above by
    // handleAutoSmelterAction (see action-handlers/auto-smelter-actions/index.ts).

    // TOGGLE_BUILD_MODE, SELECT_BUILD_BUILDING and SELECT_BUILD_FLOOR_TILE
    // are handled above by handleBuildModeAction
    // (see action-handlers/build-mode-actions/index.ts).

    // BUILD_PLACE_BUILDING and BUILD_REMOVE_ASSET are handled above by
    // handleBuildingPlacementAction (see action-handlers/building-placement.ts).

    // BUILD_PLACE_FLOOR_TILE is handled above by
    // handleFloorPlacementAction (see action-handlers/floor-placement.ts).

    case "LOGISTICS_TICK": {
      return handleLogisticsTickAction(state, LOGISTICS_TICK_IO_DEPS);
    }

    // TOGGLE_ENERGY_DEBUG is handled above by
    // handleUiAction (see action-handlers/ui-actions.ts).

    // SET_MACHINE_PRIORITY and SET_MACHINE_BOOST are handled above by
    // handleMachineConfigAction (see action-handlers/machine-config.ts).

    // SET_BUILDING_SOURCE and UPGRADE_HUB are handled above by
    // handleBuildingSiteAction (see action-handlers/building-site.ts).

    // SET_KEEP_STOCK_TARGET and SET_RECIPE_AUTOMATION_POLICY are handled
    // above by handleCraftingQueueAction
    // (see action-handlers/crafting-queue-actions/index.ts).

    // CREATE_ZONE, DELETE_ZONE and SET_BUILDING_ZONE are handled above by
    // handleZoneAction (see action-handlers/zone-actions.ts).

    // SET_HUB_TARGET_STOCK is handled above by
    // handleHubTargetAction (see action-handlers/hub-target-actions/index.ts).

    // ASSIGN_DRONE_TO_HUB is handled above by
    // handleDroneAssignmentAction (see action-handlers/drone-assignment.ts).

    // DRONE_SET_ROLE is handled above by
    // handleDroneRoleAction (see action-handlers/drone-role-actions/index.ts).

    // DRONE_TICK is handled above by
    // handleDroneTickAction (see action-handlers/drone-tick-actions/index.ts).

    default:
      return state;
  }
}

/** Wraps the core reducer with dev-mode invariant assertions. */
export function gameReducerWithInvariants(state: GameState, action: GameAction): GameState {
  const next = gameReducer(state, action);
  if (import.meta.env.DEV && next !== state) {
    devAssertInventoryNonNegative("state.inventory", next.inventory);
    for (const [whId, whInv] of Object.entries(next.warehouseInventories)) {
      devAssertInventoryNonNegative(`warehouseInventories[${whId}]`, whInv);
    }
  }
  return next;
}


