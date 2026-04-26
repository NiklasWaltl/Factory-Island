// ============================================================
// Factory Island - Crafting Tick Scheduler (Step 3)
// ------------------------------------------------------------
// Pure-ish state transition: given (warehouseInventories,
// network slice, crafting queue, assets), advance every job
// by exactly one tick. No I/O, no globals, no Date.now() except
// for informational `startedAt` / `finishesAt`.
//
// Three phases per tick — strict, deterministic order:
//   1. Progress active `crafting` jobs (commit ingredients + delivering)
//   2. Promote `queued` jobs that can reserve their ingredients
//      → `reserved`
//   3. Promote `reserved` jobs whose workbench is now free
//      → `crafting` (immediately finish crafting if processingTime===0)
//
// The reservation-before-promotion order means a freshly enqueued job
// can move all the way through queued → reserved → crafting → delivering in
// a single tick when ingredients are present and the workbench is free.
//
// File composition (Phase 4.2 split):
//   • tick/hub-inventory-view.ts — Hub<->Inventory adapters & SourceView
//   • tick/source-selection.ts   — pickCraftingPhysicalSourceForIngredient
//   • tick/job-lifecycle.ts      — finish/cancel/release + DEV invariants
//   • this file                  — orchestrator + reservation phase
// ============================================================

import { debugLog } from "../debug/debugLogger";
import type {
  Inventory,
  PlacedAsset,
  ServiceHubEntry,
} from "../store/reducer";
import type { WarehouseId } from "../items/types";
import { applyNetworkAction } from "../inventory/reservations";
import type { NetworkSlice } from "../inventory/reservationTypes";
import {
  assertTransition,
  sortByPriorityFifo,
} from "./queue/queue";
import type { CraftingJob, CraftingQueueState } from "./types";
import {
  getGlobalHubWarehouseId,
  getJobInventorySource,
  getSourceView,
  hubInventoryToInventoryView,
} from "./tick/hub-inventory-view";
import { pickCraftingPhysicalSourceForIngredient } from "./tick/source-selection";
import {
  assertCraftingNetworkCrossInvariants,
  cancelReservedJob,
  finishCraftingJob,
  getReservedAmountForCraftingOwnerItem,
  hasBufferedIngredients,
} from "./tick/job-lifecycle";

// ---------------------------------------------------------------------------
// Public re-exports — preserve the historical tick.ts surface.
// ---------------------------------------------------------------------------
export type {
  CraftingPhysicalSourceChoice,
  CraftingIngredientDecision,
} from "./tick/source-selection";
export { pickCraftingPhysicalSourceForIngredient } from "./tick/source-selection";
export {
  getGlobalHubWarehouseId,
  hubInventoryToInventoryView,
  inventoryViewToHubInventory,
} from "./tick/hub-inventory-view";
export { releaseJobReservations } from "./tick/job-lifecycle";

// ---------------------------------------------------------------------------
// Public input/output types
// ---------------------------------------------------------------------------

export interface TickInput {
  readonly warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  readonly globalInventory: Inventory;
  readonly serviceHubs: Readonly<Record<string, ServiceHubEntry>>;
  readonly network: NetworkSlice;
  readonly crafting: CraftingQueueState;
  readonly assets: Readonly<Record<string, PlacedAsset>>;
  readonly readyWorkbenchIds?: ReadonlySet<string>;
  /** Wall-clock ms; used only for informational `startedAt`/`finishesAt`. */
  readonly now: number;
}

export interface TickOutput {
  readonly warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  readonly globalInventory: Inventory;
  readonly serviceHubs: Readonly<Record<string, ServiceHubEntry>>;
  readonly network: NetworkSlice;
  readonly crafting: CraftingQueueState;
}

/**
 * Run one crafting tick. Returns the (possibly unchanged) inputs.
 * The function is referentially safe: if nothing changes, the same
 * object identities are returned and the outer reducer can short-circuit.
 */
