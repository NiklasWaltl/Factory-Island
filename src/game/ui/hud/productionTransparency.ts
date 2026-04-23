// ============================================================
// Production transparency (UI / read-only mirror)
// ------------------------------------------------------------
// Builds the snapshot consumed by ProductionStatusFeed. Strictly
// read-only: never enqueues jobs, never mutates state, never
// computes its own keep-stock decisions.
//
// Keep-stock rows are derived from `evaluateKeepStockTarget`, the
// same authoritative gate the planning workflow
// (`crafting/workflows/keepStockWorkflow.ts`) uses. This module
// only translates the typed decision codes into user-facing
// strings. If the decision logic needs to change, change it in
// `crafting/keepStockDecision.ts` — both layers will follow.
// ============================================================

import { sortByPriorityFifo } from "../../crafting/queue";
import type { CraftingInventorySource, CraftingJob } from "../../crafting/types";
import {
  isKeepStockTrackedJob,
  isOpenCraftingJob,
} from "../../crafting/jobStatus";
import {
  evaluateKeepStockTarget,
  listConfiguredKeepStockTargets,
  type KeepStockDecisionResult,
  type KeepStockEvaluationDeps,
} from "../../crafting/keepStockDecision";
import { isKnownItemId, getItemDef } from "../../items/registry";
import type { CollectableItemType, CraftingSource, GameState } from "../../store/reducer";
import {
  KEEP_STOCK_MAX_TARGET,
  KEEP_STOCK_OPEN_JOB_CAP,
  RESOURCE_LABELS,
  getCraftingSourceInventory,
  getZoneWarehouseIds,
  isUnderConstruction,
  resolveBuildingSource,
} from "../../store/reducer";
import { getWorkbenchRecipe } from "../../simulation/recipes";
import { computeIngredientLines } from "../panels/workbenchPanelHelpers";

export type TransparencyJobType =
  | "player-craft"
  | "keep-in-stock"
  | "automation-craft"
  | "construction"
  | "upgrade";

export type TransparencyJobStatus =
  | "queued"
  | "reserved"
  | "crafting"
  | "delivering"
  | "waiting";

export interface ProductionJobStatusRow {
  readonly id: string;
  readonly type: TransparencyJobType;
  readonly status: TransparencyJobStatus;
  readonly targetLabel: string;
  readonly sourceLabel?: string;
  readonly priorityLabel?: string;
  readonly reason?: string;
}

export type KeepStockDecision = "enqueue" | "skip" | "satisfied";

export interface KeepStockStatusRow {
  readonly id: string;
  readonly workbenchId: string;
  readonly recipeId: string;
  readonly itemId: string;
  readonly itemLabel: string;
  readonly targetAmount: number;
  readonly availableAmount: number;
  readonly pendingAmount: number;
  readonly decision: KeepStockDecision;
  readonly decisionReason: string;
}

export interface ProductionTransparencySnapshot {
  readonly jobs: readonly ProductionJobStatusRow[];
  readonly keepStock: readonly KeepStockStatusRow[];
}

// Shared evaluator deps — read-only mirror of the values the reducer
// passes into the planning workflow. Kept locally so this UI module
// has no dependency on the JOB_TICK wiring.
const KEEP_STOCK_EVALUATION_DEPS: KeepStockEvaluationDeps = {
  KEEP_STOCK_OPEN_JOB_CAP,
  KEEP_STOCK_MAX_TARGET,
  resolveBuildingSource,
  toCraftingJobInventorySource,
  getCraftingSourceInventory,
  isUnderConstruction,
};

function toCraftingJobInventorySource(
  state: GameState,
  source: CraftingSource,
): CraftingInventorySource {
  if (source.kind === "global") {
    return { kind: "global" };
  }
  if (source.kind === "zone") {
    return {
      kind: "zone",
      zoneId: source.zoneId,
      warehouseIds: getZoneWarehouseIds(state, source.zoneId),
    };
  }
  return { kind: "warehouse", warehouseId: source.warehouseId };
}

function toCraftingSource(source: CraftingInventorySource): CraftingSource {
  if (source.kind === "global") return { kind: "global" };
  if (source.kind === "warehouse") return { kind: "warehouse", warehouseId: source.warehouseId };
  return { kind: "zone", zoneId: source.zoneId };
}

function formatSourceLabel(source: CraftingInventorySource): string {
  if (source.kind === "global") return "global";
  if (source.kind === "warehouse") return `warehouse ${source.warehouseId}`;
  return `zone ${source.zoneId}`;
}

function getItemLabel(itemId: string): string {
  if (!isKnownItemId(itemId)) return itemId;
  return getItemDef(itemId)?.displayName ?? itemId;
}

