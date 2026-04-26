// ============================================================
// Factory Island - InventoryNetwork Read-View (Step 1)
// ------------------------------------------------------------
// Pure aggregation over the existing per-warehouse inventories.
// No mutations, no reservations, no commits. Crafting and UI
// can switch their reads to this view without changing storage
// semantics.
// ============================================================

import type { Inventory } from "../store/types";
import {
  ALL_ITEM_IDS,
  getItemsByCategory,
  isKnownItemId,
} from "../items/registry";
import type {
  ItemCategory,
  ItemDef,
  ItemId,
  NetworkStockView,
  WarehouseId,
} from "../items/types";

/**
 * Minimal structural slice of GameState this view depends on.
 * Using a structural type keeps the read-view loosely coupled
 * and trivially testable without constructing a full GameState.
 */
export interface NetworkStateSlice {
  readonly warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
}

/**
 * Aggregate per-warehouse inventories into a single network view.
 *
 * Rules:
 * - Only items defined in `ITEM_REGISTRY` are considered.
 * - The global fallback pool `state.inventory` is intentionally
 *   NOT included — it is not a warehouse and may later be merged
 *   in via a separate call.
 * - Items with a total of 0 are omitted from `totals`.
 */
export function getNetworkStock(state: NetworkStateSlice): NetworkStockView {
  const totals: Partial<Record<ItemId, number>> = {};
  const inventories = state.warehouseInventories;

  for (const whId in inventories) {
    if (!Object.prototype.hasOwnProperty.call(inventories, whId)) continue;
    const inv = inventories[whId];
    if (!inv) continue;

    for (const id of ALL_ITEM_IDS) {
      // `Inventory` is keyed by the same strings as ItemId (minus `coins`),
      // so this lookup is safe for every registered item.
      const raw = (inv as unknown as Record<string, number>)[id];
      if (typeof raw !== "number" || raw <= 0) continue;
      totals[id] = (totals[id] ?? 0) + raw;
    }
  }

  return { totals };
}

/** Total amount of a single item across the whole network. */
export function getNetworkAmount(
  state: NetworkStateSlice,
  itemId: ItemId,
): number {
  if (!isKnownItemId(itemId)) return 0;
  const inventories = state.warehouseInventories;
  let sum = 0;
  for (const whId in inventories) {
    if (!Object.prototype.hasOwnProperty.call(inventories, whId)) continue;
    const inv = inventories[whId];
    if (!inv) continue;
    const raw = (inv as unknown as Record<string, number>)[itemId];
    if (typeof raw === "number" && raw > 0) sum += raw;
  }
  return sum;
}

/**
 * All items of a given category that currently exist in the network,
 * paired with their total counts. Items with count 0 are omitted.
 */
export function getNetworkItemsByCategory(
  state: NetworkStateSlice,
  category: ItemCategory,
): ReadonlyArray<{ def: ItemDef; count: number }> {
  const view = getNetworkStock(state);
  const defs = getItemsByCategory(category);
  const out: { def: ItemDef; count: number }[] = [];
  for (const def of defs) {
    const count = view.totals[def.id] ?? 0;
    if (count > 0) out.push({ def, count });
  }
  return out;
}
