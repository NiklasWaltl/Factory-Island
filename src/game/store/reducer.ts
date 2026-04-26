// ============================================================
// Factory Island - Game State & Logic
// ============================================================

import { debugLog } from "../debug/debugLogger";
import { CELL_PX, GRID_H, GRID_W } from "../constants/grid";
import {
  BUILDING_COSTS,
  BUILDING_LABELS,
  BUILDING_SIZES,
  BUILDINGS_WITH_DEFAULT_SOURCE,
  GENERATOR_MAX_FUEL,
  REQUIRES_STONE_FLOOR,
  STACKABLE_BUILDINGS,
  getBuildingInputConfig,
} from "./constants/buildings";
import { CONVEYOR_TILE_CAPACITY } from "./constants/conveyor";
import {
  getManualAssemblerRecipe,
  getWorkbenchRecipe,
  getSmeltingRecipe,
  SMELTING_RECIPES,
} from "../simulation/recipes";
import { applyNetworkAction } from "../inventory/reservations";
import {
  createEmptyNetworkSlice,
  type NetworkAction,
} from "../inventory/reservationTypes";
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
import {
  getGlobalHubWarehouseId,
  hubInventoryToInventoryView,
  inventoryViewToHubInventory,
  pickCraftingPhysicalSourceForIngredient,
  releaseJobReservations,
  tickCraftingJobs,
} from "../crafting/tick";
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
  selectDroneTask as selectDroneTaskDecision,
  type SelectDroneTaskDeps,
} from "../drones/selection/select-drone-task";
import {
  getAssignedBuildingSupplyDroneCount as getAssignedBuildingSupplyDroneCountResolver,
  getAssignedConstructionDroneCount as getAssignedConstructionDroneCountResolver,
  getAssignedWorkbenchDeliveryDroneCount as getAssignedWorkbenchDeliveryDroneCountResolver,
  getAssignedWorkbenchInputDroneCount as getAssignedWorkbenchInputDroneCountResolver,
  getInboundBuildingSupplyAmount as getInboundBuildingSupplyAmountResolver,
  getInboundConstructionAmount as getInboundConstructionAmountResolver,
  getInboundHubBuildingSupplyAmount as getInboundHubBuildingSupplyAmountResolver,
  getInboundHubDispatchAmount as getInboundHubDispatchAmountResolver,
  getInboundHubRestockAmount as getInboundHubRestockAmountResolver,
  getInboundHubRestockDroneCount as getInboundHubRestockDroneCountResolver,
  getInboundWarehouseDispatchAmount as getInboundWarehouseDispatchAmountResolver,
  getOpenBuildingSupplyDroneSlots as getOpenBuildingSupplyDroneSlotsResolver,
  getOpenConstructionDroneSlots as getOpenConstructionDroneSlotsResolver,
  getOpenHubRestockDroneSlots as getOpenHubRestockDroneSlotsResolver,
  getRemainingBuildingInputDemand as getRemainingBuildingInputDemandResolver,
  getRemainingConstructionNeed as getRemainingConstructionNeedResolver,
  getRemainingHubRestockNeed as getRemainingHubRestockNeedResolver,
  getWorkbenchJobInputAmount as getWorkbenchJobInputAmountResolver,
} from "../drones/selection/helpers/need-slot-resolvers";
import {
  tickOneDrone as tickOneDroneExecution,
  type TickOneDroneDeps,
} from "../drones/execution/tick-one-drone";
import {
  finalizeWorkbenchDelivery as finalizeWorkbenchDeliveryExecution,
  finalizeWorkbenchInputDelivery as finalizeWorkbenchInputDeliveryExecution,
  type FinalizerDeps,
} from "../drones/execution/workbench-finalizers";
import { droneTravelTicks } from "../drones/drone-movement";
import { getDroneDockOffset } from "../drones/drone-dock-geometry";
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
  type BuildingPlacementActionDeps,
} from "./action-handlers/building-placement";
import {
  handleBuildingSiteAction,
  type BuildingSiteActionDeps,
} from "./action-handlers/building-site";
import {
  handleUiCellPrelude,
  type UiCellPreludeDeps,
} from "./action-handlers/ui-cell-prelude";
import {
  handleMachineAction,
  type MachineActionDeps,
} from "./action-handlers/machine-actions";
import {
  handleClickCellToolAction,
  type ClickCellToolActionDeps,
} from "./action-handlers/click-cell-tools";
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
import {
  handleDroneAssignmentAction,
  type DroneAssignmentActionDeps,
} from "./action-handlers/drone-assignment";
import {
  handleLogisticsTickAction,
  type LogisticsTickActionDeps,
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
import { decideBuildingPlacementEligibility } from "./build-placement-eligibility";
import { decideAutoMinerPlacementEligibility } from "./build-auto-miner-placement-eligibility";
import { getDroneStatusDetail as getDroneStatusDetailClassifier } from "./drone-status-detail";
import {
  resolveDroneDropoffDecision,
  type DroneDropoffFallbackEvent,
} from "./drone-dropoff-decision";
import type {
  CraftingAction,
  CraftingInventorySource,
  CraftingJob,
} from "../crafting/types";

// ---- Core types ----------------------------------------------------------
// All shape declarations live in ./types. Imported for internal use and
// re-exported below for backward-compatible `from "../store/reducer"` consumers.
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
  GameState,
};

/** Returns true if the building with the given asset ID is still under construction. */
export function isUnderConstruction(state: Pick<GameState, "constructionSites">, assetId: string): boolean {
  return !!state.constructionSites[assetId];
}

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
// Imported for internal use and re-exported for backward compatibility.
import { ASSET_LABELS, ASSET_EMOJIS } from "./constants/assets";
export * from "./constants/assets";

// Resource display tables (labels/emojis) live in ./constants/resources.
// Imported for internal use and re-exported for backward compatibility.
import { RESOURCE_LABELS, RESOURCE_EMOJIS } from "./constants/resources";
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
// Re-exported for backward compatibility.
export * from "./constants/energy/energy-balance";

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
import {
  PROTO_HUB_TARGET_STOCK,
  SERVICE_HUB_TARGET_STOCK,
} from "./constants/hub/hub-target-stock";
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
// Imported for internal use and re-exported for backward compatibility.
import {
  DEPOSIT_POSITIONS,
  DEPOSIT_TYPES,
} from "./constants/deposit-positions";
export * from "./constants/deposit-positions";

// Map shop offer constants live in ./constants/shop.
// Imported for internal use and re-exported for backward compatibility.
import { MAP_SHOP_ITEMS } from "./constants/shop";
export * from "./constants/shop";

/** Drop amount for all 1×1 harvestable resources (tree, stone, iron, copper). */
export const RESOURCE_1x1_DROP_AMOUNT = 10;
if (import.meta.env.DEV) console.log(`[FactoryIsland] Drop-Multiplikator auf ${RESOURCE_1x1_DROP_AMOUNT}x für 1x1-Ressourcen gesetzt.`);
export const HOTBAR_SIZE = 9;
export const HOTBAR_STACK_MAX = 5;
export const WAREHOUSE_CAPACITY = 20;
export const MAX_WAREHOUSES = 2;
export const KEEP_STOCK_MAX_TARGET = 999;
export const KEEP_STOCK_OPEN_JOB_CAP = 2;

// JOB_TICK phase wiring — see crafting/tickPhases.ts for the
// architecture rule (planning vs execution split). Declared here
// because the planning deps depend on reducer-internal helpers
// (resolveBuildingSource etc.). Kept module-scoped so the JOB_TICK
// case stays a 2-line dispatcher.
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
export const DEFAULT_MACHINE_PRIORITY: MachinePriority = 3;

const POWER_CABLE_CONDUCTOR_TYPES = new Set<AssetType>([
  "cable",
  "generator",
  "power_pole",
]);

const POWER_POLE_RANGE_TYPES = new Set<AssetType>([
  "power_pole",
  "battery",
  "smithy",
  "auto_miner",
  "conveyor",
  "conveyor_corner",
  "auto_smelter",
]);

export function isPowerCableConductorType(type: AssetType): boolean {
  return POWER_CABLE_CONDUCTOR_TYPES.has(type);
}

export function isPowerPoleRangeType(type: AssetType): boolean {
  return POWER_POLE_RANGE_TYPES.has(type);
}

import { clampMachinePriority, isEnergyConsumerType } from "./machine-priority";
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

export function withDefaultMachinePriority(type: AssetType): Pick<PlacedAsset, "priority"> | {} {
  if (!isEnergyConsumerType(type)) return {};
  return { priority: DEFAULT_MACHINE_PRIORITY };
}

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
/** Maximum tiles of separation nudge applied per tick (< 1 so velocity is never reversed). */
const DRONE_SEPARATION_STRENGTH = 0.8;

// ---- Service Hub ----
/** Hard cap to prevent a single construction target from mobilizing the entire drone fleet. */
export const MAX_DRONES_PER_CONSTRUCTION_TARGET = 4;
/** Hard cap for concurrent restock trips of the same resource into one hub. */
export const MAX_DRONES_PER_HUB_RESTOCK_RESOURCE = 4;
/** Hard cap for concurrent supply trips into the same building input buffer. */
export const MAX_DRONES_PER_BUILDING_SUPPLY = 4;