function getBufferedAmount(job: CraftingJob, itemId: string): number {
  return (job.inputBuffer ?? []).reduce(
    (sum, stack) => sum + (stack.itemId === itemId ? stack.count : 0),
    0,
  );
}

function hasBufferedIngredients(job: CraftingJob): boolean {
  return job.ingredients.every(
    (ingredient) => getBufferedAmount(job, ingredient.itemId) >= ingredient.count,
  );
}

function getQueuedReason(state: GameState, job: CraftingJob): string {
  const recipe = getWorkbenchRecipe(job.recipeId);
  if (!recipe) return "wartet: recipe unknown";

  const source = toCraftingSource(job.inventorySource);
  const sourceInv = getCraftingSourceInventory(state, source);
  const lines = computeIngredientLines(state, recipe, source, sourceInv);

  const hasReserved = lines.some((line) => line.status === "reserved");
  if (hasReserved) return "wartet auf freien Bestand (reserviert)";

  const missing = lines.find((line) => line.status === "missing");
  if (missing) {
    if (missing.missingHint === "manual") {
      return `wartet auf manuelle Ressource: ${getItemLabel(missing.resource)}`;
    }
    if (missing.missingHint === "craftable") {
      return `wartet auf Vorproduktion: ${getItemLabel(missing.resource)}`;
    }
    return `wartet auf Ressource: ${getItemLabel(missing.resource)}`;
  }

  return "wartet auf Reservierung";
}

function getCraftingJobRows(state: GameState): ProductionJobStatusRow[] {
  const openJobs = sortByPriorityFifo(
    state.crafting.jobs.filter((job) => isOpenCraftingJob(job.status)),
  );

  const rows: ProductionJobStatusRow[] = [];

  for (const job of openJobs) {
    let type: TransparencyJobType;
    if (isKeepStockTrackedJob(state, job)) type = "keep-in-stock";
    else if (job.source === "player") type = "player-craft";
    else type = "automation-craft";

    let status: TransparencyJobStatus;
    let reason: string | undefined;

    if (job.status === "queued") {
      status = "queued";
      reason = getQueuedReason(state, job);
    } else if (job.status === "reserved") {
      status = "reserved";
      if (!hasBufferedIngredients(job)) {
        reason = "wartet auf Lieferung";
      } else {
        const blockedByWorkbench = state.crafting.jobs.some(
          (other) =>
            other.id !== job.id &&
            other.workbenchId === job.workbenchId &&
            (other.status === "crafting" || other.status === "delivering"),
        );
        reason = blockedByWorkbench ? "wartet auf freie Werkbank" : "wartet auf Start";
      }
    } else if (job.status === "crafting") {
      status = "crafting";
      reason = "in Produktion";
    } else if (job.status === "delivering") {
      status = "delivering";
      const hasActiveDelivery = Object.values(state.drones).some(
        (drone) =>
          drone.currentTaskType === "workbench_delivery" &&
          drone.craftingJobId === job.id &&
          drone.status !== "idle",
      );
      reason = hasActiveDelivery ? "delivery unterwegs" : "wartet auf Abholung/Lieferung";
    } else {
      status = "waiting";
    }

    rows.push({
      id: `craft:${job.id}`,
      type,
      status,
      targetLabel: `workbench ${job.workbenchId}`,
      sourceLabel: formatSourceLabel(job.inventorySource),
      priorityLabel: job.priority,
      reason,
    });
  }

  return rows;
}

function countInboundConstructionDrones(state: GameState, targetId: string): number {
  let total = 0;
  for (const drone of Object.values(state.drones)) {
    if (drone.deliveryTargetId !== targetId) continue;
    if (drone.currentTaskType !== "construction_supply" && drone.currentTaskType !== "hub_dispatch") continue;
    if (drone.status === "idle") continue;
    total += 1;
  }
  return total;
}

function getPrimaryConstructionNeed(
  remaining: Partial<Record<CollectableItemType, number>>,
): { itemType: CollectableItemType; amount: number } | null {
  const entries = Object.entries(remaining)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([itemType, amount]) => ({ itemType: itemType as CollectableItemType, amount: amount ?? 0 }))
    .sort((left, right) => right.amount - left.amount || left.itemType.localeCompare(right.itemType));

  return entries[0] ?? null;
}

