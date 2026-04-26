// ============================================================
// Factory Island – WorkbenchPanel pure helpers
// ------------------------------------------------------------
// Side-effect-free selectors used by the workbench UI. Kept in
// their own module so reducer-level tests can exercise the
// ingredient-status logic without rendering React.
// ============================================================

import { getReservedAmount } from "../../../inventory/reservations";
import { getItemDef, isKnownItemId } from "../../../items/registry";
import type { ItemId } from "../../../items/types";
import type {
  CraftingSource,
  GameState,
  Inventory,
} from "../../../store/types";
import { getZoneWarehouseIds } from "../../../store/reducer";
import {
  MANUAL_ASSEMBLER_RECIPES,
  SMELTING_RECIPES,
  WORKBENCH_RECIPES,
  type WorkbenchRecipe,
} from "../../../simulation/recipes";
import { pickCraftingPhysicalSourceForIngredient } from "../../../crafting/tick";

/** Mirror of `tick.ts` scope-key convention (not exported from tick.ts). */
export function scopeKeyForSource(source: CraftingSource): string {
  if (source.kind === "global") return "crafting:global";
  if (source.kind === "warehouse") return `crafting:warehouse:${source.warehouseId}`;
  return `crafting:zone:${source.zoneId}`;
}

export type IngredientStatus = "available" | "reserved" | "missing";

/**
 * Sub-classification of `missing` ingredients to drive UI guidance.
 * - `manual`    → raw_resource (player must gather it by hand)
 * - `craftable` → some existing recipe can produce this item
 * - `unknown`   → neither raw nor produced by any known recipe
 */
export type MissingHint = "manual" | "craftable" | "unknown";

/** True if any registered recipe (workbench/smelter/assembler) outputs this item. */
export function isItemCraftable(itemId: string): boolean {
  for (const r of WORKBENCH_RECIPES) if (r.outputItem === itemId) return true;
  for (const r of SMELTING_RECIPES) if (r.outputItem === itemId) return true;
  for (const r of MANUAL_ASSEMBLER_RECIPES) if (r.outputItem === itemId) return true;
  return false;
}

/** Classify why an ingredient is missing — used only when status === "missing". */
export function classifyMissing(itemId: string): MissingHint {
  if (isKnownItemId(itemId)) {
    const def = getItemDef(itemId as ItemId);
    if (def?.category === "raw_resource") return "manual";
  }
  if (isItemCraftable(itemId)) return "craftable";
  return "unknown";
}

export interface IngredientLine {
  /** Raw key from recipe.costs. */
  readonly resource: string;
  readonly required: number;
  /** Stock physically present in the selected source. */
  readonly stored: number;
  /** Reservations against this source/item (queued+reserved jobs). */
  readonly reserved: number;
  /** `stored - reserved`, never negative. */
  readonly free: number;
  readonly status: IngredientStatus;
  /** Only set when status === "missing". */
  readonly missingHint?: MissingHint;
}

/**
 * Compute ingredient status for one recipe against the currently resolved
 * source.
 *
 * - `available`  → free ≥ required
 * - `reserved`   → stored ≥ required BUT free < required
 *                  (enough exists physically, but reservations block it)
 * - `missing`    → stored < required (physically not enough)
 */
export function computeIngredientLines(
  state: GameState,
  recipe: WorkbenchRecipe,
  source: CraftingSource,
  sourceInv: Inventory,
): readonly IngredientLine[] {
  const scopeKey = scopeKeyForSource(source);
  const lines: IngredientLine[] = [];
  for (const [res, amt] of Object.entries(recipe.costs)) {
    const required = typeof amt === "number" ? amt : 0;
    if (required <= 0) continue;
    let stored = 0;
    let reserved = 0;
    let free = 0;
    let status: IngredientStatus = "missing";

    // Keep global-source behavior as-is; for physical sources, reuse the exact
    // warehouse-primary / hub-fallback decision from the crafting reservation path.
    if (source.kind !== "global" && isKnownItemId(res)) {
      const inventorySource = source.kind === "zone"
        ? {
            kind: "zone" as const,
            zoneId: source.zoneId,
            warehouseIds: getZoneWarehouseIds(state, source.zoneId),
          }
        : source;
      const decision = pickCraftingPhysicalSourceForIngredient({
        source: inventorySource,
        itemId: res as ItemId,
        required,
        warehouseInventories: state.warehouseInventories,
        serviceHubs: state.serviceHubs,
        network: state.network,
        assets: state.assets,
      });
      stored = decision.stored;
      reserved = decision.reserved;
      free = decision.free;
      status = decision.status;
    } else {
      stored = (sourceInv as unknown as Record<string, number>)[res] ?? 0;
      reserved = isKnownItemId(res)
        ? getReservedAmount(state, res as ItemId, scopeKey)
        : 0;
      free = Math.max(0, stored - reserved);
      if (free >= required) status = "available";
      else if (stored >= required) status = "reserved";
      else status = "missing";
    }

    const missingHint: MissingHint | undefined =
      status === "missing" ? classifyMissing(res) : undefined;
    lines.push({ resource: res, required, stored, reserved, free, status, missingHint });
  }
  return lines;
}

export interface RecipeAvailability {
  readonly canCraft: boolean;
  readonly worstStatus: IngredientStatus;
  readonly maxBatchByStock: number;
}

/** Summarise ingredient lines into an overall recipe availability. */
export function summarizeAvailability(
  lines: readonly IngredientLine[],
): RecipeAvailability {
  if (lines.length === 0) {
    return { canCraft: true, worstStatus: "available", maxBatchByStock: Infinity };
  }
  let worst: IngredientStatus = "available";
  let canCraft = true;
  let maxBatch = Infinity;
  for (const line of lines) {
    if (line.status === "missing") {
      worst = "missing";
      canCraft = false;
    } else if (line.status === "reserved") {
      if (worst !== "missing") worst = "reserved";
      // Reserved means free < required → cannot start a new craft right now.
      canCraft = false;
    }
    const possible = Math.floor(line.free / line.required);
    if (possible < maxBatch) maxBatch = possible;
  }
  return { canCraft, worstStatus: worst, maxBatchByStock: Number.isFinite(maxBatch) ? maxBatch : 0 };
}

/** True if this recipe's output item is in the `player_gear` category. */
export function isPlayerGearRecipe(recipe: WorkbenchRecipe): boolean {
  if (!isKnownItemId(recipe.outputItem)) return false;
  return getItemDef(recipe.outputItem as ItemId)?.category === "player_gear";
}
