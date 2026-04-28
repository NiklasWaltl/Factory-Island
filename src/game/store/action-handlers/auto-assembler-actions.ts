import { isUnderConstruction } from "../asset-status";
import type { GameAction } from "../actions";
import type { GameState } from "../types";

export function isAutoAssemblerAction(action: GameAction): boolean {
  return action.type === "AUTO_ASSEMBLER_SET_RECIPE";
}

/**
 * Recipe switch only when fully idle (plan V1): empty buffer, not processing,
 * no pending output on the belt queue.
 */
export function handleAutoAssemblerAction(
  state: GameState,
  action: GameAction,
): GameState | null {
  if (action.type !== "AUTO_ASSEMBLER_SET_RECIPE") return null;
  if (isUnderConstruction(state, action.assetId)) return state;

  const entry = state.autoAssemblers[action.assetId];
  if (!entry) return state;

  const canSwitch =
    entry.ironIngotBuffer === 0 &&
    !entry.processing &&
    entry.pendingOutput.length === 0;

  if (!canSwitch) return state;

  if (entry.selectedRecipe === action.recipe) return state;

  return {
    ...state,
    autoAssemblers: {
      ...state.autoAssemblers,
      [action.assetId]: { ...entry, selectedRecipe: action.recipe },
    },
  };
}
