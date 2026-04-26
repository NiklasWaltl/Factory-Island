import { debugLog } from "../../../../debug/debugLogger";
import { LOGISTICS_TICK_MS } from "../../../constants/timing";
import { AUTO_SMELTER_BUFFER_CAPACITY } from "../../../constants/auto-smelter";
import { CONVEYOR_TILE_CAPACITY } from "../../../constants/conveyor";
import { SMELTING_RECIPES, getSmeltingRecipe } from "../../../../simulation/recipes";
import { getCraftingSourceInventory } from "../../../../crafting/crafting-sources";
import {
  decideAutoSmelterTickEntryEligibility,
  decideAutoSmelterInputBeltEligibility,
  decideAutoSmelterNonPendingStatus,
  decideAutoSmelterOutputTarget,
  decideAutoSmelterPendingOutputStatus,
  decideAutoSmelterStartProcessingEligibility,
} from "../../../smelter-decisions";
import { consumeAutoSmelterPendingOutput } from "../../../smelter-mutations";
import type { ConveyorItem } from "../../../types";
import { getAutoSmelterIoCells } from "../../../asset-geometry";
import { resolveBuildingSource } from "../../../building-source";
import { addResources } from "../../../inventory-ops";
import { getBoostMultiplier } from "../../../machine-priority";
import { areAutoSmelterEntriesEqual } from "../../../smelter-equality";
import {
  applySourceInventory,
  getLiveLogisticsState,
  getMachinePowerRatio,
  getSourceCapacity,
  type LogisticsTickContext,
} from "../context";

// Module-scope flag: log smelter recipes only on the first batch start.
// Lifted from reducer.ts so the case extraction stays behavior-identical.
let _smelterRecipesLogged = false;

