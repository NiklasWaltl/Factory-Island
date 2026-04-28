// ============================================================
// Keep-in-stock refill workflow (Planning layer)
// ------------------------------------------------------------
// Pure orchestration extracted from reducer.ts. Authoritative
// producer of automation crafting jobs for keep-stock targets.
//
// Per-target gate decisions live in `crafting/keepStockDecision.ts`
// (single source of truth shared with the UI transparency layer).
// This module is responsible for the *planning side effects* once a
// decision says "enqueue":
//   - invoke the planner for the target,
//   - enqueue resulting steps onto the queue,
//   - re-check the cap / per-item dedup against the *progressively
//     updated* queue snapshot inside the inner step loop (this
//     incremental re-check intentionally cannot live in the gate
//     evaluator, since the evaluator is per-target).
//
// Architecture rule (see tickPhases.ts):
//   ONLY the planning layer is allowed to enqueue automation jobs.
//   Execution (tickCraftingJobs, conveyors, drones) must NEVER
//   create new demand.
// ============================================================

import { debugLog } from "../../debug/debugLogger";
import {
  countOpenAutomationCraftingJobs,
  hasActiveAutomationRefillForItem,
} from "../queue/jobStatus";
import {
  checkRecipeAutomationPolicy,
} from "../policies/policies";
import {
  evaluateKeepStockTarget,
  listConfiguredKeepStockTargets,
  type KeepStockEvaluationDeps,
} from "../policies/keepStockDecision";
import { buildWorkbenchAutoCraftPlan } from "../planner/planner";
import { enqueueJob as craftingEnqueueJob } from "../queue/queue";
import { getWorkbenchRecipe } from "../../simulation/recipes";
import type {
  GameState,
} from "../../store/types";

export type KeepStockWorkflowDeps = KeepStockEvaluationDeps;

/**
 * Pure 1:1 extraction of the previous reducer-internal
 * `enqueueKeepStockRefills`. Returns a new state with any keep-stock
 * automation jobs enqueued, or the same state instance when there is
 * nothing to do.
 */
export function applyKeepStockRefills(
  state: GameState,
  deps: KeepStockWorkflowDeps,
): GameState {
  const configuredTargets = listConfiguredKeepStockTargets(state);
  if (configuredTargets.length === 0) return state;

  const recipePolicies = state.recipeAutomationPolicies ?? {};
  let nextState = state;

  for (const cfg of configuredTargets) {
    const decision = evaluateKeepStockTarget(
      nextState,
      cfg,
      deps,
      nextState.crafting.jobs,
    );

    if (decision.kind === "skip") {
      if (import.meta.env.DEV) {
        switch (decision.code) {
          case "policyBlocked":
            debugLog.general(
              `[KeepStock] Skip keep-in-stock for ${cfg.recipeId}: ${decision.rawReason}`,
            );
            break;
          case "higherPriorityBlockers":
            debugLog.general(
              `[KeepStock] Skip keep-in-stock for ${cfg.recipeId}: higher-priority jobs pending`,
            );
            break;
          case "capReached":
            debugLog.general(
              `[KeepStock] Skip keep-in-stock: global refill cap reached`,
            );
            break;
          case "recipeMissing":
            debugLog.general(
              `[KeepStock] Skip unsupported recipe ${cfg.recipeId} (workbench ${cfg.workbenchId}).`,
            );
            break;
          case "noPhysicalSource":
            debugLog.general(
              `[KeepStock] Skip ${cfg.recipeId} on ${cfg.workbenchId}: no physical source.`,
            );
            break;
          case "refillActive":
            debugLog.general(
              `[KeepStock] Skip keep-in-stock for ${cfg.recipeId}: stock refill already active`,
            );
            break;
          // "disabled" / "workbenchMissing" / "underConstruction"
          // intentionally produce no DEV log line (1:1 with previous
          // reducer-internal behaviour).
        }
      }
      continue;
    }

    if (decision.kind === "satisfied") continue;

    // decision.kind === "enqueue"
    const { ctx, craftsNeeded } = decision;
    const { recipe: _recipe, inventorySource } = ctx;
    void _recipe;

    const plan = buildWorkbenchAutoCraftPlan({
      recipeId: cfg.recipeId,
      amount: craftsNeeded,
      producerAssetId: cfg.workbenchId,
      source: inventorySource,
      warehouseInventories: nextState.warehouseInventories,
      serviceHubs: nextState.serviceHubs,
      network: nextState.network,
      assets: nextState.assets,
      existingJobs: nextState.crafting.jobs,
      canUseRecipe: (recipeId) =>
        checkRecipeAutomationPolicy(recipePolicies, recipeId, "plannerKeepStock"),
    });

    if (!plan.ok) {
      if (import.meta.env.DEV) {
        debugLog.general(
          `[KeepStock] Plan failed for ${cfg.recipeId} on ${cfg.workbenchId}: ${plan.error.message}`,
        );
      }
      continue;
    }

    let queue = nextState.crafting;
    let enqueueFailed = false;
    let enqueuedCount = 0;
    for (const step of plan.steps) {
      for (let i = 0; i < step.count; i++) {
        if (countOpenAutomationCraftingJobs(queue.jobs) >= deps.KEEP_STOCK_OPEN_JOB_CAP) {
          if (import.meta.env.DEV) {
            debugLog.general(
              `[KeepStock] Skip keep-in-stock: global refill cap reached`,
            );
          }
          enqueueFailed = true;
          break;
        }
        const stepRecipe = getWorkbenchRecipe(step.recipeId);
        if (
          stepRecipe &&
          hasActiveAutomationRefillForItem(queue.jobs, stepRecipe.outputItem)
        ) {
          if (import.meta.env.DEV) {
            debugLog.general(
              `[KeepStock] Skip keep-in-stock for ${step.recipeId}: stock refill already active`,
            );
          }
          enqueueFailed = true;
          break;
        }
        const enqueueResult = craftingEnqueueJob(queue, {
          recipeId: step.recipeId,
          workbenchId: cfg.workbenchId,
          source: "automation",
          priority: "normal",
          inventorySource,
          assets: nextState.assets,
        });
        queue = enqueueResult.queue;
        if (!enqueueResult.ok) {
          if (import.meta.env.DEV) {
            debugLog.general(
              `[KeepStock] Enqueue failed for ${step.recipeId} on ${cfg.workbenchId}: ${enqueueResult.error.message}`,
            );
          }
          enqueueFailed = true;
          break;
        }
        enqueuedCount += 1;
      }
      if (enqueueFailed) break;
    }

    if (queue === nextState.crafting) continue;

    if (import.meta.env.DEV) {
      debugLog.general(
        `[KeepStock] Enqueue keep-in-stock for ${cfg.recipeId} amount ${enqueuedCount}`,
      );
    }

    nextState = {
      ...nextState,
      crafting: queue,
    };
  }

  return nextState;
}