export function tickCraftingJobs(input: TickInput): TickOutput {
  let warehouseInventories = input.warehouseInventories;
  let globalInventory = input.globalInventory;
  let serviceHubs = input.serviceHubs;
  let network = input.network;
  let jobs = input.crafting.jobs;
  let changed = false;

  if (import.meta.env.DEV && jobs.some((job) => job.status !== "done" && job.status !== "cancelled")) {
    const queued = jobs.filter((job) => job.status === "queued").length;
    const reserved = jobs.filter((job) => job.status === "reserved").length;
    const crafting = jobs.filter((job) => job.status === "crafting").length;
    const delivering = jobs.filter((job) => job.status === "delivering").length;
    debugLog.general(`JOB_TICK sees ${queued} queued / ${reserved} reserved / ${crafting} crafting / ${delivering} delivering jobs`);
  }

  // -----------------------------------------------------------------
  // Phase 1: progress active `crafting` jobs
  // -----------------------------------------------------------------
  const phase1: CraftingJob[] = [];
  for (const job of jobs) {
    if (job.status !== "crafting") {
      phase1.push(job);
      continue;
    }
    const nextProgress = job.progress + 1;
    if (nextProgress < job.processingTime) {
      phase1.push({ ...job, progress: nextProgress });
      changed = true;
      continue;
    }
    // Completion: commit reservations, then wait for drone pickup.
    const completed = finishCraftingJob(
      job,
      warehouseInventories,
      globalInventory,
      serviceHubs,
      network,
    );
    warehouseInventories = completed.warehouseInventories;
    globalInventory = completed.globalInventory;
    serviceHubs = completed.serviceHubs;
    network = completed.network;
    phase1.push(completed.job);
    changed = true;
  }
  jobs = phase1;

  // -----------------------------------------------------------------
  // Phase 2: promote `queued` → `reserved` if reservations succeed
  // -----------------------------------------------------------------
  const queuedSorted = sortByPriorityFifo(
    jobs.filter((j) => j.status === "queued"),
  );
  const idIndex = new Map<string, number>();
  jobs.forEach((j, i) => idIndex.set(j.id, i));
  const phase2: CraftingJob[] = [...jobs];

  for (const job of queuedSorted) {
    const reserve = reserveQueuedJobIngredients(
      job,
      warehouseInventories,
      globalInventory,
      serviceHubs,
      network,
      input.assets,
    );
    if (!reserve.ok) {
      // Stay queued; will retry on a future tick.
      continue;
    }
    network = reserve.network;
    assertTransition(job.status, "reserved");
    const reserved: CraftingJob = { ...job, status: "reserved" };
    if (import.meta.env.DEV) {
      debugLog.general(`Scheduler picked job ${job.id} -> reserved`);
    }
    const idx = idIndex.get(job.id)!;
    phase2[idx] = reserved;
    changed = true;
  }
  jobs = phase2;

  // -----------------------------------------------------------------
  // Phase 3: promote `reserved` → `crafting` (only if workbench free)
  // -----------------------------------------------------------------
  const reservedSorted = sortByPriorityFifo(
    jobs.filter((j) => j.status === "reserved"),
  );
  const busyByWorkbench = new Set<string>();
  for (const j of jobs) {
    if (j.status === "crafting" || j.status === "delivering") busyByWorkbench.add(j.workbenchId);
  }
  idIndex.clear();
  jobs.forEach((j, i) => idIndex.set(j.id, i));
  const phase3: CraftingJob[] = [...jobs];

  for (const job of reservedSorted) {
    if (busyByWorkbench.has(job.workbenchId)) {
      if (import.meta.env.DEV) {
        debugLog.general(`Job ${job.id} waiting: workbench ${job.workbenchId} already busy`);
      }
      continue;
    }
    // Sanity: workbench must still exist.
    const wb = input.assets[job.workbenchId];
    if (!wb || wb.type !== "workbench") {
      // The workbench was destroyed while the job was reserved.
      const canc = cancelReservedJob(job, network);
      network = canc.network;
      if (import.meta.env.DEV) {
        debugLog.general(`Job ${job.id} cancelled: workbench ${job.workbenchId} missing`);
      }
      const idx = idIndex.get(job.id)!;
      phase3[idx] = canc.job;
      changed = true;
      continue;
    }
    if (!hasBufferedIngredients(job)) {
      if (import.meta.env.DEV) {
        debugLog.general(`Job ${job.id} waiting: workbench ${job.workbenchId} missing delivered input`);
      }
      continue;
    }
    if (input.readyWorkbenchIds && !input.readyWorkbenchIds.has(job.workbenchId)) {
      if (import.meta.env.DEV) {
        debugLog.general(`Job ${job.id} waiting: workbench ${job.workbenchId} not ready`);
      }
      continue;
    }
    assertTransition(job.status, "crafting");
    let promoted: CraftingJob = {
      ...job,
      status: "crafting",
      progress: 0,
      startedAt: input.now,
      finishesAt: input.now,
    };
    if (import.meta.env.DEV) {
      debugLog.general(`Job ${job.id} moved to crafting on workbench ${job.workbenchId}`);
    }
    // For 0-tick recipes, finish crafting immediately in the same tick.
    if (promoted.processingTime === 0) {
      const completed = finishCraftingJob(
        promoted,
        warehouseInventories,
        globalInventory,
        serviceHubs,
        network,
      );
      warehouseInventories = completed.warehouseInventories;
      globalInventory = completed.globalInventory;
      serviceHubs = completed.serviceHubs;
      network = completed.network;
      promoted = completed.job;
      busyByWorkbench.add(job.workbenchId);
    } else {
      busyByWorkbench.add(job.workbenchId);
    }
    const idx = idIndex.get(job.id)!;
    phase3[idx] = promoted;
    changed = true;
  }
  jobs = phase3;

  if (import.meta.env.DEV) {
    assertCraftingNetworkCrossInvariants(network, jobs);
  }

  if (!changed) return input;

  return {
    warehouseInventories,
    globalInventory,
    serviceHubs,
    network,
    crafting: { ...input.crafting, jobs },
  };
}

// ---------------------------------------------------------------------------
// Phase-2 helper: reserve all ingredients for a `queued` job.
// ---------------------------------------------------------------------------