/**
 * Small per-drone delivery offsets applied to construction-site targets.
 * Multiple drones delivering to the same site land at slightly different tiles.
 * These are purely cosmetic/spatial — no effect on game logic.
 */
const DELIVERY_OFFSETS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
];

/**
 * Deterministic delivery slot index for a drone, derived from its droneId.
 * Stable as long as droneId is constant (which it is — see StarterDroneState.droneId).
 */
function droneDeliverySlot(droneId: string): number {
  let h = 0;
  for (let i = 0; i < droneId.length; i++) {
    h = (h * 31 + droneId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % DELIVERY_OFFSETS.length;
}

/** Create default target stock for Tier 2 (Service-Hub). */
export function createDefaultHubTargetStock(): Record<CollectableItemType, number> {
  return { ...SERVICE_HUB_TARGET_STOCK };
}

/** Create default target stock for Tier 1 (Proto-Hub). */
export function createDefaultProtoHubTargetStock(): Record<CollectableItemType, number> {
  return { ...PROTO_HUB_TARGET_STOCK };
}

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

/** Helper: set a single drone in the drones record. */
function setDrone(drones: Record<string, StarterDroneState>, id: string, drone: StarterDroneState): Record<string, StarterDroneState> {
  return { ...drones, [id]: drone };
}

/** Keep drones record and starterDrone in sync (backward compat). */
function syncDrones(state: GameState): GameState {
  if (state.drones["starter"] === state.starterDrone) return state;
  return { ...state, drones: { ...state.drones, starter: state.starterDrone } };
}

/**
 * Write back an updated drone into state.drones[droneId].
 * Also keeps state.starterDrone in sync when droneId === "starter".
 */
function applyDroneUpdate(state: GameState, droneId: string, updated: StarterDroneState): GameState {
  const newDrones = { ...state.drones, [droneId]: updated };
  if (droneId === "starter") {
    return { ...state, drones: newDrones, starterDrone: updated };
  }
  return { ...state, drones: newDrones };
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

// ---- Construction Sites ----

/**
 * Buildings eligible for drone-based construction when a service hub exists.
 * Only includes buildings whose costs are purely CollectableItemType resources
 * and use the generic placement path.
 */
export const CONSTRUCTION_SITE_BUILDINGS = new Set<BuildingType>([
  "workbench", "warehouse", "smithy", "generator", "service_hub",
  "cable", "power_pole", "battery", "auto_miner",
  "conveyor", "conveyor_corner", "manual_assembler", "auto_smelter",
]);

/**
 * Check if all cost keys for a building type are CollectableItemType.
 * Used to validate that a construction site can be fully serviced by drones.
 */
const COLLECTABLE_KEYS = new Set<string>(["wood", "stone", "iron", "copper"]);
function costIsFullyCollectable(costs: Partial<Record<keyof Inventory, number>>): boolean {
  return Object.keys(costs).every((k) => COLLECTABLE_KEYS.has(k));
}

/** Convert building costs into a full remaining map for a new construction site. */
function fullCostAsRemaining(costs: Partial<Record<keyof Inventory, number>>): Partial<Record<CollectableItemType, number>> {
  const remaining: Partial<Record<CollectableItemType, number>> = {};
  for (const [k, v] of Object.entries(costs)) {
    if ((v ?? 0) > 0 && COLLECTABLE_KEYS.has(k)) {
      remaining[k as CollectableItemType] = v;
    }
  }
  return remaining;
}

function getInboundHubRestockAmount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundHubRestockAmountResolver(state, hubId, itemType, excludeDroneId);
}

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

function getRemainingHubRestockNeed(
  state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getRemainingHubRestockNeedResolver(state, hubId, itemType, excludeDroneId);
}

function getOpenHubRestockDroneSlots(
  state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getOpenHubRestockDroneSlotsResolver(state, hubId, itemType, excludeDroneId);
}

function getInboundHubDispatchAmount(
  state: Pick<GameState, "drones">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundHubDispatchAmountResolver(state, hubId, itemType, excludeDroneId);
}

function getAvailableHubDispatchSupply(
  state: Pick<GameState, "drones" | "serviceHubs">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  const hubEntry = state.serviceHubs[hubId];
  if (!hubEntry) return 0;
  const current = hubEntry.inventory[itemType] ?? 0;
  const inbound = getInboundHubDispatchAmount(state, hubId, itemType, excludeDroneId);
  // Building_supply trips that pull from the same hub also reduce what's left for hub_dispatch.
  const inboundBuildingFromHub = getInboundHubBuildingSupplyAmount(state, hubId, itemType, excludeDroneId);
  return Math.max(0, current - inbound - inboundBuildingFromHub);
}

// ---------------------------------------------------------------------------
// Warehouse-as-pickup-source helpers (warehouse > hub priority).
// Mirror the hub-dispatch model: synthetic targetNodeId "wh:{whId}:{item}",
// inbound counting throttles per-warehouse availability. We deliberately do
// NOT subtract crafting reservations here — symmetric to the existing hub
// path, which also ignores them. If a craft commit later races and finds
// short stock, the existing reservation system handles it.
// ---------------------------------------------------------------------------

/** Counts in-flight drone trips heading to a specific warehouse for `itemType`,
 *  across both hub_dispatch and building_supply task types. */
function getInboundWarehouseDispatchAmount(
  state: Pick<GameState, "drones">,
  warehouseId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundWarehouseDispatchAmountResolver(state, warehouseId, itemType, excludeDroneId);
}

function getAvailableWarehouseDispatchSupply(
  state: Pick<GameState, "drones" | "warehouseInventories">,
  warehouseId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  const inv = state.warehouseInventories[warehouseId];
  if (!inv) return 0;
  const current = (inv as unknown as Record<string, number>)[itemType] ?? 0;
  if (current <= 0) return 0;
  const inbound = getInboundWarehouseDispatchAmount(state, warehouseId, itemType, excludeDroneId);
  return Math.max(0, current - inbound);
}

interface NearbyWarehouseDispatchCandidate {
  readonly warehouseId: string;
  readonly x: number;
  readonly y: number;
  readonly available: number;
  readonly distance: number;
}

/** Returns the closest (Chebyshev) warehouses with any free dispatch supply
 *  for `itemType`, sorted ascending by distance, capped to DRONE_NEARBY_WAREHOUSE_LIMIT.
 *  Skips warehouses that are still under construction. */
function getNearbyWarehousesForDispatch(
  state: GameState,
  fromX: number,
  fromY: number,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): NearbyWarehouseDispatchCandidate[] {
  const out: NearbyWarehouseDispatchCandidate[] = [];
  for (const whId in state.warehouseInventories) {
    const whAsset = state.assets[whId];
    if (!whAsset || whAsset.type !== "warehouse") continue;
    if (isUnderConstruction(state, whId)) continue;
    const available = getAvailableWarehouseDispatchSupply(state, whId, itemType, excludeDroneId);
    if (available <= 0) continue;
    const distance = Math.max(Math.abs(fromX - whAsset.x), Math.abs(fromY - whAsset.y));
    out.push({ warehouseId: whId, x: whAsset.x, y: whAsset.y, available, distance });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out.slice(0, DRONE_NEARBY_WAREHOUSE_LIMIT);
}

function getInboundConstructionAmount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  siteId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundConstructionAmountResolver(state, siteId, itemType, excludeDroneId);
}

function getAssignedConstructionDroneCount(
  state: Pick<GameState, "drones">,
  siteId: string,
  excludeDroneId?: string,
): number {
  return getAssignedConstructionDroneCountResolver(state, siteId, excludeDroneId);
}

function getRemainingConstructionNeed(
  state: Pick<GameState, "drones" | "collectionNodes" | "constructionSites">,
  siteId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getRemainingConstructionNeedResolver(state, siteId, itemType, excludeDroneId);
}

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
export function getBuildingInputTargets(
  state: Pick<GameState, "assets">,
): { assetId: string; resource: CollectableItemType; capacity: number }[] {
  const out: { assetId: string; resource: CollectableItemType; capacity: number }[] = [];
  for (const asset of Object.values(state.assets)) {
    const cfg = getBuildingInputConfig(asset.type);
    if (!cfg) continue;
    out.push({ assetId: asset.id, resource: cfg.resource, capacity: cfg.capacity });
  }
  return out;
}

/** Counts in-flight building_supply cargo + reservations + hub-bound trips heading into `assetId`. */
export function getInboundBuildingSupplyAmount(
  state: Pick<GameState, "drones" | "collectionNodes">,
  assetId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundBuildingSupplyAmountResolver(state, assetId, itemType, excludeDroneId);
}

/** Counts in-flight building_supply trips that withdraw `itemType` from a specific hub. */
function getInboundHubBuildingSupplyAmount(
  state: Pick<GameState, "drones">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getInboundHubBuildingSupplyAmountResolver(state, hubId, itemType, excludeDroneId);
}

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

function getAssignedBuildingSupplyDroneCount(
  state: Pick<GameState, "drones">,
  assetId: string,
  excludeDroneId?: string,
): number {
  return getAssignedBuildingSupplyDroneCountResolver(state, assetId, excludeDroneId);
}

function getOpenBuildingSupplyDroneSlots(
  state: Pick<GameState, "assets" | "generators" | "drones">,
  assetId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  return getOpenBuildingSupplyDroneSlotsResolver(state, assetId, itemType, excludeDroneId);
}

function getAssignedWorkbenchDeliveryDroneCount(
  state: Pick<GameState, "drones">,
  jobId: string,
  excludeDroneId?: string,
): number {
  return getAssignedWorkbenchDeliveryDroneCountResolver(state, jobId, excludeDroneId);
}

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
const selectDroneTaskDeps: SelectDroneTaskDeps = {
  getAvailableHubDispatchSupply,
  getNearbyWarehousesForDispatch,
  getBuildingInputTargets,
  isUnderConstruction,
  hasCompleteWorkbenchInput,
  isCollectableCraftingItem,
  resolveWorkbenchInputPickup,
};

export function selectDroneTask(state: GameState, droneOverride?: StarterDroneState): {
  taskType: DroneTaskType;
  nodeId: string;
  deliveryTargetId: string;
} | null {
  return selectDroneTaskDecision(state, droneOverride, selectDroneTaskDeps);
}

export const AUTO_SMELTER_BUFFER_CAPACITY = 5;

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

/** Maps deposit asset type to the resource it produces */
export const DEPOSIT_RESOURCE: Record<string, "stone" | "iron" | "copper"> = {
  stone_deposit: "stone",
  iron_deposit: "iron",
  copper_deposit: "copper",
};

// ---- Battery ----
/** Maximum energy stored in a battery (J) */
export const BATTERY_CAPACITY = 1000;

// ---- Power Pole ----
/** Chebyshev range (cells) in which a power_pole connects to neighbouring conductors */
export const POWER_POLE_RANGE = 3;

export function createEmptyInventory(): Inventory {
  return {
    coins: 0,
    wood: 0,
    stone: 0,
    iron: 0,
    copper: 0,
    sapling: 0,
    ironIngot: 0,
    copperIngot: 0,
    metalPlate: 0,
    gear: 0,
    axe: 0,
    wood_pickaxe: 0,
    stone_pickaxe: 0,
    workbench: 0,
    warehouse: 0,
    smithy: 0,
    generator: 0,
    cable: 0,
    battery: 0,
    power_pole: 0,
    manual_assembler: 0,
    auto_smelter: 0,
  };
}

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

/** Read the available amount of a single resource from the global pool. */
export function getAvailableResource(state: { inventory: Inventory }, key: keyof Inventory): number {
  return state.inventory[key] as number;
}

/** Check whether the global inventory can cover all of `costs`. */
export function hasResources(inv: Inventory, costs: Partial<Record<keyof Inventory, number>>): boolean {
  for (const [key, amt] of Object.entries(costs)) {
    if (((inv as unknown as Record<string, number>)[key] ?? 0) < (amt ?? 0)) return false;
  }
  return true;
}

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

/** Return a new Inventory with `items` added. */
export function addResources(inv: Inventory, items: Partial<Record<keyof Inventory, number>>): Inventory {
  const result = { ...inv } as Record<string, number>;
  for (const [key, amt] of Object.entries(items)) {
    result[key] = (result[key] ?? 0) + (amt ?? 0);
  }
  return result as unknown as Inventory;
}

/**
 * Phase-1 derived "global inventory" view.
 *
 * SOURCE OF TRUTH for physical resources is now `warehouseInventories` and
 * `serviceHubs[id].inventory`. `state.inventory` continues to back items that
 * have no physical home (coins, tools, building counters, ingots in flight),
 * but for any resource key that *also* lives in a warehouse or hub, this view
 * is the truthful, summed read-only projection.
 *
 * USE THIS for: HUD display, build-/craft-affordance UI, debug overlays.
 * DO NOT mutate the result — write to the underlying physical stores instead.
 *
 * Identical aggregation rule as `getEffectiveBuildInventory` (kept as alias for
 * the existing reducer call sites). Hubs only contribute COLLECTABLE_KEYS.
 */
export function selectGlobalInventoryView(state: GameState): Inventory {
  return getEffectiveBuildInventory(state);
}

/**
 * UI-only build-menu view.
 *
 * Counts only resources that can directly feed the construction flow today:
 *   1. service hub inventories
 *   2. world-bound collection nodes (manual harvest drops)
 *
 * Warehouses and `state.inventory` are intentionally excluded so the build UI
 * reflects construction-accessible stock instead of broad storage totals.
 */
export function selectBuildMenuInventoryView(
  state: Pick<GameState, "serviceHubs" | "collectionNodes">,
): Inventory {
  const effective = createEmptyInventory();

  for (const hub of Object.values(state.serviceHubs)) {
    for (const res of COLLECTABLE_KEYS) {
      const key = res as CollectableItemType;
      effective[key] = (effective[key] as number) + (hub.inventory[key] ?? 0);
    }
  }

  for (const node of Object.values(state.collectionNodes)) {
    if (node.amount <= 0) continue;
    effective[node.itemType] = (effective[node.itemType] as number) + node.amount;
  }

  return effective;
}

/**
 * Aggregate global inventory + all warehouseInventories + all service hub inventories
 * for build-cost checks. Only CollectableItemType keys (wood, stone, iron, copper) are
 * summed from hubs; warehouses contribute every key they hold.
 */
export function getEffectiveBuildInventory(state: GameState): Inventory {
  const effective = { ...state.inventory } as Record<string, number>;
  for (const whInv of Object.values(state.warehouseInventories)) {
    for (const [key, amt] of Object.entries(whInv)) {
      effective[key] = (effective[key] ?? 0) + ((amt as number) ?? 0);
    }
  }
  for (const hub of Object.values(state.serviceHubs)) {
    for (const res of COLLECTABLE_KEYS) {
      effective[res] = (effective[res] ?? 0) + (hub.inventory[res as CollectableItemType] ?? 0);
    }
  }
  return effective as unknown as Inventory;
}

/**
 * Consume costs from physical stores (warehouses → hubs), then fall back to
 * `state.inventory` only for keys with no physical home (coins, tools, …).
 *
 * Phase-1 priority intentionally:
 *   1. Warehouses (any key)
 *   2. Service hubs (only COLLECTABLE_KEYS)
 *   3. state.inventory (last-resort fallback for non-physical items)
 *
 * Used internally by build-cost paths. Callers must guarantee affordability
 * via `getEffectiveBuildInventory + hasResources` BEFORE calling — this
 * function may otherwise leave `remaining > 0` and partially deduct.
 * For callers that need an all-or-nothing transaction, use
 * `consumeFromPhysicalStorage` instead.
 *
 * Returns updated inventory, warehouseInventories, serviceHubs, and the
 * remaining unfulfilled cost.
 */
function consumeBuildResources(
  state: GameState,
  costs: Partial<Record<keyof Inventory, number>>,
): {
  inventory: Inventory;
  warehouseInventories: Record<string, Inventory>;
  serviceHubs: Record<string, ServiceHubEntry>;
  remaining: Partial<Record<CollectableItemType, number>>;
} {
  const inv = { ...state.inventory } as Record<string, number>;
  let warehouses = state.warehouseInventories;
  let hubs = state.serviceHubs;
  const remaining: Partial<Record<CollectableItemType, number>> = {};
  for (const [key, amt] of Object.entries(costs)) {
    let needed = amt ?? 0;
    if (needed <= 0) continue;
    // 1) Warehouses first (any key they happen to hold).
    for (const [whId, whInv] of Object.entries(warehouses)) {
      if (needed <= 0) break;
      const whHave = ((whInv as unknown as Record<string, number>)[key] ?? 0);
      const fromWh = Math.min(whHave, needed);
      if (fromWh > 0) {
        warehouses = {
          ...warehouses,
          [whId]: { ...whInv, [key]: whHave - fromWh } as Inventory,
        };
        needed -= fromWh;
      }
    }
    // 2) Then hubs (only collectable resource types).
    if (needed > 0 && COLLECTABLE_KEYS.has(key)) {
      for (const [hubId, hub] of Object.entries(hubs)) {
        if (needed <= 0) break;
        const hubHave = hub.inventory[key as CollectableItemType] ?? 0;
        const fromHub = Math.min(hubHave, needed);
        if (fromHub > 0) {
          hubs = {
            ...hubs,
            [hubId]: {
              ...hub,
              inventory: { ...hub.inventory, [key]: hubHave - fromHub },
            },
          };
          needed -= fromHub;
        }
      }
    }
    // 3) Last-resort fallback: global inventory (e.g. coins, items without
    // a physical home, or pre-Phase-1 saves where stocks still live globally).
    if (needed > 0) {
      const globalHave = inv[key] ?? 0;
      const fromGlobal = Math.min(globalHave, needed);
      inv[key] = globalHave - fromGlobal;
      needed -= fromGlobal;
    }
    if (needed > 0) {
      remaining[key as CollectableItemType] = needed;
    }
  }
  return {
    inventory: inv as unknown as Inventory,
    warehouseInventories: warehouses,
    serviceHubs: hubs,
    remaining,
  };
}

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
// Determines where a crafting device reads/writes resources.
// - "global": uses state.inventory (default, backward-compatible)
// - "warehouse": uses a specific warehouseInventories[id]
//
// The resolver validates the assignment on every call: if the
// warehouse was removed or its inventory is missing, the
// device silently falls back to global.
// ============================================================

export type CraftingSource =
  | { kind: "global" }
  | { kind: "warehouse"; warehouseId: string }
  | { kind: "zone"; zoneId: string };

/** A production zone groups warehouses and crafting buildings into a shared local resource pool. */
export interface ProductionZone {
  id: string;
  name: string;
}

/** Maximum number of production zones a player can create. */
export const MAX_ZONES = 8;

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

// Backward-compatible aliases (used by existing workbench code & tests)
/** @deprecated Use CraftingSource */
export type WorkbenchSource = CraftingSource;

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

export type FallbackReason =
  | "none"                  // source is primary (zone or explicitly set)
  | "zone_no_warehouses"    // building has a zone, but zone has no warehouses
  | "no_zone"               // building has no zone assignment
  | "stale_warehouse"       // legacy warehouse mapping points to deleted warehouse
  | "no_assignment";        // no zone and no legacy mapping

export interface SourceStatusInfo {
  /** The resolved source used for crafting. */
  source: CraftingSource;
  /** Human-readable label for the active source (e.g. "Zone 1 (2 Lagerhäuser)"). */
  sourceLabel: string;
  /** Why this source was chosen — helpful when source is a fallback. */
  fallbackReason: FallbackReason;
  /** Short human-readable explanation of why this source is active. */
  reasonLabel: string;
  /** Zone ID if building is assigned to a zone (even if zone is empty). */
  assignedZoneId: string | null;
  /** Zone name if assigned. */
  assignedZoneName: string | null;
  /** Warehouse IDs in the active zone (empty if not zone source). */
  zoneWarehouseIds: string[];
  /** Building IDs (non-warehouse) in the active zone. */
  zoneBuildingIds: string[];
  /** Legacy warehouse ID from buildingSourceWarehouseIds (may be stale). */
  legacyWarehouseId: string | null;
  /** Whether the legacy warehouse mapping is stale (points to deleted warehouse). */
  isStale: boolean;
}

/**
 * Compute full source status diagnosis for a building.
 * Pure function — used by UI panels for transparency and debug info.
 */
export function getSourceStatusInfo(state: GameState, buildingId: string | null): SourceStatusInfo {
  const source = resolveBuildingSource(state, buildingId);
  const assignedZoneId = buildingId ? (state.buildingZoneIds[buildingId] ?? null) : null;
  const assignedZoneName = assignedZoneId ? (state.productionZones[assignedZoneId]?.name ?? null) : null;
  const legacyWhId = buildingId ? (state.buildingSourceWarehouseIds[buildingId] ?? null) : null;
  const isStale = hasStaleWarehouseAssignment(state, buildingId);

  let fallbackReason: FallbackReason = "none";
  let sourceLabel: string;
  let reasonLabel: string;
  let zoneWarehouseIds: string[] = [];
  let zoneBuildingIds: string[] = [];

  if (source.kind === "zone") {
    zoneWarehouseIds = getZoneWarehouseIds(state, source.zoneId);
    zoneBuildingIds = getZoneBuildingIds(state, source.zoneId);
    const zoneName = state.productionZones[source.zoneId]?.name ?? source.zoneId;
    sourceLabel = `${zoneName} (${zoneWarehouseIds.length} Lagerhaus${zoneWarehouseIds.length !== 1 ? "\u00e4user" : ""})`;
    reasonLabel = "Zone aktiv";
  } else if (source.kind === "warehouse") {
    const whIdx = Object.keys(state.warehouseInventories).indexOf(source.warehouseId) + 1;
    sourceLabel = `Lagerhaus ${whIdx || "?"}`;
    if (assignedZoneId && state.productionZones[assignedZoneId]) {
      fallbackReason = "zone_no_warehouses";
      reasonLabel = "Zone hat keine Lagerhäuser — Einzelzuweisung aktiv";
    } else {
      fallbackReason = "no_zone";
      reasonLabel = "Keine Zone — Einzelzuweisung aktiv";
    }
  } else {
    // global
    sourceLabel = "Globaler Puffer";
    if (assignedZoneId && state.productionZones[assignedZoneId]) {
      const zwhIds = getZoneWarehouseIds(state, assignedZoneId);
      if (zwhIds.length === 0) {
        fallbackReason = "zone_no_warehouses";
        reasonLabel = "Zone hat keine Lagerhäuser — Fallback: Globaler Puffer";
      } else {
        fallbackReason = "none";
        reasonLabel = "Globaler Puffer";
      }
    } else if (isStale) {
      fallbackReason = "stale_warehouse";
      reasonLabel = "Zugewiesenes Lagerhaus entfernt — Fallback: Globaler Puffer";
    } else if (legacyWhId) {
      fallbackReason = "stale_warehouse";
      reasonLabel = "Ungültige Lagerhauszuweisung — Fallback: Globaler Puffer";
    } else {
      fallbackReason = "no_assignment";
      reasonLabel = "Keine Zone oder Lagerhaus zugewiesen";
    }
  }

  return {
    source,
    sourceLabel,
    fallbackReason,
    reasonLabel,
    assignedZoneId,
    assignedZoneName,
    zoneWarehouseIds,
    zoneBuildingIds,
    legacyWarehouseId: legacyWhId,
    isStale,
  };
}

export const MAP_SHOP_POS = { x: Math.floor(GRID_W / 2) - 1, y: Math.floor(GRID_H / 2) - 1 };

/**
 * Manhattan distance between two grid positions.
 */
export function manhattanDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Returns true if a building has a warehouse mapping that no longer resolves
 * to a valid warehouse (stale reference). Used by panels to show a hint.
 */
export function hasStaleWarehouseAssignment(state: GameState, buildingId: string | null): boolean {
  if (!buildingId) return false;
  const whId = state.buildingSourceWarehouseIds[buildingId];
  if (!whId) return false;
  return !state.assets[whId] || !state.warehouseInventories[whId];
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
 * Move a drone one step toward (toX, toY) by up to `maxStep` tiles (Chebyshev).
 * Returns the new position. Snaps to target when within range.
 */
function moveDroneToward(
  fromX: number, fromY: number,
  toX: number, toY: number,
  maxStep: number,
): { x: number; y: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (dist <= maxStep) return { x: toX, y: toY };
  const ratio = maxStep / dist;
  return {
    x: Math.round(fromX + dx * ratio),
    y: Math.round(fromY + dy * ratio),
  };
}

/**
 * Apply a lightweight local separation nudge to a drone's computed next
 * position so nearby drones don't pixel-stack.
 *
 * Design rules:
 *   1. Skipped when the drone is in its arrival zone (dist to target ≤
 *      DRONE_SPEED_TILES_PER_TICK). This prevents oscillation at the
 *      destination because the arrival snap (rem === 0 branch) always
 *      overrides the nudge anyway, and we don't want to fight it in the
 *      penultimate tick.
 *   2. The nudge magnitude is bounded by DRONE_SEPARATION_STRENGTH (<1 tile)
 *      so it can never fully reverse the velocity vector.
 *   3. The result is clamped to valid grid bounds.
 *   4. Deterministic tie-break via droneId string comparison when two drones
 *      share the same tile or axis.
 */
function nudgeAwayFromDrones(
  nextX: number,
  nextY: number,
  toX: number,
  toY: number,
  allDrones: Record<string, StarterDroneState>,
  selfId: string,
): { x: number; y: number } {
  // Rule 1: skip the nudge inside the arrival zone to prevent oscillation.
  const distToTarget = Math.max(Math.abs(toX - nextX), Math.abs(toY - nextY));
  if (distToTarget <= DRONE_SPEED_TILES_PER_TICK) return { x: nextX, y: nextY };

  let nudgeX = 0;
  let nudgeY = 0;

  for (const [id, other] of Object.entries(allDrones)) {
    if (id === selfId) continue;
    const dx = nextX - other.tileX;
    const dy = nextY - other.tileY;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d > DRONE_SEPARATION_RADIUS) continue;
    // Linear falloff: full strength at d=0, zero at d=DRONE_SEPARATION_RADIUS.
    const strength = (DRONE_SEPARATION_RADIUS - d) / DRONE_SEPARATION_RADIUS;
    // Deterministic tie-break when on the same axis or same tile.
    nudgeX += Math.abs(dx) > 0 ? dx * strength : (selfId > id ? 0.5 : -0.5) * strength;
    nudgeY += Math.abs(dy) > 0 ? dy * strength : (selfId > id ? 0.5 : -0.5) * strength;
  }

  if (nudgeX === 0 && nudgeY === 0) return { x: nextX, y: nextY };

  // Rule 2: scale so the largest component equals DRONE_SEPARATION_STRENGTH.
  const mag = Math.max(Math.abs(nudgeX), Math.abs(nudgeY));
  const scale = DRONE_SEPARATION_STRENGTH / mag;
  // Rule 3: clamp to grid bounds.
  const nx = Math.max(0, Math.min(GRID_W - 1, Math.round(nextX + nudgeX * scale)));
  const ny = Math.max(0, Math.min(GRID_H - 1, Math.round(nextY + nudgeY * scale)));
  return { x: nx, y: ny };
}

function getCraftingJobById(
  crafting: Pick<GameState, "crafting">["crafting"],
  jobId: string | null,
): CraftingJob | null {
  if (!jobId) return null;
  return crafting.jobs.find((job) => job.id === jobId) ?? null;
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

function isCollectableCraftingItem(
  itemId: CraftingJob["ingredients"][number]["itemId"],
): itemId is CollectableItemType {
  return itemId === "wood" || itemId === "stone" || itemId === "iron" || itemId === "copper";
}

function getWorkbenchJobInputAmount(
  job: CraftingJob,
  itemId: CraftingJob["ingredients"][number]["itemId"],
): number {
  return getWorkbenchJobInputAmountResolver(job, itemId);
}

function hasCompleteWorkbenchInput(job: CraftingJob): boolean {
  return job.ingredients.every(
    (ingredient) => getWorkbenchJobInputAmount(job, ingredient.itemId) >= ingredient.count,
  );
}

function addWorkbenchInputToJob(
  job: CraftingJob,
  stack: CraftingJob["ingredients"][number],
): CraftingJob {
  const existing = job.inputBuffer ?? [];
  let merged = false;
  const nextBuffer = existing.map((entry) => {
    if (entry.itemId !== stack.itemId) return entry;
    merged = true;
    return { ...entry, count: entry.count + stack.count };
  });

  return {
    ...job,
    inputBuffer: merged ? nextBuffer : [...existing, stack],
  };
}

function getCraftingReservationById(
  network: Pick<GameState, "network">["network"],
  reservationId: string,
) {
  return network.reservations.find((reservation) => reservation.id === reservationId) ?? null;
}

function resolveWorkbenchInputPickup(
  state: Pick<GameState, "assets" | "warehouseInventories" | "serviceHubs" | "network">,
  job: CraftingJob,
  reservation: {
    id: string;
    itemId: CraftingJob["ingredients"][number]["itemId"];
    amount: number;
  },
): { x: number; y: number; sourceKind: "warehouse" | "hub"; sourceId: string } | null {
  if (job.inventorySource.kind === "global") return null;
  const decision = pickCraftingPhysicalSourceForIngredient({
    source: job.inventorySource,
    itemId: reservation.itemId,
    required: reservation.amount,
    warehouseInventories: state.warehouseInventories,
    serviceHubs: state.serviceHubs,
    network: state.network,
    assets: state.assets,
    preferredFromAssetId: job.workbenchId,
    // This reservation is the very item we are about to pick up, so it must
    // not block its own source decision.
    excludeReservationId: reservation.id,
  });
  if (!decision.source) return null;
  const sourceId = decision.source.kind === "warehouse"
    ? decision.source.warehouseId
    : decision.source.hubId;
  const asset = state.assets[sourceId];
  if (!asset) return null;
  return {
    x: asset.x,
    y: asset.y,
    sourceKind: decision.source.kind,
    sourceId,
  };
}

function commitWorkbenchInputReservation(
  state: GameState,
  job: CraftingJob,
  reservationId: string,
): {
  nextState: GameState;
  itemType: CollectableItemType;
  amount: number;
  sourceKind: "warehouse" | "hub";
  sourceId: string;
} | null {
  const reservation = getCraftingReservationById(state.network, reservationId);
  if (!reservation) return null;
  if (reservation.ownerKind !== "crafting_job" || reservation.ownerId !== job.reservationOwnerId) return null;
  if (!isCollectableCraftingItem(reservation.itemId)) return null;
  if (job.inventorySource.kind === "global") return null;

  const decision = pickCraftingPhysicalSourceForIngredient({
    source: job.inventorySource,
    itemId: reservation.itemId,
    required: reservation.amount,
    warehouseInventories: state.warehouseInventories,
    serviceHubs: state.serviceHubs,
    network: state.network,
    assets: state.assets,
    preferredFromAssetId: job.workbenchId,
    // This reservation should not consume its own free-budget during commit.
    excludeReservationId: reservation.id,
  });
  if (!decision.source) return null;

  if (decision.source.kind === "warehouse") {
    const warehouseId = decision.source.warehouseId;
    const warehouseInventory = state.warehouseInventories[warehouseId];
    if (!warehouseInventory) return null;
    const beforeAmount = (warehouseInventory as unknown as Record<string, number>)[reservation.itemId] ?? 0;
    const scoped = { [warehouseId]: warehouseInventory };
    const result = applyNetworkAction(scoped, state.network, {
      type: "NETWORK_COMMIT_RESERVATION",
      reservationId,
    });
    if (result.network.lastError) return null;
    if (import.meta.env.DEV) {
      const afterInventory = result.warehouseInventories[warehouseId] ?? warehouseInventory;
      const afterAmount = (afterInventory as unknown as Record<string, number>)[reservation.itemId] ?? 0;
      if (beforeAmount - afterAmount !== reservation.amount) {
        throw new Error(
          `[workbench] Invariant violated: commit ${reservation.id} debited ${beforeAmount - afterAmount} ` +
            `of ${reservation.itemId}, expected ${reservation.amount}.`,
        );
      }
      if (result.network.reservations.some((entry) => entry.id === reservation.id)) {
        throw new Error(
          `[workbench] Invariant violated: reservation ${reservation.id} still present after commit.`,
        );
      }
    }
    return {
      nextState: {
        ...state,
        warehouseInventories: {
          ...state.warehouseInventories,
          ...result.warehouseInventories,
        },
        network: result.network,
      },
      itemType: reservation.itemId,
      amount: reservation.amount,
      sourceKind: "warehouse",
      sourceId: warehouseId,
    };
  }

  const hubId = decision.source.hubId;
  const hubEntry = state.serviceHubs[hubId];
  if (!hubEntry) return null;
  const pseudoWarehouseId = getGlobalHubWarehouseId(hubId);
  const scoped: Record<string, Inventory> = {
    [pseudoWarehouseId]: hubInventoryToInventoryView(hubEntry.inventory),
  };
  const beforeAmount = (scoped[pseudoWarehouseId] as unknown as Record<string, number>)[reservation.itemId] ?? 0;
  const result = applyNetworkAction(scoped, state.network, {
    type: "NETWORK_COMMIT_RESERVATION",
    reservationId,
  });
  if (result.network.lastError) return null;
  const committedHubView = result.warehouseInventories[pseudoWarehouseId] ?? scoped[pseudoWarehouseId];
  if (import.meta.env.DEV) {
    const afterAmount = (committedHubView as unknown as Record<string, number>)[reservation.itemId] ?? 0;
    if (beforeAmount - afterAmount !== reservation.amount) {
      throw new Error(
        `[workbench] Invariant violated: hub commit ${reservation.id} debited ${beforeAmount - afterAmount} ` +
          `of ${reservation.itemId}, expected ${reservation.amount}.`,
      );
    }
    if (result.network.reservations.some((entry) => entry.id === reservation.id)) {
      throw new Error(
        `[workbench] Invariant violated: reservation ${reservation.id} still present after hub commit.`,
      );
    }
  }
  const nextHubInventory = inventoryViewToHubInventory(hubEntry.inventory, committedHubView);
  return {
    nextState: {
      ...state,
      serviceHubs: {
        ...state.serviceHubs,
        [hubId]: {
          ...hubEntry,
          inventory: nextHubInventory,
        },
      },
      network: result.network,
    },
    itemType: reservation.itemId,
    amount: reservation.amount,
    sourceKind: "hub",
    sourceId: hubId,
  };
}

function logDroneDropoffFallbackEvent(event: DroneDropoffFallbackEvent): void {
  if (event.kind === "construction_site_missing") {
    debugLog.inventory(`[Drone] Construction site asset ${event.targetId} gone — falling back`);
    return;
  }

  if (event.kind === "building_target_missing") {
    debugLog.inventory(`[Drone] Building input target ${event.targetId} gone — falling back`);
    return;
  }

  debugLog.inventory(`[Drone] Hub asset ${event.targetId} gone — falling back to start module`);
}

/**
 * Resolve the dropoff position for a drone based on its current task.
 *
 * - construction_supply → construction site asset position + per-drone delivery offset
 * - workbench_delivery → resolved storage destination for the finished job
 * - hub_restock → hub dock slot position derived from the hub's droneIds order
 * - fallback (no hub) → MAP_SHOP_POS
 *
 * The `serviceHubs` parameter enables per-drone dock-slot targeting for hub restock.
 * Omitting it falls back to the hub top-left corner (safe for legacy / tests).
 */
function resolveDroneDropoff(
  drone: StarterDroneState,
  assets: Record<string, PlacedAsset>,
  serviceHubs?: Record<string, ServiceHubEntry>,
  warehouseInventories?: Record<string, Inventory>,
  crafting?: Pick<GameState, "crafting">["crafting"],
): { x: number; y: number } {
  const decision = resolveDroneDropoffDecision({
    drone,
    assets,
    serviceHubs,
    warehouseInventories,
    crafting,
    mapShopPos: MAP_SHOP_POS,
    getDeliveryOffset: (droneId) => DELIVERY_OFFSETS[droneDeliverySlot(droneId)],
    getDroneHomeDock,
  });

  for (const fallbackEvent of decision.fallbackEvents ?? []) {
    logDroneDropoffFallbackEvent(fallbackEvent);
  }

  return { x: decision.x, y: decision.y };
}

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

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Returns [dx, dy] offset for a direction. */
export function directionOffset(dir: Direction): [number, number] {
  switch (dir) {
    case "north": return [0, -1];
    case "south": return [0, 1];
    case "east": return [1, 0];
    case "west": return [-1, 0];
  }
}

export function assetWidth(asset: PlacedAsset): number {
  return asset.width ?? asset.size;
}

export function assetHeight(asset: PlacedAsset): number {
  return asset.height ?? asset.size;
}

export function getAutoSmelterIoCells(asset: PlacedAsset): { input: { x: number; y: number }; output: { x: number; y: number } } {
  const dir = asset.direction ?? "east";
  const w = assetWidth(asset);
  const h = assetHeight(asset);
  switch (dir) {
    case "east":
      return { input: { x: asset.x - 1, y: asset.y }, output: { x: asset.x + w, y: asset.y } };
    case "west":
      return { input: { x: asset.x + w, y: asset.y }, output: { x: asset.x - 1, y: asset.y } };
    case "north":
      return { input: { x: asset.x, y: asset.y + h }, output: { x: asset.x, y: asset.y - 1 } };
    case "south":
      return { input: { x: asset.x, y: asset.y - 1 }, output: { x: asset.x, y: asset.y + h } };
  }
}

/**
 * Returns the input tile position and the required conveyor direction for a warehouse,
 * based on its `direction` field. Default direction is "south" (input below bottom-left
 * cell, conveyor must face "north") — preserving backward-compatible behavior.
 */
export function getWarehouseInputCell(warehouse: {
  x: number;
  y: number;
  size: 1 | 2;
  width?: 1 | 2;
  height?: 1 | 2;
  direction?: Direction;
}): { x: number; y: number; requiredDir: Direction } {
  const dir = warehouse.direction ?? "south";
  const w = warehouse.width ?? warehouse.size;
  const h = warehouse.height ?? warehouse.size;
  switch (dir) {
    case "south": return { x: warehouse.x,     y: warehouse.y + h, requiredDir: "north" };
    case "north": return { x: warehouse.x,     y: warehouse.y - 1, requiredDir: "south" };
    case "east":  return { x: warehouse.x + w, y: warehouse.y,     requiredDir: "west"  };
    case "west":  return { x: warehouse.x - 1, y: warehouse.y,     requiredDir: "east"  };
  }
}

/**
 * The warehouse has exactly one input tile whose position depends on the warehouse's
 * `direction` (defaults to "south" — directly below bottom-left cell).
 * Only a conveyor/miner at the correct tile and facing the required direction may feed items in.
 */
export function isValidWarehouseInput(
  entityX: number,
  entityY: number,
  entityDir: Direction,
  warehouse: PlacedAsset
): boolean {
  const { x, y, requiredDir } = getWarehouseInputCell(warehouse);
  return entityDir === requiredDir && entityX === x && entityY === y;
}

function hasNearbyAsset(
  cellMap: Record<string, string>,
  x: number,
  y: number
): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (cellMap[cellKey(x + dx, y + dy)]) return true;
    }
  }
  return false;
}

