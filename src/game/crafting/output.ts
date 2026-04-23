// ============================================================
// Factory Island - Crafting Output Routing (Step 3)
// ------------------------------------------------------------
// Pure routing: given finished output, decide where it lands.
//
// Routing principles:
// - Keep existing source semantics (global stays global).
// - For physical sources, prefer a valid local warehouse destination.
// - If a physical destination is gone, use deterministic fallback:
//   hub (collectable raw resources only) -> global inventory.
// ============================================================

import { isPlayerGear, isSeed } from "../items/registry";
import type { ItemStack, WarehouseId } from "../items/types";
import type { Inventory, PlacedAsset, ServiceHubEntry } from "../store/reducer";
import type { CraftingInventorySource } from "./types";

export interface RouteOutputInput {
  readonly warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  readonly globalInventory: Inventory;
  readonly serviceHubs?: Readonly<Record<string, ServiceHubEntry>>;
  readonly assets?: Readonly<Record<string, PlacedAsset>>;
  readonly preferredFromAssetId?: string | null;
  readonly stack: ItemStack;
  readonly source: CraftingInventorySource;
}

export interface OutputDestinationOptions {
  readonly assets?: Readonly<Record<string, PlacedAsset>>;
  readonly preferredFromAssetId?: string | null;
}

export interface ResolveOutputDestinationInput {
  readonly source: CraftingInventorySource;
  readonly stackItemId: ItemStack["itemId"];
  readonly warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  readonly serviceHubs?: Readonly<Record<string, ServiceHubEntry>>;
  readonly assets?: Readonly<Record<string, PlacedAsset>>;
  readonly preferredFromAssetId?: string | null;
}

/**
 * Shared single-source-of-truth for picking the destination warehouse of a
 * non-global crafting source (used by both the live `routeOutput` and the
 * Auto-Craft planner). Returns `null` if no warehouse is currently available.
 *
 * Deterministic local rule:
 * - if `preferredFromAssetId` resolves to an asset, choose nearest warehouse
 *   by Chebyshev distance (tie-break by id)
 * - otherwise, use deterministic alphabetical ordering
 *
 * Keeping this helper shared prevents planner/runtime divergence.
 */
export function pickOutputWarehouseId(
  source: CraftingInventorySource,
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>,
  options?: OutputDestinationOptions,
): WarehouseId | null {
  const assets = options?.assets;
  const preferredFromAssetId = options?.preferredFromAssetId ?? null;

  if (source.kind === "global") return null;

  if (source.kind === "warehouse") {
    if (!warehouseInventories[source.warehouseId]) return null;
    if (assets && assets[source.warehouseId]?.type !== "warehouse") return null;
    return source.warehouseId;
  }

  const candidateIds = source.warehouseIds.filter((id) => {
    if (!warehouseInventories[id]) return false;
    if (assets && assets[id]?.type !== "warehouse") return false;
    return true;
  });

  const ordered = sortByPreferredDistance(candidateIds, assets, preferredFromAssetId);
  return (ordered[0] ?? null) as WarehouseId | null;
}

export type OutputDestination =
  | { readonly kind: "warehouse"; readonly id: WarehouseId }
  | { readonly kind: "hub"; readonly id: string }
  | { readonly kind: "global" };

export function resolveOutputDestination(
  input: ResolveOutputDestinationInput,
): OutputDestination {
  const {
    source,
    stackItemId,
    warehouseInventories,
    serviceHubs,
    assets,
    preferredFromAssetId,
  } = input;

  const warehouseId = pickOutputWarehouseId(source, warehouseInventories, {
    assets,
    preferredFromAssetId,
  });
  if (warehouseId) {
    return { kind: "warehouse", id: warehouseId };
  }

  // Preserve existing semantics for explicit global source jobs.
  if (source.kind === "global") {
    return { kind: "global" };
  }

  const hubId = pickFallbackHubId(stackItemId, serviceHubs, assets, preferredFromAssetId);
  if (hubId) {
    return { kind: "hub", id: hubId };
  }

  return { kind: "global" };
}

export interface RouteOutputResult {
  readonly warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  readonly globalInventory: Inventory;
  readonly serviceHubs: Readonly<Record<string, ServiceHubEntry>>;
  readonly logicalSection: "player_gear" | "seed" | "storage";
  /** Where the items actually landed. Useful for tests and UI feedback. */
  readonly destination: OutputDestination;
}

/**
 * Deposit a finished crafting output stack.
 *
 * Routing rules:
 * 1. Determine one shared destination (`warehouse` / `hub` / `global`).
 * 2. Deposit stack into that destination.
 * 3. If a runtime destination is unexpectedly invalid, fall back to global
 *    so output is never lost.
 *
 * `logicalSection` is metadata only. It keeps `player_gear` / `seed`
 * categorisation visible for UI/debugging without directly touching the hotbar.
 */
