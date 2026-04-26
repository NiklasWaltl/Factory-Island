import { AUTO_MINER_PRODUCE_TICKS } from "../../../constants/drone-config";
import {
  getCraftingSourceInventory,
} from "../../../../crafting/crafting-sources";
import { getZoneWarehouseIds } from "../../../../zones/production-zone-aggregation";
import {
  decideAutoMinerOutputTarget,
  decideAutoMinerTickEligibility,
} from "../../../auto-miner-decisions";
import { resolveBuildingSource } from "../../../building-source";
import { directionOffset } from "../../../direction";
import { addResources } from "../../../inventory-ops";
import { getBoostMultiplier } from "../../../machine-priority";
import {
  applySourceInventory,
  getLiveLogisticsState,
  getMachinePowerRatio,
  getSourceCapacity,
  type LogisticsTickContext,
} from "../context";

// ------------------------------------------------------------
// Phase 2: Auto-miner production and output routing.
// ------------------------------------------------------------
export function runAutoMinerPhase(ctx: LogisticsTickContext): void {
  const { state, deps } = ctx;

  for (const [minerId, miner] of Object.entries(state.autoMiners)) {
    const minerTickEligibility = decideAutoMinerTickEligibility({
      minerId,
      assets: state.assets,
      connectedAssetIds: state.connectedAssetIds,
      getMachinePowerRatio: (assetId) => getMachinePowerRatio(ctx, assetId),
    });
    // Unterstrom = kompletter Stopp: Progress bleibt eingefroren, bis die Maschine wieder voll versorgt ist.
    // Hinweis: der Scheduler hat den (ggf. boosted) Mehrverbrauch bereits eingerechnet - liefert er ratio === 1,
    // ist der Bedarf gedeckt. Ist der Bedarf nicht gedeckt, ratio < 1 -> hier wird abgebrochen.
    if (minerTickEligibility.kind === "blocked") continue;

    const { minerAsset } = minerTickEligibility;

    const minerBoost = getBoostMultiplier(minerAsset);
    let progress = miner.progress + minerBoost;
    if (progress >= AUTO_MINER_PRODUCE_TICKS) {
      const dir = minerAsset.direction ?? "east";
      const [ox, oy] = directionOffset(dir);
      const outX = minerAsset.x + ox;
      const outY = minerAsset.y + oy;
      let outputDone = false;

      const liveState = getLiveLogisticsState(ctx);
      const source = resolveBuildingSource(liveState, minerId);
      const sourceInv = getCraftingSourceInventory(liveState, source);
      const sourceCapacity = getSourceCapacity(ctx, liveState, source);
      const outputDecision = decideAutoMinerOutputTarget({
        state,
        conveyors:
          ctx.newConveyorsL === state.conveyors ? state.conveyors : ctx.newConveyorsL,
        outputX: outX,
        outputY: outY,
        resource: miner.resource,
        source,
        sourceInv,
        sourceCapacity,
        minerId,
        zoneWarehouseIds:
          source.kind === "zone"
            ? getZoneWarehouseIds(liveState, source.zoneId)
            : undefined,
      });

      if (
        outputDecision.kind === "target" &&
        outputDecision.targetType === "adjacent_conveyor"
      ) {
        const outAssetId = outputDecision.outputConveyorId;
        const outConv =
          ctx.newConveyorsL === state.conveyors
            ? state.conveyors[outAssetId]
            : ctx.newConveyorsL[outAssetId];
        const outQueue = outConv?.queue ?? [];
        ctx.newConveyorsL =
          ctx.newConveyorsL === state.conveyors ? { ...state.conveyors } : ctx.newConveyorsL;
        ctx.newConveyorsL[outAssetId] = { queue: [...outQueue, miner.resource] };
        progress = 0;
        ctx.changed = true;
        outputDone = true;
      }

      if (
        !outputDone &&
        outputDecision.kind === "target" &&
        outputDecision.targetType === "source_fallback"
      ) {
        const newSourceInv = addResources(sourceInv, {
          [outputDecision.outputKey]: 1,
        });
        applySourceInventory(ctx, source, newSourceInv);
        ctx.newAutoDeliveryLogL = deps.addAutoDelivery(
          ctx.newAutoDeliveryLogL,
          "auto_miner",
          minerId,
          miner.resource,
          outputDecision.logWarehouseId,
        );
        progress = 0;
        ctx.changed = true;
        outputDone = true;
      }

      // If still at max, stay blocked (output-Ziel hat keinen Platz).
      if (progress >= AUTO_MINER_PRODUCE_TICKS) progress = AUTO_MINER_PRODUCE_TICKS;
    }
    if (progress !== miner.progress) {
      ctx.newAutoMinersL =
        ctx.newAutoMinersL === state.autoMiners
          ? { ...state.autoMiners }
          : ctx.newAutoMinersL;
      ctx.newAutoMinersL[minerId] = { ...miner, progress };
      ctx.changed = true;
    }
  }
}