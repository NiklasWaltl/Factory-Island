import { GRID_H, GRID_W } from "../constants/grid";
import { CONVEYOR_TILE_CAPACITY } from "./constants/conveyor";
import type { AutoMinerEntry, ConveyorState, GameState, Inventory, PlacedAsset } from "./types";

export type AutoMinerTickEligibilityDecision =
  | { kind: "blocked" }
  | { kind: "ready"; minerAsset: PlacedAsset };

export const decideAutoMinerTickEligibility = (input: {
  minerId: string;
  assets: Record<string, PlacedAsset>;
  connectedAssetIds: readonly string[];
  getMachinePowerRatio: (assetId: string) => number;
}): AutoMinerTickEligibilityDecision => {
  const {
    minerId,
    assets,
    connectedAssetIds,
    getMachinePowerRatio,
  } = input;

  const minerAsset = assets[minerId];
  if (!minerAsset) return { kind: "blocked" };

  const isConnected = connectedAssetIds.includes(minerId);
  const powerRatio = getMachinePowerRatio(minerId);
  if (!isConnected || powerRatio < 1) return { kind: "blocked" };

  return { kind: "ready", minerAsset };
};

export type AutoMinerOutputSource =
  | { kind: "global" }
  | { kind: "warehouse"; warehouseId: string }
  | { kind: "zone"; zoneId: string };

export type AutoMinerOutputNoTargetReason = "targets_full_or_unavailable";

export type AutoMinerOutputTargetDecision =
  | {
      kind: "target";
      targetType: "adjacent_conveyor";
      outputConveyorId: string;
    }
  | {
      kind: "target";
      targetType: "source_fallback";
      outputKey: keyof Inventory;
      logWarehouseId: string;
    }
  | {
      kind: "no_target";
      blockReason: AutoMinerOutputNoTargetReason;
    };

export interface DecideAutoMinerOutputTargetInput {
  state: Pick<GameState, "assets" | "cellMap">;
  conveyors: Record<string, ConveyorState>;
  outputX: number;
  outputY: number;
  resource: AutoMinerEntry["resource"];
  source: AutoMinerOutputSource;
  sourceInv: Inventory;
  sourceCapacity: number;
  minerId: string;
  zoneWarehouseIds?: ReadonlyArray<string>;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function resolveAutoMinerSourceLogWarehouseId(
  source: AutoMinerOutputSource,
  minerId: string,
  zoneWarehouseIds?: ReadonlyArray<string>,
): string {
  if (source.kind === "warehouse") return source.warehouseId;
  if (source.kind === "zone") return zoneWarehouseIds?.[0] ?? minerId;
  return minerId;
}

export const decideAutoMinerOutputTarget = (
  input: DecideAutoMinerOutputTargetInput,
): AutoMinerOutputTargetDecision => {
  if (
    input.outputX >= 0 &&
    input.outputX < GRID_W &&
    input.outputY >= 0 &&
    input.outputY < GRID_H
  ) {
    const outAssetId = input.state.cellMap[cellKey(input.outputX, input.outputY)] ?? null;
    const outAsset = outAssetId ? input.state.assets[outAssetId] : null;
    if (outAsset?.type === "conveyor" || outAsset?.type === "conveyor_corner") {
      const outQueue = input.conveyors[outAssetId]?.queue ?? [];
      if (outQueue.length < CONVEYOR_TILE_CAPACITY) {
        return {
          kind: "target",
          targetType: "adjacent_conveyor",
          outputConveyorId: outAssetId,
        };
      }
    }
  }

  const outputKey = input.resource as keyof Inventory;
  if ((input.sourceInv[outputKey] as number) < input.sourceCapacity) {
    return {
      kind: "target",
      targetType: "source_fallback",
      outputKey,
      logWarehouseId: resolveAutoMinerSourceLogWarehouseId(
        input.source,
        input.minerId,
        input.zoneWarehouseIds,
      ),
    };
  }

  return {
    kind: "no_target",
    blockReason: "targets_full_or_unavailable",
  };
};
