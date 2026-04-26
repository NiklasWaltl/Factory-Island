import { DRONE_NEARBY_WAREHOUSE_LIMIT } from "./candidates/scoring/scoring-constants";
import {
  getInboundHubBuildingSupplyAmount,
  getInboundHubDispatchAmount,
  getInboundWarehouseDispatchAmount,
} from "./selection/helpers/need-slot-resolvers";
import { isUnderConstruction } from "../store/asset-status";
import type { CollectableItemType, GameState } from "../store/types";

export function getAvailableHubDispatchSupply(
  state: Pick<GameState, "drones" | "serviceHubs">,
  hubId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  const hubEntry = state.serviceHubs[hubId];
  if (!hubEntry) return 0;
  const current = hubEntry.inventory[itemType] ?? 0;
  const inbound = getInboundHubDispatchAmount(state, hubId, itemType, excludeDroneId);
  // Building_supply trips that pull from the same hub also reduce what's left for hub_dispatch.
  const inboundBuildingFromHub = getInboundHubBuildingSupplyAmount(state, hubId, itemType, excludeDroneId);
  return Math.max(0, current - inbound - inboundBuildingFromHub);
}

export function getAvailableWarehouseDispatchSupply(
  state: Pick<GameState, "drones" | "warehouseInventories">,
  warehouseId: string,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): number {
  const inv = state.warehouseInventories[warehouseId];
  if (!inv) return 0;
  const current = (inv as unknown as Record<string, number>)[itemType] ?? 0;
  if (current <= 0) return 0;
  const inbound = getInboundWarehouseDispatchAmount(state, warehouseId, itemType, excludeDroneId);
  return Math.max(0, current - inbound);
}

interface NearbyWarehouseDispatchCandidate {
  readonly warehouseId: string;
  readonly x: number;
  readonly y: number;
  readonly available: number;
  readonly distance: number;
}

/** Returns the closest (Chebyshev) warehouses with any free dispatch supply
 *  for `itemType`, sorted ascending by distance, capped to DRONE_NEARBY_WAREHOUSE_LIMIT.
 *  Skips warehouses that are still under construction. */
export function getNearbyWarehousesForDispatch(
  state: GameState,
  fromX: number,
  fromY: number,
  itemType: CollectableItemType,
  excludeDroneId?: string,
): NearbyWarehouseDispatchCandidate[] {
  const out: NearbyWarehouseDispatchCandidate[] = [];
  for (const whId in state.warehouseInventories) {
    const whAsset = state.assets[whId];
    if (!whAsset || whAsset.type !== "warehouse") continue;
    if (isUnderConstruction(state, whId)) continue;
    const available = getAvailableWarehouseDispatchSupply(state, whId, itemType, excludeDroneId);
    if (available <= 0) continue;
    const distance = Math.max(Math.abs(fromX - whAsset.x), Math.abs(fromY - whAsset.y));
    out.push({ warehouseId: whId, x: whAsset.x, y: whAsset.y, available, distance });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out.slice(0, DRONE_NEARBY_WAREHOUSE_LIMIT);
}
