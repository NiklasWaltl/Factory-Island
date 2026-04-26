// ============================================================
// Keep-in-stock per-target decision (single source of truth)
// ------------------------------------------------------------
// Pure evaluator that decides for a single keep-stock target whether
// the next planning pass should
//   - skip the target (with a typed reason),
//   - mark it as already satisfied, or
//   - request a new automation refill of N crafts.
//
// IMPORTANT: This module is the ONLY authoritative place that
// computes keep-stock decisions. Two callers exist:
//
//   1. crafting/workflows/keepStockWorkflow.ts (Planning layer)
//      Uses the result to drive planner + queue mutation.
//      Authoritative producer of automation jobs.
//
//   2. ui/hud/productionTransparency.ts (UI layer)
//      Maps the result to user-facing rows. Read-only mirror.
//
// Both callers MUST go through `evaluateKeepStockTarget`. Adding
// new branches here keeps the workflow and the HUD in lock-step.
// ============================================================

import type { CraftingInventorySource, CraftingJob } from "../types";
import {
  countOpenAutomationCraftingJobs,
  getGuaranteedPendingOutput,
  hasActiveAutomationRefillForItem,
  hasHigherPriorityKeepStockBlockers,
} from "../queue/jobStatus";
import { checkRecipeAutomationPolicy } from "./policies";
import { getWorkbenchRecipe } from "../../simulation/recipes";
import type { WorkbenchRecipe } from "../../simulation/recipes/WorkbenchRecipes";
import type {
  GameState,
  Inventory,
  KeepStockTargetEntry,
} from "../../store/types";
import type { CraftingSource } from "../../store/types";

export type KeepStockSkipCode =
  | "disabled"
  | "recipeMissing"
  | "policyBlocked"
  | "workbenchMissing"
  | "underConstruction"
  | "noPhysicalSource"
  | "higherPriorityBlockers"
  | "capReached"
  | "refillActive";

export interface KeepStockTargetConfig {
  readonly workbenchId: string;
  readonly recipeId: string;
  readonly target: KeepStockTargetEntry;
}

export interface KeepStockEvaluationDeps {
  readonly KEEP_STOCK_OPEN_JOB_CAP: number;
  readonly KEEP_STOCK_MAX_TARGET: number;
  readonly resolveBuildingSource: (
    state: GameState,
    buildingId: string,
  ) => CraftingSource;
  readonly toCraftingJobInventorySource: (
    state: GameState,
    source: CraftingSource,
  ) => CraftingInventorySource;
  readonly getCraftingSourceInventory: (
    state: GameState,
    source: CraftingSource,
  ) => Inventory;
  readonly isUnderConstruction: (state: GameState, assetId: string) => boolean;
}

/** Resolved sourcing/projection context used by callers downstream of the gate. */
export interface KeepStockTargetContext {
  readonly recipe: WorkbenchRecipe;
  readonly source: CraftingSource;
  readonly inventorySource: CraftingInventorySource;
  readonly availableAmount: number;
  readonly pendingAmount: number;
  readonly projectedAmount: number;
  readonly targetAmount: number;
}

export type KeepStockDecisionResult =
  | {
      readonly kind: "skip";
      readonly code: KeepStockSkipCode;
      readonly rawReason?: string;
      readonly targetAmount: number;
      readonly recipe?: WorkbenchRecipe;
      readonly availableAmount?: number;
      readonly pendingAmount?: number;
    }
  | { readonly kind: "satisfied"; readonly ctx: KeepStockTargetContext }
  | {
      readonly kind: "enqueue";
      readonly ctx: KeepStockTargetContext;
      readonly craftsNeeded: number;
    };

/**
 * Evaluate a single keep-stock target against the supplied state and a
 * (potentially progressively-mutated) jobs snapshot. Pure: never mutates
 * state, never enqueues anything.
 *
 * The order of checks is fixed and matches the previous reducer-internal
 * decision order. Do not reorder — it is observable through the resulting
 * skip code and (in the planning layer) through which targets get capped
 * out first.
 */