function getConstructionRows(state: GameState): ProductionJobStatusRow[] {
  const rows: ProductionJobStatusRow[] = [];
  const siteIds = Object.keys(state.constructionSites).sort();

  for (const siteId of siteIds) {
    const site = state.constructionSites[siteId];
    const need = getPrimaryConstructionNeed(site.remaining);
    if (!need) continue;

    const inbound = countInboundConstructionDrones(state, siteId);
    const isUpgrade = site.buildingType === "service_hub" && !!state.serviceHubs[siteId]?.pendingUpgrade;

    rows.push({
      id: `${isUpgrade ? "upgrade" : "construction"}:${siteId}`,
      type: isUpgrade ? "upgrade" : "construction",
      status: inbound > 0 ? "delivering" : "waiting",
      targetLabel: `${site.buildingType} ${siteId}`,
      priorityLabel: isUpgrade ? "high" : "normal",
      reason:
        inbound > 0
          ? `construction delivery unterwegs (${inbound})`
          : `${isUpgrade ? "upgrade" : "construction"} wartet auf ${need.amount} ${RESOURCE_LABELS[need.itemType] ?? need.itemType}`,
    });
  }

  return rows;
}

/**
 * Map a `KeepStockDecisionResult` skip code into the wording shown in
 * the HUD. Wording is preserved 1:1 with the previous inline branches.
 * Returning `null` means "do not render a row for this target".
 */
function describeSkipReason(
  decision: Extract<KeepStockDecisionResult, { kind: "skip" }>,
): string | null {
  switch (decision.code) {
    case "disabled":
      return null;
    case "workbenchMissing":
      return null;
    case "recipeMissing":
      return "skip keep-in-stock: unsupported recipe";
    case "policyBlocked":
      return `skip keep-in-stock: ${decision.rawReason ?? "policy blocked"}`;
    case "underConstruction":
      return "skip keep-in-stock: workbench under construction";
    case "noPhysicalSource":
      return "skip keep-in-stock: no physical source";
    case "higherPriorityBlockers":
      return "skip keep-in-stock: hoeher priorisierte Jobs offen";
    case "capReached":
      return "skip keep-in-stock: global refill cap reached";
    case "refillActive":
      return "skip keep-in-stock: stock refill already active";
  }
}

function getKeepStockRows(state: GameState): KeepStockStatusRow[] {
  const rows: KeepStockStatusRow[] = [];
  const targets = listConfiguredKeepStockTargets(state);

  for (const cfg of targets) {
    const decision = evaluateKeepStockTarget(
      state,
      cfg,
      KEEP_STOCK_EVALUATION_DEPS,
      state.crafting.jobs,
    );

    const id = `${cfg.workbenchId}:${cfg.recipeId}`;

    if (decision.kind === "skip") {
      const reason = describeSkipReason(decision);
      if (reason === null) continue;
      const recipe = decision.recipe;
      rows.push({
        id,
        workbenchId: cfg.workbenchId,
        recipeId: cfg.recipeId,
        itemId: recipe?.outputItem ?? cfg.recipeId,
        itemLabel: recipe ? getItemLabel(recipe.outputItem) : cfg.recipeId,
        targetAmount: decision.targetAmount,
        availableAmount: decision.availableAmount ?? 0,
        pendingAmount: decision.pendingAmount ?? 0,
        decision: "skip",
        decisionReason: reason,
      });
      continue;
    }

    const ctx = decision.ctx;
    if (decision.kind === "satisfied") {
      rows.push({
        id,
        workbenchId: cfg.workbenchId,
        recipeId: cfg.recipeId,
        itemId: ctx.recipe.outputItem,
        itemLabel: getItemLabel(ctx.recipe.outputItem),
        targetAmount: ctx.targetAmount,
        availableAmount: ctx.availableAmount,
        pendingAmount: ctx.pendingAmount,
        decision: "satisfied",
        decisionReason: "target reached",
      });
      continue;
    }

    // decision.kind === "enqueue"
    const missing = Math.max(0, ctx.targetAmount - ctx.projectedAmount);
    rows.push({
      id,
      workbenchId: cfg.workbenchId,
      recipeId: cfg.recipeId,
      itemId: ctx.recipe.outputItem,
      itemLabel: getItemLabel(ctx.recipe.outputItem),
      targetAmount: ctx.targetAmount,
      availableAmount: ctx.availableAmount,
      pendingAmount: ctx.pendingAmount,
      decision: "enqueue",
      decisionReason: `enqueue keep-in-stock for ${ctx.recipe.outputItem} amount ${missing}`,
    });
  }

  return rows;
}

export function buildProductionTransparency(state: GameState): ProductionTransparencySnapshot {
  const jobs = [...getCraftingJobRows(state), ...getConstructionRows(state)];
  const keepStock = getKeepStockRows(state);
  return { jobs, keepStock };
}