function reserveQueuedJobIngredients(
  job: CraftingJob,
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>,
  globalInventory: Inventory,
  serviceHubs: Readonly<Record<string, ServiceHubEntry>>,
  network: NetworkSlice,
  assets: Readonly<Record<string, PlacedAsset>>,
): { ok: true; network: NetworkSlice } | { ok: false } {
  const source = getJobInventorySource(job);
  if (import.meta.env.DEV) {
    debugLog.general(`Craft availability check for recipe ${job.recipeId} (job ${job.id})`);
  }

  if (source.kind === "global") {
    const sourceView = getSourceView(source, warehouseInventories, globalInventory, serviceHubs);
    const result = applyNetworkAction(sourceView.warehouseInventories, network, {
      type: "NETWORK_RESERVE_BATCH",
      items: job.ingredients,
      ownerKind: "crafting_job",
      ownerId: job.reservationOwnerId,
      scopeKey: sourceView.scopeKey,
    });
    if (result.network.lastError) {
      if (import.meta.env.DEV) {
        debugLog.general(
          `Job ${job.id} reserve blocked for workbench ${job.workbenchId}: ${result.network.lastError.message}`,
        );
      }
      return { ok: false };
    }
    return { ok: true, network: result.network };
  }

  let nextNetwork = network;
  for (const ingredient of job.ingredients) {
    const decision = pickCraftingPhysicalSourceForIngredient({
      source,
      itemId: ingredient.itemId,
      required: ingredient.count,
      warehouseInventories,
      serviceHubs,
      network: nextNetwork,
      assets,
      preferredFromAssetId: job.workbenchId,
    });

    if (!decision.source) {
      if (import.meta.env.DEV) {
        debugLog.general(
          `Ingredient ${ingredient.itemId}: nearby warehouses insufficient` +
            (decision.status === "reserved"
              ? " (blocked by reservations)"
              : ", no fallback hub can fully supply"),
        );
        debugLog.general(
          `Enqueue rejected because: ingredient ${ingredient.itemId} unavailable for job ${job.id}`,
        );
      }
      return { ok: false };
    }

    if (import.meta.env.DEV) {
      const usedFallbackHub = decision.source.kind === "hub";
      if (usedFallbackHub) {
        debugLog.general(`Ingredient ${ingredient.itemId}: nearby warehouses insufficient`);
        debugLog.general(
          `Ingredient ${ingredient.itemId}: fallback hub ${decision.source.hubId} available with ${decision.source.free}`,
        );
      }
      debugLog.general(
        `Reservation source chosen: ${decision.source.kind} ${
          decision.source.kind === "warehouse" ? decision.source.warehouseId : decision.source.hubId
        }`,
      );
    }

    const reservedBefore = getReservedAmountForCraftingOwnerItem(
      nextNetwork,
      job.reservationOwnerId,
      ingredient.itemId,
    );

    const scopedInventories: Record<WarehouseId, Inventory> = {};
    if (decision.source.kind === "warehouse") {
      const inventory = warehouseInventories[decision.source.warehouseId];
      if (!inventory) {
        if (import.meta.env.DEV) {
          debugLog.general(
            `Enqueue rejected because: selected warehouse ${decision.source.warehouseId} is missing`,
          );
        }
        return { ok: false };
      }
      scopedInventories[decision.source.warehouseId] = inventory;
    } else {
      const hub = serviceHubs[decision.source.hubId];
      if (!hub) {
        if (import.meta.env.DEV) {
          debugLog.general(
            `Enqueue rejected because: selected fallback hub ${decision.source.hubId} is missing`,
          );
        }
        return { ok: false };
      }
      scopedInventories[getGlobalHubWarehouseId(decision.source.hubId)] = hubInventoryToInventoryView(hub.inventory);
    }

    const reserveResult = applyNetworkAction(scopedInventories, nextNetwork, {
      type: "NETWORK_RESERVE_BATCH",
      items: [ingredient],
      ownerKind: "crafting_job",
      ownerId: job.reservationOwnerId,
      scopeKey: decision.source.scopeKey,
    });

    if (reserveResult.network.lastError) {
      if (import.meta.env.DEV) {
        debugLog.general(
          `Enqueue rejected because: ${reserveResult.network.lastError.message} (job ${job.id}, ingredient ${ingredient.itemId})`,
        );
      }
      return { ok: false };
    }

    nextNetwork = reserveResult.network;

    if (import.meta.env.DEV) {
      const reservedAfter = getReservedAmountForCraftingOwnerItem(
        nextNetwork,
        job.reservationOwnerId,
        ingredient.itemId,
      );
      const delta = reservedAfter - reservedBefore;
      if (delta !== ingredient.count) {
        throw new Error(
          `[crafting] Invariant violated: reserve delta ${delta} does not match requested ${ingredient.count} for owner "${job.reservationOwnerId}" item "${ingredient.itemId}".`,
        );
      }
    }
  }

  if (import.meta.env.DEV) {
    debugLog.general(`Recipe ${job.recipeId} craftable via fallback source evaluation`);
  }
  return { ok: true, network: nextNetwork };
}