export function evaluateKeepStockTarget(
  state: GameState,
  cfg: KeepStockTargetConfig,
  deps: KeepStockEvaluationDeps,
  jobsSnapshot: readonly CraftingJob[] = state.crafting.jobs,
): KeepStockDecisionResult {
  const targetAmount = Math.max(
    0,
    Math.min(deps.KEEP_STOCK_MAX_TARGET, Math.floor(cfg.target.amount ?? 0)),
  );
  const enabled = !!cfg.target.enabled && targetAmount > 0;
  if (!enabled) {
    return { kind: "skip", code: "disabled", targetAmount };
  }

  const policyDecision = checkRecipeAutomationPolicy(
    state.recipeAutomationPolicies,
    cfg.recipeId,
    "keepStockRefill",
  );
  if (!policyDecision.allowed) {
    return {
      kind: "skip",
      code: "policyBlocked",
      rawReason: policyDecision.rawReason,
      targetAmount,
    };
  }

  if (hasHigherPriorityKeepStockBlockers(state)) {
    return {
      kind: "skip",
      code: "higherPriorityBlockers",
      targetAmount,
    };
  }

  const workbench = state.assets[cfg.workbenchId];
  if (!workbench || workbench.type !== "workbench") {
    return { kind: "skip", code: "workbenchMissing", targetAmount };
  }
  if (deps.isUnderConstruction(state, cfg.workbenchId)) {
    return { kind: "skip", code: "underConstruction", targetAmount };
  }

  if (countOpenAutomationCraftingJobs(jobsSnapshot) >= deps.KEEP_STOCK_OPEN_JOB_CAP) {
    return { kind: "skip", code: "capReached", targetAmount };
  }

  const recipe = getWorkbenchRecipe(cfg.recipeId);
  if (!recipe) {
    return { kind: "skip", code: "recipeMissing", targetAmount };
  }

  const source = deps.resolveBuildingSource(state, cfg.workbenchId);
  if (source.kind === "global") {
    return { kind: "skip", code: "noPhysicalSource", targetAmount, recipe };
  }

  const inventorySource = deps.toCraftingJobInventorySource(state, source);
  const sourceInv = deps.getCraftingSourceInventory(
    state,
    source,
  ) as unknown as Record<string, number>;
  const availableAmount = sourceInv[recipe.outputItem] ?? 0;
  const pendingAmount = getGuaranteedPendingOutput(
    jobsSnapshot,
    inventorySource,
    recipe.outputItem,
  );
  const projectedAmount = availableAmount + pendingAmount;

  if (hasActiveAutomationRefillForItem(jobsSnapshot, recipe.outputItem)) {
    return {
      kind: "skip",
      code: "refillActive",
      targetAmount,
      recipe,
      availableAmount,
      pendingAmount,
    };
  }

  const ctx: KeepStockTargetContext = {
    recipe,
    source,
    inventorySource,
    availableAmount,
    pendingAmount,
    projectedAmount,
    targetAmount,
  };

  if (projectedAmount >= targetAmount) {
    return { kind: "satisfied", ctx };
  }

  const missingOutput = targetAmount - projectedAmount;
  const craftsNeeded = Math.ceil(missingOutput / Math.max(1, recipe.outputAmount));
  if (craftsNeeded <= 0) {
    return { kind: "satisfied", ctx };
  }

  return { kind: "enqueue", ctx, craftsNeeded };
}

/**
 * Iterate all configured keep-stock targets in deterministic order
 * (workbenchId, recipeId). Used by both the workflow (planning pass)
 * and the transparency layer (HUD rendering) to ensure they walk the
 * same target list.
 */
export function listConfiguredKeepStockTargets(
  state: Pick<GameState, "keepStockByWorkbench">,
): KeepStockTargetConfig[] {
  const byWorkbench = state.keepStockByWorkbench ?? {};
  const out: KeepStockTargetConfig[] = [];
  for (const [workbenchId, recipes] of Object.entries(byWorkbench)) {
    for (const [recipeId, target] of Object.entries(recipes ?? {})) {
      out.push({ workbenchId, recipeId, target });
    }
  }
  out.sort((a, b) => {
    if (a.workbenchId === b.workbenchId) return a.recipeId.localeCompare(b.recipeId);
    return a.workbenchId.localeCompare(b.workbenchId);
  });
  return out;
}
