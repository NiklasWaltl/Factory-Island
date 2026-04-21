// ============================================================
// Factory Island - Item Registry (Step 1)
// ------------------------------------------------------------
// Single source of truth for static item metadata.
// No game state, no UI, no inventory bookkeeping.
// ============================================================

import type { ItemCategory, ItemDef, ItemId } from "./types";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Central, immutable registry of all known items.
 *
 * Conventions:
 * - `player_gear` and `seed` are the only categories that are hotbar-eligible.
 * - `player_gear` defaults to stackSize 1.
 * - `raw_resource` / `material` / `intermediate` / `buildable` are NOT
 *   hotbar-eligible.
 *
 * The registry is the only place where item metadata lives. UI, crafting,
 * and inventory code must look up data here instead of using string literals.
 */
export const ITEM_REGISTRY: Readonly<Record<ItemId, ItemDef>> = Object.freeze({
  // --- raw_resource --------------------------------------------------------
  wood:           { id: "wood",           displayName: "Wood",           category: "raw_resource", stackSize: 999, isHotbarEligible: false, sortGroup: 10 },
  stone:          { id: "stone",          displayName: "Stone",          category: "raw_resource", stackSize: 999, isHotbarEligible: false, sortGroup: 10 },
  iron:           { id: "iron",           displayName: "Iron Ore",       category: "raw_resource", stackSize: 999, isHotbarEligible: false, sortGroup: 10 },
  copper:         { id: "copper",         displayName: "Copper Ore",     category: "raw_resource", stackSize: 999, isHotbarEligible: false, sortGroup: 10 },

  // --- material ------------------------------------------------------------
  ironIngot:      { id: "ironIngot",      displayName: "Iron Ingot",     category: "material",     stackSize: 999, isHotbarEligible: false, sortGroup: 20 },
  copperIngot:    { id: "copperIngot",    displayName: "Copper Ingot",   category: "material",     stackSize: 999, isHotbarEligible: false, sortGroup: 20 },

  // --- intermediate --------------------------------------------------------
  metalPlate:     { id: "metalPlate",     displayName: "Metal Plate",    category: "intermediate", stackSize: 999, isHotbarEligible: false, sortGroup: 30 },
  gear:           { id: "gear",           displayName: "Gear",           category: "intermediate", stackSize: 999, isHotbarEligible: false, sortGroup: 30 },

  // --- player_gear (tools) -------------------------------------------------
  axe:            { id: "axe",            displayName: "Axe",            category: "player_gear",  stackSize: 1,   isHotbarEligible: true,  sortGroup: 40, tags: ["tool", "chopping"] },
  wood_pickaxe:   { id: "wood_pickaxe",   displayName: "Wood Pickaxe",   category: "player_gear",  stackSize: 1,   isHotbarEligible: true,  sortGroup: 40, tags: ["tool", "mining"] },
  stone_pickaxe:  { id: "stone_pickaxe",  displayName: "Stone Pickaxe",  category: "player_gear",  stackSize: 1,   isHotbarEligible: true,  sortGroup: 40, tags: ["tool", "mining"] },

  // --- seed ----------------------------------------------------------------
  // NOTE: `sapling` is the current seed item (no `wheat_seed` exists yet).
  sapling:        { id: "sapling",        displayName: "Sapling",        category: "seed",         stackSize: 99,  isHotbarEligible: true,  sortGroup: 50 },

  // --- buildable -----------------------------------------------------------
  workbench:        { id: "workbench",        displayName: "Workbench",        category: "buildable", stackSize: 99, isHotbarEligible: false, sortGroup: 60 },
  warehouse:        { id: "warehouse",        displayName: "Warehouse",        category: "buildable", stackSize: 99, isHotbarEligible: false, sortGroup: 60 },
  smithy:           { id: "smithy",           displayName: "Smithy",           category: "buildable", stackSize: 99, isHotbarEligible: false, sortGroup: 60 },
  generator:        { id: "generator",        displayName: "Generator",        category: "buildable", stackSize: 99, isHotbarEligible: false, sortGroup: 60 },
  cable:            { id: "cable",            displayName: "Cable",            category: "buildable", stackSize: 99, isHotbarEligible: false, sortGroup: 60 },
  battery:          { id: "battery",          displayName: "Battery",          category: "buildable", stackSize: 99, isHotbarEligible: false, sortGroup: 60 },
  power_pole:       { id: "power_pole",       displayName: "Power Pole",       category: "buildable", stackSize: 99, isHotbarEligible: false, sortGroup: 60 },
  manual_assembler: { id: "manual_assembler", displayName: "Manual Assembler", category: "buildable", stackSize: 99, isHotbarEligible: false, sortGroup: 60 },
  auto_smelter:     { id: "auto_smelter",     displayName: "Auto Smelter",     category: "buildable", stackSize: 99, isHotbarEligible: false, sortGroup: 60 },
});

/** All known item ids, in registry insertion order. */
export const ALL_ITEM_IDS: readonly ItemId[] = Object.freeze(
  Object.keys(ITEM_REGISTRY) as ItemId[],
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type guard: is the given string a known item id? */
export function isKnownItemId(id: string): id is ItemId {
  return Object.prototype.hasOwnProperty.call(ITEM_REGISTRY, id);
}

/** Returns the ItemDef or `undefined` if the id is unknown. */
export function getItemDef(itemId: ItemId): ItemDef | undefined {
  return ITEM_REGISTRY[itemId];
}

/**
 * Returns the ItemDef and throws if the id is unknown.
 * Use only when an unknown id would indicate a real bug
 * (e.g. data corruption).
 */
export function assertItemExists(itemId: ItemId): ItemDef {
  const def = ITEM_REGISTRY[itemId];
  if (!def) {
    throw new Error(`[items] Unknown item id: ${String(itemId)}`);
  }
  return def;
}

/** Whether the item may be placed into the hotbar. */
export function isHotbarEligible(itemId: ItemId): boolean {
  return ITEM_REGISTRY[itemId]?.isHotbarEligible === true;
}

export function isPlayerGear(itemId: ItemId): boolean {
  return ITEM_REGISTRY[itemId]?.category === "player_gear";
}

export function isSeed(itemId: ItemId): boolean {
  return ITEM_REGISTRY[itemId]?.category === "seed";
}

/** All item defs of a given category, in registry order. */
export function getItemsByCategory(category: ItemCategory): readonly ItemDef[] {
  const out: ItemDef[] = [];
  for (const id of ALL_ITEM_IDS) {
    const def = ITEM_REGISTRY[id];
    if (def.category === category) out.push(def);
  }
  return out;
}
