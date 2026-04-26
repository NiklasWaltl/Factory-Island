import {
  applyRecipeAutomationPolicyPatch,
  areRecipeAutomationPolicyEntriesEqual,
  isRecipeAutomationPolicyEntryDefault,
} from "../../../../crafting/policies";
import type { GameAction } from "../../../reducer";
import type { GameState } from "../../../types";
import type { CraftingQueueActionDeps } from "../deps";

type RecipePolicyAction = Extract<
  GameAction,
  {
    type: "SET_RECIPE_AUTOMATION_POLICY";
  }
>;

export interface RecipePolicyContext {
  state: GameState;
  action: RecipePolicyAction;
  deps: CraftingQueueActionDeps;
}

export function runRecipePolicyPhase(
  ctx: RecipePolicyContext,
): GameState {
  const { state, action, deps } = ctx;

  const byRecipe = deps.getRecipeAutomationPolicies(state);
  const currentEntry = byRecipe[action.recipeId];
  const nextEntry = applyRecipeAutomationPolicyPatch(currentEntry, action.patch);

  if (areRecipeAutomationPolicyEntriesEqual(currentEntry, nextEntry)) {
    return state;
  }

  if (isRecipeAutomationPolicyEntryDefault(nextEntry)) {
    if (!currentEntry) return state;
    const { [action.recipeId]: _removed, ...remaining } = byRecipe;
    return {
      ...state,
      recipeAutomationPolicies: remaining,
    };
  }

  return {
    ...state,
    recipeAutomationPolicies: {
      ...byRecipe,
      [action.recipeId]: nextEntry,
    },
  };
}