function removeAsset(
  state: GameState,
  assetId: string
): Pick<GameState, "assets" | "cellMap" | "saplingGrowAt"> {
  const asset = state.assets[assetId];
  if (asset.fixed) return { assets: state.assets, cellMap: state.cellMap, saplingGrowAt: state.saplingGrowAt };
  const newAssets = { ...state.assets };
  delete newAssets[assetId];
  const newCellMap = { ...state.cellMap };
  for (let dy = 0; dy < assetHeight(asset); dy++) {
    for (let dx = 0; dx < assetWidth(asset); dx++) {
      delete newCellMap[cellKey(asset.x + dx, asset.y + dy)];
    }
  }
  const newGrow = { ...state.saplingGrowAt };
  delete newGrow[assetId];
  return { assets: newAssets, cellMap: newCellMap, saplingGrowAt: newGrow };
}

function areConveyorItemsEqual(a: ConveyorItem[], b: ConveyorItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areNumberArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areAutoSmelterEntriesEqual(a: AutoSmelterEntry, b: AutoSmelterEntry): boolean {
  const aProc = a.processing;
  const bProc = b.processing;
  const sameProcessing =
    aProc === bProc ||
    (!!aProc &&
      !!bProc &&
      aProc.inputItem === bProc.inputItem &&
      aProc.outputItem === bProc.outputItem &&
      aProc.progressMs === bProc.progressMs &&
      aProc.durationMs === bProc.durationMs);

  return (
    sameProcessing &&
    a.status === b.status &&
    a.lastRecipeInput === b.lastRecipeInput &&
    a.lastRecipeOutput === b.lastRecipeOutput &&
    a.selectedRecipe === b.selectedRecipe &&
    areConveyorItemsEqual(a.inputBuffer, b.inputBuffer) &&
    areConveyorItemsEqual(a.pendingOutput, b.pendingOutput) &&
    areNumberArraysEqual(a.throughputEvents, b.throughputEvents)
  );
}

export function placeAsset(
  assets: Record<string, PlacedAsset>,
  cellMap: Record<string, string>,
  type: AssetType,
  x: number,
  y: number,
  size: 1 | 2,
  width?: 1 | 2,
  height?: 1 | 2,
  fixed?: boolean
): {
  assets: Record<string, PlacedAsset>;
  cellMap: Record<string, string>;
  id: string;
} | null {
  const w = width ?? size;
  const h = height ?? size;
  if (x + w > GRID_W || y + h > GRID_H) return null;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (cellMap[cellKey(x + dx, y + dy)]) return null;
    }
  }
  const id = makeId();
  const newAssets = {
    ...assets,
    [id]: {
      id,
      type,
      x,
      y,
      size,
      width: w,
      height: h,
      ...(fixed ? { fixed: true } : {}),
      ...withDefaultMachinePriority(type),
    } as PlacedAsset,
  };
  const newCellMap = { ...cellMap };
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      newCellMap[cellKey(x + dx, y + dy)] = id;
    }
  }
  return { assets: newAssets, cellMap: newCellMap, id };
}

