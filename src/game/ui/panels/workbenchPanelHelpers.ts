// ============================================================
// Factory Island – WorkbenchPanel pure helpers
// ------------------------------------------------------------
// Side-effect-free selectors used by the workbench UI. Kept in
// their own module so reducer-level tests can exercise the
// ingredient-status logic without rendering React.
// ============================================================

import { getReservedAmount } from "../../inventory/reservations";
import { getItemDef, isKnownItemId } from "../../items/registry";
import type { ItemId } from "../../items/types";
import type {
  CraftingSource,
  GameState,
  Inventory,
} from "../../store/reducer";
import type { WorkbenchRecipe } from "../../simulation/recipes";

/** Mirror of `tick.ts` scope-key convention (not exported from tick.ts). */
export function scopeKeyForSource(source: CraftingSource): string {
  if (source.kind === "global") return "crafting:global";
  if (source.kind === "warehouse") return `crafting:warehouse:${source.warehouseId}`;
  return `crafting:zone:${source.zoneId}`;
}

export type IngredientStatus = "available" | "reserved" | "missing";

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
    const stored = (sourceInv as unknown as Record<string, number>)[res] ?? 0;
    const reserved = isKnownItemId(res)
      ? getReservedAmount(state, res as ItemId, scopeKey)
      : 0;
    const free = Math.max(0, stored - reserved);
    let status: IngredientStatus;
    if (free >= required) status = "available";
    else if (stored >= required) status = "reserved";
    else status = "missing";
    lines.push({ resource: res, required, stored, reserved, free, status });
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
