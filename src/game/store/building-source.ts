import type { CraftingSource } from "./reducer";
import type { GameState } from "./types";
import { resolveCraftingSource } from "../crafting/crafting-sources";
import { getZoneWarehouseIds } from "../zones/production-zone-aggregation";

export function resolveBuildingSource(state: GameState, buildingId: string | null): CraftingSource {
  if (!buildingId) return { kind: "global" };
  const zoneId = state.buildingZoneIds[buildingId];
  if (zoneId && state.productionZones[zoneId]) {
    const whIds = getZoneWarehouseIds(state, zoneId);
    if (whIds.length > 0) {
      return { kind: "zone", zoneId };
    }
  }
  const whId = state.buildingSourceWarehouseIds[buildingId] ?? null;
  return resolveCraftingSource(state, whId);
}
