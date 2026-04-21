// ============================================================
// Factory Island - Reservation Logic (Step 2)
// ------------------------------------------------------------
// Pure functions over (warehouseInventories, networkSlice).
// No React, no I/O, no GameState coupling beyond the small
// structural slice required for stock aggregation.
// ============================================================

import type { Inventory } from "../store/reducer";
import {
  assertItemExists,
  isKnownItemId,
} from "../items/registry";
import type { ItemId, ItemStack, WarehouseId } from "../items/types";
import { getNetworkAmount, type NetworkStateSlice } from "./network";
import type {
  MissingItem,
  NetworkAction,
  NetworkError,
  NetworkSlice,
  Reservation,
  ReservationId,
  ReservationOwnerKind,
  ReserveBatchResult,
} from "./reservationTypes";
import { createEmptyNetworkSlice } from "./reservationTypes";

// ---------------------------------------------------------------------------
// Combined slice used by every helper
// ---------------------------------------------------------------------------

/**
 * Minimal structural input every reservation helper needs:
 * physical stock (per warehouse) + the reservation slice.
 */
export interface ReservationStateSlice extends NetworkStateSlice {
  readonly network: NetworkSlice;
}

function reservationMatchesScope(
  reservation: Reservation,
  scopeKey?: string,
): boolean {
  if (scopeKey === undefined) return true;
  return reservation.scopeKey === scopeKey;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Sum of all active reservations for an item. */
export function getReservedAmount(
  state: ReservationStateSlice,
  itemId: ItemId,
  scopeKey?: string,
): number {
  let sum = 0;
  for (const r of state.network.reservations) {
    if (r.itemId === itemId && reservationMatchesScope(r, scopeKey)) {
      sum += r.amount;
    }
  }
  return sum;
}

/**
 * Free = stored - reserved. Never negative.
 * If the invariant would be violated, that's data corruption: throw.
 */
export function getFreeAmount(
  state: ReservationStateSlice,
  itemId: ItemId,
  scopeKey?: string,
): number {
  const stored = getNetworkAmount(state, itemId);
  const reserved = getReservedAmount(state, itemId, scopeKey);
  const free = stored - reserved;
  if (free < 0) {
    throw new Error(
      `[reservations] Invariant violated: free<0 for "${itemId}" (stored=${stored}, reserved=${reserved})`,
    );
  }
  return free;
}

/** All active reservations for an owner, in registry / insertion order. */
export function getAllReservedByOwner(
  state: ReservationStateSlice,
  ownerKind: ReservationOwnerKind,
  ownerId: string,
): readonly Reservation[] {
  return state.network.reservations.filter(
    (r) => r.ownerKind === ownerKind && r.ownerId === ownerId,
  );
}

/** All active reservations targeting a single item. */
export function getReservationsForItem(
  state: ReservationStateSlice,
  itemId: ItemId,
): readonly Reservation[] {
  return state.network.reservations.filter((r) => r.itemId === itemId);
}

// ---------------------------------------------------------------------------
// Pure batch-reserve preview (no mutation)
// ---------------------------------------------------------------------------

/**
 * Validates and aggregates a requested batch.
 * - Throws on programmer errors (unknown item, non-positive amount).
 * - Returns business-error result when stock is insufficient.
 *
 * Items requested multiple times in the same batch are aggregated
 * (e.g. [{wood,2},{wood,3}] → wood,5) BEFORE checking availability.
 */
export function previewReserveBatch(
  state: ReservationStateSlice,
  items: readonly ItemStack[],
  scopeKey?: string,
): ReserveBatchResult {
  if (items.length === 0) {
    return {
      ok: false,
      error: {
        kind: "EMPTY_BATCH",
        message: "Cannot reserve an empty batch.",
      },
    };
  }

  // Aggregate per item, validate inputs.
  const requested = new Map<ItemId, number>();
  for (const stack of items) {
    if (!isKnownItemId(stack.itemId)) {
      throw new Error(`[reservations] Unknown item id: ${String(stack.itemId)}`);
    }
    if (!Number.isFinite(stack.count) || stack.count <= 0) {
      throw new Error(
        `[reservations] Invalid amount for "${stack.itemId}": ${stack.count}`,
      );
    }
    requested.set(stack.itemId, (requested.get(stack.itemId) ?? 0) + stack.count);
  }

  // All-or-nothing availability check.
  const missing: MissingItem[] = [];
  for (const [itemId, amount] of requested) {
    const free = getFreeAmount(state, itemId, scopeKey);
    if (free < amount) {
      missing.push({ itemId, requested: amount, available: free });
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        kind: "INSUFFICIENT_STOCK",
        message: `Insufficient stock for ${missing.length} item(s).`,
        missing,
      },
    };
  }

  // Synthesize reservations (no IDs yet — caller / reducer assigns).
  const stub: Reservation[] = [];
  for (const [itemId, amount] of requested) {
    stub.push({
      id: "<pending>",
      itemId,
      amount,
      ownerKind: "system_request",
      ownerId: "<pending>",
      ...(scopeKey !== undefined ? { scopeKey } : {}),
      createdAt: 0,
    });
  }
  return { ok: true, newReservations: stub };
}

