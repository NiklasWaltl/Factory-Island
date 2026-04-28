// ============================================================
// Factory Island - Reservation Model (Step 2)
// ------------------------------------------------------------
// Pure data types for the network reservation layer. No state,
// no logic, no UI.
// ============================================================

import type { ItemId, ItemStack } from "../items/types";

/** Stable, deterministic identifier for a single reservation. */
export type ReservationId = string;

/**
 * Who owns this reservation. Step 2 is intentionally generic so the
 * (later) CraftingJob layer can plug in without churn.
 *
 * - "crafting_job":   reserved by a workbench/job in the queue.
 * - "system_request": reserved by an internal subsystem (tests, drones,
 *                     auto-routing). Useful for ad-hoc holds.
 */
export type ReservationOwnerKind = "crafting_job" | "system_request";

/**
 * A live reservation: one item, one amount, one owner.
 * A multi-ingredient "batch" reservation is modelled as N Reservation
 * entries that share the same `ownerId` and `createdAt`.
 *
 * A reservation EXISTS only while it is active. Committed and cancelled
 * reservations are removed from the list — there is no terminal status.
 */
export interface Reservation {
  readonly id: ReservationId;
  readonly itemId: ItemId;
  readonly amount: number;
  readonly ownerKind: ReservationOwnerKind;
  readonly ownerId: string;
  /** Optional logical stock scope (for example: global, warehouse:wh-1, zone:z-1). */
  readonly scopeKey?: string;
  /** Game tick / arbitrary monotonically increasing number provided by caller. */
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// Result / error shapes
// ---------------------------------------------------------------------------

/** Per-item shortfall on a failed batch reservation. */
export interface MissingItem {
  readonly itemId: ItemId;
  readonly requested: number;
  readonly available: number;
}

export type NetworkErrorKind =
  | "INSUFFICIENT_STOCK"
  | "UNKNOWN_RESERVATION"
  | "EMPTY_BATCH";

export interface NetworkError {
  readonly kind: NetworkErrorKind;
  readonly message: string;
  /** Set for INSUFFICIENT_STOCK. */
  readonly missing?: readonly MissingItem[];
  /** Set for UNKNOWN_RESERVATION. */
  readonly reservationId?: ReservationId;
}

/** Outcome of a `reserveBatch` attempt (pure, no state mutation). */
export type ReserveBatchResult =
  | { readonly ok: true; readonly newReservations: readonly Reservation[] }
  | { readonly ok: false; readonly error: NetworkError };

// ---------------------------------------------------------------------------
// Slice shape
// ---------------------------------------------------------------------------

/**
 * Reservation slice held inside `GameState`. Kept tiny on purpose.
 *
 * - `reservations`:     all currently active reservations (any owner).
 * - `nextReservationId`: monotonic counter used to mint deterministic ids.
 * - `lastError`:        outcome of the most recent NETWORK_* action that
 *                       failed for business reasons (NOT for programmer
 *                       errors, which throw). Cleared on the next
 *                       successful network action.
 */
export interface NetworkSlice {
  readonly reservations: readonly Reservation[];
  readonly nextReservationId: number;
  readonly lastError: NetworkError | null;
}

export function createEmptyNetworkSlice(): NetworkSlice {
  return { reservations: [], nextReservationId: 1, lastError: null };
}

// ---------------------------------------------------------------------------
// Action union (lives here so reducer.ts can import without cycles)
// ---------------------------------------------------------------------------

export type NetworkAction =
  | {
      readonly type: "NETWORK_RESERVE_BATCH";
      readonly items: readonly ItemStack[];
      readonly ownerKind: ReservationOwnerKind;
      readonly ownerId: string;
      readonly scopeKey?: string;
      /** Optional caller-supplied tick. Defaults to 0. */
      readonly tick?: number;
    }
  | {
      readonly type: "NETWORK_COMMIT_RESERVATION";
      readonly reservationId: ReservationId;
    }
  | {
      readonly type: "NETWORK_COMMIT_BY_OWNER";
      readonly ownerKind: ReservationOwnerKind;
      readonly ownerId: string;
    }
  | {
      readonly type: "NETWORK_CANCEL_RESERVATION";
      readonly reservationId: ReservationId;
    }
  | {
      readonly type: "NETWORK_CANCEL_BY_OWNER";
      readonly ownerKind: ReservationOwnerKind;
      readonly ownerId: string;
    };
