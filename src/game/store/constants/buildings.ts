// ============================================================
// Building constants & input-buffer configuration.
// ------------------------------------------------------------
// Extracted from store/reducer.ts. The reducer re-exports every
// symbol declared here so existing imports keep working.
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialisation cycle.
// Type-only imports are fine (erased at runtime).
// ============================================================

import type {
  AssetType,
  BuildingType,
  CollectableItemType,
  Inventory,
} from "../reducer";

/**
 * Maximum wood the generator's local input buffer can hold
 * (first inventory-aware building).
 */
export const GENERATOR_MAX_FUEL = 70;

/** Maximum number of items a single conveyor tile can queue. */
export const CONVEYOR_TILE_CAPACITY = 4;

export const BUILDING_COSTS: Record<
  BuildingType,
  Partial<Record<keyof Inventory, number>>
> = {
  workbench: { wood: 5 },
  warehouse: { wood: 10, stone: 5 },
  smithy: { wood: 20, stone: 10 },
  generator: { wood: 15, stone: 8 },
  cable: { stone: 3 },
  battery: { iron: 10, stone: 10 },
  power_pole: { wood: 3, stone: 5 },
  auto_miner: { iron: 10, copper: 6 },
  conveyor: { iron: 2 },
  conveyor_corner: { iron: 3 },
  manual_assembler: { wood: 10, iron: 4 },
  auto_smelter: { stone: 12, iron: 8, copper: 4 },
  service_hub: { wood: 20, stone: 15, iron: 5 },
};

export const BUILDING_LABELS: Record<BuildingType, string> = {
  workbench: "Werkbank",
  warehouse: "Lagerhaus",
  smithy: "Schmiede",
  generator: "Holz-Generator",
  cable: "Stromleitung",
  battery: "Batterie",
  power_pole: "Stromknoten",
  auto_miner: "Auto-Miner",
  conveyor: "Förderband",
  conveyor_corner: "Förderband-Ecke",
  manual_assembler: "Manueller Assembler",
  auto_smelter: "Auto Smelter",
  service_hub: "Drohnen-Hub",
};

/** Grid size each building type occupies (1×1 or 2×2) */
export const BUILDING_SIZES: Record<BuildingType, 1 | 2> = {
  workbench: 2,
  warehouse: 2,
  smithy: 2,
  generator: 2,
  battery: 2,
  cable: 1,
  power_pole: 1,
  auto_miner: 1,
  conveyor: 1,
  conveyor_corner: 1,
  manual_assembler: 2,
  auto_smelter: 2,
  service_hub: 2,
};

/** Maximum number of warehouses a player can place. */
export const MAX_WAREHOUSES = 2;

/** Maximum number of production zones a player can create. */
export const MAX_ZONES = 8;

/** Maximum number of items per resource in one warehouse inventory. */
export const WAREHOUSE_CAPACITY = 20;

/** Building types that can be purchased/placed multiple times */
export const STACKABLE_BUILDINGS = new Set<BuildingType>(["cable", "power_pole", "auto_miner", "conveyor", "conveyor_corner", "auto_smelter", "generator"]);

/** Building types that receive an automatic default warehouse source on placement. */
export const BUILDINGS_WITH_DEFAULT_SOURCE = new Set<BuildingType>(["workbench", "smithy", "manual_assembler", "auto_smelter", "auto_miner"]);

/** Building types that require stone floor under ALL their cells before they can be placed */
export const REQUIRES_STONE_FLOOR = new Set<BuildingType>(["generator"]);

/** Buildings eligible for drone-based construction when a service hub exists. */
export const CONSTRUCTION_SITE_BUILDINGS = new Set<BuildingType>([
  "workbench", "warehouse", "smithy", "generator", "service_hub",
  "cable", "power_pole", "battery", "auto_miner",
  "conveyor", "conveyor_corner", "manual_assembler", "auto_smelter",
]);

// ---- Building Input Buffers --------------------------------------------------
//
// First step toward a real per-building inventory system. Each entry maps a
// building type to its single accepted input resource and local capacity.
// Drones treat every asset whose type appears here as a valid delivery target
// for the configured resource (subject to remaining capacity).
//
// Today only the wood generator participates. Future inventory-aware buildings
// (e.g. boilers, smelters) can be added here without touching the drone
// scheduler / depositing logic.

/** Configuration of a single building input slot. */
export interface BuildingInputBufferConfig {
  /** The only resource this slot accepts. */
  resource: CollectableItemType;
  /** Maximum amount the slot can hold (drones never overfill past this). */
  capacity: number;
}

/** Registry of building types that own a local input buffer. */
export const BUILDING_INPUT_BUFFERS: Partial<Record<BuildingType, BuildingInputBufferConfig>> = {
  generator: { resource: "wood", capacity: GENERATOR_MAX_FUEL },
};

/** Returns the input buffer config for a building type, or null if it has none. */
export function getBuildingInputConfig(type: AssetType | BuildingType): BuildingInputBufferConfig | null {
  return (BUILDING_INPUT_BUFFERS as Record<string, BuildingInputBufferConfig | undefined>)[type] ?? null;
}
