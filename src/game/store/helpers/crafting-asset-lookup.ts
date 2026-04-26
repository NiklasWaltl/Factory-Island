import type { GameState, PlacedAsset } from "../types";

type CraftingBuildingAssetType = "workbench" | "smithy" | "manual_assembler";

export function getCraftingAssetById(
  state: Pick<GameState, "assets">,
  assetId: string | null | undefined,
  assetType: CraftingBuildingAssetType,
): PlacedAsset | null {
  if (!assetId) return null;
  const asset = state.assets[assetId];
  return asset && asset.type === assetType ? asset : null;
}

export function getSelectedCraftingAsset(
  state: Pick<GameState, "assets" | "selectedCraftingBuildingId">,
  assetType: CraftingBuildingAssetType,
): PlacedAsset | null {
  return getCraftingAssetById(state, state.selectedCraftingBuildingId, assetType);
}

export function getActiveSmithyAsset(
  state: Pick<GameState, "assets" | "selectedCraftingBuildingId" | "smithy">,
): PlacedAsset | null {
  return getCraftingAssetById(state, state.smithy.buildingId, "smithy")
    ?? getSelectedCraftingAsset(state, "smithy");
}
