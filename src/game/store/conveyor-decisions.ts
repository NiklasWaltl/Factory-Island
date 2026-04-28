import { GRID_H, GRID_W } from "../constants/grid";
import { areZonesTransportCompatible } from "../logistics/conveyor-zone";
import type { CraftingJob } from "../crafting/types";
import { CONVEYOR_TILE_CAPACITY } from "./constants/conveyor";
import { directionOffset } from "./direction";
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

export type ConveyorMergerInputSide = "left" | "right";

export function getConveyorMergerInputCell(
  mergerAsset: Pick<PlacedAsset, "x" | "y" | "direction">,
  side: ConveyorMergerInputSide,
): { x: number; y: number } {
  const [dx, dy] = directionOffset(mergerAsset.direction ?? "east");
  const sideOffset = side === "left"
    ? { x: dy, y: -dx }
    : { x: -dy, y: dx };
  return {
    x: mergerAsset.x + sideOffset.x,
    y: mergerAsset.y + sideOffset.y,
  };
}

export function getConveyorMergerInputSide(
  sourceAsset: Pick<PlacedAsset, "x" | "y">,
  mergerAsset: Pick<PlacedAsset, "x" | "y" | "direction">,
): ConveyorMergerInputSide | null {
  const left = getConveyorMergerInputCell(mergerAsset, "left");
  if (sourceAsset.x === left.x && sourceAsset.y === left.y) return "left";

  const right = getConveyorMergerInputCell(mergerAsset, "right");
  if (sourceAsset.x === right.x && sourceAsset.y === right.y) return "right";

  return null;
}

/**
 * V1 splitter lateral output cells use the same left/right grid offsets as
 * merger input cells — thin alias so prompts and search land on splitter wording.
 */
export function getConveyorSplitterOutputCell(
  splitter: Pick<PlacedAsset, "x" | "y" | "direction">,
  side: ConveyorMergerInputSide,
): { x: number; y: number } {
  return getConveyorMergerInputCell(splitter, side);
}

/**
 * conveyor_splitter V1: items leave via the lateral arms only, in this order.
 * Must not depend on `Object.entries` iteration over conveyors.
 */
export const SPLITTER_OUTPUT_SIDE_PRIORITY: readonly ConveyorMergerInputSide[] = [
  "left",
  "right",
];

export function getConveyorSplitterBackCell(
  splitter: Pick<PlacedAsset, "x" | "y" | "direction">,
): { x: number; y: number } {
  const [dx, dy] = directionOffset(splitter.direction ?? "east");
  return { x: splitter.x - dx, y: splitter.y - dy };
}

/** True when the source feeds the splitter only from its back cell (not lateral). */
export function isValidConveyorSplitterInput(
  sourceAsset: Pick<PlacedAsset, "x" | "y" | "direction" | "type">,
  splitter: Pick<PlacedAsset, "x" | "y" | "direction">,
): boolean {
  if (
    sourceAsset.type !== "conveyor" &&
    sourceAsset.type !== "conveyor_corner" &&
    sourceAsset.type !== "conveyor_merger" &&
    sourceAsset.type !== "conveyor_underground_in"
  ) {
    return false;
  }
  const back = getConveyorSplitterBackCell(splitter);
  if (sourceAsset.x !== back.x || sourceAsset.y !== back.y) return false;
  const [ox, oy] = directionOffset(sourceAsset.direction ?? "east");
  return sourceAsset.x + ox === splitter.x && sourceAsset.y + oy === splitter.y;
}

/** Lateral neighbor can accept an item pushed from the splitter this tick. */
export function canAssetReceiveFromConveyorSplitterOutput(
  splitter: Pick<PlacedAsset, "x" | "y" | "direction">,
  neighbor: PlacedAsset,
): boolean {
  if (
    neighbor.type !== "conveyor" &&
    neighbor.type !== "conveyor_corner" &&
    neighbor.type !== "conveyor_merger" &&
    neighbor.type !== "conveyor_underground_in"
  ) {
    return false;
  }
  if (neighbor.type === "conveyor_merger") {
    return getConveyorMergerInputSide({ x: splitter.x, y: splitter.y }, neighbor) !== null;
  }
  const nd = neighbor.direction ?? "east";
  const [nox, noy] = directionOffset(nd);
  return neighbor.x - nox === splitter.x && neighbor.y - noy === splitter.y;
}

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

/**
 * LOGISTICS_TICK tie-break: a belt feeding a merger from the **right** input
 * defers this tick when the **left** input belt is eligible and still routes
 * into the same merger. Left thus wins simultaneous pushes without changing
 * `decideConveyorTargetSelection` return values (deferral is applied only when
 * committing `next_conveyor` handoff).
 */
