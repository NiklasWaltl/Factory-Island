import { getAssetOfType } from "../../../utils/asset-guards";
import type { GameAction } from "../../../reducer";
import type {
  GameState,
  KeepStockTargetEntry,
} from "../../../types";
import type { CraftingQueueActionDeps } from "../deps";

type KeepStockTargetAction = Extract<
  GameAction,
  {
    type: "SET_KEEP_STOCK_TARGET";
  }
>;

export interface KeepStockTargetContext {
  state: GameState;
  action: KeepStockTargetAction;
  deps: CraftingQueueActionDeps;
}

function isKeepStockStateConsistent(
  state: Pick<GameState, "assets" | "keepStockByWorkbench">,
): boolean {
  for (const workbenchId of Object.keys(state.keepStockByWorkbench ?? {})) {
    if (!getAssetOfType(state, workbenchId, "workbench")) return false;
  }
  return true;
}

function logKeepStockInvariantIfInvalid(
  state: Pick<GameState, "assets" | "keepStockByWorkbench">,
  actionType: string,
): void {
  if (!import.meta.env.DEV) return;
  if (isKeepStockStateConsistent(state)) return;
  console.warn(`[CraftingQueue:${actionType}] keepStockByWorkbench inkonsistent`);
}

export function runKeepStockTargetPhase(
  ctx: KeepStockTargetContext,
): GameState {
  const { state, action, deps } = ctx;

  if (!getAssetOfType(state, action.workbenchId, "workbench")) return state;

  const clampedAmount = Math.max(0, Math.min(deps.KEEP_STOCK_MAX_TARGET, Math.floor(action.amount)));
  const nextTarget: KeepStockTargetEntry = {
    enabled: !!action.enabled && clampedAmount > 0,
    amount: clampedAmount,
  };

  const byWorkbench = deps.getKeepStockByWorkbench(state);
  const recipeTargets = byWorkbench[action.workbenchId] ?? {};
  const currentTarget = recipeTargets[action.recipeId];

  if (
    currentTarget &&
    currentTarget.enabled === nextTarget.enabled &&
    currentTarget.amount === nextTarget.amount
  ) {
    return state;
  }

  // Cleanup path: remove zero+disabled entries to keep persisted config compact.
  if (!nextTarget.enabled && nextTarget.amount === 0) {
    if (!currentTarget) return state;
    const { [action.recipeId]: _removed, ...remainingRecipes } = recipeTargets;
    if (Object.keys(remainingRecipes).length === 0) {
      const { [action.workbenchId]: _removedWorkbench, ...remainingWorkbenches } = byWorkbench;
      const nextState = {
        ...state,
        keepStockByWorkbench: remainingWorkbenches,
      };
      logKeepStockInvariantIfInvalid(nextState, action.type);
      return nextState;
    }
    const nextState = {
      ...state,
      keepStockByWorkbench: {
        ...byWorkbench,
        [action.workbenchId]: remainingRecipes,
      },
    };
    logKeepStockInvariantIfInvalid(nextState, action.type);
    return nextState;
  }

  const nextState = {
    ...state,
    keepStockByWorkbench: {
      ...byWorkbench,
      [action.workbenchId]: {
        ...recipeTargets,
        [action.recipeId]: nextTarget,
      },
    },
  };
  logKeepStockInvariantIfInvalid(nextState, action.type);
  return nextState;
}
