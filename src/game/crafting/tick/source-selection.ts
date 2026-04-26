// ============================================================
// Crafting tick — physical source selection
// ------------------------------------------------------------
// Pure: given a logical CraftingInventorySource + an ingredient,
// pick a concrete (warehouse|hub) physical source that can supply
// the required count, respecting reservations and proximity.
// Lane semantics:
//   • primary  — warehouses scoped to the source
//   • fallback — service hubs (only for hub-collectable items)
// No mutation, no I/O.
// ============================================================

import type {
  CollectableItemType,
  Inventory,
  PlacedAsset,
  ServiceHubEntry,
} from "../../store/reducer";
import type { ItemId, WarehouseId } from "../../items/types";
import type { NetworkSlice } from "../../inventory/reservationTypes";
import type { CraftingInventorySource } from "../types";
import { GLOBAL_SOURCE_SCOPE_KEY } from "./hub-inventory-view";

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