function addNotification(
  notifications: GameNotification[],
  resource: string,
  amount: number
): GameNotification[] {
  const displayName = RESOURCE_LABELS[resource] ?? resource;
  const now = Date.now();
  const existing = notifications.find((n) => n.resource === resource);
  if (existing) {
    return notifications.map((n) =>
      n.resource === resource
        ? { ...n, amount: n.amount + amount, expiresAt: now + 4000 }
        : n
    );
  }
  return [
    ...notifications.slice(-5),
    { id: makeId(), resource, displayName, amount, expiresAt: now + 4000 },
  ];
}

function addErrorNotification(
  notifications: GameNotification[],
  message: string
): GameNotification[] {
  const now = Date.now();
  const filtered = notifications.filter(
    (n) => !(n.kind === "error" && n.displayName === message)
  );
  return [
    ...filtered.slice(-5),
    { id: makeId(), resource: "error", displayName: message, amount: 0, kind: "error" as const, expiresAt: now + 3000 },
  ];
}

/** Max entries kept in the auto-delivery log. */
const AUTO_DELIVERY_LOG_MAX = 50;
/** Entries with the same source+resource within this window are batched together. */
const AUTO_DELIVERY_BATCH_WINDOW_MS = 8_000;

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

export const EMPTY_HOTBAR_SLOT: HotbarSlot = { toolKind: "empty", amount: 0, label: "", emoji: "" };

