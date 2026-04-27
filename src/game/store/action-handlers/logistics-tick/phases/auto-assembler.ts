// ============================================================
// Auto-assembler V1 — belt input, processing, belt-only output.
// ------------------------------------------------------------
// Domain rules (V1):
// - Input: iron ingots from adjacent input conveyor only (shared buffer).
// - Output: adjacent output conveyor only (no warehouse / inventory fallback).
// - Under-power: full stop; processing progress freezes (same semantics as auto-smelter).
// - No overclocking.
// - Recipe change only when idle: buffer 0, not processing, no pending output.
// ============================================================

import { LOGISTICS_TICK_MS } from "../../../constants/timing";
import { AUTO_ASSEMBLER_BUFFER_CAPACITY } from "../../../constants/auto-assembler";
import { CONVEYOR_TILE_CAPACITY } from "../../../constants/conveyor";
import { getAutoAssemblerV1Recipe } from "../../../../simulation/recipes/AutoAssemblerV1Recipes";
import {
  decideAutoSmelterInputBeltEligibility,
  decideAutoSmelterNonPendingStatus,
  decideAutoSmelterStartProcessingEligibility,
} from "../../../smelter-decisions";
import { areAutoAssemblerEntriesEqual } from "../../../assembler-equality";
import type { AutoAssemblerEntry, ConveyorItem, PlacedAsset } from "../../../types";
import { getAutoSmelterIoCells } from "../../../asset-geometry";
import { GRID_H, GRID_W } from "../../../../constants/grid";
import { cellKey } from "../../../cell-key";
import { getMachinePowerRatio, type LogisticsTickContext } from "../context";
import type { ConveyorState, GameState } from "../../../types";

function decideAssemblerBeltOnlyOutput(input: {
  state: Pick<GameState, "assets" | "cellMap">;
  outputX: number;
  outputY: number;
  conveyors: Record<string, ConveyorState>;
}):
  | { kind: "target"; outputConveyorId: string }
  | { kind: "blocked"; blockReason: "output_conveyor_full" }
  | { kind: "misconfigured" } {
  const { state, outputX, outputY, conveyors } = input;
  if (outputX < 0 || outputX >= GRID_W || outputY < 0 || outputY >= GRID_H) {
    return { kind: "misconfigured" };
  }
  const outAssetId = state.cellMap[cellKey(outputX, outputY)] ?? null;
  const outAsset = outAssetId ? state.assets[outAssetId] : null;
  if (
    outAsset?.type !== "conveyor" &&
    outAsset?.type !== "conveyor_corner" &&
    outAsset?.type !== "conveyor_underground_in"
  ) {
    return { kind: "misconfigured" };
  }
  const outQueue = conveyors[outAssetId]?.queue ?? [];
  if (outQueue.length >= CONVEYOR_TILE_CAPACITY) {
    return { kind: "blocked", blockReason: "output_conveyor_full" };
  }
  return { kind: "target", outputConveyorId: outAssetId };
}

function consumeAssemblerPendingOutput(entry: AutoAssemblerEntry): void {
  entry.pendingOutput = entry.pendingOutput.slice(1);
}

