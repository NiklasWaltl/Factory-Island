// ============================================================
// Crafting tick — job lifecycle helpers
// ------------------------------------------------------------
// Pure transitions that act on a single CraftingJob:
//   • finishCraftingJob     crafting → delivering (drone pickup)
//   • cancelReservedJob     reserved/crafting → cancelled
//   • releaseJobReservations  release reservations on player cancel
// Plus the DEV-only invariant assertion + reservation-aggregation
// helpers shared with the orchestrator's reservation phase.
// ============================================================

import { debugLog } from "../../debug/debugLogger";
import type { Inventory, ServiceHubEntry } from "../../store/types";
import type { ItemId, WarehouseId } from "../../items/types";
import { applyNetworkAction } from "../../inventory/reservations";
import type { NetworkSlice } from "../../inventory/reservationTypes";
import { assertTransition } from "../queue/queue";
import type { CraftingJob } from "../types";

export function ownerItemKey(ownerId: string, itemId: ItemId): string {
  return `${ownerId}::${itemId}`;
}

export function getReservedAmountForCraftingOwnerItem(
  network: NetworkSlice,
  ownerId: string,
  itemId: ItemId,
): number {
  let total = 0;
  for (const reservation of network.reservations) {
    if (reservation.ownerKind !== "crafting_job") continue;
    if (reservation.ownerId !== ownerId) continue;
    if (reservation.itemId !== itemId) continue;
    total += reservation.amount;
  }
  return total;
}

export function assertCraftingNetworkCrossInvariants(
  network: NetworkSlice,
  jobs: readonly CraftingJob[],
): void {
  const ownerToJob = new Map<string, CraftingJob>();
  for (const job of jobs) {
    ownerToJob.set(job.reservationOwnerId, job);
  }

  const ownerItemReserved = new Map<string, number>();
  for (const reservation of network.reservations) {
    if (!Number.isFinite(reservation.amount) || reservation.amount <= 0) {
      throw new Error(
        `[crafting] Invariant violated: reservation "${reservation.id}" has invalid amount ${reservation.amount}.`,
      );
    }
    if (reservation.ownerKind !== "crafting_job") continue;

    const ownerJob = ownerToJob.get(reservation.ownerId);
    if (!ownerJob) {
      throw new Error(
        `[crafting] Invariant violated: reservation "${reservation.id}" references missing job owner "${reservation.ownerId}".`,
      );
    }

    const key = ownerItemKey(reservation.ownerId, reservation.itemId);
    ownerItemReserved.set(key, (ownerItemReserved.get(key) ?? 0) + reservation.amount);
  }

  for (const job of jobs) {
    for (const ingredient of job.ingredients) {
      const reserved = ownerItemReserved.get(ownerItemKey(job.reservationOwnerId, ingredient.itemId)) ?? 0;
      if (!Number.isFinite(reserved) || reserved < 0) {
        throw new Error(
          `[crafting] Invariant violated: negative/invalid reservation sum for owner "${job.reservationOwnerId}" item "${ingredient.itemId}".`,
        );
      }

      if (job.status === "queued" || job.status === "reserved") {
        if (reserved > ingredient.count) {
          throw new Error(
            `[crafting] Invariant violated: reserved ${reserved} exceeds required ${ingredient.count} for owner "${job.reservationOwnerId}" item "${ingredient.itemId}".`,
          );
        }
        continue;
      }

      if (reserved !== 0) {
        throw new Error(
          `[crafting] Invariant violated: non-queued/non-reserved job "${job.id}" (status=${job.status}) still owns reservations for "${ingredient.itemId}" (${reserved}).`,
        );
      }
    }
  }
}

export function finishCraftingJob(
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

export function getBufferedAmount(
  job: CraftingJob,
  itemId: CraftingJob["ingredients"][number]["itemId"],
): number {
  return (job.inputBuffer ?? []).reduce(
    (sum, stack) => sum + (stack.itemId === itemId ? stack.count : 0),
    0,
  );
}

export function hasBufferedIngredients(job: CraftingJob): boolean {
  return job.ingredients.every(
    (ingredient) => getBufferedAmount(job, ingredient.itemId) >= ingredient.count,
  );
}

export function cancelReservedJob(
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
