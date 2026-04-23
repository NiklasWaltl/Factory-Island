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
import type {
  CollectableItemType,
  Inventory,
  PlacedAsset,
  ServiceHubEntry,
} from "../store/reducer";
import type { ItemId, WarehouseId } from "../items/types";
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

type PhysicalSourceKind = "warehouse" | "hub";

interface CraftingSourceCandidateSnapshot {
  readonly lane: "primary" | "fallback";
  readonly kind: PhysicalSourceKind;
  readonly id: string;
  readonly scopeKey: string;
  readonly stored: number;
  readonly reserved: number;
  readonly free: number;
}

export type CraftingPhysicalSourceChoice =
  | {
      readonly kind: "warehouse";
      readonly warehouseId: WarehouseId;
      readonly scopeKey: string;
      readonly stored: number;
      readonly reserved: number;
      readonly free: number;
    }
  | {
      readonly kind: "hub";
      readonly hubId: string;
      readonly scopeKey: string;
      readonly stored: number;
      readonly reserved: number;
      readonly free: number;
    };

export interface CraftingIngredientDecision {
  readonly source: CraftingPhysicalSourceChoice | null;
  readonly status: "available" | "reserved" | "missing";
  readonly stored: number;
  readonly reserved: number;
  readonly free: number;
  readonly attempts: readonly CraftingSourceCandidateSnapshot[];
}

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

function getLegacyScopeKeyForSource(source: CraftingInventorySource): string {
  if (source.kind === "global") return GLOBAL_SOURCE_SCOPE_KEY;
  if (source.kind === "warehouse") return `crafting:warehouse:${source.warehouseId}`;
  return `crafting:zone:${source.zoneId}`;
}

function getSourceScopedScopeKey(
  source: Exclude<CraftingInventorySource, { kind: "global" }>,
  kind: PhysicalSourceKind,
  sourceId: string,
): string {
  return `${getLegacyScopeKeyForSource(source)}:${kind}:${sourceId}`;
}

function getReservedInScope(
  network: NetworkSlice,
  itemId: ItemId,
  scopeKey: string,
  excludeReservationId?: string,
): number {
  let total = 0;
  for (const reservation of network.reservations) {
    if (excludeReservationId && reservation.id === excludeReservationId) continue;
    if (reservation.itemId !== itemId) continue;
    if (reservation.scopeKey !== scopeKey) continue;
    total += reservation.amount;
  }
  return total;
}

function isHubCollectableItemId(itemId: ItemId): itemId is CollectableItemType {
  return itemId === "wood" || itemId === "stone" || itemId === "iron" || itemId === "copper";
}

function chebyshevDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function sortCandidateIdsByLocalDistance(
  ids: readonly string[],
  assets: Readonly<Record<string, PlacedAsset>> | undefined,
  preferredFromAssetId: string | undefined,
): string[] {
  const sortedById = [...ids].sort();
  if (!assets || !preferredFromAssetId) return sortedById;

  const from = assets[preferredFromAssetId];
  if (!from) return sortedById;

  return sortedById.sort((leftId, rightId) => {
    const left = assets[leftId];
    const right = assets[rightId];
    const leftDistance = left
      ? chebyshevDistance(from.x, from.y, left.x, left.y)
      : Number.POSITIVE_INFINITY;
    const rightDistance = right
      ? chebyshevDistance(from.x, from.y, right.x, right.y)
      : Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return leftId.localeCompare(rightId);
  });
}

function getPrimaryWarehouseCandidateIds(
  source: Exclude<CraftingInventorySource, { kind: "global" }>,
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>,
  assets?: Readonly<Record<string, PlacedAsset>>,
  preferredFromAssetId?: string,
): WarehouseId[] {
  if (source.kind === "warehouse") {
    if (!warehouseInventories[source.warehouseId]) return [];
    if (assets && assets[source.warehouseId]?.type !== "warehouse") return [];
    return [source.warehouseId];
  }
  const out: WarehouseId[] = [];
  for (const warehouseId of source.warehouseIds) {
    if (!warehouseInventories[warehouseId]) continue;
    if (assets && assets[warehouseId]?.type !== "warehouse") continue;
    out.push(warehouseId);
  }
  return sortCandidateIdsByLocalDistance(out, assets, preferredFromAssetId) as WarehouseId[];
}

function getFallbackHubCandidateIds(
  serviceHubs: Readonly<Record<string, ServiceHubEntry>>,
  assets?: Readonly<Record<string, PlacedAsset>>,
  preferredFromAssetId?: string,
): string[] {
  const out: string[] = [];
  for (const hubId of Object.keys(serviceHubs)) {
    if (assets && assets[hubId]?.type !== "service_hub") continue;
    out.push(hubId);
  }
  return sortCandidateIdsByLocalDistance(out, assets, preferredFromAssetId);
}

function selectDisplayAttempt(
  attempts: readonly CraftingSourceCandidateSnapshot[],
): CraftingSourceCandidateSnapshot | null {
  if (attempts.length === 0) return null;
  let best = attempts[0];
  for (let i = 1; i < attempts.length; i++) {
    const current = attempts[i];
    if (current.stored > best.stored) {
      best = current;
      continue;
    }
    if (current.stored === best.stored && current.free > best.free) {
      best = current;
    }
  }
  return best;
}