export function routeOutput(input: RouteOutputInput): RouteOutputResult {
  const {
    warehouseInventories,
    globalInventory,
    serviceHubs = {},
    assets,
    preferredFromAssetId,
    stack,
    source,
  } = input;
  const logicalSection = getLogicalSection(stack.itemId);
  const destination = resolveOutputDestination({
    source,
    stackItemId: stack.itemId,
    warehouseInventories,
    serviceHubs,
    assets,
    preferredFromAssetId,
  });

  if (destination.kind === "warehouse") {
    const targetInv = warehouseInventories[destination.id];
    if (!targetInv) {
      return {
        warehouseInventories,
        globalInventory: depositInto(globalInventory, stack),
        serviceHubs,
        logicalSection,
        destination: { kind: "global" },
      };
    }
    return {
      warehouseInventories: {
        ...warehouseInventories,
        [destination.id]: depositInto(targetInv, stack),
      },
      globalInventory,
      serviceHubs,
      logicalSection,
      destination,
    };
  }

  if (destination.kind === "hub") {
    const hub = serviceHubs[destination.id];
    if (!hub || !isHubStorableItemId(stack.itemId)) {
      return {
        warehouseInventories,
        globalInventory: depositInto(globalInventory, stack),
        serviceHubs,
        logicalSection,
        destination: { kind: "global" },
      };
    }
    const nextHubInventory = depositIntoHubInventory(hub.inventory, stack.itemId, stack.count);
    return {
      warehouseInventories,
      globalInventory,
      serviceHubs: {
        ...serviceHubs,
        [destination.id]: {
          ...hub,
          inventory: nextHubInventory,
        },
      },
      logicalSection,
      destination,
    };
  }

  return {
    warehouseInventories,
    globalInventory: depositInto(globalInventory, stack),
    serviceHubs,
    logicalSection,
    destination: { kind: "global" },
  };
}

function getLogicalSection(itemId: ItemStack["itemId"]): "player_gear" | "seed" | "storage" {
  if (isPlayerGear(itemId)) return "player_gear";
  if (isSeed(itemId)) return "seed";
  return "storage";
}

function depositInto(inv: Inventory, stack: ItemStack): Inventory {
  const key = stack.itemId as keyof Inventory;
  const current = (inv as unknown as Record<string, number>)[key] ?? 0;
  return {
    ...inv,
    [key]: current + stack.count,
  } as Inventory;
}

type HubStorableItemId = "wood" | "stone" | "iron" | "copper";

function isHubStorableItemId(itemId: ItemStack["itemId"]): itemId is HubStorableItemId {
  return itemId === "wood" || itemId === "stone" || itemId === "iron" || itemId === "copper";
}

function depositIntoHubInventory(
  inv: ServiceHubEntry["inventory"],
  itemId: HubStorableItemId,
  amount: number,
): ServiceHubEntry["inventory"] {
  return {
    ...inv,
    [itemId]: (inv[itemId] ?? 0) + amount,
  };
}

function pickFallbackHubId(
  itemId: ItemStack["itemId"],
  serviceHubs: Readonly<Record<string, ServiceHubEntry>> | undefined,
  assets: Readonly<Record<string, PlacedAsset>> | undefined,
  preferredFromAssetId: string | null | undefined,
): string | null {
  if (!serviceHubs || !isHubStorableItemId(itemId)) return null;

  const hubIds = Object.keys(serviceHubs).filter((hubId) => {
    if (assets && assets[hubId]?.type !== "service_hub") return false;
    return true;
  });

  const ordered = sortByPreferredDistance(hubIds, assets, preferredFromAssetId);
  return ordered[0] ?? null;
}

function sortByPreferredDistance(
  ids: readonly string[],
  assets: Readonly<Record<string, PlacedAsset>> | undefined,
  preferredFromAssetId: string | null | undefined,
): string[] {
  const sortedById = [...ids].sort();
  if (!assets || !preferredFromAssetId) return sortedById;

  const from = assets[preferredFromAssetId];
  if (!from) return sortedById;

  return sortedById.sort((leftId, rightId) => {
    const left = assets[leftId];
    const right = assets[rightId];
    const leftDistance = left ? chebyshevDistance(from.x, from.y, left.x, left.y) : Number.POSITIVE_INFINITY;
    const rightDistance = right ? chebyshevDistance(from.x, from.y, right.x, right.y) : Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return leftId.localeCompare(rightId);
  });
}

function chebyshevDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
