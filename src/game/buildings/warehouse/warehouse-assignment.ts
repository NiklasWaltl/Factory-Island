import type { GameState } from "../../store/types";

function manhattanDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Returns the ID of the nearest valid warehouse to the given grid position,
 * or `null` when no warehouse exists.
 *
 * Distance metric: Manhattan distance on top-left grid coordinates.
 * Tie-break: lexicographically smaller ID wins (deterministic).
 *
 * @param excludeId  optional warehouse ID to skip (used during deletion)
 */
export function getNearestWarehouseId(
  state: GameState,
  bx: number,
  by: number,
  excludeId?: string,
): string | null {
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const whId of Object.keys(state.warehouseInventories)) {
    if (whId === excludeId) continue;
    const wh = state.assets[whId];
    if (!wh) continue;
    const d = manhattanDist(bx, by, wh.x, wh.y);
    if (d < bestDist || (d === bestDist && bestId !== null && whId < bestId)) {
      bestDist = d;
      bestId = whId;
    }
  }
  return bestId;
}

/**
 * Remove all entries from buildingSourceWarehouseIds whose warehouse ID
 * no longer exists in warehouseInventories. Returns a new object (or the
 * same reference if nothing changed).
 * Used for defensive cleanup on Save/Load (no reassign, just purge).
 */
export function cleanBuildingSourceIds(
  mapping: Record<string, string>,
  validWarehouseIds: Set<string>,
): Record<string, string> {
  let changed = false;
  const result: Record<string, string> = {};
  for (const [buildingId, whId] of Object.entries(mapping)) {
    if (validWarehouseIds.has(whId)) {
      result[buildingId] = whId;
    } else {
      changed = true;
    }
  }
  return changed ? result : mapping;
}

/**
 * Reassign-or-clean: for each mapping entry whose warehouse is no longer
 * valid, reassign to the **nearest** remaining warehouse (by Manhattan
 * distance). If no replacement exists, the entry is removed (→ global).
 * Used at runtime when a warehouse is deleted.
 */
export function reassignBuildingSourceIds(
  mapping: Record<string, string>,
  state: GameState,
  deletedWarehouseId: string,
): Record<string, string> {
  let changed = false;
  const result: Record<string, string> = {};
  for (const [buildingId, whId] of Object.entries(mapping)) {
    if (whId !== deletedWarehouseId) {
      result[buildingId] = whId;
    } else {
      const building = state.assets[buildingId];
      const replacement = building
        ? getNearestWarehouseId(state, building.x, building.y, deletedWarehouseId)
        : null;
      if (replacement) {
        result[buildingId] = replacement;
      }
      // else: entry dropped → global fallback
      changed = true;
    }
  }
  return changed ? result : mapping;
}