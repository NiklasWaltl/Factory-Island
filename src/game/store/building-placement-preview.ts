/**
 * Read-only placement preview for build-mode hover UI.
 * Bundles the same rules as `handlePlaceBuildingAction` for supported types,
 * without mutating state or duplicating underground geometry (reuses
 * `underground-out-pairing-hint`).
 */

import { GRID_H, GRID_W } from "../constants/grid";
import { cellKey } from "./cell-key";
import { decideBuildingPlacementEligibility } from "./build-placement-eligibility";
import type { BuildPlacementEligibilityBlockReason } from "./build-placement-eligibility";
import {
  BUILDING_COSTS,
  BUILDING_LABELS,
  BUILDING_SIZES,
  CONSTRUCTION_SITE_BUILDINGS,
  MAX_WAREHOUSES,
  REQUIRES_STONE_FLOOR,
  STACKABLE_BUILDINGS,
} from "./constants/buildings";
import {
  costIsFullyCollectable,
  getEffectiveBuildInventory,
  hasResources,
} from "./inventory-ops";
import {
  explainUndergroundOutPairingFailure,
  findUnpairedUndergroundEntranceId,
  isUndergroundOutPlacementGeometricallyValid,
} from "./underground-out-pairing-hint";
import type { BuildingType, Direction, GameState, Inventory } from "./types";

export const CONVEYOR_PREVIEW_BUILDING_TYPES = [
  "conveyor",
  "conveyor_corner",
  "conveyor_merger",
  "conveyor_splitter",
  "conveyor_underground_in",
  "conveyor_underground_out",
] as const satisfies readonly BuildingType[];

export type ConveyorPreviewBuildingType =
  (typeof CONVEYOR_PREVIEW_BUILDING_TYPES)[number];

export function isConveyorPreviewBuildingType(
  t: BuildingType | null | undefined,
): t is ConveyorPreviewBuildingType {
  return (
    t != null &&
    (CONVEYOR_PREVIEW_BUILDING_TYPES as readonly string[]).includes(t)
  );
}

export type BuildingPlacementPreviewBlockReason =
  | "out_of_bounds"
  | "not_enough_resources"
  | "cell_occupied"
  | "missing_stone_floor"
  | "workbench_already_exists"
  | "non_stackable_limit_reached"
  | "warehouse_limit_reached"
  | "ug_tunnel_span"
  | "ug_pairing"
  | "eligibility_silent_block";

export type BuildingPlacementPreviewResult =
  | { ok: true }
  | { ok: false; reason: BuildingPlacementPreviewBlockReason; message: string };

function previewMessageForEligibilityBlock(
  blockReason: BuildPlacementEligibilityBlockReason,
  buildingLabel: string,
): string | null {
  if (blockReason === "not_enough_resources") {
    return "Nicht genug Ressourcen!";
  }
  if (blockReason === "workbench_already_exists") {
    return "Es kann nur eine Werkbank gebaut werden.";
  }
  if (blockReason === "non_stackable_limit_reached") {
    return `${buildingLabel} ist bereits platziert.`;
  }
  if (blockReason === "warehouse_limit_reached") {
    return "Maximale Anzahl an Lagerhäusern erreicht.";
  }
  if (blockReason === "missing_stone_floor") {
    return `${buildingLabel} benötigt Steinboden unter allen Feldern!`;
  }
  return null;
}

function mapEligibilityReason(
  blockReason: BuildPlacementEligibilityBlockReason,
): BuildingPlacementPreviewBlockReason {
  if (blockReason === "not_enough_resources") return "not_enough_resources";
  if (blockReason === "workbench_already_exists")
    return "workbench_already_exists";
  if (blockReason === "non_stackable_limit_reached")
    return "non_stackable_limit_reached";
  if (blockReason === "warehouse_limit_reached")
    return "warehouse_limit_reached";
  if (blockReason === "missing_stone_floor") return "missing_stone_floor";
  return "eligibility_silent_block";
}