export function pickCraftingPhysicalSourceForIngredient(args: {
  source: CraftingInventorySource;
  itemId: ItemId;
  required: number;
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  serviceHubs: Readonly<Record<string, ServiceHubEntry>>;
  network: NetworkSlice;
  assets?: Readonly<Record<string, PlacedAsset>>;
  preferredFromAssetId?: string;
  excludeReservationId?: string;
}): CraftingIngredientDecision {
  const {
    source,
    itemId,
    required,
    warehouseInventories,
    serviceHubs,
    network,
    assets,
    preferredFromAssetId,
    excludeReservationId,
  } = args;

  if (required <= 0) {
    return {
      source: null,
      status: "available",
      stored: 0,
      reserved: 0,
      free: 0,
      attempts: [],
    };
  }

  if (source.kind === "global") {
    return {
      source: null,
      status: "missing",
      stored: 0,
      reserved: 0,
      free: 0,
      attempts: [],
    };
  }

  const attempts: CraftingSourceCandidateSnapshot[] = [];
  const legacyScope = getLegacyScopeKeyForSource(source);

  const primaryWarehouseIds = getPrimaryWarehouseCandidateIds(
    source,
    warehouseInventories,
    assets,
    preferredFromAssetId,
  );
  for (const warehouseId of primaryWarehouseIds) {
    const stored = (warehouseInventories[warehouseId] as unknown as Record<string, number>)[itemId] ?? 0;
    const scopedReserved = getReservedInScope(
      network,
      itemId,
      getSourceScopedScopeKey(source, "warehouse", warehouseId),
      excludeReservationId,
    );
    const legacyReserved = getReservedInScope(network, itemId, legacyScope, excludeReservationId);
    const reserved = scopedReserved + legacyReserved;
    const free = Math.max(0, stored - reserved);
    const attempt: CraftingSourceCandidateSnapshot = {
      lane: "primary",
      kind: "warehouse",
      id: warehouseId,
      scopeKey: getSourceScopedScopeKey(source, "warehouse", warehouseId),
      stored,
      reserved,
      free,
    };
    attempts.push(attempt);
    if (free >= required) {
      return {
        source: {
          kind: "warehouse",
          warehouseId,
          scopeKey: attempt.scopeKey,
          stored,
          reserved,
          free,
        },
        status: "available",
        stored,
        reserved,
        free,
        attempts,
      };
    }
  }

  if (isHubCollectableItemId(itemId)) {
    const hubIds = getFallbackHubCandidateIds(serviceHubs, assets, preferredFromAssetId);
    for (const hubId of hubIds) {
      const hubStored = serviceHubs[hubId]?.inventory[itemId] ?? 0;
      const scopedReserved = getReservedInScope(
        network,
        itemId,
        getSourceScopedScopeKey(source, "hub", hubId),
        excludeReservationId,
      );
      const legacyReserved = getReservedInScope(network, itemId, legacyScope, excludeReservationId);
      const reserved = scopedReserved + legacyReserved;
      const free = Math.max(0, hubStored - reserved);
      const attempt: CraftingSourceCandidateSnapshot = {
        lane: "fallback",
        kind: "hub",
        id: hubId,
        scopeKey: getSourceScopedScopeKey(source, "hub", hubId),
        stored: hubStored,
        reserved,
        free,
      };
      attempts.push(attempt);
      if (free >= required) {
        return {
          source: {
            kind: "hub",
            hubId,
            scopeKey: attempt.scopeKey,
            stored: hubStored,
            reserved,
            free,
          },
          status: "available",
          stored: hubStored,
          reserved,
          free,
          attempts,
        };
      }
    }
  }

  const blocked = attempts.find((attempt) => attempt.stored >= required && attempt.free < required) ?? null;
  if (blocked) {
    return {
      source: null,
      status: "reserved",
      stored: blocked.stored,
      reserved: blocked.reserved,
      free: blocked.free,
      attempts,
    };
  }

  const display = selectDisplayAttempt(attempts);
  return {
    source: null,
    status: "missing",
    stored: display?.stored ?? 0,
    reserved: display?.reserved ?? 0,
    free: display?.free ?? 0,
    attempts,
  };
}

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
  }

  if (import.meta.env.DEV) {
    debugLog.general(`Recipe ${job.recipeId} craftable via fallback source evaluation`);
  }
  return { ok: true, network: nextNetwork };
}

interface SourceView {
  scopeKey: string;
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
}

export function getGlobalHubWarehouseId(hubId: string): WarehouseId {
  return `${GLOBAL_SOURCE_HUB_PREFIX}${hubId}` as WarehouseId;
}

export function hubInventoryToInventoryView(hubInventory: ServiceHubEntry["inventory"]): Inventory {
  return {
    wood: hubInventory.wood ?? 0,
    stone: hubInventory.stone ?? 0,
    iron: hubInventory.iron ?? 0,
    copper: hubInventory.copper ?? 0,
  } as Inventory;
}

export function inventoryViewToHubInventory(
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
