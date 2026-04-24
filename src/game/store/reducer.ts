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
import { resolveOutputDestination, routeOutput } from "../crafting/output";
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
import { gatherConstructionSupplyCandidates } from "../drones/candidates/construction-supply-candidates";
import { gatherGroundBuildingSupplyCandidates } from "../drones/candidates/ground-building-supply-candidates";
import { gatherHubBuildingSupplyCandidates } from "../drones/candidates/hub-building-supply-candidates";
import { gatherHubDispatchCandidates } from "../drones/candidates/hub-dispatch-candidates";
import { gatherHubRestockCandidates } from "../drones/candidates/hub-restock-candidates";
import {
  DRONE_DEMAND_BONUS_MAX,
  DRONE_NEARBY_WAREHOUSE_LIMIT,
  DRONE_ROLE_BONUS,
  DRONE_SPREAD_PENALTY_PER_DRONE,
  DRONE_STICKY_BONUS,
  DRONE_URGENCY_BONUS_MAX,
  DRONE_WAREHOUSE_PRIORITY_BONUS,
} from "../drones/candidates/scoring-constants";
import { scoreDroneTask } from "../drones/candidates/score-drone-task";
export {
  DRONE_NEARBY_WAREHOUSE_LIMIT,
  scoreDroneTask,
  DRONE_WAREHOUSE_PRIORITY_BONUS,
};
import { gatherWarehouseBuildingSupplyCandidates } from "../drones/candidates/building-supply-warehouse-source-candidates";
import { gatherWarehouseConstructionCandidates } from "../drones/candidates/warehouse-construction-candidates";
import { gatherWorkbenchInputCandidates } from "../drones/candidates/workbench-input-candidates";
import { gatherWorkbenchOutputDeliveryCandidates } from "../drones/candidates/workbench-output-delivery-candidates";
import {
  selectDroneTask as selectDroneTaskDecision,
  type SelectDroneTaskDeps,
} from "../drones/selection/select-drone-task";
import {
  type NeedSlotResolverDeps,
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
import {
  tickAllDrones,
  type TickAllDronesDeps,
} from "../drones/orchestration/tick-all-drones";
import { droneTravelTicks } from "../drones/drone-movement";
import { getDroneDockOffset } from "../drones/drone-dock-geometry";
import { computeConnectedAssetIds } from "../logistics/connectivity";
import {
  areZonesTransportCompatible,
  getConveyorZone,
} from "../logistics/conveyor-zone";
import { decideHubDispatchExecutionAction } from "./workflows/hub-dispatch-execution";
import {
  handleCraftingQueueAction,
  type CraftingQueueActionDeps,
} from "./action-handlers/crafting-queue-actions";
import {
  handleZoneAction,
  type ZoneActionDeps,
} from "./action-handlers/zone-actions";
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

export const CONVEYOR_TILE_CAPACITY = 4;
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
  SAPLING_DROP_CHANCE,
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
// Imported for internal use and re-exported for backward compatibility.
import { ENERGY_DRAIN } from "./constants/energy/energy-balance";
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

/**
 * Tie-break order for machines with the same user priority.
 * Lower rank is served first so transport stays alive before downstream processing.
 */
const ENERGY_ALLOCATION_RANK: Partial<Record<AssetType, number>> = {
  conveyor: 0,
  conveyor_corner: 0,
  auto_miner: 1,
  smithy: 2,
  auto_smelter: 3,
};

export function isPowerCableConductorType(type: AssetType): boolean {
  return POWER_CABLE_CONDUCTOR_TYPES.has(type);
}

export function isPowerPoleRangeType(type: AssetType): boolean {
  return POWER_POLE_RANGE_TYPES.has(type);
}

function clampMachinePriority(priority: number | undefined): MachinePriority {
  const raw = Number.isFinite(priority) ? Math.round(priority as number) : DEFAULT_MACHINE_PRIORITY;
  const clamped = Math.max(1, Math.min(5, raw));
  return clamped as MachinePriority;
}

export function isEnergyConsumerType(type: AssetType): boolean {
  return ENERGY_DRAIN[type] != null;
}

function getEnergyAllocationRank(type: AssetType): number {
  return ENERGY_ALLOCATION_RANK[type] ?? 4;
}
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
  areZonesTransportCompatible,
};
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

