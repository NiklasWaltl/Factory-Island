// ============================================================
// Factory Island - Crafting Output Routing (Step 3)
// ------------------------------------------------------------
// Pure routing: given finished output, decide where it lands.
// MVP rule: first warehouse (sorted by id) gets the deposit.
// If no warehouse exists, fall back to the global inventory pool.
// This fallback is deliberate, deterministic and documented —
// not a silent catch-all.
// ============================================================

import { isPlayerGear, isSeed } from "../items/registry";
import type { ItemStack, WarehouseId } from "../items/types";
import type { Inventory } from "../store/reducer";
import type { CraftingInventorySource } from "./types";

export interface RouteOutputInput {
  readonly warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  readonly globalInventory: Inventory;
  readonly stack: ItemStack;
  readonly source: CraftingInventorySource;
}

export interface RouteOutputResult {
  readonly warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  readonly globalInventory: Inventory;
  readonly logicalSection: "player_gear" | "seed" | "storage";
  /** Where the items actually landed. Useful for tests and UI feedback. */
  readonly destination:
    | { readonly kind: "warehouse"; readonly id: WarehouseId }
    | { readonly kind: "global" };
}

/**
 * Deposit a finished crafting output stack.
 *
 * Routing rules:
 * 1. `global` jobs deposit into the global inventory.
 * 2. `warehouse` jobs deposit back into that warehouse if it still exists.
 * 3. `zone` jobs deposit into the first available warehouse of that zone.
 * 4. If the intended physical destination no longer exists, fall back to the
 *    global inventory so output is never lost silently.
 *
 * `logicalSection` is metadata only. It keeps `player_gear` / `seed`
 * categorisation visible for UI/debugging without directly touching the hotbar.
 */
export function routeOutput(input: RouteOutputInput): RouteOutputResult {
  const { warehouseInventories, globalInventory, stack, source } = input;
  const logicalSection = getLogicalSection(stack.itemId);

  if (source.kind === "global") {
    return {
      warehouseInventories,
      globalInventory: depositInto(globalInventory, stack),
      logicalSection,
      destination: { kind: "global" },
    };
  }

  if (source.kind === "warehouse") {
    const targetInv = warehouseInventories[source.warehouseId];
    if (!targetInv) {
      return {
        warehouseInventories,
        globalInventory: depositInto(globalInventory, stack),
        logicalSection,
        destination: { kind: "global" },
      };
    }
    return {
      warehouseInventories: {
        ...warehouseInventories,
        [source.warehouseId]: depositInto(targetInv, stack),
      },
      globalInventory,
      logicalSection,
      destination: { kind: "warehouse", id: source.warehouseId },
    };
  }

  const zoneIds = source.warehouseIds.filter((id) => warehouseInventories[id]).sort();
  if (zoneIds.length === 0) {
    return {
      warehouseInventories,
      globalInventory: depositInto(globalInventory, stack),
      logicalSection,
      destination: { kind: "global" },
    };
  }

  const targetId = zoneIds[0];
  const targetInv = warehouseInventories[targetId];
  const updated: Record<WarehouseId, Inventory> = {
    ...warehouseInventories,
    [targetId]: depositInto(targetInv, stack),
  };
  return {
    warehouseInventories: updated,
    globalInventory,
    logicalSection,
    destination: { kind: "warehouse", id: targetId },
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