export function shouldDeferRightMergerInputToLeft(input: {
  convId: string;
  conveyorAsset: PlacedAsset;
  targetMergerId: string;
  assets: Record<string, PlacedAsset>;
  cellMap: GameState["cellMap"];
  connectedAssetIds: readonly string[];
  poweredSet: ReadonlySet<string>;
  movedThisTick: ReadonlySet<string>;
  conveyors: Record<string, ConveyorState>;
  decideRoutingFor: (
    convId: string,
    conveyorAsset: PlacedAsset,
    currentItem: ConveyorItem,
  ) => ConveyorTargetDecision;
}): boolean {
  const {
    convId,
    conveyorAsset,
    targetMergerId,
    assets,
    cellMap,
    connectedAssetIds,
    poweredSet,
    movedThisTick,
    conveyors,
    decideRoutingFor,
  } = input;

  const mergerAsset = assets[targetMergerId];
  if (!mergerAsset || mergerAsset.type !== "conveyor_merger") return false;
  if (getConveyorMergerInputSide(conveyorAsset, mergerAsset) !== "right") return false;

  const leftInputCell = getConveyorMergerInputCell(mergerAsset, "left");
  const leftInputId = cellMap[cellKey(leftInputCell.x, leftInputCell.y)] ?? null;
  if (!leftInputId || leftInputId === convId) return false;

  const leftAsset = assets[leftInputId];
  if (!leftAsset) return false;

  const leftQueue = conveyors[leftInputId]?.queue ?? [];
  const leftItem = leftQueue[0] ?? null;
  if (!leftItem) return false;

  const leftPreflight = decideConveyorTickEligibility({
    conveyorId: leftInputId,
    movedThisTick,
    assets,
    connectedAssetIds,
    poweredSet,
  });
  if (leftPreflight.kind === "blocked") return false;

  const leftRoutingDecision = decideRoutingFor(
    leftInputId,
    leftPreflight.conveyorAsset,
    leftItem,
  );

  return (
    leftRoutingDecision.kind === "target" &&
    leftRoutingDecision.targetType === "next_conveyor" &&
    leftRoutingDecision.nextAssetId === targetMergerId
  );
}

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

  if (input.convAsset.type === "conveyor_splitter") {
    for (const side of SPLITTER_OUTPUT_SIDE_PRIORITY) {
      const arm = getConveyorSplitterOutputCell(input.convAsset, side);
      if (arm.x < 0 || arm.x >= GRID_W || arm.y < 0 || arm.y >= GRID_H) continue;

      const nextAssetId = input.state.cellMap[cellKey(arm.x, arm.y)] ?? null;
      const nextAsset = nextAssetId ? input.state.assets[nextAssetId] : null;
      if (!nextAsset || !canAssetReceiveFromConveyorSplitterOutput(input.convAsset, nextAsset)) {
        continue;
      }

      const nextTileZone = nextAssetId ? (input.state.buildingZoneIds[nextAssetId] ?? null) : null;
      const beltToNextZoneOk = areZonesTransportCompatible(convZone, nextTileZone);
      const nextConv = input.conveyors[nextAssetId!];
      const nextQueue = nextConv?.queue ?? [];
      const nextConveyorEligibility = classifyConveyorTargetEligibility([
        {
          condition: !input.movedThisTick.has(nextAssetId!),
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
      if (!nextConveyorEligibility.eligible) continue;

      return {
        kind: "target",
        targetType: "next_conveyor",
        targetId: nextAssetId!,
        nextAssetId: nextAssetId!,
      };
    }

    return { kind: "no_target", blockReason: "no_supported_target" };
  }

  if (input.convAsset.type === "conveyor_underground_in") {
    const peerId = input.state.conveyorUndergroundPeers[input.convId] ?? null;
    if (!peerId) {
      return { kind: "no_target", blockReason: "no_supported_target" };
    }
    const peerAsset = input.state.assets[peerId];
    if (!peerAsset || peerAsset.type !== "conveyor_underground_out") {
      return { kind: "no_target", blockReason: "no_supported_target" };
    }
    const nextConv = input.conveyors[peerId];
    const nextQueue = nextConv?.queue ?? [];
    const peerZone = input.state.buildingZoneIds[peerId] ?? null;
    const beltToPeerZoneOk = areZonesTransportCompatible(convZone, peerZone);
    const peerEligibility = classifyConveyorTargetEligibility([
      {
        condition: !input.movedThisTick.has(peerId),
        blockReason: "next_conveyor_already_moved",
      },
      {
        condition: beltToPeerZoneOk,
        blockReason: "next_conveyor_zone_incompatible",
      },
      {
        condition: nextQueue.length < CONVEYOR_TILE_CAPACITY,
        blockReason: "next_conveyor_full",
      },
    ]);
    if (!peerEligibility.eligible) {
      return {
        kind: "blocked",
        targetType: "next_conveyor",
        targetId: peerId,
        nextAssetId: peerId,
        blockReason: peerEligibility.blockReason,
      };
    }
    return {
      kind: "target",
      targetType: "next_conveyor",
      targetId: peerId,
      nextAssetId: peerId,
    };
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
    (nextAsset?.type === "conveyor" && (nextAsset.direction ?? "east") === dir) ||
    (nextAsset?.type === "conveyor_underground_in" &&
      (nextAsset.direction ?? "east") === dir) ||
    (nextAsset?.type === "conveyor_merger" &&
      getConveyorMergerInputSide(input.convAsset, nextAsset) !== null) ||
    (nextAsset?.type === "conveyor_splitter" &&
      isValidConveyorSplitterInput(input.convAsset, nextAsset));
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

  if (
    nextAsset?.type === "conveyor" ||
    nextAsset?.type === "conveyor_merger" ||
    nextAsset?.type === "conveyor_splitter" ||
    nextAsset?.type === "conveyor_underground_out"
  ) {
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

function assetHeight(asset: Pick<PlacedAsset, "height" | "size">): number {
  return asset.height ?? asset.size;
}