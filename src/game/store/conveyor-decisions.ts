import { GRID_H, GRID_W } from "../constants/grid";
import { areZonesTransportCompatible } from "../logistics/conveyor-zone";
import type { CraftingJob } from "../crafting/types";
import { CONVEYOR_TILE_CAPACITY } from "./constants/conveyor";
import type {
  ConveyorItem,
  ConveyorState,
  Direction,
  GameMode,
  GameState,
  Inventory,
  PlacedAsset,
  SmithyState,
} from "./types";

export type ConveyorTickEligibilityDecision =
  | { kind: "blocked" }
  | { kind: "ready"; conveyorAsset: PlacedAsset };

export const decideConveyorTickEligibility = (input: {
  conveyorId: string;
  assets: Record<string, PlacedAsset>;
  connectedAssetIds: readonly string[];
  poweredSet: ReadonlySet<string>;
  movedThisTick: ReadonlySet<string>;
}): ConveyorTickEligibilityDecision => {
  const {
    conveyorId,
    assets,
    connectedAssetIds,
    poweredSet,
    movedThisTick,
  } = input;

  if (movedThisTick.has(conveyorId)) return { kind: "blocked" };

  const conveyorAsset = assets[conveyorId];
  if (!conveyorAsset) return { kind: "blocked" };

  const isConnected = connectedAssetIds.includes(conveyorId);
  const isPowered = poweredSet.has(conveyorId);
  if (!isConnected || !isPowered) return { kind: "blocked" };

  return { kind: "ready", conveyorAsset };
};

export type ConveyorTargetType =
  | "warehouse_input_tile"
  | "next_conveyor"
  | "adjacent_warehouse"
  | "workbench"
  | "smithy";

export type ConveyorTargetBlockReason =
  | "warehouse_input_tile_zone_incompatible"
  | "warehouse_input_tile_missing_inventory"
  | "warehouse_input_tile_full"
  | "next_conveyor_already_moved"
  | "next_conveyor_zone_incompatible"
  | "next_conveyor_full"
  | "adjacent_warehouse_zone_incompatible"
  | "adjacent_warehouse_missing_inventory"
  | "adjacent_warehouse_full"
  | "workbench_no_active_job"
  | "workbench_zone_incompatible"
  | "workbench_source_full"
  | "smithy_zone_incompatible"
  | "smithy_item_not_supported"
  | "smithy_full";

export type ConveyorNoTargetReason =
  | "next_tile_out_of_bounds"
  | "next_conveyor_direction_mismatch"
  | "adjacent_warehouse_input_mismatch"
  | "no_supported_target";

export type ConveyorTargetDecision =
  | {
      kind: "target";
      targetType: "next_conveyor";
      targetId: string;
      nextAssetId: string;
    }
  | {
      kind: "target";
      targetType: "workbench";
      targetId: string;
      workbenchJob: Pick<CraftingJob, "id" | "status">;
    }
  | {
      kind: "target";
      targetType: Exclude<ConveyorTargetType, "smithy" | "next_conveyor" | "workbench">;
      targetId: string;
    }
  | {
      kind: "target";
      targetType: "smithy";
      targetId: string;
      smithyOreKey: "iron" | "copper";
    }
  | {
      kind: "blocked";
      targetType: "next_conveyor";
      targetId: string;
      nextAssetId: string;
      blockReason: ConveyorTargetBlockReason;
    }
  | {
      kind: "blocked";
      targetType: Exclude<ConveyorTargetType, "next_conveyor">;
      targetId: string;
      blockReason: ConveyorTargetBlockReason;
    }
  | {
      kind: "no_target";
      blockReason: ConveyorNoTargetReason;
    };

export type ConveyorTargetEligibility =
  | { eligible: true }
  | { eligible: false; blockReason: ConveyorTargetBlockReason };

export interface ConveyorTargetEligibilityCheck {
  condition: boolean;
  blockReason: ConveyorTargetBlockReason;
}

export const classifyConveyorTargetEligibility = (
  checks: ReadonlyArray<ConveyorTargetEligibilityCheck>,
): ConveyorTargetEligibility => {
  for (const check of checks) {
    if (!check.condition) {
      return { eligible: false, blockReason: check.blockReason };
    }
  }
  return { eligible: true };
};