export function createInitialHotbar(): HotbarSlot[] {
  return Array.from({ length: HOTBAR_SIZE }, () => ({ ...EMPTY_HOTBAR_SLOT }));
}

function makeHotbarLabel(toolKind: ToolKind, amount: number, buildingType?: BuildingType): string {
  if (toolKind === "empty") return "";
  if (toolKind === "building" && buildingType) {
    return BUILDING_LABELS[buildingType] + (amount > 1 ? ` ×${amount}` : "");
  }
  const base = RESOURCE_LABELS[toolKind] ?? toolKind;
  return amount > 1 ? `${base} (${amount})` : base;
}

function makeHotbarEmoji(toolKind: ToolKind, buildingType?: BuildingType): string {
  if (toolKind === "empty") return "";
  if (toolKind === "building" && buildingType) return ASSET_EMOJIS[buildingType];
  return RESOURCE_EMOJIS[toolKind] ?? "";
}

export function hotbarAdd(
  slots: HotbarSlot[],
  toolKind: Exclude<ToolKind, "empty">,
  buildingType?: BuildingType,
  add = 1
): HotbarSlot[] | null {
  const existingIdx = slots.findIndex(
    (s) =>
      s.toolKind === toolKind &&
      (toolKind !== "building" || s.buildingType === buildingType) &&
      s.amount < HOTBAR_STACK_MAX
  );
  if (existingIdx >= 0) {
    return slots.map((s, i) => {
      if (i !== existingIdx) return s;
      const newAmt = Math.min(s.amount + add, HOTBAR_STACK_MAX);
      return { ...s, amount: newAmt, label: makeHotbarLabel(toolKind, newAmt, buildingType) };
    });
  }
  const emptyIdx = slots.findIndex((s) => s.toolKind === "empty");
  if (emptyIdx < 0) return null;
  return slots.map((s, i) => {
    if (i !== emptyIdx) return s;
    const amt = Math.min(add, HOTBAR_STACK_MAX);
    return { toolKind, buildingType, amount: amt, label: makeHotbarLabel(toolKind, amt, buildingType), emoji: makeHotbarEmoji(toolKind, buildingType) };
  });
}

