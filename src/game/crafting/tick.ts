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
// ============================================================

import { debugLog } from "../debug/debugLogger";
import type { Inventory, PlacedAsset, ServiceHubEntry } from "../store/reducer";
import type { WarehouseId } from "../items/types";
import { applyNetworkAction } from "../inventory/reservations";
import type { NetworkSlice } from "../inventory/reservationTypes";
import {
  assertTransition,
  sortByPriorityFifo,
} from "./queue";
import type {
  CraftingInventorySource,
  CraftingJob,
  CraftingQueueState,
} from "./types";

const GLOBAL_SOURCE_SCOPE_KEY = "crafting:global";
const GLOBAL_SOURCE_WAREHOUSE_ID = "__crafting_global__" as WarehouseId;
const GLOBAL_SOURCE_HUB_PREFIX = "__crafting_hub__:";
const HUB_COLLECTABLE_ITEM_IDS = ["wood", "stone", "iron", "copper"] as const;

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
    const sourceView = getSourceView(
      getJobInventorySource(job),
      warehouseInventories,
      globalInventory,
      serviceHubs,
    );
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
      // Stay queued; will retry on a future tick.
      continue;
    }
    network = result.network;
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
// Internal helpers
// ---------------------------------------------------------------------------

function finishCraftingJob(
  job: CraftingJob,
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>,
  globalInventory: Inventory,
  serviceHubs: Readonly<Record<string, ServiceHubEntry>>,
  network: NetworkSlice,
): {
  job: CraftingJob;
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  globalInventory: Inventory;
  serviceHubs: Readonly<Record<string, ServiceHubEntry>>;
  network: NetworkSlice;
} {
  // Input is already physically buffered at the workbench before the job may
  // enter crafting, so no source inventory may be touched here.
  assertTransition(job.status, "delivering");
  if (import.meta.env.DEV) {
    debugLog.general(
      `Job ${job.id} finished crafting: ${job.output.count}x ${job.output.itemId} waiting for drone pickup`,
    );
  }
  return {
    job: { ...job, status: "delivering", progress: job.processingTime },
    warehouseInventories,
    globalInventory,
    serviceHubs,
    network,
  };
}

