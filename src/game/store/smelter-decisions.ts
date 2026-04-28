import { GRID_H, GRID_W } from "../constants/grid";
import { getSmeltingRecipe } from "../simulation/recipes";
import { CONVEYOR_TILE_CAPACITY } from "./constants/conveyor";
import type {
  AutoSmelterEntry,
  ConveyorItem,
  ConveyorState,
  GameState,
  Inventory,
  PlacedAsset,
} from "./types";

export type AutoSmelterTickEntryEligibilityDecision =
  | {
      kind: "blocked";
      reason: "no_asset_or_type" | "no_power" | "misconfigured_recipe";
    }
  | {
      kind: "ready";
      smelterAsset: PlacedAsset;
      selectedRecipe: NonNullable<ReturnType<typeof getSmeltingRecipe>>;
    };

export const decideAutoSmelterTickEntryEligibility = (input: {
  smelterId: string;
  smelterState: AutoSmelterEntry;
  assets: Record<string, PlacedAsset>;
  getMachinePowerRatio: (assetId: string) => number;
  getSmeltingRecipe: typeof getSmeltingRecipe;
}): AutoSmelterTickEntryEligibilityDecision => {
  const {
    smelterId,
    smelterState,
    assets,
    getMachinePowerRatio,
    getSmeltingRecipe,
  } = input;

  const smelterAsset = assets[smelterId];
  if (!smelterAsset || smelterAsset.type !== "auto_smelter") {
    return { kind: "blocked", reason: "no_asset_or_type" };
  }

  const powerRatio = getMachinePowerRatio(smelterId);
  if (powerRatio < 1) {
    return { kind: "blocked", reason: "no_power" };
  }

  const selectedRecipe = getSmeltingRecipe(smelterState.selectedRecipe);
  if (!selectedRecipe) {
    return { kind: "blocked", reason: "misconfigured_recipe" };
  }

  return { kind: "ready", smelterAsset, selectedRecipe };
};

export type AutoSmelterInputBeltBlockReason =
  | "input_buffer_full"
  | "input_tile_out_of_bounds"
  | "input_tile_no_conveyor"
  | "input_item_mismatch";

export type AutoSmelterInputBeltDecision =
  | {
      kind: "eligible";
      inputConveyorId: string;
      matchedInputItem: ConveyorItem;
    }
  | {
      kind: "blocked";
      blockReason: AutoSmelterInputBeltBlockReason;
      foundInputItem?: ConveyorItem | null;
    };

export interface DecideAutoSmelterInputBeltEligibilityInput {
  state: Pick<GameState, "assets" | "cellMap">;
  conveyors: Record<string, ConveyorState>;
  inputX: number;
  inputY: number;
  expectedInputItem: ConveyorItem;
  inputBufferLength: number;
  inputBufferCapacity: number;
}

export type AutoSmelterStartProcessingBlockReason =
  | "processing_active"
  | "pending_output_not_empty"
  | "input_amount_not_reached";

export type AutoSmelterStartProcessingDecision =
  | { kind: "eligible" }
  | { kind: "blocked"; blockReason: AutoSmelterStartProcessingBlockReason };

export interface DecideAutoSmelterStartProcessingEligibilityInput {
  hasProcessing: boolean;
  pendingOutputCount: number;
  matchCount: number;
  requiredInputAmount: number;
}

export type AutoSmelterOutputTargetType =
  | "output_conveyor"
  | "source_fallback";
export type AutoSmelterOutputBlockReason =
  | "output_conveyor_full"
  | "source_fallback_full";
export type AutoSmelterOutputNoTargetReason = "missing_pending_recipe";

export type AutoSmelterOutputTargetDecision =
  | {
      kind: "target";
      targetType: "output_conveyor";
      outputConveyorId: string;
      outputItem: ConveyorItem;
      outputKey: keyof Inventory;
      outputAmount: number;
    }
  | {
      kind: "target";
      targetType: "source_fallback";
      outputItem: ConveyorItem;
      outputKey: keyof Inventory;
      outputAmount: number;
    }
  | {
      kind: "blocked";
      targetType: AutoSmelterOutputTargetType;
      blockReason: AutoSmelterOutputBlockReason;
      outputConveyorId?: string;
    }
  | {
      kind: "no_target";
      blockReason: AutoSmelterOutputNoTargetReason;
    };

export interface DecideAutoSmelterOutputTargetInput {
  state: Pick<GameState, "assets" | "cellMap">;
  pendingInputItem: ConveyorItem;
  outputX: number;
  outputY: number;
  conveyors: Record<string, ConveyorState>;
  sourceInv: Inventory;
  sourceCapacity: number;
}

export type AutoSmelterPendingOutputStatusDecision =
  | { nextStatus: "MISCONFIGURED"; decisionKind: "no_target" }
  | { nextStatus: "OUTPUT_BLOCKED"; decisionKind: "blocked" }
  | { nextStatus: "IDLE"; decisionKind: "target" };

export type AutoSmelterNonPendingStatusDecision =
  | { nextStatus: "PROCESSING"; decisionKind: "processing_active" }
  | { nextStatus: "IDLE"; decisionKind: "idle_with_buffer" | "idle_empty" };