export function hotbarDecrement(slots: HotbarSlot[], idx: number): HotbarSlot[] {
  return slots.map((s, i) => {
    if (i !== idx) return s;
    if (s.amount <= 1) return { ...EMPTY_HOTBAR_SLOT };
    const newAmt = s.amount - 1;
    return { ...s, amount: newAmt, label: makeHotbarLabel(s.toolKind, newAmt, s.buildingType) };
  });
}

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

export type GameAction =
  | { type: "CLICK_CELL"; x: number; y: number }
  | { type: "SET_ACTIVE_SLOT"; slot: number }
  | { type: "BUY_MAP_SHOP_ITEM"; itemKey: string }
  /** @deprecated Use JOB_ENQUEUE and JOB_TICK. */
  | { type: "CRAFT_WORKBENCH"; recipeKey: string }
  | { type: "TOGGLE_PANEL"; panel: UIPanel }
  | { type: "CLOSE_PANEL" }
  | { type: "SMITHY_ADD_FUEL"; amount: number }
  | { type: "SMITHY_ADD_IRON"; amount: number }
  | { type: "SMITHY_START" }
  | { type: "SMITHY_STOP" }
  | { type: "SMITHY_TICK" }
  | { type: "SMITHY_WITHDRAW" }
  | { type: "MANUAL_ASSEMBLER_START"; recipe: "metal_plate" | "gear" }
  | { type: "MANUAL_ASSEMBLER_TICK" }
  | { type: "AUTO_SMELTER_TICK" }
  | { type: "AUTO_SMELTER_SET_RECIPE"; assetId: string; recipe: "iron" | "copper" }
  | { type: "GROW_SAPLING"; assetId: string }
  | { type: "GROW_SAPLINGS"; assetIds: string[] }
  | { type: "NATURAL_SPAWN" }
  | { type: "REMOVE_BUILDING"; buildingType: BuildingType }
  | { type: "REMOVE_FROM_HOTBAR"; slot: number }
  | { type: "EQUIP_BUILDING_FROM_WAREHOUSE"; buildingType: BuildingType; amount?: number }
  | { type: "EQUIP_FROM_WAREHOUSE"; itemKind: "axe" | "wood_pickaxe" | "stone_pickaxe" | "sapling"; amount?: number }
  | { type: "TRANSFER_TO_WAREHOUSE"; item: keyof Inventory; amount: number }
  | { type: "TRANSFER_FROM_WAREHOUSE"; item: keyof Inventory; amount: number }
  | { type: "SMITHY_ADD_COPPER"; amount: number }
  | { type: "SMITHY_SET_RECIPE"; recipe: "iron" | "copper" }
  | { type: "EXPIRE_NOTIFICATIONS" }
  | { type: "DEBUG_SET_STATE"; state: GameState }
  // Generator / Energy
  | { type: "GENERATOR_ADD_FUEL"; amount: number }
  | { type: "GENERATOR_REQUEST_REFILL"; amount: number | "max" }
  | { type: "GENERATOR_START" }
  | { type: "GENERATOR_STOP" }
  | { type: "GENERATOR_TICK" }
  // Unified energy-network balance tick (production – consumption → battery)
  | { type: "ENERGY_NET_TICK" }
  // Power pole removal (by specific asset ID)
  | { type: "REMOVE_POWER_POLE"; assetId: string }
  // Build mode
  | { type: "TOGGLE_BUILD_MODE" }
  | { type: "SELECT_BUILD_BUILDING"; buildingType: BuildingType | null }
  | { type: "SELECT_BUILD_FLOOR_TILE"; tileType: FloorTileType | null }
  | { type: "BUILD_PLACE_BUILDING"; x: number; y: number; direction?: Direction }
  | { type: "BUILD_PLACE_FLOOR_TILE"; x: number; y: number }
  | { type: "BUILD_REMOVE_ASSET"; assetId: string }
  | { type: "LOGISTICS_TICK" }
  | { type: "TOGGLE_ENERGY_DEBUG" }
  | { type: "SET_MACHINE_PRIORITY"; assetId: string; priority: MachinePriority }
  | { type: "SET_MACHINE_BOOST"; assetId: string; boosted: boolean }
  // Per-building resource source selection
  | { type: "SET_BUILDING_SOURCE"; buildingId: string; warehouseId: string | null }
  // Per-workbench keep-in-stock targets for workbench recipes
  | { type: "SET_KEEP_STOCK_TARGET"; workbenchId: string; recipeId: string; amount: number; enabled: boolean }
  // Per-recipe automation policy overrides
  | { type: "SET_RECIPE_AUTOMATION_POLICY"; recipeId: string; patch: RecipeAutomationPolicyPatch }
  // Production zones
  | { type: "CREATE_ZONE"; name?: string }
  | { type: "DELETE_ZONE"; zoneId: string }
  | { type: "SET_BUILDING_ZONE"; buildingId: string; zoneId: string | null }
  // Starter drone state machine tick
  | { type: "DRONE_TICK" }
  // Service hub target stock adjustment
  | { type: "SET_HUB_TARGET_STOCK"; hubId: string; resource: CollectableItemType; amount: number }
  // Hub upgrade from Tier 1 to Tier 2
  | { type: "UPGRADE_HUB"; hubId: string }
  /**
   * Explicitly assign a drone to a hub. The drone is immediately repositioned
   * to the hub's dock slot and any in-progress task is aborted cleanly.
   * This is the ONLY way a drone changes its homeHub after initial game setup.
   */
  | { type: "ASSIGN_DRONE_TO_HUB"; droneId: string; hubId: string }
  /**
   * Set the preferred role for a drone. Only meaningful for Tier 2 hubs.
   * The UI enforces this but the reducer does not check tier — game logic is
   * always valid (role is purely an advisory scoring hint).
   */
  | { type: "DRONE_SET_ROLE"; droneId: string; role: DroneRole }
  // Inventory-network reservations (Step 2)
  | NetworkAction
  // Crafting jobs (Step 3)
  | CraftingAction;