// ---------------------------------------------------------------------------
// State-producing operations (used by the reducer)
// ---------------------------------------------------------------------------

/**
 * Apply a successful batch reservation, minting deterministic IDs.
 * Caller must have already validated availability via `previewReserveBatch`.
 */
function appendReservations(
  slice: NetworkSlice,
  itemAmounts: ReadonlyMap<ItemId, number>,
  ownerKind: ReservationOwnerKind,
  ownerId: string,
  createdAt: number,
  scopeKey?: string,
): { slice: NetworkSlice; created: readonly Reservation[] } {
  const created: Reservation[] = [];
  let nextId = slice.nextReservationId;
  for (const [itemId, amount] of itemAmounts) {
    created.push({
      id: `res-${nextId}`,
      itemId,
      amount,
      ownerKind,
      ownerId,
      ...(scopeKey !== undefined ? { scopeKey } : {}),
      createdAt,
    });
    nextId += 1;
  }
  return {
    slice: {
      reservations: [...slice.reservations, ...created],
      nextReservationId: nextId,
      lastError: null,
    },
    created,
  };
}

/**
 * Subtract `amount` of `itemId` from physical warehouses, greedily,
 * iterating warehouse ids in sorted (deterministic) order.
 *
 * If physical stock is less than `amount`, that means a reservation
 * existed without backing stock — a hard invariant violation that we
 * surface loudly via throw.
 */
function decrementPhysicalStock(
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>,
  itemId: ItemId,
  amount: number,
): Record<WarehouseId, Inventory> {
  // Defensive: ensure the item is registered (programmer error otherwise).
  assertItemExists(itemId);

  const next: Record<WarehouseId, Inventory> = { ...warehouseInventories };
  let remaining = amount;
  const ids = Object.keys(next).sort();
  for (const whId of ids) {
    if (remaining <= 0) break;
    const inv = next[whId];
    if (!inv) continue;
    const current = (inv as unknown as Record<string, number>)[itemId] ?? 0;
    if (current <= 0) continue;
    const take = Math.min(current, remaining);
    const updated: Inventory = {
      ...inv,
      [itemId]: current - take,
    } as Inventory;
    next[whId] = updated;
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(
      `[reservations] Invariant violated: cannot commit ${amount} "${itemId}" — ` +
        `physical stock short by ${remaining}.`,
    );
  }
  return next;
}

// ---------------------------------------------------------------------------
// applyNetworkAction
// ---------------------------------------------------------------------------

/**
 * Apply a NetworkAction to the (warehouseInventories + network slice) pair.
 *
 * Returns BOTH potentially-changed pieces so the outer reducer can wire them
 * into GameState without leaking knowledge of unrelated fields.
 *
 * Business failures (insufficient stock, unknown reservation id) are stored
 * on `network.lastError` — they do NOT throw. Programmer errors (negative
 * amount, unknown item id) DO throw via the helpers above.
 */