function withDefaultMachinePriority(type: AssetType): Pick<PlacedAsset, "priority"> | {} {
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
  switch (drone.status) {
    case "idle":
      return { label: "Bereit" };
    case "moving_to_collect": {
      // hub_dispatch: en route to hub to pick up stock
      if (drone.currentTaskType === "hub_dispatch" && drone.targetNodeId?.startsWith("hub:")) {
        const resource = drone.targetNodeId.split(":")[2];
        return { label: "Unterwegs zum Hub", taskGoal: resource ? `${resource} abholen` : undefined };
      }
      const workbenchTask = parseWorkbenchTaskNodeId(drone.targetNodeId);
      if (drone.currentTaskType === "workbench_delivery" && workbenchTask?.kind === "input") {
        const job = getCraftingJobById(state.crafting, workbenchTask.jobId);
        const reservation = getCraftingReservationById(state.network, workbenchTask.reservationId);
        return {
          label: "Unterwegs zum Lager",
          taskGoal: reservation && job ? `${reservation.amount}× ${reservation.itemId} für ${job.recipeId}` : undefined,
        };
      }
      if (drone.currentTaskType === "workbench_delivery" && drone.craftingJobId) {
        const job = getCraftingJobById(state.crafting, drone.craftingJobId);
        return {
          label: "Unterwegs zur Werkbank",
          taskGoal: job ? `${job.output.count}× ${job.output.itemId} abholen` : undefined,
        };
      }
      const node = drone.targetNodeId ? state.collectionNodes[drone.targetNodeId] : null;
      return { label: "Unterwegs zum Sammeln", taskGoal: node ? `${node.itemType} (${node.amount})` : undefined };
    }
    case "collecting":
      if (drone.currentTaskType === "workbench_delivery" && parseWorkbenchTaskNodeId(drone.targetNodeId)?.kind === "input") {
        return { label: "Holt Werkbank-Input…" };
      }
      if (drone.currentTaskType === "workbench_delivery") return { label: "Holt Werkbank-Output…" };
      if (drone.currentTaskType === "hub_dispatch") return { label: "Entnimmt Hub-Lager…" };
      return { label: "Sammelt ein…" };
    case "moving_to_dropoff":
      if (drone.currentTaskType === "workbench_delivery" && parseWorkbenchTaskNodeId(drone.targetNodeId)?.kind === "input") {
        return {
          label: "Liefert Werkbank-Input",
          taskGoal: drone.cargo ? `${drone.cargo.amount}× ${drone.cargo.itemType}` : undefined,
        };
      }
      if (drone.currentTaskType === "workbench_delivery" && drone.craftingJobId) {
        const job = getCraftingJobById(state.crafting, drone.craftingJobId);
        return {
          label: "Liefert Werkzeug aus",
          taskGoal: job ? `${job.output.count}× ${job.output.itemId}` : undefined,
        };
      }
      return { label: "Rückflug", taskGoal: drone.cargo ? `${drone.cargo.amount}× ${drone.cargo.itemType}` : undefined };
    case "depositing":
      return { label: "Liefert ab…" };
    default:
      return { label: String(drone.status) };
  }
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
const needSlotResolverDeps: NeedSlotResolverDeps = {
  getOpenConstructionDroneSlots,
  getAssignedConstructionDroneCount,
  getRemainingConstructionNeed,
  getRemainingHubRestockNeed,
  getOpenHubRestockDroneSlots,
  getRemainingBuildingInputDemand,
  getOpenBuildingSupplyDroneSlots,
  getAssignedBuildingSupplyDroneCount,
  getWorkbenchJobInputAmount,
  getAssignedWorkbenchInputDroneCount,
  getAssignedWorkbenchDeliveryDroneCount,
};

const selectDroneTaskDeps: SelectDroneTaskDeps = {
  roleBonus: DRONE_ROLE_BONUS,
  stickyBonus: DRONE_STICKY_BONUS,
  urgencyBonusMax: DRONE_URGENCY_BONUS_MAX,
  demandBonusMax: DRONE_DEMAND_BONUS_MAX,
  spreadPenaltyPerDrone: DRONE_SPREAD_PENALTY_PER_DRONE,
  warehousePriorityBonus: DRONE_WAREHOUSE_PRIORITY_BONUS,
  gatherConstructionSupplyCandidates,
  gatherHubRestockCandidates,
  gatherHubDispatchCandidates,
  gatherWarehouseConstructionCandidates,
  gatherGroundBuildingSupplyCandidates,
  gatherHubBuildingSupplyCandidates,
  gatherWarehouseBuildingSupplyCandidates,
  gatherWorkbenchInputCandidates,
  gatherWorkbenchOutputDeliveryCandidates,
  scoreDroneTask,
  ...needSlotResolverDeps,
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

export function isBoostSupportedType(type: AssetType): boolean {
  return type === "auto_miner" || type === "auto_smelter";
}

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

function createEmptyInventory(): Inventory {
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

// ============================================================
// CONVEYOR ZONE HELPERS
// Pure helpers for zone-aware belt transport checks.
// ============================================================

export interface ConveyorZoneStatus {
  /** Zone assigned to this belt (null = unzoned / global). */
  zone: string | null;
  /** Human-readable zone name (null if unzoned). */
  zoneName: string | null;
  /** Zone of the next tile this belt is pointing at (null = unzoned or no next asset). */
  nextTileZone: string | null;
  /** True when both this belt and the next tile have differing explicit zones. */
  hasConflict: boolean;
  /** Human-readable conflict reason, or null when no conflict. */
  conflictReason: string | null;
}

/**
 * Derive zone/conflict status for a conveyor belt.
 * Pure function — safe to call from any UI component.
 */
export function getConveyorZoneStatus(state: GameState, conveyorId: string): ConveyorZoneStatus {
  const convAsset = state.assets[conveyorId];
  const zone = state.buildingZoneIds[conveyorId] ?? null;
  const zoneName = zone ? (state.productionZones[zone]?.name ?? zone) : null;

  let nextTileZone: string | null = null;
  let hasConflict = false;
  let conflictReason: string | null = null;

  if (convAsset) {
    const dir = convAsset.direction ?? "east";
    const [ox, oy] = directionOffset(dir);
    const nextX = convAsset.x + ox;
    const nextY = convAsset.y + oy;
    if (nextX >= 0 && nextX < GRID_W && nextY >= 0 && nextY < GRID_H) {
      const nextId = state.cellMap[cellKey(nextX, nextY)];
      if (nextId) {
        nextTileZone = state.buildingZoneIds[nextId] ?? null;
        if (!areZonesTransportCompatible(zone, nextTileZone)) {
          hasConflict = true;
          const thisName = zoneName ?? zone ?? "Global";
          const nextName = nextTileZone ? (state.productionZones[nextTileZone]?.name ?? nextTileZone) : "Global";
          conflictReason = `Ziel-Zone mismatch: ${thisName} → ${nextName}`;
        }
      }
    }
  }

  return { zone, zoneName, nextTileZone, hasConflict, conflictReason };
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

function getCraftingAssetById(
  state: Pick<GameState, "assets">,
  assetId: string | null | undefined,
  assetType: CraftingBuildingAssetType,
): PlacedAsset | null {
  if (!assetId) return null;
  const asset = state.assets[assetId];
  return asset && asset.type === assetType ? asset : null;
}

function getSelectedCraftingAsset(
  state: Pick<GameState, "assets" | "selectedCraftingBuildingId">,
  assetType: CraftingBuildingAssetType,
): PlacedAsset | null {
  return getCraftingAssetById(state, state.selectedCraftingBuildingId, assetType);
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

function getActiveSmithyAsset(
  state: Pick<GameState, "assets" | "selectedCraftingBuildingId" | "smithy">,
): PlacedAsset | null {
  return getCraftingAssetById(state, state.smithy.buildingId, "smithy")
    ?? getSelectedCraftingAsset(state, "smithy");
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

let _idCounter = 0;
let _smelterRecipesLogged = false;
export function makeId(): string {
  return `a${Date.now()}_${_idCounter++}`;
}

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
    const scoped = { [warehouseId]: warehouseInventory };
    const result = applyNetworkAction(scoped, state.network, {
      type: "NETWORK_COMMIT_RESERVATION",
      reservationId,
    });
    if (result.network.lastError) return null;
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
  const result = applyNetworkAction(scoped, state.network, {
    type: "NETWORK_COMMIT_RESERVATION",
    reservationId,
  });
  if (result.network.lastError) return null;
  const committedHubView = result.warehouseInventories[pseudoWarehouseId] ?? scoped[pseudoWarehouseId];
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

function resolveWorkbenchDeliveryDropoff(
  job: CraftingJob,
  assets: Record<string, PlacedAsset>,
  warehouseInventories: Record<string, Inventory>,
  serviceHubs: Record<string, ServiceHubEntry>,
): { x: number; y: number } {
  const destination = resolveOutputDestination({
    source: job.inventorySource,
    stackItemId: job.output.itemId,
    warehouseInventories,
    serviceHubs,
    assets,
    preferredFromAssetId: job.workbenchId,
  });

  if (destination.kind === "warehouse") {
    const targetAsset = assets[destination.id];
    if (targetAsset?.type === "warehouse") {
      return { x: targetAsset.x, y: targetAsset.y };
    }
  }

  if (destination.kind === "hub") {
    const targetAsset = assets[destination.id];
    if (targetAsset?.type === "service_hub") {
      return { x: targetAsset.x, y: targetAsset.y };
    }
  }

  return { x: MAP_SHOP_POS.x, y: MAP_SHOP_POS.y };
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
  // Construction supply: target is the construction site asset + per-drone offset
  if (drone.currentTaskType === "construction_supply" && drone.deliveryTargetId) {
    const siteAsset = assets[drone.deliveryTargetId];
    if (siteAsset) {
      const off = DELIVERY_OFFSETS[droneDeliverySlot(drone.droneId)];
      return { x: siteAsset.x + off.dx, y: siteAsset.y + off.dy };
    }
    // Site was removed during flight — fall through to hub or MAP_SHOP
    debugLog.inventory(`[Drone] Construction site asset ${drone.deliveryTargetId} gone — falling back`);
  }

  // Building supply: target is the building asset hosting the input buffer
  if (drone.currentTaskType === "building_supply" && drone.deliveryTargetId) {
    const targetAsset = assets[drone.deliveryTargetId];
    if (targetAsset) {
      const off = DELIVERY_OFFSETS[droneDeliverySlot(drone.droneId)];
      return { x: targetAsset.x + off.dx, y: targetAsset.y + off.dy };
    }
    debugLog.inventory(`[Drone] Building input target ${drone.deliveryTargetId} gone — falling back`);
  }

  if (drone.currentTaskType === "workbench_delivery" && crafting) {
    const task = parseWorkbenchTaskNodeId(drone.targetNodeId);
    if (task?.kind === "input") {
      const workbenchAsset = assets[task.workbenchId];
      if (workbenchAsset?.type === "workbench") {
        return { x: workbenchAsset.x, y: workbenchAsset.y };
      }
    }
    const job = getCraftingJobById(crafting, drone.craftingJobId ?? task?.jobId ?? null);
    if (job) {
      return resolveWorkbenchDeliveryDropoff(
        job,
        assets,
        warehouseInventories ?? {},
        serviceHubs ?? {},
      );
    }
  }

  // Hub restock (or construction fallback): use dock slot so each drone targets its own tile
  if (drone.hubId) {
    if (serviceHubs) {
      const dock = getDroneHomeDock(drone, { assets, serviceHubs });
      if (dock) return dock;
    }
    // Fallback when serviceHubs not provided (backward-compat path)
    const hubAsset = assets[drone.hubId];
    if (hubAsset) return { x: hubAsset.x, y: hubAsset.y };
    // Hub asset removed during flight — fall through to MAP_SHOP
    debugLog.inventory(`[Drone] Hub asset ${drone.hubId} gone — falling back to start module`);
  }

  // Legacy / no hub: deliver to start module
  return { x: MAP_SHOP_POS.x, y: MAP_SHOP_POS.y };
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
  const id = `cn${Date.now()}_${_idCounter++}`;
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

function assetWidth(asset: PlacedAsset): number {
  return asset.width ?? asset.size;
}

function assetHeight(asset: PlacedAsset): number {
  return asset.height ?? asset.size;
}

function getAutoSmelterIoCells(asset: PlacedAsset): { input: { x: number; y: number }; output: { x: number; y: number } } {
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

function tryTogglePanelFromAsset(state: GameState, asset: PlacedAsset | null): GameState | null {
  if (!asset) return null;
  if (isUnderConstruction(state, asset.id)) return null;

  if ((["workbench", "warehouse", "smithy", "generator", "battery", "power_pole", "manual_assembler", "service_hub"] as string[]).includes(asset.type)) {
    const panel = asset.type as UIPanel;
    if (asset.type === "warehouse") {
      const newPanel = state.openPanel === panel && state.selectedWarehouseId === asset.id ? null : panel;
      return { ...state, openPanel: newPanel, selectedWarehouseId: newPanel ? asset.id : null };
    }
    if (asset.type === "power_pole") {
      const newPanel = state.openPanel === panel ? null : panel;
      return { ...state, openPanel: newPanel, selectedPowerPoleId: newPanel ? asset.id : state.selectedPowerPoleId };
    }
    // Crafting buildings: track which specific instance is open
    if (asset.type === "workbench" || asset.type === "smithy" || asset.type === "manual_assembler") {
      const opening = state.openPanel !== panel || state.selectedCraftingBuildingId !== asset.id;
      return {
        ...state,
        openPanel: opening ? panel : null,
        selectedCraftingBuildingId: opening ? asset.id : null,
      };
    }
    if (asset.type === "generator") {
      const opening = state.openPanel !== panel || state.selectedGeneratorId !== asset.id;
      return {
        ...state,
        openPanel: opening ? panel : null,
        selectedGeneratorId: opening ? asset.id : null,
      };
    }
    if (asset.type === "service_hub") {
      const opening = state.openPanel !== panel || state.selectedServiceHubId !== asset.id;
      return {
        ...state,
        openPanel: opening ? panel : null,
        selectedServiceHubId: opening ? asset.id : null,
      };
    }
    return { ...state, openPanel: state.openPanel === panel ? null : panel };
  }

  if (asset.type === "auto_miner") {
    const opening = state.openPanel !== "auto_miner" || state.selectedAutoMinerId !== asset.id;
    return {
      ...state,
      openPanel: opening ? "auto_miner" : null,
      selectedAutoMinerId: opening ? asset.id : null,
    };
  }

  if (asset.type === "auto_smelter") {
    const opening = state.openPanel !== "auto_smelter" || state.selectedAutoSmelterId !== asset.id;
    return {
      ...state,
      openPanel: opening ? "auto_smelter" : null,
      selectedAutoSmelterId: opening ? asset.id : null,
    };
  }

  return null;
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

function placeAsset(
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

export function createInitialState(mode: GameMode): GameState {
  const assets: Record<string, PlacedAsset> = {};
  const cellMap: Record<string, string> = {};

  function tryPlace(type: AssetType, x: number, y: number, size: 1 | 2, fixed?: boolean): string | undefined {
    if (x + size > GRID_W || y + size > GRID_H) return;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (cellMap[cellKey(x + dx, y + dy)]) return;
      }
    }
    const id = makeId();
    assets[id] = {
      id,
      type,
      x,
      y,
      size,
      ...(fixed ? { fixed: true } : {}),
      ...withDefaultMachinePriority(type),
    } as PlacedAsset;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        cellMap[cellKey(x + dx, y + dy)] = id;
      }
    }
    return id;
  }

  // Place fixed map shop (2x2) near center
  tryPlace("map_shop", MAP_SHOP_POS.x, MAP_SHOP_POS.y, 2, true);

  // Place fixed proto-hub (2x2) next to map shop
  const protoHubId = tryPlace("service_hub", MAP_SHOP_POS.x + 3, MAP_SHOP_POS.y, 2, true);

  // Place fixed 2\u00d72 resource deposits at predetermined positions
  for (const dp of DEPOSIT_POSITIONS) {
    tryPlace(dp.type, dp.x, dp.y, 2, true);
  }

  // Place starting warehouse (2x2) at the nearest free spot within 10 cells of map_shop
  {
    const shopX = MAP_SHOP_POS.x;
    const shopY = MAP_SHOP_POS.y;
    const candidates: { x: number; y: number; dist: number }[] = [];
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const wx = shopX + dx;
        const wy = shopY + dy;
        if (wx < 0 || wy < 0 || wx + 2 > GRID_W || wy + 2 > GRID_H) continue;
        candidates.push({ x: wx, y: wy, dist: Math.abs(dx) + Math.abs(dy) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const { x, y } of candidates) {
      if (
        !cellMap[cellKey(x, y)] &&
        !cellMap[cellKey(x + 1, y)] &&
        !cellMap[cellKey(x, y + 1)] &&
        !cellMap[cellKey(x + 1, y + 1)]
      ) {
        tryPlace("warehouse", x, y, 2);
        break;
      }
    }
  }

  // Place resources randomly
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    tryPlace("tree", x, y, 1);
  }
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    tryPlace("stone", x, y, 1);
  }
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    tryPlace("iron", x, y, 1);
  }
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    tryPlace("copper", x, y, 1);
  }

  const isDebug = mode === "debug";
  const floorMap: Record<string, "stone_floor"> = {};
  const autoMiners: Record<string, AutoMinerEntry> = {};
  const conveyors: Record<string, ConveyorState> = {};
  const autoSmelters: Record<string, AutoSmelterEntry> = {};
  let selectedPowerPoleId: string | null = null;

  function removeNonFixedAssetAtCell(x: number, y: number) {
    const id = cellMap[cellKey(x, y)];
    if (!id) return;
    const a = assets[id];
    if (!a || a.fixed) return;
    delete assets[id];
    for (let dy = 0; dy < assetHeight(a); dy++) {
      for (let dx = 0; dx < assetWidth(a); dx++) {
        const k = cellKey(a.x + dx, a.y + dy);
        if (cellMap[k] === id) delete cellMap[k];
      }
    }
  }

  function clearAreaForDebug(x: number, y: number, size: 1 | 2) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        removeNonFixedAssetAtCell(x + dx, y + dy);
      }
    }
  }

  function placeDirectedForDebug(type: AssetType, x: number, y: number, direction: Direction) {
    clearAreaForDebug(x, y, 1);
    const placedId = tryPlace(type, x, y, 1);
    if (!placedId) return null;
    assets[placedId] = { ...assets[placedId], direction };
    return placedId;
  }

  if (isDebug) {
    // Deterministisches Debug-Setup:
    // Auto-Miner (Eisen) -> 3 Förderbänder -> Auto Smelter -> 3 Förderbänder -> Lagerhaus,
    // plus 2 Generatoren + Stromknoten für stabile Vollversorgung.
    const ironDeposit = Object.values(assets).find((a) => a.type === "iron_deposit") ?? null;
    if (ironDeposit) {
      const minerPos = { x: ironDeposit.x, y: ironDeposit.y, dir: "west" as Direction };
      const autoSmelterPos = {
        x: Math.max(2, minerPos.x - 5),
        y: minerPos.y,
      };
      const warehousePos = {
        x: Math.max(1, minerPos.x - 8),
        y: Math.max(0, minerPos.y - 2),
      };
      const generatorA = {
        x: Math.max(0, autoSmelterPos.x - 2),
        y: Math.min(GRID_H - 2, autoSmelterPos.y + 3),
      };
      const generatorB = {
        x: Math.min(GRID_W - 2, autoSmelterPos.x + 1),
        y: Math.min(GRID_H - 2, autoSmelterPos.y + 3),
      };
      const polePositions = [
        { x: autoSmelterPos.x + 1, y: autoSmelterPos.y + 2 },
        { x: autoSmelterPos.x - 1, y: autoSmelterPos.y + 2 },
        { x: warehousePos.x + 1, y: warehousePos.y + 2 },
        // Bridge pole so the auto-miner tile is within POWER_POLE_RANGE in debug setup.
        { x: minerPos.x - 3, y: minerPos.y + 1 },
      ].filter((p) => p.x >= 0 && p.x < GRID_W && p.y >= 0 && p.y < GRID_H);

      const inputBelts = [
        { x: minerPos.x - 1, y: minerPos.y, dir: "west" as Direction },
        { x: minerPos.x - 2, y: minerPos.y, dir: "west" as Direction },
        { x: minerPos.x - 3, y: minerPos.y, dir: "west" as Direction },
      ];
      const outputBelts = [
        { x: autoSmelterPos.x - 1, y: autoSmelterPos.y, dir: "west" as Direction },
        { x: autoSmelterPos.x - 2, y: autoSmelterPos.y, dir: "west" as Direction },
        { x: autoSmelterPos.x - 3, y: autoSmelterPos.y, dir: "west" as Direction },
      ];

      clearAreaForDebug(warehousePos.x, warehousePos.y, 2);
      clearAreaForDebug(autoSmelterPos.x, autoSmelterPos.y, 2);
      clearAreaForDebug(generatorA.x, generatorA.y, 2);
      clearAreaForDebug(generatorB.x, generatorB.y, 2);
      for (const p of polePositions) clearAreaForDebug(p.x, p.y, 1);
      for (const belt of [...inputBelts, ...outputBelts]) clearAreaForDebug(belt.x, belt.y, 1);

      for (const g of [generatorA, generatorB]) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            floorMap[cellKey(g.x + dx, g.y + dy)] = "stone_floor";
          }
        }
      }

      tryPlace("warehouse", warehousePos.x, warehousePos.y, 2);
      tryPlace("generator", generatorA.x, generatorA.y, 2);
      tryPlace("generator", generatorB.x, generatorB.y, 2);

      for (const p of polePositions) {
        const poleId = placeDirectedForDebug("power_pole", p.x, p.y, "north");
        if (!selectedPowerPoleId && poleId) selectedPowerPoleId = poleId;
      }

      const depositCellId = cellMap[cellKey(minerPos.x, minerPos.y)];
      const depositAsset = depositCellId ? assets[depositCellId] : null;
      let minerId: string | null = null;
      if (depositAsset && depositAsset.type === "iron_deposit") {
        minerId = makeId();
        assets[minerId] = {
          id: minerId,
          type: "auto_miner",
          x: minerPos.x,
          y: minerPos.y,
          size: 1,
          direction: minerPos.dir,
          priority: DEFAULT_MACHINE_PRIORITY,
        };
        cellMap[cellKey(minerPos.x, minerPos.y)] = minerId;
        autoMiners[minerId] = {
          depositId: depositCellId,
          resource: "iron",
          progress: 0,
        };
      }

      for (const belt of [...inputBelts, ...outputBelts]) {
        const convId = placeDirectedForDebug("conveyor", belt.x, belt.y, belt.dir);
        if (convId) conveyors[convId] = { queue: [] };
      }

      const smelterPlaced = placeAsset(assets, cellMap, "auto_smelter", autoSmelterPos.x, autoSmelterPos.y, 2, 2, 1);
      if (smelterPlaced) {
        Object.assign(assets, smelterPlaced.assets);
        assets[smelterPlaced.id] = {
          ...smelterPlaced.assets[smelterPlaced.id],
          direction: "west",
          priority: DEFAULT_MACHINE_PRIORITY,
        };
        for (const [k, v] of Object.entries(smelterPlaced.cellMap)) {
          cellMap[k] = v;
        }
        autoSmelters[smelterPlaced.id] = {
          inputBuffer: [],
          processing: null,
          pendingOutput: [],
          status: "IDLE",
          lastRecipeInput: null,
          lastRecipeOutput: null,
          throughputEvents: [],
          selectedRecipe: "iron",
        };

        const io = getAutoSmelterIoCells(assets[smelterPlaced.id]);
        const inputNeighborId = cellMap[cellKey(io.input.x, io.input.y)];
        const outputNeighborId = cellMap[cellKey(io.output.x, io.output.y)];
        const inputNeighbor = inputNeighborId ? assets[inputNeighborId] : null;
        const outputNeighbor = outputNeighborId ? assets[outputNeighborId] : null;
        const beltFound =
          (inputNeighbor?.type === "conveyor" || inputNeighbor?.type === "conveyor_corner") &&
          (outputNeighbor?.type === "conveyor" || outputNeighbor?.type === "conveyor_corner");

        console.log("[DebugSetup] Auto-Miner:", minerId ? assets[minerId] : null);
        console.log("[DebugSetup] Auto-Smelter:", assets[smelterPlaced.id]);
        console.log("[DebugSetup] Lagerhaus:", Object.values(assets).find((a) => a.type === "warehouse"));
        console.log("[DebugSetup] Generator A:", generatorA, "Generator B:", generatorB);
        console.log("[DebugSetup] Smelter Input-Tile:", io.input);
        console.log("[DebugSetup] Smelter Output-Tile:", io.output);
        console.log("[DebugSetup] Förderbänder korrekt erkannt:", beltFound, {
          inputType: inputNeighbor?.type ?? null,
          outputType: outputNeighbor?.type ?? null,
        });
        console.log("[DebugSetup] Miner -> Input-Band verbunden:", {
          minerOutputTile: { x: minerPos.x - 1, y: minerPos.y },
          inputTile: io.input,
          connected: minerPos.x - 1 === inputBelts[0].x && minerPos.y === inputBelts[0].y,
        });
      }

    }
  }

  // Build per-instance generator state; debug mode pre-fuels all generators and starts them.
  const generators: Record<string, GeneratorState> = {};
  for (const asset of Object.values(assets)) {
    if (asset.type === "generator") {
      generators[asset.id] = isDebug
        ? { fuel: 500, progress: 0, running: true }
        : { fuel: 0, progress: 0, running: false };
    }
  }

  const inventory: Inventory = {
    ...createEmptyInventory(),
    // Start with no resources in debug mode – use the Debug Panel (999 per click) to add them.
    // In normal mode, give the player a small coin starting grant only.
    ...(isDebug ? { coins: 99999 } : { coins: 1000 }),
  };

  const warehouseInventories: Record<string, Inventory> = {};
  for (const a of Object.values(assets)) {
    if (a.type === "warehouse") {
      warehouseInventories[a.id] = createEmptyInventory();
    }
  }

  const hotbar = createInitialHotbar();
  // No pre-filled debug hotbar – tools come from Debug Panel → warehouse → hotbar.
  const warehouseCount = Object.values(assets).filter((a) => a.type === "warehouse").length;
  const powerPoleCount = Object.values(assets).filter((a) => a.type === "power_pole").length;
  const hasGenerator = Object.values(assets).some((a) => a.type === "generator");
  const connectedAssetIds = computeConnectedAssetIds({ assets, cellMap, constructionSites: {} });
  const anyGeneratorRunning = Object.values(generators).some((g) => g.running);
  const poweredMachineIds = anyGeneratorRunning
    ? connectedAssetIds.filter((id) => {
        const a = assets[id];
        return !!a && isEnergyConsumerType(a.type);
      })
    : [];

  const initial: GameState = {
    mode,
    assets,
    cellMap,
    inventory,
    purchasedBuildings: hasGenerator ? ["generator"] : [],
    placedBuildings: hasGenerator ? ["generator"] : [],
    warehousesPurchased: warehouseCount,
    warehousesPlaced: warehouseCount,
    warehouseInventories,
    selectedWarehouseId: null,
    cablesPlaced: 0,
    powerPolesPlaced: powerPoleCount,
    selectedPowerPoleId,
    hotbarSlots: hotbar,
    activeSlot: 0,
    smithy: { fuel: 0, iron: 0, copper: 0, selectedRecipe: "iron", processing: false, progress: 0, outputIngots: 0, outputCopperIngots: 0, buildingId: null },
    generators,
    battery: { stored: 0, capacity: BATTERY_CAPACITY },
    connectedAssetIds,
    poweredMachineIds,
    openPanel: null,
    notifications: [],
    saplingGrowAt: {},
    buildMode: false,
    selectedBuildingType: null,
    selectedFloorTile: null,
    floorMap,
    autoMiners,
    conveyors,
    selectedAutoMinerId: null,
    autoSmelters,
    selectedAutoSmelterId: null,
    selectedGeneratorId: null,
    selectedServiceHubId: null,
    manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
    machinePowerRatio: {},
    energyDebugOverlay: false,
    autoDeliveryLog: [],
    buildingSourceWarehouseIds: {},
    productionZones: {},
    buildingZoneIds: {},
    selectedCraftingBuildingId: null,
    collectionNodes: {},
    starterDrone: {
      status: "idle",
      tileX: protoHubId ? MAP_SHOP_POS.x + 3 : MAP_SHOP_POS.x,
      tileY: MAP_SHOP_POS.y,
      targetNodeId: null,
      cargo: null,
      ticksRemaining: 0,
      hubId: protoHubId ?? null,
      currentTaskType: null,
      deliveryTargetId: null,
      craftingJobId: null,
      droneId: "starter",
    },
    drones: {} as Record<string, StarterDroneState>,
    serviceHubs: protoHubId
      ? { [protoHubId]: { inventory: createEmptyHubInventory(), targetStock: createDefaultProtoHubTargetStock(), tier: 1 as HubTier, droneIds: ["starter"] } }
      : {},
    constructionSites: {},
    network: createEmptyNetworkSlice(),
    crafting: createEmptyCraftingQueue(),
    keepStockByWorkbench: {},
    recipeAutomationPolicies: {},
  };
  // Ensure drones record is pre-populated with the starter drone
  initial.drones = { starter: initial.starterDrone };
  return initial;
}

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
};

