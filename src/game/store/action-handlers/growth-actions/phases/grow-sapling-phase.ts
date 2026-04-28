import { placeAsset, removeAsset } from "../../../asset-mutation";
import type { GameState } from "../../../types";
import type { GrowSaplingAction } from "../types";

export interface GrowSaplingContext {
  state: GameState;
  action: GrowSaplingAction;
}

export function runGrowSaplingPhase(ctx: GrowSaplingContext): GameState {
  const { state, action } = ctx;
  const asset = state.assets[action.assetId];
  if (!asset || asset.type !== "sapling") return state;
  const removed = removeAsset(state, action.assetId);
  const placed = placeAsset(removed.assets, removed.cellMap, "tree", asset.x, asset.y, 1);
  if (!placed) return state;
  return {
    ...state,
    assets: placed.assets,
    cellMap: placed.cellMap,
    saplingGrowAt: removed.saplingGrowAt,
  };
}