export function applyNetworkAction(
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>,
  network: NetworkSlice,
  action: NetworkAction,
): {
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  network: NetworkSlice;
} {
  switch (action.type) {
    case "NETWORK_RESERVE_BATCH": {
      const slice: ReservationStateSlice = {
        warehouseInventories,
        network,
      };
      const scopedPreview = previewReserveBatch(slice, action.items, action.scopeKey);
      if (!scopedPreview.ok) {
        return {
          warehouseInventories,
          network: { ...network, lastError: scopedPreview.error },
        };
      }
      // Re-aggregate for deterministic ID minting (preview also aggregated).
      const aggregated = new Map<ItemId, number>();
      for (const r of scopedPreview.newReservations) {
        aggregated.set(r.itemId, (aggregated.get(r.itemId) ?? 0) + r.amount);
      }
      const { slice: nextSlice } = appendReservations(
        network,
        aggregated,
        action.ownerKind,
        action.ownerId,
        action.tick ?? 0,
        action.scopeKey,
      );
      return { warehouseInventories, network: nextSlice };
    }

    case "NETWORK_COMMIT_RESERVATION": {
      const idx = network.reservations.findIndex(
        (r) => r.id === action.reservationId,
      );
      if (idx < 0) {
        return {
          warehouseInventories,
          network: {
            ...network,
            lastError: {
              kind: "UNKNOWN_RESERVATION",
              message: `Reservation "${action.reservationId}" does not exist.`,
              reservationId: action.reservationId,
            },
          },
        };
      }
      const r = network.reservations[idx];
      const nextWarehouses = decrementPhysicalStock(
        warehouseInventories,
        r.itemId,
        r.amount,
      );
      const nextReservations = [
        ...network.reservations.slice(0, idx),
        ...network.reservations.slice(idx + 1),
      ];
      return {
        warehouseInventories: nextWarehouses,
        network: {
          ...network,
          reservations: nextReservations,
          lastError: null,
        },
      };
    }

    case "NETWORK_COMMIT_BY_OWNER": {
      const matching = network.reservations.filter(
        (r) =>
          r.ownerKind === action.ownerKind && r.ownerId === action.ownerId,
      );
      if (matching.length === 0) {
        return {
          warehouseInventories,
          network: {
            ...network,
            lastError: {
              kind: "UNKNOWN_RESERVATION",
              message: `No reservations for owner "${action.ownerKind}:${action.ownerId}".`,
            },
          },
        };
      }
      let nextWarehouses: Readonly<Record<WarehouseId, Inventory>> =
        warehouseInventories;
      for (const r of matching) {
        nextWarehouses = decrementPhysicalStock(
          nextWarehouses,
          r.itemId,
          r.amount,
        );
      }
      const matchingIds = new Set(matching.map((r) => r.id));
      return {
        warehouseInventories: nextWarehouses,
        network: {
          ...network,
          reservations: network.reservations.filter(
            (r) => !matchingIds.has(r.id),
          ),
          lastError: null,
        },
      };
    }

    case "NETWORK_CANCEL_RESERVATION": {
      const idx = network.reservations.findIndex(
        (r) => r.id === action.reservationId,
      );
      if (idx < 0) {
        return {
          warehouseInventories,
          network: {
            ...network,
            lastError: {
              kind: "UNKNOWN_RESERVATION",
              message: `Reservation "${action.reservationId}" does not exist.`,
              reservationId: action.reservationId,
            },
          },
        };
      }
      return {
        warehouseInventories,
        network: {
          ...network,
          reservations: [
            ...network.reservations.slice(0, idx),
            ...network.reservations.slice(idx + 1),
          ],
          lastError: null,
        },
      };
    }

    case "NETWORK_CANCEL_BY_OWNER": {
      const matching = network.reservations.filter(
        (r) =>
          r.ownerKind === action.ownerKind && r.ownerId === action.ownerId,
      );
      if (matching.length === 0) {
        return {
          warehouseInventories,
          network: {
            ...network,
            lastError: {
              kind: "UNKNOWN_RESERVATION",
              message: `No reservations for owner "${action.ownerKind}:${action.ownerId}".`,
            },
          },
        };
      }
      const matchingIds = new Set(matching.map((r) => r.id));
      return {
        warehouseInventories,
        network: {
          ...network,
          reservations: network.reservations.filter(
            (r) => !matchingIds.has(r.id),
          ),
          lastError: null,
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Save/Load helper
// ---------------------------------------------------------------------------

/**
 * Normalise a possibly-missing or partially-populated network slice
 * coming from an older save. Always returns a fully-formed slice.
 *
 * Reservations from older saves are intentionally DROPPED — they have no
 * matching crafting jobs in the new system and would otherwise pin stock.
 */
export function normalizeNetworkSlice(
  raw: Partial<NetworkSlice> | undefined | null,
): NetworkSlice {
  if (!raw) return createEmptyNetworkSlice();
  // Drop any persisted reservations on load (see comment above).
  const nextId =
    typeof raw.nextReservationId === "number" && raw.nextReservationId >= 1
      ? raw.nextReservationId
      : 1;
  return {
    reservations: [],
    nextReservationId: nextId,
    lastError: null,
  };
}
