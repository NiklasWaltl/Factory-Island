import { placeAsset, removeAsset } from "../../../asset-mutation";
import type { GameState } from "../../../types";
import type { GrowSaplingsAction } from "../types";

export interface GrowSaplingsContext {
  state: GameState;
  action: GrowSaplingsAction;
}

export function runGrowSaplingsPhase(ctx: GrowSaplingsContext): GameState {
  const { state, action } = ctx;
  let { assets, cellMap, saplingGrowAt } = state;
  let changed = false;
  for (const assetId of action.assetIds) {
    const asset = assets[assetId];
    if (!asset || asset.type !== "sapling") continue;
    const removed = removeAsset({ ...state, assets, cellMap, saplingGrowAt }, assetId);
    const placed = placeAsset(removed.assets, removed.cellMap, "tree", asset.x, asset.y, 1);
    if (placed) {
      assets = placed.assets;
      cellMap = placed.cellMap;
    } else {
      assets = removed.assets;
      cellMap = removed.cellMap;
    }
    saplingGrowAt = removed.saplingGrowAt;
    changed = true;
  }
  if (!changed) return state;
  return { ...state, assets, cellMap, saplingGrowAt };
}
