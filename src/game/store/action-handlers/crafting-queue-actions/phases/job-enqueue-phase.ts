import { debugLog } from "../../../../debug/debugLogger";
import { enqueueJob as craftingEnqueueJob } from "../../../../crafting/queue";
import { checkRecipeAutomationPolicy } from "../../../../crafting/policies";
import { getAssetOfType } from "../../../utils/asset-guards";
import { withErrorNotification } from "../../../utils/notification-utils";
import type { GameAction } from "../../../actions";
import type { GameState } from "../../../types";
import type { CraftingQueueActionDeps } from "../deps";

type JobEnqueueAction = Extract<
  GameAction,
  {
    type: "JOB_ENQUEUE";
  }
>;

export interface JobEnqueueContext {
  state: GameState;
  action: JobEnqueueAction;
  deps: CraftingQueueActionDeps;
}

export function runJobEnqueuePhase(
  ctx: JobEnqueueContext,
): GameState {
  const { state, action, deps } = ctx;

  const workbenchAsset = getAssetOfType(state, action.workbenchId, "workbench");
  if (!workbenchAsset) {
    const failed = craftingEnqueueJob(state.crafting, {
      recipeId: action.recipeId,
      workbenchId: action.workbenchId,
      source: action.source,
      priority: action.priority,
      inventorySource: { kind: "global" },
      assets: state.assets,
    });
    return failed.ok
      ? state
      : {
          ...state,
          crafting: failed.queue,
          notifications: deps.addErrorNotification(state.notifications, failed.error.message),
        };
  }
  deps.logCraftingSelectionComparison(state, "workbench", action.workbenchId);
  if (deps.isUnderConstruction(state, workbenchAsset.id)) {
    debugLog.general(`Crafting workbench [${workbenchAsset.id}] - under construction`);
    return withErrorNotification(
      state,
      deps.addErrorNotification,
      `Werkbank [${workbenchAsset.id}] ist noch im Bau.`,
    );
  }

  if (action.source === "automation") {
    const decision = checkRecipeAutomationPolicy(
      deps.getRecipeAutomationPolicies(state),
      action.recipeId,
      "jobEnqueueAutomation",
    );
    if (!decision.allowed) {
      if (import.meta.env.DEV) {
        debugLog.general(
          `Enqueue rejected by policy: ${decision.rawReason} (recipe ${action.recipeId}, workbench ${action.workbenchId})`,
        );
      }
      return withErrorNotification(state, deps.addErrorNotification, decision.reason!);
    }
  }

  const resolvedSource = deps.resolveBuildingSource(state, action.workbenchId);
  if (resolvedSource.kind === "global") {
    if (import.meta.env.DEV) {
      debugLog.general(
        `Enqueue rejected because: workbench ${action.workbenchId} has no physical source (recipe ${action.recipeId})`,
      );
    }
    return withErrorNotification(
      state,
      deps.addErrorNotification,
      "Werkbank braucht ein physisches Lager als Quelle.",
    );
  }
  const r = craftingEnqueueJob(state.crafting, {
    recipeId: action.recipeId,
    workbenchId: action.workbenchId,
    source: action.source,
    priority: action.priority,
    inventorySource: deps.toCraftingJobInventorySource(state, resolvedSource),
    assets: state.assets,
  });
  if (!r.ok) {
    if (import.meta.env.DEV) {
      debugLog.general(
        `Enqueue rejected because: ${r.error.message} (recipe ${action.recipeId}, workbench ${action.workbenchId})`,
      );
    }
    return withErrorNotification(
      {
        ...state,
        crafting: r.queue,
      },
      deps.addErrorNotification,
      r.error.message,
    );
  }
  if (import.meta.env.DEV) {
    debugLog.general(`Craft availability check for recipe ${action.recipeId}`);
  }
  debugLog.general(`Job ${r.job.id} created for workbench ${action.workbenchId}`);
  return { ...state, crafting: r.queue };
}
