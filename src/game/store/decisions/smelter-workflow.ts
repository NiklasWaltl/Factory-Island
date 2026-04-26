// ============================================================
// Auto-smelter workflow decisions
// ------------------------------------------------------------
// Decision layer for status transitions in LOGISTICS_TICK.
// Reducer applies returned actions as pure state updates.
// ============================================================

import { getSmeltingRecipe } from "../../simulation/recipes";
import { CONVEYOR_TILE_CAPACITY } from "../constants/conveyor";
import type {
  AutoSmelterEntry,
  AutoSmelterStatus,
  ConveyorState,
  Inventory,
  PlacedAsset,
} from "../types";

export type SmelterWorkflowAction = {
  type: "set_status";
  status: AutoSmelterStatus;
};

export interface SmelterOutputRouteContext {
  outputX: number;
  outputY: number;
  cellMap: Readonly<Record<string, string>>;
  assets: Readonly<Record<string, Pick<PlacedAsset, "type">>>;
  conveyors: Readonly<Record<string, ConveyorState>>;
  sourceInventory: Inventory;
  sourceCapacity: number;
}

export interface DecideSmelterWorkflowInput {
  powerRatio: number;
  smelter: Pick<AutoSmelterEntry, "pendingOutput" | "processing">;
  outputRoute?: SmelterOutputRouteContext;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function canFlushPendingOutput(
  pendingInputItem: AutoSmelterEntry["pendingOutput"][number],
  outputRoute: SmelterOutputRouteContext,
): "misconfigured" | boolean {
  const pendingRecipe = getSmeltingRecipe(pendingInputItem);
  if (!pendingRecipe) return "misconfigured";

  const outAssetId =
    outputRoute.cellMap[cellKey(outputRoute.outputX, outputRoute.outputY)];
  const outAsset = outAssetId ? outputRoute.assets[outAssetId] : null;
  const hasOutputConveyor =
    outAsset?.type === "conveyor" || outAsset?.type === "conveyor_corner";

  if (hasOutputConveyor) {
    const outQueue = outputRoute.conveyors[outAssetId]?.queue ?? [];
    return outQueue.length < CONVEYOR_TILE_CAPACITY;
  }

  const pendingOutputKey = pendingRecipe.outputItem as keyof Inventory;
  return (
    (outputRoute.sourceInventory[pendingOutputKey] as number) +
      pendingRecipe.outputAmount <=
    outputRoute.sourceCapacity
  );
}

export function decideSmelterWorkflowActions(
  input: DecideSmelterWorkflowInput,
): SmelterWorkflowAction[] {
  let status: AutoSmelterStatus;

  if (input.powerRatio < 1) {
    status = "NO_POWER";
  } else if (input.smelter.pendingOutput.length > 0) {
    const outputRoute = input.outputRoute;
    if (!outputRoute) {
      status = "OUTPUT_BLOCKED";
    } else {
      const outputCanProceed = canFlushPendingOutput(
        input.smelter.pendingOutput[0],
        outputRoute,
      );
      status =
        outputCanProceed === "misconfigured"
          ? "MISCONFIGURED"
          : outputCanProceed
            ? "IDLE"
            : "OUTPUT_BLOCKED";
    }
  } else if (input.smelter.processing) {
    status = "PROCESSING";
  } else {
    status = "IDLE";
  }

  return [{ type: "set_status", status }];
}
