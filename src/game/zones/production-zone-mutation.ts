import { WAREHOUSE_CAPACITY } from "../store/constants/buildings";
import type {
  GameState,
  Inventory,
} from "../store/types";
import {
  getZoneAggregateInventory,
  getZoneWarehouseIds,
} from "./production-zone-aggregation";

/**
 * Distributes the delta between the current zone aggregate and `newAgg`
 * across the zone's warehouses. Consumption is deducted from warehouses
 * in sorted-ID order; production is added in sorted-ID order respecting
 * per-warehouse capacity (overflow goes to the first warehouse).
 */
export function applyZoneDelta(
  state: GameState,
  zoneId: string,
  newAgg: Inventory,
): Partial<GameState> {
  const whIds = getZoneWarehouseIds(state, zoneId);
  if (whIds.length === 0) return {};

  const oldAgg = getZoneAggregateInventory(state, zoneId);

  // Shallow-copy the outer map, then deep-copy each zone warehouse inventory
  const newWhInvs = { ...state.warehouseInventories };
  for (const whId of whIds) {
    newWhInvs[whId] = { ...newWhInvs[whId] };
  }

  const invKeys = Object.keys(oldAgg) as (keyof Inventory)[];
  for (const key of invKeys) {
    const oldVal = oldAgg[key] as number;
    const newVal = newAgg[key] as number;
    const diff = newVal - oldVal;
    if (diff === 0) continue;

    if (diff < 0) {
      // Consumption: deduct from warehouses in sorted order
      let remaining = -diff;
      for (const whId of whIds) {
        if (remaining <= 0) break;
        const inv = newWhInvs[whId] as unknown as Record<string, number>;
        const current = inv[key as string] ?? 0;
        const take = Math.min(current, remaining);
        if (take > 0) {
          inv[key as string] = current - take;
          remaining -= take;
        }
      }
    } else {
      // Production: add to warehouses in sorted order, respecting capacity
      let remaining = diff;
      const cap = state.mode === "debug" ? Infinity : WAREHOUSE_CAPACITY;
      for (const whId of whIds) {
        if (remaining <= 0) break;
        const inv = newWhInvs[whId] as unknown as Record<string, number>;
        const current = inv[key as string] ?? 0;
        const space = Math.max(0, cap - current);
        const add = Math.min(space, remaining);
        if (add > 0) {
          inv[key as string] = current + add;
          remaining -= add;
        }
      }
      // Overflow: add to first warehouse (matches single-warehouse behavior)
      if (remaining > 0 && whIds.length > 0) {
        const inv = newWhInvs[whIds[0]] as unknown as Record<string, number>;
        inv[key as string] = (inv[key as string] ?? 0) + remaining;
      }
    }
  }

  return { warehouseInventories: newWhInvs };
}