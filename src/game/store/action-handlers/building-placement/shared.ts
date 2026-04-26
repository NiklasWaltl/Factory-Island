// ============================================================
// Build placement/removal — shared types & helpers
// Used by ../building-placement.ts dispatcher and the per-case
// modules in this folder (place-building, remove-asset).
// ============================================================

import type { GameAction } from "../../reducer";
import type {
  BuildPlacementEligibilityDecision,
  DecideBuildingPlacementEligibilityInput,
} from "../../build-placement-eligibility";
import type {
  AutoMinerPlacementEligibilityDecision,
  DecideAutoMinerPlacementEligibilityInput,
} from "../../build-auto-miner-placement-eligibility";
import {
  isBuildingSourceStateConsistent,
  isBuildingZoneStateConsistent,
  isConstructionSiteStateConsistent,
} from "../../utils/asset-guards";
import type {
  AssetType,
  BuildingType,
  CollectableItemType,
  GameNotification,
  GameState,
  Inventory,
  MachinePriority,
  PlacedAsset,
  ServiceHubEntry,
} from "../../types";

export type HandledActionType = "BUILD_PLACE_BUILDING" | "BUILD_REMOVE_ASSET";

export const HANDLED_ACTION_TYPES = new Set<string>([
  "BUILD_PLACE_BUILDING",
  "BUILD_REMOVE_ASSET",
]);

export function isBuildingPlacementAction(
  action: GameAction,
): action is Extract<GameAction, { type: HandledActionType }> {
  return HANDLED_ACTION_TYPES.has(action.type);
}

export interface BuildingPlacementActionDeps {
  GRID_W: number;
  GRID_H: number;
  BUILDING_COSTS: Record<BuildingType, Partial<Record<keyof Inventory, number>>>;
  CONSTRUCTION_SITE_BUILDINGS: Set<BuildingType>;
  BUILDING_LABELS: Record<BuildingType, string>;
  BUILDING_SIZES: Record<BuildingType, 1 | 2>;
  BUILDINGS_WITH_DEFAULT_SOURCE: Set<BuildingType>;
  REQUIRES_STONE_FLOOR: Set<BuildingType>;
  STACKABLE_BUILDINGS: Set<BuildingType>;
  MAX_WAREHOUSES: number;
  DEPOSIT_TYPES: Set<string>;
  DEPOSIT_RESOURCE: Record<string, "stone" | "iron" | "copper">;
  DEFAULT_MACHINE_PRIORITY: MachinePriority;
  ASSET_LABELS: Record<AssetType, string>;
  cellKey(x: number, y: number): string;
  hasResources(inv: Inventory, costs: Partial<Record<keyof Inventory, number>>): boolean;
  addResources(inv: Inventory, items: Partial<Record<keyof Inventory, number>>): Inventory;
  getEffectiveBuildInventory(state: GameState): Inventory;
  costIsFullyCollectable(costs: Partial<Record<keyof Inventory, number>>): boolean;
  fullCostAsRemaining(costs: Partial<Record<keyof Inventory, number>>): Partial<Record<CollectableItemType, number>>;
  placeAsset(
    assets: Record<string, PlacedAsset>,
    cellMap: Record<string, string>,
    type: AssetType,
    x: number,
    y: number,
    size: 1 | 2,
    width?: 1 | 2,
    height?: 1 | 2,
    fixed?: boolean,
  ): {
    assets: Record<string, PlacedAsset>;
    cellMap: Record<string, string>;
    id: string;
  } | null;
  removeAsset(
    state: GameState,
    assetId: string,
  ): Pick<GameState, "assets" | "cellMap" | "saplingGrowAt">;
  makeId(): string;
  getAutoSmelterIoCells(asset: PlacedAsset): { input: { x: number; y: number }; output: { x: number; y: number } };
  consumeBuildResources(
    state: GameState,
    costs: Partial<Record<keyof Inventory, number>>,
  ): {
    inventory: Inventory;
    warehouseInventories: Record<string, Inventory>;
    serviceHubs: Record<string, ServiceHubEntry>;
    remaining: Partial<Record<CollectableItemType, number>>;
  };
  createEmptyInventory(): Inventory;
  createEmptyHubInventory(): ServiceHubEntry["inventory"];
  createDefaultProtoHubTargetStock(): Record<CollectableItemType, number>;
  getNearestWarehouseId(state: GameState, x: number, y: number): string | null;
  reassignBuildingSourceIds(
    sourceIds: GameState["buildingSourceWarehouseIds"],
    state: GameState,
    removedWarehouseId: string,
  ): GameState["buildingSourceWarehouseIds"];
  getDroneDockOffset(slot: number): { dx: number; dy: number };
  computeConnectedAssetIds(state: GameState): string[];
  decideBuildingPlacementEligibility(
    input: DecideBuildingPlacementEligibilityInput,
  ): BuildPlacementEligibilityDecision;
  decideAutoMinerPlacementEligibility(
    input: DecideAutoMinerPlacementEligibilityInput,
  ): AutoMinerPlacementEligibilityDecision;
  addErrorNotification(notifications: GameNotification[], message: string): GameNotification[];
  debugLog: {
    building(message: string): void;
  };
}

export function logPlacementInvariantWarnings(
  state: GameState,
  actionType: string,
  debugLog: BuildingPlacementActionDeps["debugLog"],
): void {
  if (!import.meta.env.DEV) return;
  if (!isConstructionSiteStateConsistent(state)) {
    debugLog.building(`[Invariant:${actionType}] constructionSites inkonsistent`);
  }
  if (!isBuildingZoneStateConsistent(state)) {
    debugLog.building(`[Invariant:${actionType}] buildingZoneIds inkonsistent`);
  }
  if (!isBuildingSourceStateConsistent(state)) {
    debugLog.building(`[Invariant:${actionType}] buildingSourceWarehouseIds inkonsistent`);
  }
}