// ------------------------------------------------------------
// Phase 4: Auto-smelter belt input, processing, output flush, status update.
// ------------------------------------------------------------
export function runAutoSmelterPhase(ctx: LogisticsTickContext): void {
  const { state } = ctx;

  for (const [smelterId, smelterState] of Object.entries(state.autoSmelters ?? {})) {
    const entryDecision = decideAutoSmelterTickEntryEligibility({
      smelterId,
      smelterState,
      assets: state.assets,
      getMachinePowerRatio: (assetId) => getMachinePowerRatio(ctx, assetId),
      getSmeltingRecipe,
    });
    if (entryDecision.kind === "blocked") {
      if (entryDecision.reason === "no_asset_or_type") continue;

      // Unterstrom = kompletter Stopp: jede Unterversorgung (ratio < 1) stoppt die Verarbeitung vollständig.
      // Laufender progressMs bleibt erhalten und wird pausiert, bis wieder volle Versorgung anliegt.
      if (entryDecision.reason === "no_power") {
        ctx.newAutoSmeltersL =
          ctx.newAutoSmeltersL === state.autoSmelters
            ? { ...state.autoSmelters }
            : ctx.newAutoSmeltersL;
        ctx.newAutoSmeltersL[smelterId] = { ...smelterState, status: "NO_POWER" };
        ctx.changed = true;
        continue;
      }

      const nextSmelter = { ...smelterState, status: "MISCONFIGURED" as const };
      if (!areAutoSmelterEntriesEqual(nextSmelter, smelterState)) {
        ctx.newAutoSmeltersL =
          ctx.newAutoSmeltersL === state.autoSmelters
            ? { ...state.autoSmelters }
            : ctx.newAutoSmeltersL;
        ctx.newAutoSmeltersL[smelterId] = nextSmelter;
        ctx.changed = true;
      }
      continue;
    }

    const { smelterAsset, selectedRecipe } = entryDecision;
    const nextSmelter = { ...smelterState };

    const source = resolveBuildingSource(getLiveLogisticsState(ctx), smelterId);
    let sourceInv = getCraftingSourceInventory(getLiveLogisticsState(ctx), source);
    const sourceCapacity = getSourceCapacity(ctx, getLiveLogisticsState(ctx), source);
    const smelterIo = getAutoSmelterIoCells(smelterAsset);

    // Belt-only input: pull 1 matching item per tick from the adjacent input conveyor.
    // No inventory fallback — the auto-smelter is exclusively belt-fed.
    {
      const inX = smelterIo.input.x;
      const inY = smelterIo.input.y;
      if (import.meta.env.DEV) {
        console.log(
          `[AutoSmelter:${smelterId}] input check at tile (${inX},${inY}), buffer=${nextSmelter.inputBuffer.length}/${AUTO_SMELTER_BUFFER_CAPACITY}`,
        );
      }
      const inputDecision = decideAutoSmelterInputBeltEligibility({
        state,
        conveyors:
          ctx.newConveyorsL === state.conveyors ? state.conveyors : ctx.newConveyorsL,
        inputX: inX,
        inputY: inY,
        expectedInputItem: selectedRecipe.inputItem as ConveyorItem,
        inputBufferLength: nextSmelter.inputBuffer.length,
        inputBufferCapacity: AUTO_SMELTER_BUFFER_CAPACITY,
      });

      if (inputDecision.kind === "eligible") {
        const inAssetId = inputDecision.inputConveyorId;
        const inConv =
          ctx.newConveyorsL === state.conveyors
            ? state.conveyors[inAssetId]
            : ctx.newConveyorsL[inAssetId];
        const inQueue = inConv?.queue ?? [];
        if ((inQueue[0] ?? null) === selectedRecipe.inputItem) {
          ctx.newConveyorsL =
            ctx.newConveyorsL === state.conveyors
              ? { ...state.conveyors }
              : ctx.newConveyorsL;
          ctx.newConveyorsL[inAssetId] = { queue: inQueue.slice(1) };
          nextSmelter.inputBuffer = [...nextSmelter.inputBuffer, inputDecision.matchedInputItem];
          nextSmelter.lastRecipeInput = selectedRecipe.inputItem;
          nextSmelter.lastRecipeOutput = selectedRecipe.outputItem;
          ctx.changed = true;
          if (import.meta.env.DEV) {
            console.log(
              `[AutoSmelter:${smelterId}] consumed "${inputDecision.matchedInputItem}" from conveyor tile (${inX},${inY})`,
            );
          }
        }
      } else if (inputDecision.blockReason === "input_item_mismatch") {
        if (import.meta.env.DEV) {
          console.log(
            `[AutoSmelter:${smelterId}] no matching item on belt – found: ${inputDecision.foundInputItem ?? "empty"}, need: ${selectedRecipe.inputItem}`,
          );
        }
      } else if (inputDecision.blockReason === "input_tile_no_conveyor") {
        if (import.meta.env.DEV) {
          console.log(
            `[AutoSmelter:${smelterId}] no conveyor at input tile (${inX},${inY}) – smelter blocked`,
          );
        }
      }
    }

    // Flush pending output — Priority 1: output conveyor belt, Priority 2: source inventory.
    while (nextSmelter.pendingOutput.length > 0) {
      const pendingInputItem = nextSmelter.pendingOutput[0];
      const outputDecision = decideAutoSmelterOutputTarget({
        state,
        pendingInputItem,
        outputX: smelterIo.output.x,
        outputY: smelterIo.output.y,
        conveyors:
          ctx.newConveyorsL === state.conveyors ? state.conveyors : ctx.newConveyorsL,
        sourceInv,
        sourceCapacity,
      });

      if (outputDecision.kind === "no_target") {
        ctx.changed = consumeAutoSmelterPendingOutput({
          smelter: nextSmelter,
          recordThroughputEvent: false,
        }).changed;
        continue;
      }

      if (outputDecision.kind === "blocked") {
        // Output conveyor full OR source fallback full — stay blocked.
        break;
      }

      if (outputDecision.targetType === "output_conveyor") {
        const outAssetId = outputDecision.outputConveyorId;
        const outConv =
          ctx.newConveyorsL === state.conveyors
            ? state.conveyors[outAssetId]
            : ctx.newConveyorsL[outAssetId];
        const outQueue = outConv?.queue ?? [];
        if (outQueue.length >= CONVEYOR_TILE_CAPACITY) {
          break;
        }
        ctx.newConveyorsL =
          ctx.newConveyorsL === state.conveyors
            ? { ...state.conveyors }
            : ctx.newConveyorsL;
        ctx.newConveyorsL[outAssetId] = {
          queue: [...outQueue, outputDecision.outputItem],
        };
        ctx.changed = consumeAutoSmelterPendingOutput({
          smelter: nextSmelter,
          recordThroughputEvent: true,
        }).changed;
        continue;
      }

      const added = addResources(sourceInv, {
        [outputDecision.outputKey]: outputDecision.outputAmount,
      });
      applySourceInventory(ctx, source, added);
      sourceInv = added;
      ctx.changed = consumeAutoSmelterPendingOutput({
        smelter: nextSmelter,
        recordThroughputEvent: true,
      }).changed;
    }

    // Start processing once buffer holds recipe.inputAmount matching items.
    const matchCount = nextSmelter.inputBuffer.filter(
      (it) => it === selectedRecipe.inputItem,
    ).length;
    const startProcessingDecision = decideAutoSmelterStartProcessingEligibility({
      hasProcessing: !!nextSmelter.processing,
      pendingOutputCount: nextSmelter.pendingOutput.length,
      matchCount,
      requiredInputAmount: selectedRecipe.inputAmount,
    });
    if (startProcessingDecision.kind === "eligible") {
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
      ctx.changed = true;
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
        nextSmelter.pendingOutput = [
          ...nextSmelter.pendingOutput,
          nextSmelter.processing.inputItem,
        ];
        nextSmelter.processing = null;
      }
      ctx.changed = true;
    }

    // Keep only last 60s throughput data.
    const cutoff = Date.now() - 60_000;
    const trimmed = nextSmelter.throughputEvents.filter((ts) => ts >= cutoff);
    if (trimmed.length !== nextSmelter.throughputEvents.length) {
      nextSmelter.throughputEvents = trimmed;
      ctx.changed = true;
    }

    if (nextSmelter.pendingOutput.length > 0) {
      const statusOutputDecision = decideAutoSmelterOutputTarget({
        state,
        pendingInputItem: nextSmelter.pendingOutput[0],
        outputX: smelterIo.output.x,
        outputY: smelterIo.output.y,
        conveyors:
          ctx.newConveyorsL === state.conveyors ? state.conveyors : ctx.newConveyorsL,
        sourceInv,
        sourceCapacity,
      });
      const pendingOutputStatusDecision = decideAutoSmelterPendingOutputStatus(statusOutputDecision);
      nextSmelter.status = pendingOutputStatusDecision.nextStatus;
    } else {
      const nonPendingStatusDecision = decideAutoSmelterNonPendingStatus({
        hasProcessing: !!nextSmelter.processing,
        inputBufferCount: nextSmelter.inputBuffer.length,
      });
      nextSmelter.status = nonPendingStatusDecision.nextStatus;
    }

    if (!areAutoSmelterEntriesEqual(nextSmelter, smelterState)) {
      ctx.newAutoSmeltersL =
        ctx.newAutoSmeltersL === state.autoSmelters
          ? { ...state.autoSmelters }
          : ctx.newAutoSmeltersL;
      ctx.newAutoSmeltersL[smelterId] = nextSmelter;
    }
  }
}