export interface DecideAutoSmelterNonPendingStatusInput {
  hasProcessing: boolean;
  inputBufferCount: number;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export const decideAutoSmelterInputBeltEligibility = (
  input: DecideAutoSmelterInputBeltEligibilityInput,
): AutoSmelterInputBeltDecision => {
  if (input.inputBufferLength >= input.inputBufferCapacity) {
    return { kind: "blocked", blockReason: "input_buffer_full" };
  }

  if (input.inputX < 0 || input.inputX >= GRID_W || input.inputY < 0 || input.inputY >= GRID_H) {
    return { kind: "blocked", blockReason: "input_tile_out_of_bounds" };
  }

  const inAssetId = input.state.cellMap[cellKey(input.inputX, input.inputY)] ?? null;
  const inAsset = inAssetId ? input.state.assets[inAssetId] : null;
  if (
    inAsset?.type !== "conveyor" &&
    inAsset?.type !== "conveyor_corner" &&
    inAsset?.type !== "conveyor_underground_out"
  ) {
    return { kind: "blocked", blockReason: "input_tile_no_conveyor" };
  }

  const inQueue = input.conveyors[inAssetId]?.queue ?? [];
  const frontItem = (inQueue[0] ?? null) as ConveyorItem | null;
  if (frontItem !== input.expectedInputItem) {
    return {
      kind: "blocked",
      blockReason: "input_item_mismatch",
      foundInputItem: frontItem,
    };
  }

  return {
    kind: "eligible",
    inputConveyorId: inAssetId,
    matchedInputItem: input.expectedInputItem,
  };
};

export const decideAutoSmelterStartProcessingEligibility = (
  input: DecideAutoSmelterStartProcessingEligibilityInput,
): AutoSmelterStartProcessingDecision => {
  if (input.hasProcessing) {
    return { kind: "blocked", blockReason: "processing_active" };
  }
  if (input.pendingOutputCount > 0) {
    return { kind: "blocked", blockReason: "pending_output_not_empty" };
  }
  if (input.matchCount < input.requiredInputAmount) {
    return { kind: "blocked", blockReason: "input_amount_not_reached" };
  }
  return { kind: "eligible" };
};

export const decideAutoSmelterOutputTarget = (
  input: DecideAutoSmelterOutputTargetInput,
): AutoSmelterOutputTargetDecision => {
  const pendingRecipe = getSmeltingRecipe(input.pendingInputItem);
  if (!pendingRecipe) {
    return { kind: "no_target", blockReason: "missing_pending_recipe" };
  }

  const outputKey = pendingRecipe.outputItem as keyof Inventory;
  const outputItem = pendingRecipe.outputItem as ConveyorItem;
  const outputAmount = pendingRecipe.outputAmount;

  if (input.outputX >= 0 && input.outputX < GRID_W && input.outputY >= 0 && input.outputY < GRID_H) {
    const outAssetId = input.state.cellMap[cellKey(input.outputX, input.outputY)] ?? null;
    const outAsset = outAssetId ? input.state.assets[outAssetId] : null;
    if (
      outAsset?.type === "conveyor" ||
      outAsset?.type === "conveyor_corner" ||
      outAsset?.type === "conveyor_underground_in"
    ) {
      const outQueue = input.conveyors[outAssetId]?.queue ?? [];
      if (outQueue.length < CONVEYOR_TILE_CAPACITY) {
        return {
          kind: "target",
          targetType: "output_conveyor",
          outputConveyorId: outAssetId,
          outputItem,
          outputKey,
          outputAmount,
        };
      }
      return {
        kind: "blocked",
        targetType: "output_conveyor",
        outputConveyorId: outAssetId,
        blockReason: "output_conveyor_full",
      };
    }
  }

  if ((input.sourceInv[outputKey] as number) + outputAmount > input.sourceCapacity) {
    return {
      kind: "blocked",
      targetType: "source_fallback",
      blockReason: "source_fallback_full",
    };
  }

  return {
    kind: "target",
    targetType: "source_fallback",
    outputItem,
    outputKey,
    outputAmount,
  };
};

export const decideAutoSmelterPendingOutputStatus = (
  outputDecision: AutoSmelterOutputTargetDecision,
): AutoSmelterPendingOutputStatusDecision => {
  if (outputDecision.kind === "no_target") {
    return { nextStatus: "MISCONFIGURED", decisionKind: "no_target" };
  }
  if (outputDecision.kind === "blocked") {
    return { nextStatus: "OUTPUT_BLOCKED", decisionKind: "blocked" };
  }
  return { nextStatus: "IDLE", decisionKind: "target" };
};

export const decideAutoSmelterNonPendingStatus = (
  input: DecideAutoSmelterNonPendingStatusInput,
): AutoSmelterNonPendingStatusDecision => {
  if (input.hasProcessing) {
    return { nextStatus: "PROCESSING", decisionKind: "processing_active" };
  }
  if (input.inputBufferCount > 0) {
    return { nextStatus: "IDLE", decisionKind: "idle_with_buffer" };
  }
  return { nextStatus: "IDLE", decisionKind: "idle_empty" };
};