// ============================================================
// REDUCER
// ============================================================

const workbenchFinalizerDeps: FinalizerDeps = {
  applyDroneUpdate,
  getCraftingJobById,
  addWorkbenchInputToJob,
  addResources,
  addNotification,
  routeOutput,
  debugLog,
};

function finalizeWorkbenchDelivery(
  state: GameState,
  droneId: string,
  jobId: string | null,
  idleDrone: StarterDroneState,
): GameState {
  return finalizeWorkbenchDeliveryExecution(
    state,
    droneId,
    jobId,
    idleDrone,
    workbenchFinalizerDeps,
  );
}

function finalizeWorkbenchInputDelivery(
  state: GameState,
  droneId: string,
  task: Extract<WorkbenchTaskNodeId, { kind: "input" }>,
  idleDrone: StarterDroneState,
): GameState {
  return finalizeWorkbenchInputDeliveryExecution(
    state,
    droneId,
    task,
    idleDrone,
    workbenchFinalizerDeps,
  );
}

/**
 * Tick one drone (identified by droneId) through its state machine for one step.
 * Reads from state.drones[droneId]; writes back via applyDroneUpdate so that
 * state.starterDrone stays in sync for the "starter" drone.
 * All other game-state fields (collectionNodes, serviceHubs, …) are updated in place.
 */
const tickOneDroneDeps: TickOneDroneDeps = {
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
  moveDroneToward,
  nudgeAwayFromDrones,
  commitWorkbenchInputReservation,
  resolveDroneDropoff,
  addResources,
  makeId,
  addNotification,
  syncDrones,
  isHubUpgradeDeliverySatisfied,
  finalizeWorkbenchInputDelivery,
  debugLog,
};