function tickOneDrone(state: GameState, droneId: string): GameState {
  return tickOneDroneExecution(state, droneId, tickOneDroneDeps);
}

const tickAllDronesDeps: TickAllDronesDeps = {
  tickOneDrone,
  readStarterRecord: (state) => state.drones.starter,
  writeStarterRecord: (state, starter) => ({
    ...state,
    drones: { ...state.drones, starter },
  }),
  listDroneIds: (state) => Object.keys(state.drones),
};

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

const ZONE_ACTION_DEPS: ZoneActionDeps = {
  makeId,
};

const UI_CELL_PRELUDE_DEPS: UiCellPreludeDeps = {
  tryTogglePanelFromAsset,
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
  addErrorNotification,
  debugLog,
};

const BUILDING_SITE_ACTION_DEPS: BuildingSiteActionDeps = {
  isUnderConstruction,
  addErrorNotification,
  fullCostAsRemaining,
  debugLog,
};

export function gameReducer(state: GameState, action: GameAction): GameState {
  const craftingQueueResult = handleCraftingQueueAction(state, action, CRAFTING_QUEUE_ACTION_DEPS);
  if (craftingQueueResult !== null) return craftingQueueResult;
  const zoneResult = handleZoneAction(state, action, ZONE_ACTION_DEPS);
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

      // ---- NO cable removal outside build mode ----
      // (removed old cable-click-remove logic here; cables are removed via BUILD_REMOVE_ASSET)

      const slot = state.hotbarSlots[state.activeSlot];
      if (!slot || slot.toolKind === "empty") return state;

      // Block building placement from hotbar in normal mode
      if (slot.toolKind === "building") return state;

      // Block tool usage on 2×2 deposits – they require an Auto-Miner
      if (asset && DEPOSIT_TYPES.has(asset.type)) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Benötigt Auto-Miner") };
      }

      // === AXE: fell tree (durability 1) ===
      // Wood is spawned as a CollectionNode at the tree tile — NOT booked into
      // the warehouse/central inventory. A later drone/service-hub pass will
      // pick these up. Saplings are intentionally excluded from this system
      // and keep their existing hotbar/inventory path.
      if (slot.toolKind === "axe") {
        if (!asset || asset.type !== "tree") {
          if (asset && ((["stone", "iron", "copper"] as string[]).includes(asset.type))) {
            const msg = asset.type === "stone"
              ? "Du brauchst eine Holz- oder Steinspitzhacke."
              : "Du brauchst eine Steinspitzhacke.";
            return { ...state, notifications: addErrorNotification(state.notifications, msg) };
          }
          return state;
        }
        if (slot.amount <= 0) return state;
        const treeX = asset.x;
        const treeY = asset.y;
        const removed = removeAsset(state, assetId);
        const collectionNodes = addToCollectionNodeAt(state.collectionNodes, "wood", treeX, treeY, RESOURCE_1x1_DROP_AMOUNT);
        let notifs = state.notifications;
        let hotbar0 = hotbarDecrement(state.hotbarSlots, state.activeSlot);
        let inv = state.inventory;
        debugLog.mining(`Felled tree at (${x},${y}) with Axe → wood CollectionNode @ (${treeX},${treeY})`);
        if (Math.random() < SAPLING_DROP_CHANCE) {
          const cap = getCapacityPerResource(state);
          const withSapling = hotbarAdd(hotbar0, "sapling");
          if (withSapling) {
            hotbar0 = withSapling;
            notifs = addNotification(notifs, "sapling", 1);
          } else if (inv.sapling < cap) {
            inv = addResources(inv, { sapling: 1 });
            notifs = addNotification(notifs, "sapling", 1);
            debugLog.inventory("Sapling drop → added to central inventory");
          }
        }
        return { ...state, ...removed, inventory: inv, hotbarSlots: hotbar0, notifications: notifs, collectionNodes };
      }
      if (slot.toolKind === "wood_pickaxe") {
        if (!asset || asset.type !== "stone") {
          if (asset && asset.type === "tree") {
            return { ...state, notifications: addErrorNotification(state.notifications, "Du brauchst eine Axt.") };
          }
          if (asset && (["iron", "copper"] as string[]).includes(asset.type)) {
            return { ...state, notifications: addErrorNotification(state.notifications, "Du brauchst eine Steinspitzhacke.") };
          }
          return state;
        }
        if (slot.amount <= 0) return state;
        const tileX = asset.x;
        const tileY = asset.y;
        const removed = removeAsset(state, assetId);
        const collectionNodes = addToCollectionNodeAt(state.collectionNodes, "stone", tileX, tileY, RESOURCE_1x1_DROP_AMOUNT);
        const newHotbar1 = hotbarDecrement(state.hotbarSlots, state.activeSlot);
        debugLog.mining(`Mined stone at (${x},${y}) with Wood Pickaxe → CollectionNode @ (${tileX},${tileY})`);
        return { ...state, ...removed, hotbarSlots: newHotbar1, collectionNodes };
      }

      // === STONE_PICKAXE: mine stone, iron, copper ===
      if (slot.toolKind === "stone_pickaxe") {
        if (!asset || !(["stone", "iron", "copper"] as string[]).includes(asset.type)) {
          if (asset && asset.type === "tree") {
            return { ...state, notifications: addErrorNotification(state.notifications, "Du brauchst eine Axt.") };
          }
          return state;
        }
        if (slot.amount <= 0) return state;
        const itemType = asset.type as CollectableItemType;
        const tileX = asset.x;
        const tileY = asset.y;
        const removed = removeAsset(state, assetId);
        const collectionNodes = addToCollectionNodeAt(state.collectionNodes, itemType, tileX, tileY, RESOURCE_1x1_DROP_AMOUNT);
        const newHotbar2 = hotbarDecrement(state.hotbarSlots, state.activeSlot);
        debugLog.mining(`Mined ${asset.type} at (${x},${y}) with Stone Pickaxe → CollectionNode @ (${tileX},${tileY})`);
        return { ...state, ...removed, hotbarSlots: newHotbar2, collectionNodes };
      }

      // === PLACE SAPLING ===
      if (slot.toolKind === "sapling") {
        if (slot.amount <= 0 || asset) return state;
        const placed = placeAsset(state.assets, state.cellMap, "sapling", x, y, 1);
        if (!placed) return state;
        const newHotbar3 = hotbarDecrement(state.hotbarSlots, state.activeSlot);
        debugLog.building(`Placed Sapling at (${x},${y})`);
        return {
          ...state,
          assets: placed.assets,
          cellMap: placed.cellMap,
          hotbarSlots: newHotbar3,
          saplingGrowAt: { ...state.saplingGrowAt, [placed.id]: Date.now() + SAPLING_GROW_MS },
        };
      }

      // Buildings are placed exclusively via BUILD_PLACE_BUILDING (build mode)

      return state;
    }

    // SET_ACTIVE_SLOT is handled above by handleUiAction.

    case "BUY_MAP_SHOP_ITEM": {
      const item = MAP_SHOP_ITEMS.find((i) => i.key === action.itemKey);
      if (!item) return state;
      if (!hasResources(state.inventory, { coins: item.costCoins })) return state;
      const baseInv = consumeResources(state.inventory, { coins: item.costCoins });
      const notifs = addNotification(state.notifications, item.key, 1);
      const toolHotbarKinds: ToolKind[] = ["axe", "wood_pickaxe", "stone_pickaxe"];
      const toolKind = item.key as ToolKind;
      if (toolHotbarKinds.includes(toolKind)) {
        const newHotbar = hotbarAdd(state.hotbarSlots, toolKind as Exclude<ToolKind, "empty">);
        if (newHotbar) {
          return { ...state, inventory: baseInv, hotbarSlots: newHotbar, notifications: notifs };
        }
      }
      const newInv = addResources(baseInv, { [item.inventoryKey]: 1 });
      return { ...state, inventory: newInv, notifications: notifs };
    }

    case "CRAFT_WORKBENCH": {
      if (import.meta.env.DEV) {
        console.warn("CRAFT_WORKBENCH deprecated - use queue");
      }
      debugLog.general("CRAFT_WORKBENCH deprecated - use queue");
      return state;
    }

    // TOGGLE_PANEL and CLOSE_PANEL are handled above by handleUiAction.

    case "EQUIP_BUILDING_FROM_WAREHOUSE": {
      const { buildingType, amount = 1 } = action;
      const whId = state.selectedWarehouseId;
      if (!whId) return state;
      const whInv = state.warehouseInventories[whId];
      if (!whInv) return state;
      const invKey = buildingType as keyof Inventory;
      if ((whInv[invKey] as number) < amount) return state;

      const newHotbar = hotbarAdd(state.hotbarSlots, "building", buildingType, amount);
      if (!newHotbar) {
        return {
          ...state,
          notifications: addErrorNotification(
            state.notifications,
            "Hotbar voll! Kein Platz zum Ausrüsten.",
          ),
        };
      }

      const newWhInv = {
        ...whInv,
        [invKey]: (whInv[invKey] as number) - amount,
      };

      return {
        ...state,
        warehouseInventories: {
          ...state.warehouseInventories,
          [whId]: newWhInv,
        },
        hotbarSlots: newHotbar,
      };
    }

    case "EQUIP_FROM_WAREHOUSE": {
      const { itemKind, amount = 1 } = action;
      debugLog.hotbar(`Equip ${RESOURCE_LABELS[itemKind] ?? itemKind} ×${amount} from warehouse → hotbar`);
      const invKey = itemKind as keyof Inventory;
      const whId = state.selectedWarehouseId;
      if (!whId) return state;
      const whInv = state.warehouseInventories[whId];
      if (!whInv) return state;
      if ((whInv[invKey] as number) < amount) return state;
      const newHotbar = hotbarAdd(state.hotbarSlots, itemKind as Exclude<ToolKind, "empty">, undefined, amount);
      if (!newHotbar) return { ...state, notifications: addErrorNotification(state.notifications, "Hotbar voll! Kein Platz zum Ausrüsten.") };
      const newWhInv = { ...whInv, [invKey]: (whInv[invKey] as number) - amount };
      return { ...state, warehouseInventories: { ...state.warehouseInventories, [whId]: newWhInv }, hotbarSlots: newHotbar };
    }

    // ---- Manual resource transfers: global ↔ selected warehouse ----

    case "TRANSFER_TO_WAREHOUSE": {
      const { item, amount } = action;
      if (amount <= 0) return state;
      const whId = state.selectedWarehouseId;
      if (!whId) return state;
      if (isUnderConstruction(state, whId)) return state;
      const whInv = state.warehouseInventories[whId];
      if (!whInv) return state;

      // Clamp to what is actually available in global inventory
      const globalAvailable = getAvailableResource(state, item);
      const whCap = getWarehouseCapacity(state.mode);
      const whCurrent = whInv[item] as number;
      const spaceInWarehouse = item === "coins" ? Infinity : Math.max(0, whCap - whCurrent);
      const transferAmount = Math.min(amount, globalAvailable, spaceInWarehouse);
      if (transferAmount <= 0) return state;

      return {
        ...state,
        inventory: consumeResources(state.inventory, { [item]: transferAmount }),
        warehouseInventories: {
          ...state.warehouseInventories,
          [whId]: addResources(whInv, { [item]: transferAmount }),
        },
      };
    }

    case "TRANSFER_FROM_WAREHOUSE": {
      const { item, amount } = action;
      if (amount <= 0) return state;
      const whId = state.selectedWarehouseId;
      if (!whId) return state;
      if (isUnderConstruction(state, whId)) return state;
      const whInv = state.warehouseInventories[whId];
      if (!whInv) return state;

      // Clamp to what the warehouse actually holds
      const whAvailable = whInv[item] as number;
      const transferAmount = Math.min(amount, whAvailable);
      if (transferAmount <= 0) return state;

      return {
        ...state,
        inventory: addResources(state.inventory, { [item]: transferAmount }),
        warehouseInventories: {
          ...state.warehouseInventories,
          [whId]: consumeResources(whInv, { [item]: transferAmount }),
        },
      };
    }

    case "SMITHY_ADD_FUEL": {
      const smithyForFuel = getSelectedCraftingAsset(state, "smithy");
      if (!smithyForFuel) return state;
      logCraftingSelectionComparison(state, "smithy", smithyForFuel.id);
      if (isUnderConstruction(state, smithyForFuel.id)) return state;
      const source = resolveBuildingSource(state, state.selectedCraftingBuildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const amt = Math.min(action.amount, sourceInv.wood as number);
      if (amt > 0) debugLog.smithy(`Added ${amt} Wood as fuel`);
      if (amt <= 0) return state;
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { wood: amt })),
        smithy: { ...state.smithy, fuel: state.smithy.fuel + amt },
      };
    }

    case "SMITHY_ADD_IRON": {
      const smithyForIron = getSelectedCraftingAsset(state, "smithy");
      if (!smithyForIron) return state;
      logCraftingSelectionComparison(state, "smithy", smithyForIron.id);
      if (isUnderConstruction(state, smithyForIron.id)) return state;
      const source = resolveBuildingSource(state, state.selectedCraftingBuildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const amt = Math.min(action.amount, sourceInv.iron as number);
      if (amt > 0) debugLog.smithy(`Added ${amt} Iron ore`);
      if (amt <= 0) return state;
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { iron: amt })),
        smithy: { ...state.smithy, iron: state.smithy.iron + amt },
      };
    }

    case "SMITHY_ADD_COPPER": {
      const smithyForCopper = getSelectedCraftingAsset(state, "smithy");
      if (!smithyForCopper) return state;
      logCraftingSelectionComparison(state, "smithy", smithyForCopper.id);
      if (isUnderConstruction(state, smithyForCopper.id)) return state;
      const source = resolveBuildingSource(state, state.selectedCraftingBuildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const amt = Math.min(action.amount, sourceInv.copper as number);
      if (amt > 0) debugLog.smithy(`Added ${amt} Copper ore`);
      if (amt <= 0) return state;
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { copper: amt })),
        smithy: { ...state.smithy, copper: state.smithy.copper + amt },
      };
    }

    case "SMITHY_SET_RECIPE": {
      if (state.smithy.processing) return state;
      return { ...state, smithy: { ...state.smithy, selectedRecipe: action.recipe } };
    }

    case "SMITHY_START": {
      const s = state.smithy;
      const smithyAsset = getSelectedCraftingAsset(state, "smithy");
      if (!smithyAsset) return state;
      logCraftingSelectionComparison(state, "smithy", smithyAsset.id);
      if (isUnderConstruction(state, smithyAsset.id)) {
        return { ...state, notifications: addErrorNotification(state.notifications, `Schmelze [${smithyAsset.id}] ist noch im Bau.`) };
      }
      const smithyPowered =
        !!smithyAsset && (state.poweredMachineIds ?? []).includes(smithyAsset.id);
      if (!smithyPowered) {
        debugLog.smithy(`Crafting smithy [${smithyAsset.id}] - not enough power`);
        return {
          ...state,
          notifications: addErrorNotification(state.notifications, `Schmelze [${smithyAsset.id}] hat keinen Strom.`),
        };
      }
      debugLog.smithy(`Crafting smithy [${smithyAsset.id}] - Power OK`);
      if (s.processing || s.fuel <= 0) return state;
      const recipe = getSmeltingRecipe(s.selectedRecipe);
      if (!recipe) return state;
      const rawAmt = s.selectedRecipe === "iron" ? s.iron : s.copper;
      if (rawAmt < recipe.inputAmount) return state;
      debugLog.smithy(`Started smelting ${s.selectedRecipe} (fuel=${s.fuel}, ore=${rawAmt})`);
      return { ...state, smithy: { ...s, processing: true, progress: 0, buildingId: smithyAsset.id } };
    }

    case "SMITHY_STOP":
      return { ...state, smithy: { ...state.smithy, processing: false } };

    case "SMITHY_TICK": {
      const s = state.smithy;
      const smithyAsset = getActiveSmithyAsset(state);
      if (!smithyAsset) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      if (isUnderConstruction(state, smithyAsset.id)) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      const smithyPowered =
        !!smithyAsset && (state.poweredMachineIds ?? []).includes(smithyAsset.id);
      if (!smithyPowered) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      const recipe = getSmeltingRecipe(s.selectedRecipe);
      if (!recipe) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      const rawAmt = s.selectedRecipe === "iron" ? s.iron : s.copper;
      if (!s.processing || s.fuel <= 0 || rawAmt < recipe.inputAmount)
        return { ...state, smithy: { ...s, processing: false } };
      const newProgress = s.progress + SMITHY_TICK_MS / SMITHY_PROCESS_MS;
      if (newProgress >= 1) {
        const newFuel = s.fuel - 1;
        if (recipe.inputItem === "iron") {
          const newIron = s.iron - recipe.inputAmount;
          const canContinue = newFuel > 0 && newIron >= recipe.inputAmount;
          return {
            ...state,
            smithy: { ...s, iron: newIron, fuel: newFuel, outputIngots: s.outputIngots + recipe.outputAmount, progress: 0, processing: canContinue },
            notifications: addNotification(state.notifications, recipe.outputItem, recipe.outputAmount),
          };
        } else {
          const newCopper = s.copper - recipe.inputAmount;
          const canContinue = newFuel > 0 && newCopper >= recipe.inputAmount;
          return {
            ...state,
            smithy: { ...s, copper: newCopper, fuel: newFuel, outputCopperIngots: s.outputCopperIngots + recipe.outputAmount, progress: 0, processing: canContinue },
            notifications: addNotification(state.notifications, recipe.outputItem, recipe.outputAmount),
          };
        }
      }
      return { ...state, smithy: { ...s, progress: newProgress } };
    }

    case "SMITHY_WITHDRAW": {
      const ironAmt = state.smithy.outputIngots;
      const copperAmt = state.smithy.outputCopperIngots;
      if (ironAmt <= 0 && copperAmt <= 0) return state;
      const source = resolveBuildingSource(state, state.smithy.buildingId ?? state.selectedCraftingBuildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const newSourceInv = addResources(sourceInv, { ironIngot: ironAmt, copperIngot: copperAmt });
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, newSourceInv),
        smithy: { ...state.smithy, outputIngots: 0, outputCopperIngots: 0 },
      };
    }

    case "MANUAL_ASSEMBLER_START": {
      const maAsset = getSelectedCraftingAsset(state, "manual_assembler");
      if (!maAsset) return state;
      logCraftingSelectionComparison(state, "manual_assembler", maAsset.id);
      if (isUnderConstruction(state, maAsset.id)) {
        return {
          ...state,
          notifications: addErrorNotification(state.notifications, `Manueller Assembler [${maAsset.id}] ist noch im Bau.`),
        };
      }
      if (state.manualAssembler.processing) return state;
      const recipe = getManualAssemblerRecipe(action.recipe);
      if (!recipe) return state;
      const bId = maAsset.id;
      const source = resolveBuildingSource(state, bId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const outputKey = recipe.outputItem as keyof Inventory;
      const inputKey = recipe.inputItem as keyof Inventory;

      // Capacity check against active source
      const cap = source.kind === "global" ? getCapacityPerResource(state) : source.kind === "zone" ? getZoneItemCapacity(state, source.zoneId) : (state.mode === "debug" ? Infinity : WAREHOUSE_CAPACITY);
      if ((sourceInv[outputKey] as number) >= cap) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
      }
      if ((sourceInv[inputKey] as number) < recipe.inputAmount) {
        const error = recipe.key === "metal_plate" ? "Nicht genug Metallbarren!" : "Nicht genug Metallplatten!";
        return { ...state, notifications: addErrorNotification(state.notifications, error) };
      }

      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { [inputKey]: recipe.inputAmount })),
        manualAssembler: { processing: true, recipe: recipe.key, progress: 0, buildingId: bId },
      };
    }

    case "MANUAL_ASSEMBLER_TICK": {
      const m = state.manualAssembler;
      if (!m.processing || !m.recipe) return state;
      const recipe = getManualAssemblerRecipe(m.recipe);
      if (!recipe) return { ...state, manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null } };

      const newProgress = m.progress + MANUAL_ASSEMBLER_TICK_MS / Math.max(1, recipe.processingTime * 1000);
      if (newProgress < 1) {
        return { ...state, manualAssembler: { ...m, progress: newProgress } };
      }

      // Use the building ID stored at START time for output routing
      const source = resolveBuildingSource(state, m.buildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const outputKey = recipe.outputItem as keyof Inventory;
      const cap = source.kind === "global" ? getCapacityPerResource(state) : source.kind === "zone" ? getZoneItemCapacity(state, source.zoneId) : (state.mode === "debug" ? Infinity : WAREHOUSE_CAPACITY);
      if ((sourceInv[outputKey] as number) >= cap) {
        return {
          ...state,
          manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
          notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser."),
        };
      }

      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, addResources(sourceInv, { [outputKey]: recipe.outputAmount })),
        manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
        notifications: addNotification(state.notifications, outputKey, recipe.outputAmount),
      };
    }

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

    case "REMOVE_FROM_HOTBAR": {
      const hs = state.hotbarSlots[action.slot];
      if (!hs || hs.toolKind === "empty") return state;
      debugLog.hotbar(`Removed ${hs.label || hs.toolKind} ×${hs.amount} from Hotbar slot ${action.slot}`);
      const whId = state.selectedWarehouseId;
      if (!whId || !state.warehouseInventories[whId]) return state;
      const whInv = state.warehouseInventories[whId];
      const newHotbarSlots = state.hotbarSlots.map((s, i) =>
        i === action.slot ? { ...EMPTY_HOTBAR_SLOT } : s
      );
      let newWhInv = { ...whInv };
      if (hs.toolKind === "building" && hs.buildingType) {
        const bType = hs.buildingType;
        (newWhInv as any)[bType] = ((newWhInv as any)[bType] ?? 0) + hs.amount;
        return { ...state, warehouseInventories: { ...state.warehouseInventories, [whId]: newWhInv }, hotbarSlots: newHotbarSlots };
      }
      if (hs.toolKind === "axe") newWhInv = { ...newWhInv, axe: newWhInv.axe + hs.amount };
      else if (hs.toolKind === "wood_pickaxe") newWhInv = { ...newWhInv, wood_pickaxe: newWhInv.wood_pickaxe + hs.amount };
      else if (hs.toolKind === "stone_pickaxe") newWhInv = { ...newWhInv, stone_pickaxe: newWhInv.stone_pickaxe + hs.amount };
      else if (hs.toolKind === "sapling") newWhInv = { ...newWhInv, sapling: newWhInv.sapling + hs.amount };
      return { ...state, warehouseInventories: { ...state.warehouseInventories, [whId]: newWhInv }, hotbarSlots: newHotbarSlots };
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

    // ============================================================
    // GENERATOR & ENERGY CASES
    // ============================================================

    case "GENERATOR_ADD_FUEL": {
      const genId = state.selectedGeneratorId;
      if (!genId || !state.generators[genId]) return state;
      if (isUnderConstruction(state, genId)) return state;
      const source = resolveBuildingSource(state, genId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const gen = state.generators[genId];
      const space = Math.max(0, GENERATOR_MAX_FUEL - gen.fuel);
      const amt = Math.min(action.amount, (sourceInv.wood as number) ?? 0, space);
      if (amt <= 0) return state;
      debugLog.building(`Generator ${genId}: added ${amt} wood as fuel (${gen.fuel} → ${gen.fuel + amt}/${GENERATOR_MAX_FUEL})`);
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { wood: amt })),
        generators: { ...state.generators, [genId]: { ...gen, fuel: gen.fuel + amt } },
      };
    }

    case "GENERATOR_REQUEST_REFILL": {
      const genId = state.selectedGeneratorId;
      if (!genId || !state.generators[genId]) return state;
      if (isUnderConstruction(state, genId)) return state;
      const gen = state.generators[genId];
      const currentReq = gen.requestedRefill ?? 0;
      // Cap by remaining fuel-slot space minus what's already been requested
      // (so repeated clicks don't over-promise beyond capacity).
      const headroom = Math.max(0, GENERATOR_MAX_FUEL - gen.fuel - currentReq);
      const desired = action.amount === "max" ? headroom : Math.max(0, Math.floor(action.amount));
      const add = Math.min(desired, headroom);
      if (add <= 0) {
        return {
          ...state,
          notifications: addErrorNotification(
            state.notifications,
            currentReq > 0
              ? `Generator ${genId}: bereits ${currentReq} Holz angefordert`
              : `Generator ${genId}: Speicher voll`,
          ),
        };
      }
      debugLog.building(`Generator ${genId}: refill request +${add} (open ${currentReq} → ${currentReq + add})`);
      return {
        ...state,
        generators: { ...state.generators, [genId]: { ...gen, requestedRefill: currentReq + add } },
      };
    }

    case "GENERATOR_START": {
      const genId = state.selectedGeneratorId;
      if (!genId) return state;
      if (isUnderConstruction(state, genId)) return state;
      const gen = state.generators[genId];
      if (!gen || gen.running || gen.fuel <= 0) return state;
      debugLog.building(`Generator ${genId}: started`);
      return { ...state, generators: { ...state.generators, [genId]: { ...gen, running: true } } };
    }

    case "GENERATOR_STOP": {
      const genId = state.selectedGeneratorId;
      if (!genId) return state;
      const gen = state.generators[genId];
      if (!gen) return state;
      debugLog.building(`Generator ${genId}: stopped`);
      const fuelAfterStop = gen.progress > 0 ? Math.max(0, gen.fuel - 1) : gen.fuel;
      return { ...state, generators: { ...state.generators, [genId]: { ...gen, running: false, progress: 0, fuel: fuelAfterStop } } };
    }

    case "GENERATOR_TICK": {
      const newGenerators = { ...state.generators };
      let changed = false;
      for (const id of Object.keys(newGenerators)) {
        if (isUnderConstruction(state, id)) continue;
        const g = newGenerators[id];
        if (!g.running || g.fuel <= 0) {
          if (g.running) { newGenerators[id] = { ...g, running: false }; changed = true; }
          continue;
        }
        const newProgress = g.progress + 1 / GENERATOR_TICKS_PER_WOOD;
        if (newProgress >= 1) {
          const newFuel = g.fuel - 1;
          newGenerators[id] = { ...g, fuel: newFuel, progress: 0, running: newFuel > 0 };
        } else {
          newGenerators[id] = { ...g, progress: newProgress };
        }
        changed = true;
      }
      if (!changed) return state;
      return { ...state, generators: newGenerators };
    }

    case "ENERGY_NET_TICK": {
      // === Generator production over this 2-second period ===
      const production = getEnergyProductionPerPeriod(state);

      // === Connected consumer machines ===
      const connectedConsumers = state.connectedAssetIds
        .map((id) => state.assets[id])
        .filter((a): a is PlacedAsset => !!a && isEnergyConsumerType(a.type));

      // Priority scheduling: lower number gets energy first.
      // For equal priority, keep the logistics backbone stable by serving
      // conveyors first, then miners, then other machines, then smelters.
      const prioritizedConsumers = connectedConsumers
        .map((asset, index) => ({
          asset,
          index,
          priority: clampMachinePriority(asset.priority),
          allocationRank: getEnergyAllocationRank(asset.type),
          drain:
            (asset.type === "auto_smelter"
              ? (state.autoSmelters?.[asset.id]?.processing ? AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD : AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD)
              : ENERGY_DRAIN[asset.type]) * getBoostMultiplier(asset),
        }))
        .sort((a, b) => a.priority - b.priority || a.allocationRank - b.allocationRank || a.index - b.index);

      // === Battery is the sole energy storage ===
      const batteryAsset = Object.values(state.assets).find((a) => a.type === "battery");
      const batteryConnected = batteryAsset
        ? state.connectedAssetIds.includes(batteryAsset.id) && !isUnderConstruction(state, batteryAsset.id)
        : false;

      // Available energy in this period = production + (optional) battery discharge potential.
      let remainingEnergy = production + (batteryConnected ? state.battery.stored : 0);
      const poweredMachineIds: string[] = [];
      const machinePowerRatio: Record<string, number> = {};

      for (const consumer of prioritizedConsumers) {
        if (consumer.drain <= 0) {
          machinePowerRatio[consumer.asset.id] = 1;
          poweredMachineIds.push(consumer.asset.id);
          continue;
        }
        if (remainingEnergy <= 0) {
          machinePowerRatio[consumer.asset.id] = 0;
          continue;
        }
        const ratio = Math.max(0, Math.min(1, remainingEnergy / consumer.drain));
        machinePowerRatio[consumer.asset.id] = ratio;
        remainingEnergy -= consumer.drain * ratio;
        if (ratio >= 1) poweredMachineIds.push(consumer.asset.id);
      }

      let newBatteryStored = state.battery.stored;
      if (batteryConnected) {
        // Whatever remains after serving prioritized consumers is the new battery level.
        newBatteryStored = Math.min(state.battery.capacity, Math.max(0, remainingEnergy));
      }

      const prevPowered = state.poweredMachineIds ?? [];
      const samePoweredSet =
        poweredMachineIds.length === prevPowered.length &&
        poweredMachineIds.every((id, idx) => prevPowered[idx] === id);

      const samePowerRatio =
        Object.keys(machinePowerRatio).length === Object.keys(state.machinePowerRatio ?? {}).length &&
        Object.entries(machinePowerRatio).every(([id, ratio]) => Math.abs((state.machinePowerRatio?.[id] ?? 0) - ratio) < 0.0001);

      if (newBatteryStored === state.battery.stored && samePoweredSet && samePowerRatio) return state;

      return {
        ...state,
        battery: { ...state.battery, stored: newBatteryStored },
        poweredMachineIds,
        machinePowerRatio,
      };
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

    case "BUILD_PLACE_FLOOR_TILE": {
      if (!state.buildMode || !state.selectedFloorTile) return state;
      const tileType = state.selectedFloorTile;
      const { x, y } = action;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return state;
      const key = cellKey(x, y);

      // Cost check (considers global inventory + hub inventories)
      const tileCosts = FLOOR_TILE_COSTS[tileType];
      if (!hasResources(getEffectiveBuildInventory(state), tileCosts as Partial<Record<keyof Inventory, number>>)) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Nicht genug Ressourcen!") };
      }

      if (tileType === "stone_floor") {
        // Can only be placed on empty grass (no floor, no object)
        if (state.floorMap[key]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Hier liegt bereits Steinboden.") };
        }
        if (state.cellMap[key]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Das Feld ist belegt.") };
        }
        const newFloorMap = { ...state.floorMap, [key]: "stone_floor" as const };
        const consumedF = consumeBuildResources(state, tileCosts as Partial<Record<keyof Inventory, number>>);
        debugLog.building(`[BuildMode] Placed stone_floor at (${x},${y})`);
        return { ...state, floorMap: newFloorMap, inventory: consumedF.inventory, warehouseInventories: consumedF.warehouseInventories, serviceHubs: consumedF.serviceHubs };
      } else {
        // grass_block: convert stone_floor back to grass (no object on cell)
        if (!state.floorMap[key]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Kein Steinboden auf diesem Feld.") };
        }
        if (state.cellMap[key]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Das Feld ist belegt – Gebäude zuerst entfernen.") };
        }
        const newFloorMap = { ...state.floorMap };
        delete newFloorMap[key];
        const consumedF = consumeBuildResources(state, tileCosts as Partial<Record<keyof Inventory, number>>);
        debugLog.building(`[BuildMode] Placed grass_block at (${x},${y}) – stone floor removed`);
        return { ...state, floorMap: newFloorMap, inventory: consumedF.inventory, warehouseInventories: consumedF.warehouseInventories, serviceHubs: consumedF.serviceHubs };
      }
    }

    case "LOGISTICS_TICK": {
      const poweredSet = new Set(state.poweredMachineIds ?? []);
      let newAutoMinersL = state.autoMiners;
      let newConveyorsL = state.conveyors;
      let newInvL = state.inventory;
      let newWarehouseInventoriesL = state.warehouseInventories;
      let newSmithyL = state.smithy;
      let newNotifsL = state.notifications;
      let newAutoDeliveryLogL = state.autoDeliveryLog;
      let changed = false;

      const tryStoreInWarehouse = (warehouseId: string, resource: ConveyorItem): boolean => {
        // Warehouse building must exist
        const whInv = (newWarehouseInventoriesL === state.warehouseInventories
          ? state.warehouseInventories[warehouseId]
          : newWarehouseInventoriesL[warehouseId]);
        if (!whInv) return false;
        // Store into the warehouse's own inventory (per-WH storage)
        const cap = getWarehouseCapacity(state.mode);
        const resKey = resource as keyof Inventory;
        if ((whInv[resKey] as number) >= cap) return false;
        newWarehouseInventoriesL = newWarehouseInventoriesL === state.warehouseInventories
          ? { ...state.warehouseInventories }
          : newWarehouseInventoriesL;
        newWarehouseInventoriesL[warehouseId] = addResources(whInv, { [resKey]: 1 });
        return true;
      };

      const getLiveLogisticsState = (): GameState => {
        if (newInvL === state.inventory && newWarehouseInventoriesL === state.warehouseInventories) {
          return state;
        }
        return {
          ...state,
          inventory: newInvL,
          warehouseInventories: newWarehouseInventoriesL,
        };
      };

      const getSourceCapacity = (liveState: GameState, source: CraftingSource): number => {
        if (source.kind === "global") return getCapacityPerResource(liveState);
        if (source.kind === "zone") return getZoneItemCapacity(liveState, source.zoneId);
        return getWarehouseCapacity(liveState.mode);
      };

      const applySourceInventory = (source: CraftingSource, nextInv: Inventory): void => {
        const partial = applyCraftingSourceInventory(getLiveLogisticsState(), source, nextInv);
        if (partial.inventory) {
          newInvL = partial.inventory;
        }
        if (partial.warehouseInventories) {
          newWarehouseInventoriesL = partial.warehouseInventories;
        }
      };

      // ---- Auto-Miners: produce resources ----
      for (const [minerId, miner] of Object.entries(state.autoMiners)) {
        const minerAsset = state.assets[minerId];
        if (!minerAsset) continue;
        const isConnected = state.connectedAssetIds.includes(minerId);
        const powerRatio = Math.max(0, Math.min(1, state.machinePowerRatio?.[minerId] ?? (poweredSet.has(minerId) ? 1 : 0)));
        // Unterstrom = kompletter Stopp: Progress bleibt eingefroren, bis die Maschine wieder voll versorgt ist.
        // Hinweis: der Scheduler hat den (ggf. boosted) Mehrverbrauch bereits eingerechnet — liefert er ratio === 1,
        // ist der Bedarf gedeckt. Ist der Bedarf nicht gedeckt, ratio < 1 → hier wird abgebrochen.
        if (!isConnected || powerRatio < 1) continue;

        const minerBoost = getBoostMultiplier(minerAsset);
        let progress = miner.progress + minerBoost;
        if (progress >= AUTO_MINER_PRODUCE_TICKS) {
          const dir = minerAsset.direction ?? "east";
          const [ox, oy] = directionOffset(dir);
          const outX = minerAsset.x + ox;
          const outY = minerAsset.y + oy;
          let outputDone = false;

          // Priority 1: Adjacent conveyor — unchanged physical belt output.
          if (!outputDone && outX >= 0 && outX < GRID_W && outY >= 0 && outY < GRID_H) {
            const outAssetId = state.cellMap[cellKey(outX, outY)];
            const outAsset = outAssetId ? state.assets[outAssetId] : null;
            if (outAsset?.type === "conveyor" || outAsset?.type === "conveyor_corner") {
              const outConv = newConveyorsL === state.conveyors ? state.conveyors[outAssetId] : newConveyorsL[outAssetId];
              const outQueue = outConv?.queue ?? [];
              if (outQueue.length < CONVEYOR_TILE_CAPACITY) {
                newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
                newConveyorsL[outAssetId] = { queue: [...outQueue, miner.resource] };
                progress = 0;
                changed = true;
                outputDone = true;
              }
            }
          }

          // Priority 2: Zone-aware source output (Zone > Legacy-Warehouse > Global).
          if (!outputDone) {
            const liveState = getLiveLogisticsState();
            const source = resolveBuildingSource(liveState, minerId);
            const sourceInv = getCraftingSourceInventory(liveState, source);
            const sourceCapacity = getSourceCapacity(liveState, source);
            const resKey = miner.resource as keyof Inventory;
            if ((sourceInv[resKey] as number) < sourceCapacity) {
              const newSourceInv = addResources(sourceInv, { [resKey]: 1 });
              applySourceInventory(source, newSourceInv);
              const logWhId = source.kind === "warehouse"
                ? source.warehouseId
                : source.kind === "zone"
                ? (getZoneWarehouseIds(liveState, source.zoneId)[0] ?? minerId)
                : minerId;
              newAutoDeliveryLogL = addAutoDelivery(newAutoDeliveryLogL, "auto_miner", minerId, miner.resource, logWhId);
              progress = 0;
              changed = true;
              outputDone = true;
            }
          }

          // If still at max, stay blocked (output-Ziel hat keinen Platz).
          if (progress >= AUTO_MINER_PRODUCE_TICKS) progress = AUTO_MINER_PRODUCE_TICKS;
        }
        if (progress !== miner.progress) {
          newAutoMinersL = newAutoMinersL === state.autoMiners ? { ...state.autoMiners } : newAutoMinersL;
          newAutoMinersL[minerId] = { ...miner, progress };
          changed = true;
        }
      }

      // ---- Conveyors: move items ----
      const movedThisTick = new Set<string>();
      for (const [convId, conv] of Object.entries(state.conveyors)) {
        const activeConv = newConveyorsL === state.conveyors ? conv : newConveyorsL[convId];
        const activeQueue = activeConv?.queue ?? [];
        const currentItem = activeQueue[0] ?? null;
        if (!currentItem) continue;
        if (movedThisTick.has(convId)) continue;
        const convAsset = state.assets[convId];
        if (!convAsset) continue;
        const isConnected = state.connectedAssetIds.includes(convId);
        const isPowered = poweredSet.has(convId);
        if (!isConnected || !isPowered) continue;

        // ---- Priority: if this belt is sitting on a warehouse input tile, deliver directly ----
        // This overrides directional movement so the item always goes into the warehouse
        // regardless of which direction the belt faces.
        let deliveredToWarehouse = false;
        for (const wAsset of Object.values(state.assets)) {
          if (wAsset.type !== "warehouse") continue;
          if (convAsset.x === wAsset.x && convAsset.y === wAsset.y + assetHeight(wAsset)) {
            const convZoneDirect = state.buildingZoneIds[convId] ?? null;
            const whZoneDirect = state.buildingZoneIds[wAsset.id] ?? null;
            if (areZonesTransportCompatible(convZoneDirect, whZoneDirect) && tryStoreInWarehouse(wAsset.id, currentItem)) {
              newAutoDeliveryLogL = addAutoDelivery(newAutoDeliveryLogL, "conveyor", convId, currentItem, wAsset.id);
              newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
              newConveyorsL[convId] = { queue: activeQueue.slice(1) };
              changed = true;
            }
            deliveredToWarehouse = true;
            break;
          }
        }
        if (deliveredToWarehouse) continue;

        const inDir = convAsset.direction ?? "east";
        // For both conveyor and conveyor_corner, `direction` is the OUTPUT direction.
        // The corner shape is purely visual (sprite rotation); the tile pushes items
        // in the direction the asset is facing — identical to a straight belt.
        const dir = inDir;
        const [ox, oy] = directionOffset(dir);
        const nextX = convAsset.x + ox;
        const nextY = convAsset.y + oy;
        if (nextX < 0 || nextX >= GRID_W || nextY < 0 || nextY >= GRID_H) continue;

        const nextAssetId = state.cellMap[cellKey(nextX, nextY)];
        const nextAsset = nextAssetId ? state.assets[nextAssetId] : null;

        // Straight belts only accept items arriving from behind (same output direction).
        // Corner belts accept from any direction — they are the intended turn mechanism.
        const nextBeltCompatible =
          nextAsset?.type === "conveyor_corner" ||
          (nextAsset?.type === "conveyor" && (nextAsset.direction ?? "east") === dir);
        // Zone-aware transport: block belt-to-belt if both have explicit, differing zones.
        const convZone = state.buildingZoneIds[convId] ?? null;
        const nextTileZone = nextAssetId ? (state.buildingZoneIds[nextAssetId] ?? null) : null;
        const beltToNextZoneOk = areZonesTransportCompatible(convZone, nextTileZone);
        if (nextBeltCompatible && !movedThisTick.has(nextAssetId) && beltToNextZoneOk) {
          const nextConv = newConveyorsL === state.conveyors ? state.conveyors[nextAssetId] : newConveyorsL[nextAssetId];
          const nextQueue = nextConv?.queue ?? [];
          if (nextQueue.length < CONVEYOR_TILE_CAPACITY) {
            newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
            newConveyorsL[nextAssetId] = { queue: [...nextQueue, currentItem] };
            newConveyorsL[convId] = { queue: activeQueue.slice(1) };
            movedThisTick.add(nextAssetId);
            changed = true;
          }
        } else if (nextAsset?.type === "warehouse" && isValidWarehouseInput(convAsset.x, convAsset.y, dir, nextAsset)) {
          const adjWhZone = state.buildingZoneIds[nextAsset.id] ?? null;
          if (areZonesTransportCompatible(convZone, adjWhZone) && tryStoreInWarehouse(nextAsset.id, currentItem)) {
            newAutoDeliveryLogL = addAutoDelivery(newAutoDeliveryLogL, "conveyor", convId, currentItem, nextAsset.id);
            newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
            newConveyorsL[convId] = { queue: activeQueue.slice(1) };
            changed = true;
          }
        } else if (nextAsset?.type === "workbench") {
          // Guard: only deliver conveyor items into the workbench's source when an active
          // crafting job (queued / reserved / crafting) exists for this workbench.
          // Without an active job the item stays on the belt — no silent stockpiling.
          const activeJobForWb = (state.crafting?.jobs ?? []).find(
            (j) =>
              j.workbenchId === nextAsset.id &&
              j.status !== "done" &&
              j.status !== "cancelled",
          );
          if (!activeJobForWb) {
            if (import.meta.env.DEV) {
              debugLog.inventory(
                `[Conveyor] WorkBench ${nextAsset.id}: ignoring ${currentItem}, no active job`,
              );
            }
            // Item remains on the conveyor — do NOT set changed/consume the item.
          } else {
            // Inject into the workbench's resolved source (zone/warehouse/global) so zone-assigned
            // workbenches receive conveyor items in their zone inventory, not always in global.
            const wbZone = state.buildingZoneIds[nextAsset.id] ?? null;
            if (areZonesTransportCompatible(convZone, wbZone)) {
              const liveForWb = getLiveLogisticsState();
              const wbSource = resolveBuildingSource(liveForWb, nextAsset.id);
              const wbSourceInv = getCraftingSourceInventory(liveForWb, wbSource);
              const wbCap = getSourceCapacity(liveForWb, wbSource);
              const resKey = currentItem as keyof Inventory;
              if ((wbSourceInv[resKey] as number) < wbCap) {
                applySourceInventory(wbSource, addResources(wbSourceInv, { [resKey]: 1 }));
                newNotifsL = addNotification(newNotifsL, currentItem, 1);
                newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
                newConveyorsL[convId] = { queue: activeQueue.slice(1) };
                changed = true;
                if (import.meta.env.DEV) {
                  debugLog.inventory(
                    `[Conveyor] Drohne/Band: delivering ${currentItem} for Job ${activeJobForWb.id} (${activeJobForWb.status})`,
                  );
                }
              }
            }
          }
        } else if (nextAsset?.type === "smithy") {
          // Feed ore into smithy internal slots
          const smithyZone = state.buildingZoneIds[nextAsset.id] ?? null;
          if (areZonesTransportCompatible(convZone, smithyZone) && (currentItem === "iron" || currentItem === "copper")) {
            const oreKey = currentItem === "iron" ? "iron" : "copper";
            if ((newSmithyL as any)[oreKey] < 50) {
              newSmithyL = { ...newSmithyL, [oreKey]: (newSmithyL as any)[oreKey] + 1 };
              newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
              newConveyorsL[convId] = { queue: activeQueue.slice(1) };
              changed = true;
            }
          }
        }
      }

      // ---- Auto Smelters: source input -> process -> source output ----
      let newAutoSmeltersL = state.autoSmelters;
      for (const [smelterId, smelterState] of Object.entries(state.autoSmelters ?? {})) {
        const smelterAsset = state.assets[smelterId];
        if (!smelterAsset || smelterAsset.type !== "auto_smelter") continue;

        const powerRatio = Math.max(0, Math.min(1, state.machinePowerRatio?.[smelterId] ?? (poweredSet.has(smelterId) ? 1 : 0)));
        // Unterstrom = kompletter Stopp: jede Unterversorgung (ratio < 1) stoppt die Verarbeitung vollständig.
        // Laufender progressMs bleibt erhalten und wird pausiert, bis wieder volle Versorgung anliegt.
        if (powerRatio < 1) {
          newAutoSmeltersL = newAutoSmeltersL === state.autoSmelters ? { ...state.autoSmelters } : newAutoSmeltersL;
          newAutoSmeltersL[smelterId] = { ...smelterState, status: "NO_POWER" };
          changed = true;
          continue;
        }

        let nextSmelter = { ...smelterState };
        const selectedRecipe = getSmeltingRecipe(nextSmelter.selectedRecipe);
        if (!selectedRecipe) {
          nextSmelter.status = "MISCONFIGURED";
          if (!areAutoSmelterEntriesEqual(nextSmelter, smelterState)) {
            newAutoSmeltersL = newAutoSmeltersL === state.autoSmelters ? { ...state.autoSmelters } : newAutoSmeltersL;
            newAutoSmeltersL[smelterId] = nextSmelter;
            changed = true;
          }
          continue;
        }

        const source = resolveBuildingSource(getLiveLogisticsState(), smelterId);
        let sourceInv = getCraftingSourceInventory(getLiveLogisticsState(), source);
        const sourceCapacity = getSourceCapacity(getLiveLogisticsState(), source);

        // Belt-only input: pull 1 matching item per tick from the adjacent input conveyor.
        // No inventory fallback — the auto-smelter is exclusively belt-fed.
        {
          const smelterInputIo = getAutoSmelterIoCells(smelterAsset);
          const inX = smelterInputIo.input.x;
          const inY = smelterInputIo.input.y;
          if (import.meta.env.DEV) {
            console.log(`[AutoSmelter:${smelterId}] input check at tile (${inX},${inY}), buffer=${nextSmelter.inputBuffer.length}/${AUTO_SMELTER_BUFFER_CAPACITY}`);
          }
          if (
            nextSmelter.inputBuffer.length < AUTO_SMELTER_BUFFER_CAPACITY &&
            inX >= 0 && inX < GRID_W && inY >= 0 && inY < GRID_H
          ) {
            const inAssetId = state.cellMap[cellKey(inX, inY)];
            const inAsset = inAssetId ? state.assets[inAssetId] : null;
            if (inAsset?.type === "conveyor" || inAsset?.type === "conveyor_corner") {
              const inConv = newConveyorsL === state.conveyors ? state.conveyors[inAssetId] : newConveyorsL[inAssetId];
              const inQueue = inConv?.queue ?? [];
              const frontItem = inQueue[0];
              if (frontItem === selectedRecipe.inputItem) {
                newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
                newConveyorsL[inAssetId] = { queue: inQueue.slice(1) };
                nextSmelter.inputBuffer = [...nextSmelter.inputBuffer, frontItem];
                nextSmelter.lastRecipeInput = selectedRecipe.inputItem;
                nextSmelter.lastRecipeOutput = selectedRecipe.outputItem;
                changed = true;
                if (import.meta.env.DEV) {
                  console.log(`[AutoSmelter:${smelterId}] consumed "${frontItem}" from conveyor tile (${inX},${inY})`);
                }
              } else {
                if (import.meta.env.DEV) {
                  console.log(`[AutoSmelter:${smelterId}] no matching item on belt – found: ${frontItem ?? "empty"}, need: ${selectedRecipe.inputItem}`);
                }
              }
            } else {
              if (import.meta.env.DEV) {
                console.log(`[AutoSmelter:${smelterId}] no conveyor at input tile (${inX},${inY}) – smelter blocked`);
              }
            }
          }
        }

        // Flush pending output — Priority 1: output conveyor belt, Priority 2: source inventory.
        while (nextSmelter.pendingOutput.length > 0) {
          const pendingInputItem = nextSmelter.pendingOutput[0];
          const pendingRecipe = getSmeltingRecipe(pendingInputItem);
          if (!pendingRecipe) {
            nextSmelter.pendingOutput = nextSmelter.pendingOutput.slice(1);
            changed = true;
            continue;
          }
          const pendingOutputKey = pendingRecipe.outputItem as keyof Inventory;
          const pendingOutputItem = pendingRecipe.outputItem as ConveyorItem;
          let outputDone = false;

          // Priority 1: Adjacent output conveyor belt (direction-aware, mirrors Auto-Miner logic).
          const smelterIo = getAutoSmelterIoCells(smelterAsset);
          const outX = smelterIo.output.x;
          const outY = smelterIo.output.y;
          if (outX >= 0 && outX < GRID_W && outY >= 0 && outY < GRID_H) {
            const outAssetId = state.cellMap[cellKey(outX, outY)];
            const outAsset = outAssetId ? state.assets[outAssetId] : null;
            if (outAsset?.type === "conveyor" || outAsset?.type === "conveyor_corner") {
              const outConv = newConveyorsL === state.conveyors ? state.conveyors[outAssetId] : newConveyorsL[outAssetId];
              const outQueue = outConv?.queue ?? [];
              if (outQueue.length < CONVEYOR_TILE_CAPACITY) {
                newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
                newConveyorsL[outAssetId] = { queue: [...outQueue, pendingOutputItem] };
                nextSmelter.pendingOutput = nextSmelter.pendingOutput.slice(1);
                nextSmelter.throughputEvents = [...nextSmelter.throughputEvents, Date.now()];
                changed = true;
                outputDone = true;
              } else {
                // Output conveyor is present but full — stay blocked, don't bypass to source inventory.
                break;
              }
            }
          }

          // Priority 2: Source inventory fallback (no conveyor at output cell).
          if (!outputDone) {
            if ((sourceInv[pendingOutputKey] as number) + pendingRecipe.outputAmount > sourceCapacity) {
              break;
            }
            const added = addResources(sourceInv, { [pendingOutputKey]: pendingRecipe.outputAmount });
            applySourceInventory(source, added);
            sourceInv = added;
            nextSmelter.pendingOutput = nextSmelter.pendingOutput.slice(1);
            nextSmelter.throughputEvents = [...nextSmelter.throughputEvents, Date.now()];
            changed = true;
          }
        }

        // Start processing once buffer holds recipe.inputAmount matching items.
        const matchCount = nextSmelter.inputBuffer.filter((it) => it === selectedRecipe.inputItem).length;
        if (!nextSmelter.processing && nextSmelter.pendingOutput.length === 0 && matchCount >= selectedRecipe.inputAmount) {
          if (import.meta.env.DEV && !_smelterRecipesLogged) {
            console.log("[Smelter] Rezepte geladen:", SMELTING_RECIPES);
            _smelterRecipesLogged = true;
          }
          let batchConsumed = 0;
          nextSmelter.inputBuffer = nextSmelter.inputBuffer.filter((it) => {
            if (batchConsumed < selectedRecipe.inputAmount && it === selectedRecipe.inputItem) {
              batchConsumed++;
              return false;
            }
            return true;
          });
          nextSmelter.processing = {
            inputItem: selectedRecipe.inputItem as ConveyorItem,
            outputItem: selectedRecipe.outputItem as ConveyorItem,
            progressMs: 0,
            durationMs: Math.max(1, selectedRecipe.processingTime * 1000),
          };
          nextSmelter.lastRecipeInput = selectedRecipe.inputItem;
          nextSmelter.lastRecipeOutput = selectedRecipe.outputItem;
          changed = true;
        }

        // Ab hier gilt powerRatio === 1 (volle Versorgung). Produktion läuft mit voller Geschwindigkeit
        // oder — bei Unterstrom — wurde oben bereits per `continue` komplett gestoppt.
        if (nextSmelter.processing) {
          const smelterBoost = getBoostMultiplier(smelterAsset);
          nextSmelter.processing = {
            ...nextSmelter.processing,
            progressMs: nextSmelter.processing.progressMs + LOGISTICS_TICK_MS * smelterBoost,
          };
          if (nextSmelter.processing.progressMs >= nextSmelter.processing.durationMs) {
            // Store the recipe input token (iron/copper) to resolve deterministic output metadata later.
            nextSmelter.pendingOutput = [...nextSmelter.pendingOutput, nextSmelter.processing.inputItem];
            nextSmelter.processing = null;
          }
          changed = true;
        }

        // Keep only last 60s throughput data.
        const cutoff = Date.now() - 60_000;
        const trimmed = nextSmelter.throughputEvents.filter((ts) => ts >= cutoff);
        if (trimmed.length !== nextSmelter.throughputEvents.length) {
          nextSmelter.throughputEvents = trimmed;
          changed = true;
        }

        if (nextSmelter.pendingOutput.length > 0) {
          const pendingRecipe = getSmeltingRecipe(nextSmelter.pendingOutput[0]);
          if (!pendingRecipe) {
            nextSmelter.status = "MISCONFIGURED";
          } else {
            const pendingOutputKey = pendingRecipe.outputItem as keyof Inventory;
            // Check output route: conveyor takes priority over source inventory.
            const statusIo = getAutoSmelterIoCells(smelterAsset);
            const statusOutX = statusIo.output.x;
            const statusOutY = statusIo.output.y;
            let hasOutputConveyor = false;
            let outputConveyorHasSpace = false;
            if (statusOutX >= 0 && statusOutX < GRID_W && statusOutY >= 0 && statusOutY < GRID_H) {
              const statusOutId = state.cellMap[cellKey(statusOutX, statusOutY)];
              const statusOutAsset = statusOutId ? state.assets[statusOutId] : null;
              if (statusOutAsset?.type === "conveyor" || statusOutAsset?.type === "conveyor_corner") {
                hasOutputConveyor = true;
                const statusConv = newConveyorsL === state.conveyors ? state.conveyors[statusOutId] : newConveyorsL[statusOutId];
                outputConveyorHasSpace = (statusConv?.queue?.length ?? 0) < CONVEYOR_TILE_CAPACITY;
              }
            }
            const outputCanProceed = hasOutputConveyor
              ? outputConveyorHasSpace
              : (sourceInv[pendingOutputKey] as number) + pendingRecipe.outputAmount <= sourceCapacity;
            nextSmelter.status = outputCanProceed ? "IDLE" : "OUTPUT_BLOCKED";
          }
        } else if (nextSmelter.processing) {
          nextSmelter.status = "PROCESSING";
        } else if (nextSmelter.inputBuffer.length > 0) {
          nextSmelter.status = "IDLE";
        } else {
          nextSmelter.status = "IDLE";
        }

        if (!areAutoSmelterEntriesEqual(nextSmelter, smelterState)) {
          newAutoSmeltersL = newAutoSmeltersL === state.autoSmelters ? { ...state.autoSmelters } : newAutoSmeltersL;
          newAutoSmeltersL[smelterId] = nextSmelter;
        }
      }

      if (!changed) return state;
      return {
        ...state,
        inventory: newInvL,
        warehouseInventories: newWarehouseInventoriesL,
        smithy: newSmithyL,
        autoMiners: newAutoMinersL,
        autoSmelters: newAutoSmeltersL,
        conveyors: newConveyorsL,
        notifications: newNotifsL,
        autoDeliveryLog: newAutoDeliveryLogL,
      };
    }

    // TOGGLE_ENERGY_DEBUG is handled above by handleUiAction.

    case "SET_MACHINE_PRIORITY": {
      const asset = state.assets[action.assetId];
      if (!asset) return state;
      if (!isEnergyConsumerType(asset.type)) return state;
      const nextPriority = clampMachinePriority(action.priority);
      if ((asset.priority ?? DEFAULT_MACHINE_PRIORITY) === nextPriority) return state;
      return {
        ...state,
        assets: {
          ...state.assets,
          [action.assetId]: {
            ...asset,
            priority: nextPriority,
          },
        },
      };
    }

    case "SET_MACHINE_BOOST": {
      const asset = state.assets[action.assetId];
      if (!asset) return state;
      // Harte Einschränkung: Overclocking-Stufe 1 ist nur für auto_miner und auto_smelter.
      if (!isBoostSupportedType(asset.type)) return state;
      const nextBoost = !!action.boosted;
      if ((asset.boosted ?? false) === nextBoost) return state;
      return {
        ...state,
        assets: {
          ...state.assets,
          [action.assetId]: {
            ...asset,
            boosted: nextBoost,
          },
        },
      };
    }

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

    case "ASSIGN_DRONE_TO_HUB": {
      const { droneId, hubId } = action;
      const targetHub = state.serviceHubs[hubId];
      const hubAsset = state.assets[hubId];
      if (!targetHub || !hubAsset) return state;

      // Look up the drone — starterDrone is authoritative for "starter"; fall back to drones record
      const drone = (droneId === state.starterDrone.droneId)
        ? state.starterDrone
        : (state.drones[droneId] ?? null);
      if (!drone) return state;

      // Check hub capacity (skip if already assigned to this hub)
      const maxSlots = getMaxDrones(targetHub.tier);
      if (!targetHub.droneIds.includes(droneId) && targetHub.droneIds.length >= maxSlots) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Hub hat keine freien Drohnen-Slots.") };
      }

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
      const offset = getDroneDockOffset(dockSlot);
      const dockX = hubAsset.x + offset.dx;
      const dockY = hubAsset.y + offset.dy;
      newHubs = { ...newHubs, [hubId]: { ...newHubs[hubId]!, droneIds: newDroneIds } };

      // Release any claimed collection node before resetting the drone
      let newNodes = state.collectionNodes;
      if (drone.targetNodeId && newNodes[drone.targetNodeId]?.reservedByDroneId === droneId) {
        newNodes = { ...newNodes, [drone.targetNodeId]: { ...newNodes[drone.targetNodeId], reservedByDroneId: null } };
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

      debugLog.building(`[ASSIGN_DRONE_TO_HUB] Drone ${droneId} → hub ${hubId} (dock slot ${dockSlot}, pos ${dockX},${dockY})`);

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
      return syncDrones(newState);
    }

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
      return tickAllDrones(state, tickAllDronesDeps);
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


