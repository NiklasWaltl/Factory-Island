import { debugLog } from "../../../../debug/debugLogger";
import { getCraftingSourceInventory } from "../../../../crafting/crafting-sources";
import {
  decideConveyorTickEligibility,
  decideConveyorTargetSelection,
} from "../../../conveyor-decisions";
import type { CraftingSource } from "../../../types";
import type { ConveyorItem, Inventory } from "../../../types";
import { resolveBuildingSource } from "../../../building-source";
import { addResources } from "../../../inventory-ops";
import { CONVEYOR_TILE_CAPACITY } from "../../../constants/conveyor";
import { getWarehouseCapacity } from "../../../warehouse-capacity";
import { isValidWarehouseInput } from "../../../warehouse-input";
import {
  applySourceInventory,
  getLiveLogisticsState,
  getSourceCapacity,
  tryStoreInWarehouse,
  type LogisticsTickContext,
} from "../context";

// ------------------------------------------------------------
// Phase 3: Conveyor movement, transport matching, destination handoff.
// ------------------------------------------------------------
export function runConveyorPhase(ctx: LogisticsTickContext): void {
  const { state, deps } = ctx;
  const movedThisTick = new Set<string>();

  const dequeueConveyorFrontItemAndMarkChanged = (
    convId: string,
    activeQueue: ConveyorItem[],
  ): void => {
    ctx.newConveyorsL =
      ctx.newConveyorsL === state.conveyors ? { ...state.conveyors } : ctx.newConveyorsL;
    ctx.newConveyorsL[convId] = { queue: activeQueue.slice(1) };
    ctx.changed = true;
  };

  const commitConveyorWarehouseDelivery = (
    convId: string,
    activeQueue: ConveyorItem[],
    currentItem: ConveyorItem,
    warehouseId: string,
  ): void => {
    ctx.newAutoDeliveryLogL = deps.addAutoDelivery(
      ctx.newAutoDeliveryLogL,
      "conveyor",
      convId,
      currentItem,
      warehouseId,
    );
    dequeueConveyorFrontItemAndMarkChanged(convId, activeQueue);
  };

  const commitConveyorToNextConveyor = (
    convId: string,
    activeQueue: ConveyorItem[],
    currentItem: ConveyorItem,
    nextConveyorId: string,
    nextQueue: ConveyorItem[],
  ): void => {
    ctx.newConveyorsL =
      ctx.newConveyorsL === state.conveyors ? { ...state.conveyors } : ctx.newConveyorsL;
    ctx.newConveyorsL[nextConveyorId] = { queue: [...nextQueue, currentItem] };
    dequeueConveyorFrontItemAndMarkChanged(convId, activeQueue);
    movedThisTick.add(nextConveyorId);
  };

  const commitConveyorToWorkbench = (
    convId: string,
    activeQueue: ConveyorItem[],
    currentItem: ConveyorItem,
    wbSource: CraftingSource,
    wbSourceInv: Inventory,
  ): void => {
    const resKey = currentItem as keyof Inventory;
    applySourceInventory(ctx, wbSource, addResources(wbSourceInv, { [resKey]: 1 }));
    ctx.newNotifsL = deps.addNotification(ctx.newNotifsL, currentItem, 1);
    dequeueConveyorFrontItemAndMarkChanged(convId, activeQueue);
  };

  const commitConveyorToSmithy = (
    convId: string,
    activeQueue: ConveyorItem[],
    oreKey: "iron" | "copper",
  ): void => {
    ctx.newSmithyL = {
      ...ctx.newSmithyL,
      [oreKey]: (ctx.newSmithyL as any)[oreKey] + 1,
    };
    dequeueConveyorFrontItemAndMarkChanged(convId, activeQueue);
  };

  for (const [convId, conv] of Object.entries(state.conveyors)) {
    const activeConv =
      ctx.newConveyorsL === state.conveyors ? conv : ctx.newConveyorsL[convId];
    const activeQueue = activeConv?.queue ?? [];
    const queueHead = activeQueue[0] ?? null;
    if (!queueHead) continue;
    const preflight = decideConveyorTickEligibility({
      conveyorId: convId,
      movedThisTick,
      assets: state.assets,
      connectedAssetIds: state.connectedAssetIds,
      poweredSet: ctx.poweredSet,
    });
    if (preflight.kind === "blocked") continue;
    const { conveyorAsset } = preflight;
    const currentItem = queueHead;
    const liveLogisticsState = getLiveLogisticsState(ctx);

    const routingDecision = decideConveyorTargetSelection({
      state,
      liveState: liveLogisticsState,
      convId,
      convAsset: conveyorAsset,
      currentItem,
      conveyors:
        ctx.newConveyorsL === state.conveyors ? state.conveyors : ctx.newConveyorsL,
      warehouseInventories:
        ctx.newWarehouseInventoriesL === state.warehouseInventories
          ? state.warehouseInventories
          : ctx.newWarehouseInventoriesL,
      smithy: ctx.newSmithyL,
      movedThisTick,
      isValidWarehouseInput,
      resolveBuildingSource,
      getCraftingSourceInventory,
      getSourceCapacity: (live, source) => getSourceCapacity(ctx, live, source),
      getWarehouseCapacity,
    });

    if (routingDecision.kind === "no_target") continue;

    if (routingDecision.kind === "blocked") {
      if (
        routingDecision.blockReason === "workbench_no_active_job" &&
        import.meta.env.DEV
      ) {
        debugLog.inventory(
          `[Conveyor] WorkBench ${routingDecision.targetId}: ignoring ${currentItem}, no active job`,
        );
      }
      continue;
    }

    if (routingDecision.targetType === "warehouse_input_tile") {
      if (tryStoreInWarehouse(ctx, routingDecision.targetId, currentItem)) {
        commitConveyorWarehouseDelivery(
          convId,
          activeQueue,
          currentItem,
          routingDecision.targetId,
        );
      }
      continue;
    }

    if (routingDecision.targetType === "next_conveyor") {
      const nextConveyorId = routingDecision.nextAssetId;
      const nextConv =
        ctx.newConveyorsL === state.conveyors
          ? state.conveyors[nextConveyorId]
          : ctx.newConveyorsL[nextConveyorId];
      const nextQueue = nextConv?.queue ?? [];
      if (nextQueue.length < CONVEYOR_TILE_CAPACITY) {
        commitConveyorToNextConveyor(
          convId,
          activeQueue,
          currentItem,
          nextConveyorId,
          nextQueue,
        );
      }
      continue;
    }

    if (routingDecision.targetType === "adjacent_warehouse") {
      if (tryStoreInWarehouse(ctx, routingDecision.targetId, currentItem)) {
        commitConveyorWarehouseDelivery(
          convId,
          activeQueue,
          currentItem,
          routingDecision.targetId,
        );
      }
      continue;
    }

    if (routingDecision.targetType === "workbench") {
      const liveForWb = getLiveLogisticsState(ctx);
      const wbSource = resolveBuildingSource(liveForWb, routingDecision.targetId);
      const wbSourceInv = getCraftingSourceInventory(liveForWb, wbSource);
      const wbCap = getSourceCapacity(ctx, liveForWb, wbSource);
      const resKey = currentItem as keyof Inventory;
      if ((wbSourceInv[resKey] as number) < wbCap) {
        commitConveyorToWorkbench(convId, activeQueue, currentItem, wbSource, wbSourceInv);
        if (import.meta.env.DEV) {
          debugLog.inventory(
            `[Conveyor] Drohne/Band: delivering ${currentItem} for Job ${routingDecision.workbenchJob.id} (${routingDecision.workbenchJob.status})`,
          );
        }
      }
      continue;
    }

    if (routingDecision.targetType === "smithy") {
      commitConveyorToSmithy(convId, activeQueue, routingDecision.smithyOreKey);
    }
  }
}