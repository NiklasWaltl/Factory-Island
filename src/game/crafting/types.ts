// ============================================================
// Factory Island - Crafting Job Types (Step 3)
// ------------------------------------------------------------
// Pure data types for the CraftingJob / CraftingJobQueue layer.
// No logic, no state, no UI.
// ============================================================

import type { ItemId, ItemStack, WarehouseId } from "../items/types";

export type JobId = string;
export type RecipeId = string;
export type WorkbenchId = string;

/**
 * Lifecycle of a crafting job.
 *
 *   queued      → no reservations held; waiting for ingredients
 *   reserved    → ingredients reserved (Step 2); waiting for free workbench
 *   crafting    → workbench timer running
 *   delivering  → craft completed; waiting for drone pickup/dropoff
 *   done        → terminal: ingredients committed, output deposited
 *   cancelled   → terminal: reservations (if any) released
 *
 * `done_pending_storage` is intentionally OMITTED — warehouses currently
 * have no hard item cap that could reject a deposit.
 */
export type JobStatus =
  | "queued"
  | "reserved"
  | "crafting"
  | "delivering"
  | "done"
  | "cancelled";

export type JobPriority = "high" | "normal" | "low";

export type JobSource = "player" | "automation";

export type CraftingInventorySource =
  | { readonly kind: "global" }
  | { readonly kind: "warehouse"; readonly warehouseId: WarehouseId }
  | {
      readonly kind: "zone";
      readonly zoneId: string;
      readonly warehouseIds: readonly WarehouseId[];
    };

/**
 * Snapshot-style crafting job. Recipe details (`ingredients`, `output`,
 * `processingTime`) are captured at enqueue time so that mid-game recipe
 * edits do not corrupt running jobs.
 */
export interface CraftingJob {
  readonly id: JobId;
  readonly recipeId: RecipeId;
  readonly workbenchId: WorkbenchId;
  /** Snapshot of the physical stock pool this job reads from and writes to. */
  readonly inventorySource: CraftingInventorySource;
  readonly status: JobStatus;
  readonly priority: JobPriority;
  readonly source: JobSource;
  /** Monotonic enqueue sequence (NOT wall-clock). Stable FIFO ordering. */
  readonly enqueuedAt: number;
  /** Wall-clock ms when the job entered `crafting`. Informational. */
  readonly startedAt: number | null;
  /** Wall-clock ms when the job is expected to finish. Informational. */
  readonly finishesAt: number | null;
  /** Number of ticks already spent in `crafting` (0..processingTime). */
  readonly progress: number;
  /** Frozen recipe snapshot. */
  readonly ingredients: readonly ItemStack[];
  readonly output: ItemStack;
  /** Number of ticks the job needs in `crafting`. 0 = instant. */
  readonly processingTime: number;
  /**
   * Owner key used for the network reservation layer.
   * Convention: equals `id`. Stored explicitly to make the link visible.
   */
  readonly reservationOwnerId: string;
}

// ---------------------------------------------------------------------------
// Queue slice and errors
// ---------------------------------------------------------------------------

export type CraftingErrorKind =
  | "UNKNOWN_RECIPE"
  | "UNKNOWN_WORKBENCH"
  | "UNKNOWN_JOB"
  | "INVALID_TRANSITION"
  | "INVALID_OUTPUT_ITEM";

export interface CraftingError {
  readonly kind: CraftingErrorKind;
  readonly message: string;
  readonly jobId?: JobId;
  readonly recipeId?: RecipeId;
  readonly workbenchId?: WorkbenchId;
}

export interface CraftingQueueState {
  readonly jobs: readonly CraftingJob[];
  /** Monotonic counter used to mint stable JobIds and enqueuedAt values. */
  readonly nextJobSeq: number;
  /**
   * Outcome of the most recent JOB_* action that failed for a business
   * reason. Cleared on the next successful action.
   */
  readonly lastError: CraftingError | null;
}

export function createEmptyCraftingQueue(): CraftingQueueState {
  return { jobs: [], nextJobSeq: 1, lastError: null };
}

// ---------------------------------------------------------------------------
// Action union
// ---------------------------------------------------------------------------

export type CraftingAction =
  | {
      readonly type: "JOB_ENQUEUE";
      readonly recipeId: RecipeId;
      readonly workbenchId: WorkbenchId;
      readonly source: JobSource;
      /** Optional override; default is "high" for player, "normal" for automation. */
      readonly priority?: JobPriority;
    }
  | { readonly type: "JOB_CANCEL"; readonly jobId: JobId }
  | { readonly type: "JOB_TICK" };

// ---------------------------------------------------------------------------
// Helpers (small enough to live with the types)
// ---------------------------------------------------------------------------

export const PRIORITY_ORDER: Readonly<Record<JobPriority, number>> = {
  high: 0,
  normal: 1,
  low: 2,
};

export function defaultPriorityFor(source: JobSource): JobPriority {
  return source === "player" ? "high" : "normal";
}

/** Type guard for a string being a known item id is in items/registry; here
 *  we only need a runtime check that an output item id is valid. */
export function asItemId(s: string): ItemId {
  return s as ItemId;
}