/**
 * Same `runStandardPlacementChecks` flag as `handlePlaceBuildingAction` for the
 * supported conveyor-like building types — always false here.
 */
function runStandardPlacementChecksForConveyorPreview(
  _bType: ConveyorPreviewBuildingType,
): boolean {
  void _bType;
  return false;
}

/**
 * Returns whether the player could place `buildingType` at (x, y) with
 * `direction` under current `handlePlaceBuildingAction` rules (read-only).
 */
export function previewBuildingPlacementAtCell(
  state: GameState,
  buildingType: ConveyorPreviewBuildingType,
  x: number,
  y: number,
  direction: Direction,
): BuildingPlacementPreviewResult {
  const bType = buildingType;
  const bSize = BUILDING_SIZES[bType] ?? 2;

  if (x < 0 || y < 0 || x + bSize > GRID_W || y + bSize > GRID_H) {
    return {
      ok: false,
      reason: "out_of_bounds",
      message: "Außerhalb der Karte.",
    };
  }

  const costs = BUILDING_COSTS[bType];
  const hasActiveHub = Object.values(state.assets).some(
    (a) => a.type === "service_hub",
  );
  const useConstructionSite =
    CONSTRUCTION_SITE_BUILDINGS.has(bType) &&
    hasActiveHub &&
    costIsFullyCollectable(costs);

  const eligibilityDecision = decideBuildingPlacementEligibility({
    buildingType: bType,
    hasEnoughResources:
      useConstructionSite ||
      hasResources(
        getEffectiveBuildInventory(state),
        costs as Partial<Record<keyof Inventory, number>>,
      ),
    hasWorkbenchPlaced: Object.values(state.assets).some(
      (a) => a.type === "workbench",
    ),
    isStackableBuilding: STACKABLE_BUILDINGS.has(bType),
    placedBuildingCountOfType: state.placedBuildings.filter((b) => b === bType)
      .length,
    nonStackableLimit: import.meta.env.DEV ? 100 : 1,
    warehousesPlaced: state.warehousesPlaced,
    warehouseLimit: import.meta.env.DEV ? 100 : MAX_WAREHOUSES,
    requiresStoneFloor: REQUIRES_STONE_FLOOR.has(bType),
    runStandardPlacementChecks:
      runStandardPlacementChecksForConveyorPreview(bType),
    x,
    y,
    footprintSize: bSize,
    gridWidth: GRID_W,
    gridHeight: GRID_H,
    cellMap: state.cellMap,
    floorMap: state.floorMap,
  });

  if (eligibilityDecision.kind === "blocked") {
    const msg = previewMessageForEligibilityBlock(
      eligibilityDecision.blockReason,
      BUILDING_LABELS[bType],
    );
    if (msg) {
      return {
        ok: false,
        reason: mapEligibilityReason(eligibilityDecision.blockReason),
        message: msg,
      };
    }
    return {
      ok: false,
      reason: "eligibility_silent_block",
      message: "Platzierung nicht möglich.",
    };
  }

  for (let dy = 0; dy < bSize; dy++) {
    for (let dx = 0; dx < bSize; dx++) {
      if (state.cellMap[cellKey(x + dx, y + dy)]) {
        return {
          ok: false,
          reason: "cell_occupied",
          message: "Das Feld ist belegt.",
        };
      }
    }
  }

  if (bType === "conveyor_underground_out") {
    if (!isUndergroundOutPlacementGeometricallyValid(state, x, y, direction)) {
      const entranceId = findUnpairedUndergroundEntranceId(
        state,
        x,
        y,
        direction,
      );
      if (entranceId) {
        return {
          ok: false,
          reason: "ug_tunnel_span",
          message:
            "Untergrund-Tunnel: Strecke zwischen Eingang und Ausgang liegt außerhalb der Karte.",
        };
      }
      return {
        ok: false,
        reason: "ug_pairing",
        message: explainUndergroundOutPairingFailure(state, x, y, direction),
      };
    }
  }

  return { ok: true };
}
