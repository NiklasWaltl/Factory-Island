// ============================================================
// Crafting / Queue action handler
// ------------------------------------------------------------
// Centralizes all action cases that mutate the crafting queue or
// closely-related slices (network reservations, keep-in-stock
// targets, recipe automation policies). Extracted from
// reducer.ts so the reducer's switch only delegates these cases.
//
// Behaviour is intentionally byte-equivalent to the prior inline
// case bodies — no new abstractions, no logic changes.
// ============================================================

import { debugLog } from "../../debug/debugLogger";
import { applyNetworkAction } from "../../inventory/reservations";
import {
  cancelJob as craftingCancelJob,
  enqueueJob as craftingEnqueueJob,
  moveJob as craftingMoveJob,
  setJobPriority as craftingSetJobPriority,
} from "../../crafting/queue";
import { buildWorkbenchAutoCraftPlan } from "../../crafting/planner";
import {
  applyPlanningTriggers,
  applyExecutionTick,
  type ExecutionTickDeps,
  type PlanningTriggerDeps,
} from "../../crafting/tickPhases";
import {
  applyRecipeAutomationPolicyPatch,
  areRecipeAutomationPolicyEntriesEqual,
  checkRecipeAutomationPolicy,
  isRecipeAutomationPolicyEntryDefault,
} from "../../crafting/policies";
import { releaseJobReservations } from "../../crafting/tick";
import { getAssetOfType } from "../utils/asset-guards";
import { withErrorNotification } from "../utils/notification-utils";
import type {
  GameNotification,
  GameState,
  Inventory,
  KeepStockByWorkbench,
  KeepStockTargetEntry,
  RecipeAutomationPolicyMap,
} from "../types";
import type { CraftingInventorySource } from "../../crafting/types";
import type { GameAction, CraftingSource } from "../reducer";

/**
 * Reducer-internal helpers/constants the crafting/queue handler needs
 * but which still live inside reducer.ts (or its module-scope
 * configuration). Passed as deps to keep this module free of
 * circular value imports from reducer.ts.
 */
export interface CraftingQueueActionDeps {
  readonly KEEP_STOCK_MAX_TARGET: number;
  readonly planningTriggerDeps: PlanningTriggerDeps;
  readonly executionTickDeps: ExecutionTickDeps;
  isUnderConstruction(state: GameState, assetId: string): boolean;
  resolveBuildingSource(state: GameState, buildingId: string | null): CraftingSource;
  toCraftingJobInventorySource(
    state: GameState,
    source: CraftingSource,
  ): CraftingInventorySource;
  logCraftingSelectionComparison(
    state: GameState,
    assetType: "workbench",
    selectedId?: string | null,
  ): void;
  addErrorNotification(
    notifications: GameNotification[],
    message: string,
  ): GameNotification[];
  getKeepStockByWorkbench(state: GameState): KeepStockByWorkbench;
  getRecipeAutomationPolicies(state: GameState): RecipeAutomationPolicyMap;
}

/** Action types handled by this module. */
type HandledActionType =
  | "NETWORK_RESERVE_BATCH"
  | "NETWORK_COMMIT_RESERVATION"
  | "NETWORK_COMMIT_BY_OWNER"
  | "NETWORK_CANCEL_RESERVATION"
  | "NETWORK_CANCEL_BY_OWNER"
  | "CRAFT_REQUEST_WITH_PREREQUISITES"
  | "JOB_ENQUEUE"
  | "JOB_CANCEL"
  | "JOB_MOVE"
  | "JOB_SET_PRIORITY"
  | "JOB_TICK"
  | "SET_KEEP_STOCK_TARGET"
  | "SET_RECIPE_AUTOMATION_POLICY";

const HANDLED_ACTION_TYPES = new Set<string>([
  "NETWORK_RESERVE_BATCH",
  "NETWORK_COMMIT_RESERVATION",
  "NETWORK_COMMIT_BY_OWNER",
  "NETWORK_CANCEL_RESERVATION",
  "NETWORK_CANCEL_BY_OWNER",
  "CRAFT_REQUEST_WITH_PREREQUISITES",
  "JOB_ENQUEUE",
  "JOB_CANCEL",
  "JOB_MOVE",
  "JOB_SET_PRIORITY",
  "JOB_TICK",
  "SET_KEEP_STOCK_TARGET",
  "SET_RECIPE_AUTOMATION_POLICY",
]);

export function isCraftingQueueAction(
  action: GameAction,
): action is Extract<GameAction, { type: HandledActionType }> {
  return HANDLED_ACTION_TYPES.has(action.type);
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

/**
 * Handles all crafting/queue cluster actions. Returns the next state
 * if the action belongs to this cluster, or `null` to signal the
 * reducer should fall through to its remaining switch cases.
 */
export function handleCraftingQueueAction(
  state: GameState,
  action: GameAction,
  deps: CraftingQueueActionDeps,
): GameState | null {
  switch (action.type) {
    // -----------------------------------------------------------------
    // Inventory-network reservations (Step 2)
    // -----------------------------------------------------------------
    case "NETWORK_RESERVE_BATCH":
    case "NETWORK_COMMIT_RESERVATION":
    case "NETWORK_COMMIT_BY_OWNER":
    case "NETWORK_CANCEL_RESERVATION":
    case "NETWORK_CANCEL_BY_OWNER": {
      const result = applyNetworkAction(
        state.warehouseInventories,
        state.network,
        action,
      );
      if (
        result.warehouseInventories === state.warehouseInventories &&
        result.network === state.network
      ) {
        return state;
      }
      return {
        ...state,
        warehouseInventories: result.warehouseInventories as Record<string, Inventory>,
        network: result.network,
      };
    }

    // -----------------------------------------------------------------
    // Crafting jobs (Step 3)
    // -----------------------------------------------------------------
    case "CRAFT_REQUEST_WITH_PREREQUISITES": {
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

    case "JOB_ENQUEUE": {
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

    case "JOB_CANCEL": {
      const r = craftingCancelJob(state.crafting, action.jobId);
      if (!r.ok) {
        return { ...state, crafting: r.queue };
      }
      // If the cancelled job held reservations, release them. We use the
      // pre-cancellation status because `releaseJobReservations` keys off
      // the status to decide whether reservations could exist.
      const jobBefore = { ...r.job, status: r.previousStatus };
      const nextNetwork = releaseJobReservations(state.network, jobBefore);
      return { ...state, crafting: r.queue, network: nextNetwork };
    }

    case "JOB_MOVE": {
      const r = craftingMoveJob(state.crafting, action.jobId, action.direction);
      if (r.queue === state.crafting) return state;
      return { ...state, crafting: r.queue };
    }

    case "JOB_SET_PRIORITY": {
      const r = craftingSetJobPriority(state.crafting, action.jobId, action.priority);
      if (r.queue === state.crafting) return state;
      return { ...state, crafting: r.queue };
    }

    case "JOB_TICK": {
      // Architecture rule: JOB_TICK is split into two clearly named
      // phases (see crafting/tickPhases.ts).
      //   1. Planning — ONLY layer allowed to enqueue automation jobs
      //      (currently keep-in-stock refills).
      //   2. Execution — progresses existing jobs; never enqueues new
      //      demand.
      const planned = applyPlanningTriggers(state, deps.planningTriggerDeps);
      return applyExecutionTick(planned, deps.executionTickDeps);
    }

    case "SET_KEEP_STOCK_TARGET": {
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

    case "SET_RECIPE_AUTOMATION_POLICY": {
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

    default:
      return null;
  }
}