export function runAutoAssemblerPhase(ctx: LogisticsTickContext): void {
  const { state } = ctx;

  for (const [assemblerId, assemblerState] of Object.entries(state.autoAssemblers ?? {})) {
    const asset = state.assets[assemblerId];
    if (!asset || asset.type !== "auto_assembler") continue;

    const powerRatio = getMachinePowerRatio(ctx, assemblerId);
    if (powerRatio < 1) {
      ctx.newAutoAssemblersL =
        ctx.newAutoAssemblersL === state.autoAssemblers
          ? { ...state.autoAssemblers }
          : ctx.newAutoAssemblersL;
      ctx.newAutoAssemblersL[assemblerId] = { ...assemblerState, status: "NO_POWER" };
      ctx.changed = true;
      continue;
    }

    const recipe = getAutoAssemblerV1Recipe(assemblerState.selectedRecipe);
    if (!recipe) {
      ctx.newAutoAssemblersL =
        ctx.newAutoAssemblersL === state.autoAssemblers
          ? { ...state.autoAssemblers }
          : ctx.newAutoAssemblersL;
      ctx.newAutoAssemblersL[assemblerId] = { ...assemblerState, status: "MISCONFIGURED" as const };
      ctx.changed = true;
      continue;
    }

    const nextAssembler: AutoAssemblerEntry = { ...assemblerState };
    const io = getAutoSmelterIoCells(asset as PlacedAsset);

    // Belt input: one iron ingot per tick when buffer allows.
    {
      const inputDecision = decideAutoSmelterInputBeltEligibility({
        state,
        conveyors:
          ctx.newConveyorsL === state.conveyors ? state.conveyors : ctx.newConveyorsL,
        inputX: io.input.x,
        inputY: io.input.y,
        expectedInputItem: "ironIngot",
        inputBufferLength: nextAssembler.ironIngotBuffer,
        inputBufferCapacity: AUTO_ASSEMBLER_BUFFER_CAPACITY,
      });

      if (inputDecision.kind === "eligible") {
        const inAssetId = inputDecision.inputConveyorId;
        const inConv =
          ctx.newConveyorsL === state.conveyors
            ? state.conveyors[inAssetId]
            : ctx.newConveyorsL[inAssetId];
        const inQueue = inConv?.queue ?? [];
        if ((inQueue[0] ?? null) === "ironIngot") {
          ctx.newConveyorsL =
            ctx.newConveyorsL === state.conveyors
              ? { ...state.conveyors }
              : ctx.newConveyorsL;
          ctx.newConveyorsL[inAssetId] = { queue: inQueue.slice(1) };
          nextAssembler.ironIngotBuffer = nextAssembler.ironIngotBuffer + 1;
          ctx.changed = true;
        }
      }
    }

    // Flush pending output to belt only.
    while (nextAssembler.pendingOutput.length > 0) {
      const item = nextAssembler.pendingOutput[0];
      const outDec = decideAssemblerBeltOnlyOutput({
        state,
        outputX: io.output.x,
        outputY: io.output.y,
        conveyors:
          ctx.newConveyorsL === state.conveyors ? state.conveyors : ctx.newConveyorsL,
      });

      if (outDec.kind === "misconfigured") {
        break;
      }
      if (outDec.kind === "blocked") {
        break;
      }

      const outConv =
        ctx.newConveyorsL === state.conveyors
          ? state.conveyors[outDec.outputConveyorId]
          : ctx.newConveyorsL[outDec.outputConveyorId];
      const outQueue = outConv?.queue ?? [];
      ctx.newConveyorsL =
        ctx.newConveyorsL === state.conveyors
          ? { ...state.conveyors }
          : ctx.newConveyorsL;
      ctx.newConveyorsL[outDec.outputConveyorId] = {
        queue: [...outQueue, item],
      };
      consumeAssemblerPendingOutput(nextAssembler);
      ctx.changed = true;
    }

    const matchCount = nextAssembler.ironIngotBuffer;
    const startDecision = decideAutoSmelterStartProcessingEligibility({
      hasProcessing: !!nextAssembler.processing,
      pendingOutputCount: nextAssembler.pendingOutput.length,
      matchCount,
      requiredInputAmount: recipe.inputAmount,
    });

    if (startDecision.kind === "eligible") {
      nextAssembler.ironIngotBuffer -= recipe.inputAmount;
      nextAssembler.processing = {
        outputItem: recipe.outputItem,
        progressMs: 0,
        durationMs: Math.max(1, recipe.processingTimeSec * 1000),
      };
      ctx.changed = true;
    }

    if (nextAssembler.processing) {
      nextAssembler.processing = {
        ...nextAssembler.processing,
        progressMs: nextAssembler.processing.progressMs + LOGISTICS_TICK_MS,
      };
      if (nextAssembler.processing.progressMs >= nextAssembler.processing.durationMs) {
        nextAssembler.pendingOutput = [
          ...nextAssembler.pendingOutput,
          nextAssembler.processing.outputItem,
        ];
        nextAssembler.processing = null;
      }
      ctx.changed = true;
    }

    if (nextAssembler.pendingOutput.length > 0) {
      const outForStatus = decideAssemblerBeltOnlyOutput({
        state,
        outputX: io.output.x,
        outputY: io.output.y,
        conveyors:
          ctx.newConveyorsL === state.conveyors ? state.conveyors : ctx.newConveyorsL,
      });
      if (outForStatus.kind === "misconfigured") {
        nextAssembler.status = "MISCONFIGURED";
      } else if (outForStatus.kind === "blocked") {
        nextAssembler.status = "OUTPUT_BLOCKED";
      } else {
        nextAssembler.status = "IDLE";
      }
    } else {
      nextAssembler.status = decideAutoSmelterNonPendingStatus({
        hasProcessing: !!nextAssembler.processing,
        inputBufferCount: nextAssembler.ironIngotBuffer,
      }).nextStatus;
    }

    if (!areAutoAssemblerEntriesEqual(nextAssembler, assemblerState)) {
      ctx.newAutoAssemblersL =
        ctx.newAutoAssemblersL === state.autoAssemblers
          ? { ...state.autoAssemblers }
          : ctx.newAutoAssemblersL;
      ctx.newAutoAssemblersL[assemblerId] = nextAssembler;
    }
  }
}
