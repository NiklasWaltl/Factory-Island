import { debugLog } from "../../../../debug/debugLogger";
import { enqueueJob as craftingEnqueueJob } from "../../../../crafting/queue";
import { buildWorkbenchAutoCraftPlan } from "../../../../crafting/planner";
import { checkRecipeAutomationPolicy } from "../../../../crafting/policies";
import { getAssetOfType } from "../../../utils/asset-guards";
import { withErrorNotification } from "../../../utils/notification-utils";
import type { GameAction } from "../../../reducer";
import type { GameState } from "../../../types";
import type { CraftingQueueActionDeps } from "../deps";

type CraftRequestAction = Extract<
  GameAction,
  {
    type: "CRAFT_REQUEST_WITH_PREREQUISITES";
  }
>;

export interface CraftRequestContext {
  state: GameState;
  action: CraftRequestAction;
  deps: CraftingQueueActionDeps;
}

export function runCraftRequestPhase(
  ctx: CraftRequestContext,
): GameState {
  const { state, action, deps } = ctx;

  const workbenchAsset = getAssetOfType(state, action.workbenchId, "workbench");
  if (!workbenchAsset) {
    return withErrorNotification(
      state,
      deps.addErrorNotification,
      `Werkbank "${action.workbenchId}" existiert nicht.`,
    );
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

  const recipePolicies = deps.getRecipeAutomationPolicies(state);
  const autoCraftDecision = checkRecipeAutomationPolicy(
    recipePolicies,
    action.recipeId,
    "craftRequest",
  );
  if (!autoCraftDecision.allowed) {
    return withErrorNotification(state, deps.addErrorNotification, autoCraftDecision.reason!);
  }

  const resolvedSource = deps.resolveBuildingSource(state, action.workbenchId);
  if (resolvedSource.kind === "global") {
    return withErrorNotification(
      state,
      deps.addErrorNotification,
      "Werkbank braucht ein physisches Lager als Quelle.",
    );
  }

  const inventorySource = deps.toCraftingJobInventorySource(state, resolvedSource);
  if (inventorySource.kind === "global") {
    return withErrorNotification(
      state,
      deps.addErrorNotification,
      "Workbench braucht eine physische Quelle (Lagerhaus/Zone) für Auto-Craft.",
    );
  }

  const plan = buildWorkbenchAutoCraftPlan({
    recipeId: action.recipeId,
    amount: action.amount ?? 1,
    producerAssetId: action.workbenchId,
    source: inventorySource,
    warehouseInventories: state.warehouseInventories,
    serviceHubs: state.serviceHubs,
    network: state.network,
    assets: state.assets,
    existingJobs: state.crafting.jobs,
    canUseRecipe: (recipeId) =>
      checkRecipeAutomationPolicy(recipePolicies, recipeId, "plannerAutoCraft"),
  });

  if (!plan.ok) {
    if (import.meta.env.DEV) {
      debugLog.general(
        `Auto-craft planning failed for ${action.recipeId}: ${plan.error.message}`,
      );
    }
    return withErrorNotification(state, deps.addErrorNotification, plan.error.message);
  }

  let nextQueue = state.crafting;
  const plannedTotalCount = plan.steps.reduce((sum, step) => sum + step.count, 0);
  let divergenceNotice: string | null = null;
  if (
    typeof action.expectedStepCount === "number" &&
    action.expectedStepCount !== plannedTotalCount
  ) {
    divergenceNotice = `Hinweis: Auto-Craft-Plan an aktuellen Bestand angepasst (${action.expectedStepCount} → ${plannedTotalCount} Schritte).`;
  }
  for (const step of plan.steps) {
    for (let i = 0; i < step.count; i++) {
      const enqueueResult = craftingEnqueueJob(nextQueue, {
        recipeId: step.recipeId,
        workbenchId: action.workbenchId,
        source: action.source,
        priority: action.priority,
        inventorySource,
        assets: state.assets,
      });
      if (!enqueueResult.ok) {
        return withErrorNotification(
          {
            ...state,
            crafting: enqueueResult.queue,
          },
          deps.addErrorNotification,
          enqueueResult.error.message,
        );
      }
      nextQueue = enqueueResult.queue;
    }
  }

  if (import.meta.env.DEV) {
    debugLog.general(
      `Auto-craft plan enqueued for ${action.recipeId}: ${plan.steps
        .map((step) => `${step.count}x ${step.recipeId}`)
        .join(", ")}`,
    );
  }

  if (nextQueue === state.crafting) return state;
  return {
    ...state,
    crafting: nextQueue,
    notifications: divergenceNotice
      ? deps.addErrorNotification(state.notifications, divergenceNotice)
      : state.notifications,
  };
}
