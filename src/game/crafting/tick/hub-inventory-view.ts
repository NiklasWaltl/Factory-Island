// ============================================================
// Crafting tick — hub & source-view adapter layer
// ------------------------------------------------------------
// Pure helpers that translate between:
//   • a `CraftingInventorySource` (logical scope) and
//   • a flat `Record<WarehouseId, Inventory>` view that the
//     network reservation engine understands.
// Plus tiny Hub <-> Inventory adapters used by the warehouse-only
// view of a service hub's collectable stockpile.
// No game logic — purely structural conversion.
// ============================================================

import type { Inventory, ServiceHubEntry } from "../../store/types";
import type { WarehouseId } from "../../items/types";
import type { CraftingInventorySource, CraftingJob } from "../types";

export const GLOBAL_SOURCE_SCOPE_KEY = "crafting:global";
export const GLOBAL_SOURCE_WAREHOUSE_ID = "__crafting_global__" as WarehouseId;
export const GLOBAL_SOURCE_HUB_PREFIX = "__crafting_hub__:";
export const HUB_COLLECTABLE_ITEM_IDS = ["wood", "stone", "iron", "copper"] as const;

export interface SourceView {
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

export function hubInventoriesEqual(
  left: ServiceHubEntry["inventory"],
  right: ServiceHubEntry["inventory"],
): boolean {
  return HUB_COLLECTABLE_ITEM_IDS.every((itemId) => (left[itemId] ?? 0) === (right[itemId] ?? 0));
}

export function getJobInventorySource(job: CraftingJob): CraftingInventorySource {
  const source = (job as CraftingJob & { inventorySource?: CraftingInventorySource }).inventorySource;
  return source ?? { kind: "global" };
}

export function getSourceView(
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

export function mergeSourceView(
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