function tickOneDrone(state: GameState, droneId: string): GameState {
  return tickOneDroneExecution(state, droneId, tickOneDroneDeps);
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

const BUILDING_PLACEMENT_ACTION_DEPS: BuildingPlacementActionDeps = {
  GRID_W,
  GRID_H,
  BUILDING_COSTS,
  CONSTRUCTION_SITE_BUILDINGS,
  BUILDING_LABELS,
  BUILDING_SIZES,
  BUILDINGS_WITH_DEFAULT_SOURCE,
  REQUIRES_STONE_FLOOR,
  STACKABLE_BUILDINGS,
  MAX_WAREHOUSES,
  DEPOSIT_TYPES,
  DEPOSIT_RESOURCE,
  DEFAULT_MACHINE_PRIORITY,
  ASSET_LABELS,
  cellKey,
  hasResources,
  addResources,
  getEffectiveBuildInventory,
  costIsFullyCollectable,
  fullCostAsRemaining,
  placeAsset,
  removeAsset,
  makeId,
  getAutoSmelterIoCells,
  consumeBuildResources,
  createEmptyInventory,
  createEmptyHubInventory,
  createDefaultProtoHubTargetStock,
  getNearestWarehouseId,
  reassignBuildingSourceIds,
  getDroneDockOffset,
  computeConnectedAssetIds,
  decideBuildingPlacementEligibility,
  decideAutoMinerPlacementEligibility,
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

const LOGISTICS_TICK_ACTION_DEPS: LogisticsTickActionDeps = {
  getWarehouseCapacity,
  getCapacityPerResource,
  getZoneItemCapacity,
  resolveBuildingSource,
  directionOffset,
  getBoostMultiplier,
  getAutoSmelterIoCells,
  areAutoSmelterEntriesEqual,
  isValidWarehouseInput,
  addResources,
  addNotification,
  addAutoDelivery,
  CONVEYOR_TILE_CAPACITY,
  AUTO_SMELTER_BUFFER_CAPACITY,
  AUTO_MINER_PRODUCE_TICKS,
  LOGISTICS_TICK_MS,
};

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
    BUILDING_PLACEMENT_ACTION_DEPS,
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
  const droneAssignmentResult = handleDroneAssignmentAction(
    state,
    action,
    DRONE_ASSIGNMENT_ACTION_DEPS,
  );
  if (droneAssignmentResult !== null) return droneAssignmentResult;
  switch (action.type) {
    // -----------------------------------------------------------------
    // Crafting/Queue cases (NETWORK_*, CRAFT_REQUEST_WITH_PREREQUISITES,
    // JOB_*, SET_KEEP_STOCK_TARGET, SET_RECIPE_AUTOMATION_POLICY) are
    // handled above by handleCraftingQueueAction.
    // -----------------------------------------------------------------

    case "CLICK_CELL": {
      const { x, y } = action;
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return state;

      const assetId = state.cellMap[cellKey(x, y)];
      const asset = assetId ? state.assets[assetId] : null;

      const uiPreludeState = handleUiCellPrelude(state, asset, UI_CELL_PRELUDE_DEPS);
      if (uiPreludeState !== null) return uiPreludeState;

      return handleClickCellToolAction(
        state,
        { x, y, assetId, asset },
        CLICK_CELL_TOOL_ACTION_DEPS,
      );
    }

    // SET_ACTIVE_SLOT is handled above by handleUiAction.

    // BUY_MAP_SHOP_ITEM is handled above by
    // handleShopAction (see action-handlers/shop.ts).

    case "CRAFT_WORKBENCH": {
      if (import.meta.env.DEV) {
        console.warn("CRAFT_WORKBENCH deprecated - use queue");
      }
      debugLog.general("CRAFT_WORKBENCH deprecated - use queue");
      return state;
    }

    // TOGGLE_PANEL and CLOSE_PANEL are handled above by handleUiAction.

    case "GROW_SAPLING": {
      const asset = state.assets[action.assetId];
      if (!asset || asset.type !== "sapling") return state;
      const removed = removeAsset(state, action.assetId);
      const placed = placeAsset(removed.assets, removed.cellMap, "tree", asset.x, asset.y, 1);
      if (!placed) return state;
      return { ...state, assets: placed.assets, cellMap: placed.cellMap, saplingGrowAt: removed.saplingGrowAt };
    }

    case "GROW_SAPLINGS": {
      let { assets, cellMap, saplingGrowAt } = state;
      let changed = false;
      for (const assetId of action.assetIds) {
        const asset = assets[assetId];
        if (!asset || asset.type !== "sapling") continue;
        const removed = removeAsset({ ...state, assets, cellMap, saplingGrowAt }, assetId);
        const placed = placeAsset(removed.assets, removed.cellMap, "tree", asset.x, asset.y, 1);
        if (placed) {
          assets = placed.assets;
          cellMap = placed.cellMap;
        } else {
          assets = removed.assets;
          cellMap = removed.cellMap;
        }
        saplingGrowAt = removed.saplingGrowAt;
        changed = true;
      }
      if (!changed) return state;
      return { ...state, assets, cellMap, saplingGrowAt };
    }

    case "NATURAL_SPAWN": {
      // Enforce per-type spawn cap
      const treeCount = Object.values(state.assets).filter(
        (a) => a.type === "tree" || a.type === "sapling"
      ).length;
      if (treeCount >= NATURAL_SPAWN_CAP) return state;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (Math.random() > NATURAL_SPAWN_CHANCE) continue;
        const x = Math.floor(Math.random() * GRID_W);
        const y = Math.floor(Math.random() * GRID_H);
        if (state.cellMap[cellKey(x, y)]) continue;
        if (hasNearbyAsset(state.cellMap, x, y)) continue;
        const placed = placeAsset(state.assets, state.cellMap, "sapling", x, y, 1);
        if (!placed) continue;
        return {
          ...state,
          assets: placed.assets,
          cellMap: placed.cellMap,
          saplingGrowAt: { ...state.saplingGrowAt, [placed.id]: Date.now() + SAPLING_GROW_MS },
        };
      }
      return state;
    }

    case "REMOVE_BUILDING": {
      // Buildings are removed exclusively via BUILD_REMOVE_ASSET in Build Mode.
      return state;
    }

    case "EXPIRE_NOTIFICATIONS": {
      const now = Date.now();
      const alive = state.notifications.filter((n) => n.expiresAt > now);
      if (alive.length === state.notifications.length) return state;
      return { ...state, notifications: alive };
    }

    case "DEBUG_SET_STATE": {
      if (!import.meta.env.DEV) return state;
      return action.state;
    }

    case "ENERGY_NET_TICK": {
      return runEnergyNetTick(state);
    }

    case "REMOVE_POWER_POLE": {
      // Power poles are removed exclusively via BUILD_REMOVE_ASSET in Build Mode.
      return state;
    }

    case "AUTO_SMELTER_SET_RECIPE": {
      const { assetId, recipe } = action;
      if (isUnderConstruction(state, assetId)) return state;
      const smelter = state.autoSmelters[assetId];
      if (!smelter) return state;
      return {
        ...state,
        autoSmelters: {
          ...state.autoSmelters,
          [assetId]: { ...smelter, selectedRecipe: recipe },
        },
      };
    }

    // ============================================================
    // BUILD MODE
    // ============================================================

    case "TOGGLE_BUILD_MODE": {
      const newBuildMode = !state.buildMode;
      return {
        ...state,
        buildMode: newBuildMode,
        selectedBuildingType: newBuildMode ? state.selectedBuildingType : null,
        selectedFloorTile: newBuildMode ? state.selectedFloorTile : null,
        openPanel: newBuildMode ? null : state.openPanel,
        selectedWarehouseId: newBuildMode ? null : state.selectedWarehouseId,
      };
    }

    case "SELECT_BUILD_BUILDING": {
      return { ...state, selectedBuildingType: action.buildingType, selectedFloorTile: null };
    }

    case "SELECT_BUILD_FLOOR_TILE": {
      return { ...state, selectedFloorTile: action.tileType, selectedBuildingType: null };
    }
    // BUILD_PLACE_BUILDING and BUILD_REMOVE_ASSET are handled above by
    // handleBuildingPlacementAction (see action-handlers/building-placement.ts).

    // BUILD_PLACE_FLOOR_TILE is handled above by
    // handleFloorPlacementAction (see action-handlers/floor-placement.ts).

    case "LOGISTICS_TICK": {
      return handleLogisticsTickAction(state, LOGISTICS_TICK_ACTION_DEPS);
    }

    // TOGGLE_ENERGY_DEBUG is handled above by handleUiAction.

    // SET_MACHINE_PRIORITY and SET_MACHINE_BOOST are handled above by
    // handleMachineConfigAction (see action-handlers/machine-config.ts).

    // SET_BUILDING_SOURCE and UPGRADE_HUB are handled above by
    // handleBuildingSiteAction (see action-handlers/building-site.ts).

    // SET_KEEP_STOCK_TARGET and SET_RECIPE_AUTOMATION_POLICY are handled
    // above by handleCraftingQueueAction (see action-handlers/crafting-queue-actions.ts).

    // ---- Production Zone Actions ----
    // CREATE_ZONE / DELETE_ZONE / SET_BUILDING_ZONE are handled above by
    // handleZoneAction (see action-handlers/zone-actions.ts).

    case "SET_HUB_TARGET_STOCK": {
      const hub = state.serviceHubs[action.hubId];
      if (!hub) return state;
      if (isUnderConstruction(state, action.hubId)) return state;
      const maxStock = getMaxTargetStockForTier(hub.tier);
      const clamped = Math.max(0, Math.min(maxStock, Math.round(action.amount)));
      return {
        ...state,
        serviceHubs: {
          ...state.serviceHubs,
          [action.hubId]: {
            ...hub,
            targetStock: { ...hub.targetStock, [action.resource]: clamped },
          },
        },
      };
    }

    // ASSIGN_DRONE_TO_HUB is handled above by
    // handleDroneAssignmentAction (see action-handlers/drone-assignment.ts).

    case "DRONE_SET_ROLE": {
      const { droneId, role } = action;
      // Update whichever drone record is authoritative.
      if (droneId === state.starterDrone.droneId) {
        const updated = { ...state.starterDrone, role };
        return syncDrones({ ...state, starterDrone: updated });
      }
      const target = state.drones[droneId];
      if (!target) return state;
      return syncDrones({
        ...state,
        drones: { ...state.drones, [droneId]: { ...target, role } },
      });
    }

    case "DRONE_TICK": {
      // Inline of the former tickAllDrones() — sequential per-drone tick using
      // the order of the current drones map. Each subsequent drone sees all
      // mutations made by the previously ticked drones.
      const starterRecord = state.drones.starter;
      const startState = starterRecord !== state.starterDrone
        ? { ...state, drones: { ...state.drones, starter: state.starterDrone } }
        : state;
      let nextState = startState;
      for (const droneId of Object.keys(startState.drones)) {
        nextState = tickOneDrone(nextState, droneId);
      }
      return nextState;
    }

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