export interface DecideConveyorTargetSelectionInput<TSource = unknown> {
  state: GameState;
  liveState: GameState;
  convId: string;
  convAsset: PlacedAsset;
  currentItem: ConveyorItem;
  conveyors: Record<string, ConveyorState>;
  warehouseInventories: Record<string, Inventory>;
  smithy: SmithyState;
  movedThisTick: ReadonlySet<string>;
  isValidWarehouseInput: (
    entityX: number,
    entityY: number,
    entityDir: Direction,
    warehouse: PlacedAsset,
  ) => boolean;
  resolveBuildingSource: (state: GameState, buildingId: string | null) => TSource;
  getCraftingSourceInventory: (state: GameState, source: TSource) => Inventory;
  getSourceCapacity: (state: GameState, source: TSource) => number;
  getWarehouseCapacity: (mode: GameMode) => number;
}

export const decideConveyorTargetSelection = <TSource>(
  input: DecideConveyorTargetSelectionInput<TSource>,
): ConveyorTargetDecision => {
  const convZone = input.state.buildingZoneIds[input.convId] ?? null;
  const itemKey = input.currentItem as keyof Inventory;
  const warehouseCapacity = input.getWarehouseCapacity(input.state.mode);

  // Priority 1: conveyor stands directly on a warehouse input tile.
  for (const wAsset of Object.values(input.state.assets)) {
    if (wAsset.type !== "warehouse") continue;
    if (input.convAsset.x === wAsset.x && input.convAsset.y === wAsset.y + assetHeight(wAsset)) {
      const whZone = input.state.buildingZoneIds[wAsset.id] ?? null;
      const whInv = input.warehouseInventories[wAsset.id];
      const warehouseInputEligibility = classifyConveyorTargetEligibility([
        {
          condition: areZonesTransportCompatible(convZone, whZone),
          blockReason: "warehouse_input_tile_zone_incompatible",
        },
        {
          condition: !!whInv,
          blockReason: "warehouse_input_tile_missing_inventory",
        },
        {
          condition: !!whInv && (whInv[itemKey] as number) < warehouseCapacity,
          blockReason: "warehouse_input_tile_full",
        },
      ]);
      if (!warehouseInputEligibility.eligible) {
        return {
          kind: "blocked",
          targetType: "warehouse_input_tile",
          targetId: wAsset.id,
          blockReason: warehouseInputEligibility.blockReason,
        };
      }
      return {
        kind: "target",
        targetType: "warehouse_input_tile",
        targetId: wAsset.id,
      };
    }
  }

  const dir = input.convAsset.direction ?? "east";
  const [ox, oy] = directionOffset(dir);
  const nextX = input.convAsset.x + ox;
  const nextY = input.convAsset.y + oy;
  if (nextX < 0 || nextX >= GRID_W || nextY < 0 || nextY >= GRID_H) {
    return { kind: "no_target", blockReason: "next_tile_out_of_bounds" };
  }

  const nextAssetId = input.state.cellMap[cellKey(nextX, nextY)] ?? null;
  const nextAsset = nextAssetId ? input.state.assets[nextAssetId] : null;

  const nextBeltCompatible =
    nextAsset?.type === "conveyor_corner" ||
    (nextAsset?.type === "conveyor" && (nextAsset.direction ?? "east") === dir);
  const nextTileZone = nextAssetId ? (input.state.buildingZoneIds[nextAssetId] ?? null) : null;
  const beltToNextZoneOk = areZonesTransportCompatible(convZone, nextTileZone);

  if (nextBeltCompatible) {
    const nextConveyorId = nextAssetId;
    if (!nextConveyorId) {
      return { kind: "no_target", blockReason: "no_supported_target" };
    }
    const nextConv = input.conveyors[nextConveyorId];
    const nextQueue = nextConv?.queue ?? [];
    const nextConveyorEligibility = classifyConveyorTargetEligibility([
      {
        condition: !input.movedThisTick.has(nextConveyorId),
        blockReason: "next_conveyor_already_moved",
      },
      {
        condition: beltToNextZoneOk,
        blockReason: "next_conveyor_zone_incompatible",
      },
      {
        condition: nextQueue.length < CONVEYOR_TILE_CAPACITY,
        blockReason: "next_conveyor_full",
      },
    ]);
    if (!nextConveyorEligibility.eligible) {
      return {
        kind: "blocked",
        targetType: "next_conveyor",
        targetId: nextConveyorId,
        nextAssetId: nextConveyorId,
        blockReason: nextConveyorEligibility.blockReason,
      };
    }
    return {
      kind: "target",
      targetType: "next_conveyor",
      targetId: nextConveyorId,
      nextAssetId: nextConveyorId,
    };
  }

  if (nextAsset?.type === "conveyor") {
    return { kind: "no_target", blockReason: "next_conveyor_direction_mismatch" };
  }

  if (nextAsset?.type === "warehouse") {
    if (!input.isValidWarehouseInput(input.convAsset.x, input.convAsset.y, dir, nextAsset)) {
      return { kind: "no_target", blockReason: "adjacent_warehouse_input_mismatch" };
    }
    const adjWhZone = input.state.buildingZoneIds[nextAsset.id] ?? null;
    const whInv = input.warehouseInventories[nextAsset.id];
    const adjacentWarehouseEligibility = classifyConveyorTargetEligibility([
      {
        condition: areZonesTransportCompatible(convZone, adjWhZone),
        blockReason: "adjacent_warehouse_zone_incompatible",
      },
      {
        condition: !!whInv,
        blockReason: "adjacent_warehouse_missing_inventory",
      },
      {
        condition: !!whInv && (whInv[itemKey] as number) < warehouseCapacity,
        blockReason: "adjacent_warehouse_full",
      },
    ]);
    if (!adjacentWarehouseEligibility.eligible) {
      return {
        kind: "blocked",
        targetType: "adjacent_warehouse",
        targetId: nextAsset.id,
        blockReason: adjacentWarehouseEligibility.blockReason,
      };
    }
    return {
      kind: "target",
      targetType: "adjacent_warehouse",
      targetId: nextAsset.id,
    };
  }

  if (nextAsset?.type === "workbench") {
    const activeJobForWb = (input.state.crafting?.jobs ?? []).find(
      (j) =>
        j.workbenchId === nextAsset.id &&
        j.status !== "done" &&
        j.status !== "cancelled",
    );
    const workbenchJobEligibility = classifyConveyorTargetEligibility([
      {
        condition: !!activeJobForWb,
        blockReason: "workbench_no_active_job",
      },
    ]);
    if (!workbenchJobEligibility.eligible) {
      return {
        kind: "blocked",
        targetType: "workbench",
        targetId: nextAsset.id,
        blockReason: workbenchJobEligibility.blockReason,
      };
    }
    const wbZone = input.state.buildingZoneIds[nextAsset.id] ?? null;
    const workbenchZoneEligibility = classifyConveyorTargetEligibility([
      {
        condition: areZonesTransportCompatible(convZone, wbZone),
        blockReason: "workbench_zone_incompatible",
      },
    ]);
    if (!workbenchZoneEligibility.eligible) {
      return {
        kind: "blocked",
        targetType: "workbench",
        targetId: nextAsset.id,
        blockReason: workbenchZoneEligibility.blockReason,
      };
    }
    const wbSource = input.resolveBuildingSource(input.liveState, nextAsset.id);
    const wbSourceInv = input.getCraftingSourceInventory(input.liveState, wbSource);
    const wbCap = input.getSourceCapacity(input.liveState, wbSource);
    const workbenchCapacityEligibility = classifyConveyorTargetEligibility([
      {
        condition: (wbSourceInv[itemKey] as number) < wbCap,
        blockReason: "workbench_source_full",
      },
    ]);
    if (!workbenchCapacityEligibility.eligible) {
      return {
        kind: "blocked",
        targetType: "workbench",
        targetId: nextAsset.id,
        blockReason: workbenchCapacityEligibility.blockReason,
      };
    }
    return {
      kind: "target",
      targetType: "workbench",
      targetId: nextAsset.id,
      workbenchJob: { id: activeJobForWb!.id, status: activeJobForWb!.status },
    };
  }

  if (nextAsset?.type === "smithy") {
    const smithyZone = input.state.buildingZoneIds[nextAsset.id] ?? null;
    const smithyItemSupported = input.currentItem === "iron" || input.currentItem === "copper";
    const oreKey = input.currentItem === "iron" ? "iron" : "copper";
    const smithyEligibility = classifyConveyorTargetEligibility([
      {
        condition: areZonesTransportCompatible(convZone, smithyZone),
        blockReason: "smithy_zone_incompatible",
      },
      {
        condition: smithyItemSupported,
        blockReason: "smithy_item_not_supported",
      },
      {
        condition: !smithyItemSupported || (input.smithy as any)[oreKey] < 50,
        blockReason: "smithy_full",
      },
    ]);
    if (!smithyEligibility.eligible) {
      return {
        kind: "blocked",
        targetType: "smithy",
        targetId: nextAsset.id,
        blockReason: smithyEligibility.blockReason,
      };
    }
    return {
      kind: "target",
      targetType: "smithy",
      targetId: nextAsset.id,
      smithyOreKey: oreKey,
    };
  }

  return { kind: "no_target", blockReason: "no_supported_target" };
};

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function directionOffset(dir: Direction): [number, number] {
  switch (dir) {
    case "north": return [0, -1];
    case "south": return [0, 1];
    case "east": return [1, 0];
    case "west": return [-1, 0];
  }
}

function assetHeight(asset: Pick<PlacedAsset, "height" | "size">): number {
  return asset.height ?? asset.size;
}