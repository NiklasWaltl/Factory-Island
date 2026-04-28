import { getZoneAggregateInventory } from "../zones/production-zone-aggregation";
import { applyZoneDelta } from "../zones/production-zone-mutation";
import type { GameState, Inventory } from "../store/types";
import type { CraftingSource } from "../store/types";

/** Read the inventory for a resolved crafting source. */
export function getCraftingSourceInventory(state: GameState, source: CraftingSource): Inventory {
  if (source.kind === "global") return state.inventory;
  if (source.kind === "zone") return getZoneAggregateInventory(state, source.zoneId);
  return state.warehouseInventories[source.warehouseId];
}

/**
 * Resolve a crafting resource source from an optional warehouse ID.
 * Returns "global" when null or when the warehouse is invalid/missing.
 */
export function resolveCraftingSource(state: GameState, warehouseId: string | null): CraftingSource {
  if (!warehouseId) return { kind: "global" };
  if (!state.assets[warehouseId] || !state.warehouseInventories[warehouseId]) return { kind: "global" };
  return { kind: "warehouse", warehouseId };
}

/**
 * Apply an inventory mutation to the correct source (global or warehouse).
 * For zones, computes the delta from the current aggregate and distributes
 * consumption/production across the zone's warehouses deterministically.
 * Returns partial state update to spread into the next state.
 */
export function applyCraftingSourceInventory(
  state: GameState,
  source: CraftingSource,
  newInv: Inventory,
): Partial<GameState> {
  if (source.kind === "global") {
    return { inventory: newInv };
  }
  if (source.kind === "zone") {
    return applyZoneDelta(state, source.zoneId, newInv);
  }
  return { warehouseInventories: { ...state.warehouseInventories, [source.warehouseId]: newInv } };
}
