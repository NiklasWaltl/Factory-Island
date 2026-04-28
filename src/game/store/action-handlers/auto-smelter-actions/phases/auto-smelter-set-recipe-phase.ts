import { isUnderConstruction } from "../../../asset-status";
import type { GameState } from "../../../types";
import type { AutoSmelterAction } from "../types";

export interface AutoSmelterSetRecipeContext {
  state: GameState;
  action: AutoSmelterAction;
}

export function runAutoSmelterSetRecipePhase(
  ctx: AutoSmelterSetRecipeContext,
): GameState {
  const { state, action } = ctx;
  const { assetId, recipe } = action;
  if (isUnderConstruction(state, assetId)) return state;
  const smelter = state.autoSmelters[assetId];
  if (!smelter) return state;
  return {
    ...state,
    autoSmelters: {
      ...state.autoSmelters,
      [assetId]: { ...smelter, selectedRecipe: recipe },
    },
  };
}