function getBufferedAmount(
  job: CraftingJob,
  itemId: CraftingJob["ingredients"][number]["itemId"],
): number {
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

function cancelReservedJob(
  job: CraftingJob,
  network: NetworkSlice,
): { job: CraftingJob; network: NetworkSlice } {
  const released = applyNetworkAction({}, network, {
    type: "NETWORK_CANCEL_BY_OWNER",
    ownerKind: "crafting_job",
    ownerId: job.reservationOwnerId,
  });
  // Cancellation of an unknown owner just sets lastError — safe to ignore.
  assertTransition(job.status, "cancelled");
  return {
    job: { ...job, status: "cancelled" },
    network: released.network.lastError ? network : released.network,
  };
}

/**
 * Helper for the reducer: release reservations associated with a job
 * that was just cancelled by the player. Pure and idempotent.
 */
export function releaseJobReservations(
  network: NetworkSlice,
  job: CraftingJob,
): NetworkSlice {
  if (job.status !== "reserved" && job.status !== "crafting") {
    // Only those statuses hold reservations.
    return network;
  }
  const result = applyNetworkAction({}, network, {
    type: "NETWORK_CANCEL_BY_OWNER",
    ownerKind: "crafting_job",
    ownerId: job.reservationOwnerId,
  });
  // If there were no matching reservations, keep the original slice
  // so we don't surface a misleading lastError to UI.
  return result.network.lastError ? network : result.network;
}

interface SourceView {
  scopeKey: string;
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
}

function getGlobalHubWarehouseId(hubId: string): WarehouseId {
  return `${GLOBAL_SOURCE_HUB_PREFIX}${hubId}` as WarehouseId;
}

function hubInventoryToInventoryView(hubInventory: ServiceHubEntry["inventory"]): Inventory {
  return {
    wood: hubInventory.wood ?? 0,
    stone: hubInventory.stone ?? 0,
    iron: hubInventory.iron ?? 0,
    copper: hubInventory.copper ?? 0,
  } as Inventory;
}

function inventoryViewToHubInventory(
  hubInventory: ServiceHubEntry["inventory"],
  inventoryView: Inventory,
): ServiceHubEntry["inventory"] {
  return {
    ...hubInventory,
    wood: inventoryView.wood ?? 0,
    stone: inventoryView.stone ?? 0,
    iron: inventoryView.iron ?? 0,
    copper: inventoryView.copper ?? 0,
  };
}

function hubInventoriesEqual(
  left: ServiceHubEntry["inventory"],
  right: ServiceHubEntry["inventory"],
): boolean {
  return HUB_COLLECTABLE_ITEM_IDS.every((itemId) => (left[itemId] ?? 0) === (right[itemId] ?? 0));
}

function getJobInventorySource(job: CraftingJob): CraftingInventorySource {
  const source = (job as CraftingJob & { inventorySource?: CraftingInventorySource }).inventorySource;
  return source ?? { kind: "global" };
}

function getSourceView(
  source: CraftingInventorySource,
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>,
  globalInventory: Inventory,
  serviceHubs: Readonly<Record<string, ServiceHubEntry>>,
): SourceView {
  if (source.kind === "global") {
    const scopedWarehouses: Record<WarehouseId, Inventory> = {
      [GLOBAL_SOURCE_WAREHOUSE_ID]: globalInventory,
    };
    for (const [hubId, hub] of Object.entries(serviceHubs)) {
      scopedWarehouses[getGlobalHubWarehouseId(hubId)] = hubInventoryToInventoryView(hub.inventory);
    }
    return {
      scopeKey: GLOBAL_SOURCE_SCOPE_KEY,
      warehouseInventories: scopedWarehouses,
    };
  }

  if (source.kind === "warehouse") {
    const warehouse = warehouseInventories[source.warehouseId];
    return {
      scopeKey: `crafting:warehouse:${source.warehouseId}`,
      warehouseInventories: warehouse ? { [source.warehouseId]: warehouse } : {},
    };
  }

  const scopedWarehouses: Record<WarehouseId, Inventory> = {};
  for (const warehouseId of source.warehouseIds) {
    const inventory = warehouseInventories[warehouseId];
    if (inventory) {
      scopedWarehouses[warehouseId] = inventory;
    }
  }
  return {
    scopeKey: `crafting:zone:${source.zoneId}`,
    warehouseInventories: scopedWarehouses,
  };
}

function mergeSourceView(
  source: CraftingInventorySource,
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>,
  globalInventory: Inventory,
  serviceHubs: Readonly<Record<string, ServiceHubEntry>>,
  scopedWarehouses: Readonly<Record<WarehouseId, Inventory>>,
): {
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  globalInventory: Inventory;
  serviceHubs: Readonly<Record<string, ServiceHubEntry>>;
} {
  if (source.kind === "global") {
    let nextServiceHubs: Record<string, ServiceHubEntry> | null = null;
    for (const [hubId, hub] of Object.entries(serviceHubs)) {
      const scopedInventory = scopedWarehouses[getGlobalHubWarehouseId(hubId)];
      if (!scopedInventory) continue;
      const nextHubInventory = inventoryViewToHubInventory(hub.inventory, scopedInventory);
      if (hubInventoriesEqual(hub.inventory, nextHubInventory)) continue;
      if (!nextServiceHubs) {
        nextServiceHubs = { ...serviceHubs };
      }
      nextServiceHubs[hubId] = { ...hub, inventory: nextHubInventory };
    }
    return {
      warehouseInventories,
      globalInventory: scopedWarehouses[GLOBAL_SOURCE_WAREHOUSE_ID] ?? globalInventory,
      serviceHubs: nextServiceHubs ?? serviceHubs,
    };
  }

  if (source.kind === "warehouse") {
    const scopedInventory = scopedWarehouses[source.warehouseId];
    if (!scopedInventory) {
      return { warehouseInventories, globalInventory, serviceHubs };
    }
    return {
      warehouseInventories: {
        ...warehouseInventories,
        [source.warehouseId]: scopedInventory,
      },
      globalInventory,
      serviceHubs,
    };
  }

  const mergedWarehouses: Record<WarehouseId, Inventory> = {
    ...warehouseInventories,
  };
  for (const warehouseId of source.warehouseIds) {
    const scopedInventory = scopedWarehouses[warehouseId];
    if (scopedInventory) {
      mergedWarehouses[warehouseId] = scopedInventory;
    }
  }
  return {
    warehouseInventories: mergedWarehouses,
    globalInventory,
    serviceHubs,
  };
}
