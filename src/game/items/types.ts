// ============================================================
// Factory Island - Item Model (Step 1)
// ------------------------------------------------------------
// Static, data-driven item metadata. No runtime state, no UI,
// no inventory bookkeeping in this module.
// ============================================================

/**
 * Canonical item identifiers.
 *
 * NOTE: Intentionally aligned with the existing `keyof Inventory`
 * (minus `coins`) so the new InventoryNetwork read-view can
 * aggregate `state.warehouseInventories` without any refactor.
 *
 * New item ids should be added here AND to the registry, and
 * (when they should be physically storable) also to the
 * `Inventory` interface in `store/reducer.ts`.
 */
export type ItemId =
  // raw resources
  | "wood"
  | "stone"
  | "iron"
  | "copper"
  // materials / intermediates
  | "ironIngot"
  | "copperIngot"
  | "metalPlate"
  | "gear"
  // player gear (tools)
  | "axe"
  | "wood_pickaxe"
  | "stone_pickaxe"
  // seeds
  | "sapling"
  // buildables
  | "workbench"
  | "warehouse"
  | "smithy"
  | "generator"
  | "cable"
  | "battery"
  | "power_pole"
  | "manual_assembler"
  | "auto_smelter"
  | "auto_assembler";

/**
 * Item categories.
 *
 * - raw_resource: gathered by the player by hand (wood, stone, ore)
 * - material:     processed primary good (ingots, planks)
 * - intermediate: composite parts used in further crafting (gear, plate)
 * - buildable:    item that places a building/structure on the grid
 * - seed:         plantable; allowed in hotbar
 * - player_gear:  tools and equippable items; allowed in hotbar; never
 *                 used as a crafting ingredient; usually stackSize 1
 */
export type ItemCategory =
  | "raw_resource"
  | "material"
  | "intermediate"
  | "buildable"
  | "seed"
  | "player_gear";

/**
 * Static item definition. Pure metadata — no counts, no state.
 */
export interface ItemDef {
  readonly id: ItemId;
  readonly displayName: string;
  readonly category: ItemCategory;
  /** Maximum count per logical stack. `player_gear` is typically 1. */
  readonly stackSize: number;
  /** Only items with `isHotbarEligible === true` may ever be placed
   *  into the hotbar (currently: `seed` and `player_gear`). */
  readonly isHotbarEligible: boolean;
  /** Optional UI hint; the actual icon source stays UI-side. */
  readonly iconKey?: string;
  /** Free-form tags for later filters (e.g. "tool", "mining"). */
  readonly tags?: readonly string[];
  /** Optional sort hint for warehouse/network UI grouping. */
  readonly sortGroup?: number;
}

/**
 * A countable amount of a specific item. Used by inventory views
 * and (later) by reservations / crafting jobs.
 */
export interface ItemStack {
  readonly itemId: ItemId;
  readonly count: number;
}

/** Warehouse identifier (matches the placed asset id). */
export type WarehouseId = string;

/**
 * Aggregated, read-only view of the network's physical stock.
 * Only items with count > 0 are included.
 *
 * IMPORTANT: This is a snapshot. Reservations, crafting jobs,
 * and drone in-transit buffers are explicitly NOT part of this
 * model in step 1.
 */
export interface NetworkStockView {
  readonly totals: Readonly<Partial<Record<ItemId, number>>>;
}
