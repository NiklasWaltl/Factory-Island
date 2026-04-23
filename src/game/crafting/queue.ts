// ============================================================
// Factory Island - Crafting Queue Helpers (Step 3)
// ------------------------------------------------------------
// Pure functions for building, sorting and querying the
// CraftingQueueState. The reducer wires these together.
// ============================================================

import { isKnownItemId } from "../items/registry";
import type { ItemStack } from "../items/types";
import { getWorkbenchRecipe, type WorkbenchRecipe } from "../simulation/recipes";
import type { PlacedAsset } from "../store/reducer";
import {
  asItemId,
  createEmptyCraftingQueue,
  defaultPriorityFor,
  PRIORITY_ORDER,
  type CraftingInventorySource,
  type CraftingError,
  type CraftingJob,
  type CraftingQueueState,
  type JobId,
  type JobPriority,
  type JobSource,
  type JobStatus,
  type RecipeId,
  type WorkbenchId,
} from "./types";

// ---------------------------------------------------------------------------
// Recipe → ItemStack[] conversion
// ---------------------------------------------------------------------------

/**
 * Translate a `WorkbenchRecipe.costs` map into an ItemStack[].
 * Throws on unknown item ids — that would be a recipe authoring bug.
 */
export function recipeIngredientsToStacks(
  recipe: WorkbenchRecipe,
): readonly ItemStack[] {
  const out: ItemStack[] = [];
  for (const [key, count] of Object.entries(recipe.costs)) {
    if (typeof count !== "number" || count <= 0) continue;
    if (!isKnownItemId(key)) {
      throw new Error(
        `[crafting] Recipe "${recipe.key}" references unknown item "${key}"`,
      );
    }
    out.push({ itemId: asItemId(key), count });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export interface EnqueueInput {
  readonly recipeId: RecipeId;
  readonly workbenchId: WorkbenchId;
  readonly source: JobSource;
  readonly inventorySource: CraftingInventorySource;
  readonly priority?: JobPriority;
  readonly assets: Readonly<Record<string, PlacedAsset>>;
}

export type EnqueueResult =
  | { readonly ok: true; readonly queue: CraftingQueueState; readonly job: CraftingJob }
  | { readonly ok: false; readonly queue: CraftingQueueState; readonly error: CraftingError };

/**
 * Validate inputs and append a new `queued` job to the queue.
 * Stable FIFO ordering inside a priority is guaranteed by `enqueuedAt`
 * (the monotonic queue sequence number).
 */
export function enqueueJob(
  queue: CraftingQueueState,
  input: EnqueueInput,
): EnqueueResult {
  const recipe = getWorkbenchRecipe(input.recipeId);
  if (!recipe) {
    const err: CraftingError = {
      kind: "UNKNOWN_RECIPE",
      message: `Recipe "${input.recipeId}" not found.`,
      recipeId: input.recipeId,
    };
    return { ok: false, queue: { ...queue, lastError: err }, error: err };
  }

  const wbAsset = input.assets[input.workbenchId];
  if (!wbAsset || wbAsset.type !== "workbench") {
    const err: CraftingError = {
      kind: "UNKNOWN_WORKBENCH",
      message: `Workbench "${input.workbenchId}" does not exist.`,
      workbenchId: input.workbenchId,
    };
    return { ok: false, queue: { ...queue, lastError: err }, error: err };
  }

  if (!isKnownItemId(recipe.outputItem)) {
    const err: CraftingError = {
      kind: "INVALID_OUTPUT_ITEM",
      message: `Recipe "${input.recipeId}" output "${recipe.outputItem}" is not a registered item.`,
      recipeId: input.recipeId,
    };
    return { ok: false, queue: { ...queue, lastError: err }, error: err };
  }

  const seq = queue.nextJobSeq;
  const id: JobId = `job-${seq}`;
  const priority = input.priority ?? defaultPriorityFor(input.source);
  const ingredients = recipeIngredientsToStacks(recipe);

  const job: CraftingJob = {
    id,
    recipeId: input.recipeId,
    workbenchId: input.workbenchId,
    inventorySource: input.inventorySource,
    inputBuffer: [],
    status: "queued",
    priority,
    source: input.source,
    enqueuedAt: seq,
    startedAt: null,
    finishesAt: null,
    progress: 0,
    ingredients,
    output: { itemId: asItemId(recipe.outputItem), count: recipe.outputAmount },
    processingTime: Math.max(0, recipe.processingTime | 0),
    reservationOwnerId: id,
  };

  return {
    ok: true,
    queue: {
      jobs: [...queue.jobs, job],
      nextJobSeq: seq + 1,
      lastError: null,
    },
    job,
  };
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export type CancelResult =
  | {
      readonly ok: true;
      readonly queue: CraftingQueueState;
      /**
       * The status the job was in BEFORE cancellation. Callers (the reducer)
       * use this to decide whether reservations need to be released.
       */
      readonly previousStatus: JobStatus;
      readonly job: CraftingJob;
    }
  | { readonly ok: false; readonly queue: CraftingQueueState; readonly error: CraftingError };

/**
 * Mark a job as cancelled. Already-terminal jobs (`done`, `cancelled`) are
 * left untouched and report a business error via lastError.
 */
export function cancelJob(
  queue: CraftingQueueState,
  jobId: JobId,
): CancelResult {
  const idx = queue.jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) {
    const err: CraftingError = {
      kind: "UNKNOWN_JOB",
      message: `Job "${jobId}" does not exist.`,
      jobId,
    };
    return { ok: false, queue: { ...queue, lastError: err }, error: err };
  }
  const job = queue.jobs[idx];
  if (job.status === "done" || job.status === "cancelled" || job.status === "delivering") {
    const err: CraftingError = {
      kind: "INVALID_TRANSITION",
      message: `Job "${jobId}" is terminal (${job.status}); cannot cancel.`,
      jobId,
    };
    return { ok: false, queue: { ...queue, lastError: err }, error: err };
  }
  const updated: CraftingJob = { ...job, status: "cancelled" };
  return {
    ok: true,
    queue: {
      ...queue,
      jobs: [
        ...queue.jobs.slice(0, idx),
        updated,
        ...queue.jobs.slice(idx + 1),
      ],
      lastError: null,
    },
    previousStatus: job.status,
    job: updated,
  };
}

// ---------------------------------------------------------------------------
// Reorder / re-prioritise (waiting jobs only)
// ---------------------------------------------------------------------------

/**
 * Status set considered "waiting" and therefore safe to reorder/reprioritise.
 * Active (`crafting`/`delivering`) and terminal (`done`/`cancelled`) jobs are
 * never moved.
 */
const REORDERABLE: ReadonlySet<JobStatus> = new Set<JobStatus>(["queued", "reserved"]);

export type MoveDirection = "up" | "down" | "top";

export type MoveResult =
  | { readonly ok: true; readonly queue: CraftingQueueState }
  | { readonly ok: false; readonly queue: CraftingQueueState; readonly error: CraftingError };

export type SetPriorityResult = MoveResult;

function notReorderableError(jobId: JobId, reason: string): CraftingError {
  return {
    kind: "INVALID_TRANSITION",
    message: `Job "${jobId}" cannot be reordered: ${reason}`,
    jobId,
  };
}

/**
 * Move a waiting job within its workbench's waiting list.
 *
 * Implementation: jobs are sorted globally by `(priority, enqueuedAt)`.
 * To swap two adjacent waiting jobs of the same workbench, we swap BOTH
 * `priority` and `enqueuedAt` between them — that guarantees their sort
 * positions trade places no matter what other queue contents look like.
 *
 * "top" promotes the job to `high` priority and gives it a sentinel
 * `enqueuedAt = (min waiting enqueuedAt) - 1`, so it sorts strictly before
 * every other waiting job in the queue. The monotonic `nextJobSeq` is
 * untouched.
 *
 * Reservations are keyed by job id (`reservationOwnerId`) and therefore
 * remain valid across any reorder.
 */
export function moveJob(
  queue: CraftingQueueState,
  jobId: JobId,
  direction: MoveDirection,
): MoveResult {
  const idx = queue.jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) {
    const err: CraftingError = { kind: "UNKNOWN_JOB", message: `Job "${jobId}" does not exist.`, jobId };
    return { ok: false, queue: { ...queue, lastError: err }, error: err };
  }
  const job = queue.jobs[idx];
  if (!REORDERABLE.has(job.status)) {
    const err = notReorderableError(jobId, `status is ${job.status}`);
    return { ok: false, queue: { ...queue, lastError: err }, error: err };
  }

  if (direction === "top") {
    const waiting = queue.jobs.filter((j) => REORDERABLE.has(j.status));
    const minSeq = waiting.reduce((m, j) => Math.min(m, j.enqueuedAt), job.enqueuedAt);
    const promoted: CraftingJob = { ...job, priority: "high", enqueuedAt: minSeq - 1 };
    return {
      ok: true,
      queue: {
        ...queue,
        jobs: queue.jobs.map((j, i) => (i === idx ? promoted : j)),
        lastError: null,
      },
    };
  }

  // Find the adjacent waiting neighbour for this workbench in sorted order.
  const sortedWaitingForWb = sortByPriorityFifo(
    queue.jobs.filter((j) => j.workbenchId === job.workbenchId && REORDERABLE.has(j.status)),
  );
  const sortedIdx = sortedWaitingForWb.findIndex((j) => j.id === jobId);
  const neighbourSortedIdx = direction === "up" ? sortedIdx - 1 : sortedIdx + 1;
  if (neighbourSortedIdx < 0 || neighbourSortedIdx >= sortedWaitingForWb.length) {
    // Already at the requested edge; treat as no-op success (clear lastError).
    return { ok: true, queue: { ...queue, lastError: null } };
  }
  const neighbour = sortedWaitingForWb[neighbourSortedIdx];
  const neighbourIdx = queue.jobs.findIndex((j) => j.id === neighbour.id);

  const swappedJob: CraftingJob = { ...job, priority: neighbour.priority, enqueuedAt: neighbour.enqueuedAt };
  const swappedNeighbour: CraftingJob = { ...neighbour, priority: job.priority, enqueuedAt: job.enqueuedAt };

  return {
    ok: true,
    queue: {
      ...queue,
      jobs: queue.jobs.map((j, i) => {
        if (i === idx) return swappedJob;
        if (i === neighbourIdx) return swappedNeighbour;
        return j;
      }),
      lastError: null,
    },
  };
}

/**
 * Change the priority of a waiting job. Active and terminal jobs are
 * rejected to keep scheduler invariants intact.
 */
export function setJobPriority(
  queue: CraftingQueueState,
  jobId: JobId,
  priority: JobPriority,
): SetPriorityResult {
  const idx = queue.jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) {
    const err: CraftingError = { kind: "UNKNOWN_JOB", message: `Job "${jobId}" does not exist.`, jobId };
    return { ok: false, queue: { ...queue, lastError: err }, error: err };
  }
  const job = queue.jobs[idx];
  if (!REORDERABLE.has(job.status)) {
    const err = notReorderableError(jobId, `status is ${job.status}`);
    return { ok: false, queue: { ...queue, lastError: err }, error: err };
  }
  if (job.priority === priority) {
    return { ok: true, queue: { ...queue, lastError: null } };
  }
  const updated: CraftingJob = { ...job, priority };
  return {
    ok: true,
    queue: {
      ...queue,
      jobs: queue.jobs.map((j, i) => (i === idx ? updated : j)),
      lastError: null,
    },
  };
}

