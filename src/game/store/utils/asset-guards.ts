import type { AssetType, GameState, PlacedAsset } from "../types";

export function hasAsset(
  state: Pick<GameState, "assets">,
  assetId: string | null | undefined,
): boolean {
  return !!assetId && !!state.assets[assetId];
}

export function getAssetOfType<T extends AssetType>(
  state: Pick<GameState, "assets">,
  assetId: string | null | undefined,
  expectedType: T,
): PlacedAsset | null {
  if (!assetId) return null;
  const asset = state.assets[assetId];
  if (!asset || asset.type !== expectedType) return null;
  return asset;
}

export function hasWarehouseAssetWithInventory(
  state: Pick<GameState, "assets" | "warehouseInventories">,
  warehouseId: string | null | undefined,
): boolean {
  const warehouse = getAssetOfType(state, warehouseId, "warehouse");
  return !!warehouse && !!warehouseId && !!state.warehouseInventories[warehouseId];
}

export function isBuildingSourceStateConsistent(
  state: Pick<GameState, "assets" | "warehouseInventories" | "buildingSourceWarehouseIds">,
): boolean {
  for (const [buildingId, warehouseId] of Object.entries(state.buildingSourceWarehouseIds)) {
    if (!state.assets[buildingId]) return false;
    if (!hasWarehouseAssetWithInventory(state, warehouseId)) return false;
  }
  return true;
}

export function isBuildingZoneStateConsistent(
  state: Pick<GameState, "assets" | "productionZones" | "buildingZoneIds">,
): boolean {
  for (const [buildingId, zoneId] of Object.entries(state.buildingZoneIds)) {
    if (!state.assets[buildingId]) return false;
    if (!state.productionZones[zoneId]) return false;
  }
  return true;
}

export function isConstructionSiteStateConsistent(
  state: Pick<GameState, "assets" | "constructionSites">,
): boolean {
  for (const siteId of Object.keys(state.constructionSites)) {
    if (!state.assets[siteId]) return false;
  }
  return true;
}
