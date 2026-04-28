import { applyNetworkAction } from "../inventory/reservations";
import type { CraftingJob } from "../crafting/types";
import {
  getGlobalHubWarehouseId,
  hubInventoryToInventoryView,
  inventoryViewToHubInventory,
  pickCraftingPhysicalSourceForIngredient,
} from "../crafting/tick";
import type {
  CollectableItemType,
  GameState,
  Inventory,
} from "./types";
import { getCraftingReservationById } from "./workbench-task-utils";
import { isCollectableCraftingItem } from "../crafting/workbench-input-buffer";

export function resolveWorkbenchInputPickup(
  state: Pick<GameState, "assets" | "warehouseInventories" | "serviceHubs" | "network">,
  job: CraftingJob,
  reservation: {
    id: string;
    itemId: CraftingJob["ingredients"][number]["itemId"];
    amount: number;
  },
): { x: number; y: number; sourceKind: "warehouse" | "hub"; sourceId: string } | null {
  if (job.inventorySource.kind === "global") return null;
  const decision = pickCraftingPhysicalSourceForIngredient({
    source: job.inventorySource,
    itemId: reservation.itemId,
    required: reservation.amount,
    warehouseInventories: state.warehouseInventories,
    serviceHubs: state.serviceHubs,
    network: state.network,
    assets: state.assets,
    preferredFromAssetId: job.workbenchId,
    excludeReservationId: reservation.id,
  });
  if (!decision.source) return null;
  const sourceId = decision.source.kind === "warehouse"
    ? decision.source.warehouseId
    : decision.source.hubId;
  const asset = state.assets[sourceId];
  if (!asset) return null;
  return {
    x: asset.x,
    y: asset.y,
    sourceKind: decision.source.kind,
    sourceId,
  };
}

export function commitWorkbenchInputReservation(
  state: GameState,
  job: CraftingJob,
  reservationId: string,
): {
  nextState: GameState;
  itemType: CollectableItemType;
  amount: number;
  sourceKind: "warehouse" | "hub";
  sourceId: string;
} | null {
  const reservation = getCraftingReservationById(state.network, reservationId);
  if (!reservation) return null;
  if (reservation.ownerKind !== "crafting_job" || reservation.ownerId !== job.reservationOwnerId) return null;
  if (!isCollectableCraftingItem(reservation.itemId)) return null;
  if (job.inventorySource.kind === "global") return null;

  const decision = pickCraftingPhysicalSourceForIngredient({
    source: job.inventorySource,
    itemId: reservation.itemId,
    required: reservation.amount,
    warehouseInventories: state.warehouseInventories,
    serviceHubs: state.serviceHubs,
    network: state.network,
    assets: state.assets,
    preferredFromAssetId: job.workbenchId,
    excludeReservationId: reservation.id,
  });
  if (!decision.source) return null;

  if (decision.source.kind === "warehouse") {
    const warehouseId = decision.source.warehouseId;
    const warehouseInventory = state.warehouseInventories[warehouseId];
    if (!warehouseInventory) return null;
    const beforeAmount = (warehouseInventory as unknown as Record<string, number>)[reservation.itemId] ?? 0;
    const scoped = { [warehouseId]: warehouseInventory };
    const result = applyNetworkAction(scoped, state.network, {
      type: "NETWORK_COMMIT_RESERVATION",
      reservationId,
    });
    if (result.network.lastError) return null;
    if (import.meta.env.DEV) {
      const afterInventory = result.warehouseInventories[warehouseId] ?? warehouseInventory;
      const afterAmount = (afterInventory as unknown as Record<string, number>)[reservation.itemId] ?? 0;
      if (beforeAmount - afterAmount !== reservation.amount) {
        throw new Error(
          `[workbench] Invariant violated: commit ${reservation.id} debited ${beforeAmount - afterAmount} ` +
            `of ${reservation.itemId}, expected ${reservation.amount}.`,
        );
      }
      if (result.network.reservations.some((entry) => entry.id === reservation.id)) {
        throw new Error(
          `[workbench] Invariant violated: reservation ${reservation.id} still present after commit.`,
        );
      }
    }
    return {
      nextState: {
        ...state,
        warehouseInventories: {
          ...state.warehouseInventories,
          ...result.warehouseInventories,
        },
        network: result.network,
      },
      itemType: reservation.itemId,
      amount: reservation.amount,
      sourceKind: "warehouse",
      sourceId: warehouseId,
    };
  }

  const hubId = decision.source.hubId;
  const hubEntry = state.serviceHubs[hubId];
  if (!hubEntry) return null;
  const pseudoWarehouseId = getGlobalHubWarehouseId(hubId);
  const scoped: Record<string, Inventory> = {
    [pseudoWarehouseId]: hubInventoryToInventoryView(hubEntry.inventory),
  };
  const beforeAmount = (scoped[pseudoWarehouseId] as unknown as Record<string, number>)[reservation.itemId] ?? 0;
  const result = applyNetworkAction(scoped, state.network, {
    type: "NETWORK_COMMIT_RESERVATION",
    reservationId,
  });
  if (result.network.lastError) return null;
  const committedHubView = result.warehouseInventories[pseudoWarehouseId] ?? scoped[pseudoWarehouseId];
  if (import.meta.env.DEV) {
    const afterAmount = (committedHubView as unknown as Record<string, number>)[reservation.itemId] ?? 0;
    if (beforeAmount - afterAmount !== reservation.amount) {
      throw new Error(
        `[workbench] Invariant violated: hub commit ${reservation.id} debited ${beforeAmount - afterAmount} ` +
          `of ${reservation.itemId}, expected ${reservation.amount}.`,
      );
    }
    if (result.network.reservations.some((entry) => entry.id === reservation.id)) {
      throw new Error(
        `[workbench] Invariant violated: reservation ${reservation.id} still present after hub commit.`,
      );
    }
  }
  const nextHubInventory = inventoryViewToHubInventory(hubEntry.inventory, committedHubView);
  return {
    nextState: {
      ...state,
      serviceHubs: {
        ...state.serviceHubs,
        [hubId]: {
          ...hubEntry,
          inventory: nextHubInventory,
        },
      },
      network: result.network,
    },
    itemType: reservation.itemId,
    amount: reservation.amount,
    sourceKind: "hub",
    sourceId: hubId,
  };
}