const ALLOWED: Readonly<Record<JobStatus, ReadonlySet<JobStatus>>> = {
  queued: new Set<JobStatus>(["reserved", "cancelled"]),
  reserved: new Set<JobStatus>(["crafting", "cancelled"]),
  crafting: new Set<JobStatus>(["delivering", "cancelled"]),
  delivering: new Set<JobStatus>(["done"]),
  done: new Set<JobStatus>([]),
  cancelled: new Set<JobStatus>([]),
};

/**
 * Throw on any disallowed status transition. We treat this as a programmer
 * error: the scheduler is the only caller and a violation means a logic bug.
 */
export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!ALLOWED[from].has(to)) {
    throw new Error(
      `[crafting] Invalid status transition: ${from} → ${to}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Stable order: priority asc (high first), then enqueuedAt asc. */
export function sortByPriorityFifo(
  jobs: readonly CraftingJob[],
): readonly CraftingJob[] {
  return [...jobs].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return a.enqueuedAt - b.enqueuedAt;
  });
}

export function getJobsForWorkbench(
  queue: CraftingQueueState,
  workbenchId: WorkbenchId,
): readonly CraftingJob[] {
  return queue.jobs.filter((j) => j.workbenchId === workbenchId);
}

export function getActiveCraftingJob(
  queue: CraftingQueueState,
  workbenchId: WorkbenchId,
): CraftingJob | null {
  return (
    queue.jobs.find(
      (j) => j.workbenchId === workbenchId && (j.status === "crafting" || j.status === "delivering"),
    ) ?? null
  );
}

export function isWorkbenchBusy(
  queue: CraftingQueueState,
  workbenchId: WorkbenchId,
): boolean {
  return getActiveCraftingJob(queue, workbenchId) !== null;
}

// Re-export the empty constructor for convenience.
export { createEmptyCraftingQueue };
