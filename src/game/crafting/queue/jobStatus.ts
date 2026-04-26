// ============================================================
// Crafting job status helpers
// ------------------------------------------------------------
// Pure, side-effect-free predicates and aggregations over
// CraftingJob / CraftingInventorySource. Single source of truth
// shared between the reducer (cap / blocker logic) and the UI
// transparency layer (status display).
//
// IMPORTANT — fachlich getrennte Begriffe:
//   - isAutomationCraftingJob(job):
//       Reducer-Semantik. Ein offener (nicht done/cancelled)
//       Crafting-Job mit source === "automation". Wird für Caps
//       und globale Blocker des Keep-in-Stock-Refill-Loops
//       verwendet.
//   - isKeepStockTrackedJob(state, job):
//       UI-Semantik. Ein automation-Job, dessen Workbench für
//       genau dieses Rezept ein aktives Keep-Stock-Target
//       konfiguriert hat. Wird für die HUD-Klassifikation
//       benutzt. Diese Funktion prüft KEINEN Open-Status, damit
//       Anzeige-Pfade auch abgeschlossene Jobs noch erkennen
//       können. Wer "aktiv UND tracked" benötigt, kombiniert
//       isKeepStockTrackedJob(state, job) && isOpenCraftingJob(job.status).
// Diese beiden Begriffe dürfen NICHT zusammengelegt werden.
// ============================================================

import type { CraftingInventorySource, CraftingJob } from "../types";
import type { GameState } from "../../store/types";

export function isOpenCraftingJob(status: CraftingJob["status"]): boolean {
  return status !== "done" && status !== "cancelled";
}

export function isGuaranteedPendingCraftingJob(status: CraftingJob["status"]): boolean {
  return status === "reserved" || status === "crafting" || status === "delivering";
}

export function areCraftingSourcesEqual(
  left: CraftingInventorySource,
  right: CraftingInventorySource,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "global" && right.kind === "global") return true;
  if (left.kind === "warehouse" && right.kind === "warehouse") {
    return left.warehouseId === right.warehouseId;
  }
  if (left.kind === "zone" && right.kind === "zone") {
    if (left.zoneId !== right.zoneId) return false;
    if (left.warehouseIds.length !== right.warehouseIds.length) return false;
    const leftIds = [...left.warehouseIds].sort();
    const rightIds = [...right.warehouseIds].sort();
    for (let i = 0; i < leftIds.length; i++) {
      if (leftIds[i] !== rightIds[i]) return false;
    }
    return true;
  }
  return false;
}

/**
 * Aggregates the output count of all jobs that are "guaranteed pending"
 * (reserved / crafting / delivering) for the given output item AND whose
 * inventory source equals the requested source. Mirrors the projection
 * used by both the reducer's keep-in-stock refill decision and the UI's
 * pending-output badge.
 */
export function getGuaranteedPendingOutput(
  jobs: readonly CraftingJob[],
  source: CraftingInventorySource,
  outputItem: string,
): number {
  let total = 0;
  for (const job of jobs) {
    if (!isGuaranteedPendingCraftingJob(job.status)) continue;
    if (job.output.itemId !== outputItem) continue;
    if (!areCraftingSourcesEqual(job.inventorySource, source)) continue;
    total += job.output.count;
  }
  return total;
}

/**
 * Reducer-Semantik: ein offener Automation-Job, unabhängig davon, ob
 * eine Workbench dafür ein Keep-Stock-Target konfiguriert hat. Wird für
 * Cap-/Blocker-Entscheidungen im Keep-Stock-Refill-Loop verwendet.
 */
export function isAutomationCraftingJob(job: CraftingJob): boolean {
  return job.source === "automation" && isOpenCraftingJob(job.status);
}

/**
 * Counts open automation crafting jobs in a queue snapshot. Used for
 * the keep-stock refill cap (`KEEP_STOCK_OPEN_JOB_CAP`).
 */
export function countOpenAutomationCraftingJobs(jobs: readonly CraftingJob[]): number {
  let total = 0;
  for (const job of jobs) {
    if (isAutomationCraftingJob(job)) total += 1;
  }
  return total;
}

/**
 * True when the queue snapshot contains any open automation job whose
 * output item matches `outputItem`. Used as a per-item dedup gate in
 * the keep-stock refill loop.
 */
export function hasActiveAutomationRefillForItem(
  jobs: readonly CraftingJob[],
  outputItem: string,
): boolean {
  return jobs.some(
    (job) => isAutomationCraftingJob(job) && job.output.itemId === outputItem,
  );
}

/**
 * UI-Semantik: ein Automation-Job, dessen Workbench für genau dieses
 * Rezept ein aktiviertes Keep-Stock-Target hat. Bewusst OHNE Open-Check,
 * damit Anzeige-Pfade auch abgeschlossene Jobs als "Keep-in-Stock"
 * klassifizieren können. Aufrufer kombinieren bei Bedarf mit
 * isOpenCraftingJob(job.status).
 */
export function isKeepStockTrackedJob(
  state: Pick<GameState, "keepStockByWorkbench">,
  job: CraftingJob,
): boolean {
  if (job.source !== "automation") return false;
  const target = state.keepStockByWorkbench?.[job.workbenchId]?.[job.recipeId];
  return !!target?.enabled && (target.amount ?? 0) > 0;
}

/**
 * Returns true if there are any higher-priority workloads that should
 * pause keep-in-stock refills: open player crafting jobs, open
 * construction sites, or pending hub upgrades.
 */
export function hasHigherPriorityKeepStockBlockers(
  state: Pick<GameState, "crafting" | "constructionSites" | "serviceHubs">,
): boolean {
  const hasOpenPlayerCraftingJobs = state.crafting.jobs.some(
    (job) => job.source === "player" && isOpenCraftingJob(job.status),
  );
  if (hasOpenPlayerCraftingJobs) return true;

  const hasOpenConstruction = Object.values(state.constructionSites).some((site) =>
    Object.values(site.remaining).some((amount) => (amount ?? 0) > 0),
  );
  if (hasOpenConstruction) return true;

  return Object.values(state.serviceHubs).some((hub) => !!hub.pendingUpgrade);
}
