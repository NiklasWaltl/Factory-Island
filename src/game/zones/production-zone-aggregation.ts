import type {
  GameState,
  Inventory,
} from "../store/types";

function createEmptyInventoryLike(state: Pick<GameState, "inventory">): Inventory {
  const empty = {} as Inventory;
  for (const key of Object.keys(state.inventory) as (keyof Inventory)[]) {
    empty[key] = 0;
  }
  return empty;
}

/**
 * Returns sorted warehouse IDs that belong to the given zone.
 * Only includes warehouses that still exist in assets and warehouseInventories.
 */
export function getZoneWarehouseIds(state: GameState, zoneId: string): string[] {
  const result: string[] = [];
  for (const [bid, zid] of Object.entries(state.buildingZoneIds)) {
    if (zid !== zoneId) continue;
    if (state.assets[bid]?.type === "warehouse" && state.warehouseInventories[bid]) {
      result.push(bid);
    }
  }
  return result.sort();
}

/**
 * Returns the aggregated inventory across all warehouses in a zone.
 * If the zone has no warehouses, returns an empty inventory.
 */
export function getZoneAggregateInventory(state: GameState, zoneId: string): Inventory {
  const whIds = getZoneWarehouseIds(state, zoneId);
  const agg = createEmptyInventoryLike(state);
  for (const whId of whIds) {
    const whInv = state.warehouseInventories[whId];
    if (!whInv) continue;
    for (const key of Object.keys(agg) as (keyof Inventory)[]) {
      agg[key] = (agg[key] ?? 0) + (whInv[key] ?? 0);
    }
  }
  return agg;
}