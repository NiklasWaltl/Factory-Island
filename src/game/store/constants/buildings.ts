// ============================================================
// Building constants & input-buffer configuration.
// ------------------------------------------------------------
// Compatibility facade. The per-BuildingType data now lives in
// ./buildings/registry.ts; this module derives the original
// flat exports from that registry so existing consumers keep
// working byte-for-byte.
//
// New consumers SHOULD import from ./buildings/registry directly
// (`getBuildingDef`, `BUILDING_REGISTRY`, …).
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialisation cycle.
// Type-only imports are fine (erased at runtime).
// ============================================================

import type {
  AssetType,
  BuildingType,
  Inventory,
} from "../types";

import {
  BUILDING_REGISTRY,
  GENERATOR_MAX_FUEL as REGISTRY_GENERATOR_MAX_FUEL,
  lookupBuildingInputConfig,
  type BuildingDef,
  type BuildingInputBufferConfig,
} from "./buildings/registry";

export type { BuildingInputBufferConfig };

// Re-export the registry helpers so legacy `from "./buildings"`
// import paths reach them too.
export { BUILDING_REGISTRY, getBuildingDef } from "./buildings/registry";

// ---- Generator fuel buffer capacity (single source: registry) ----
export const GENERATOR_MAX_FUEL = REGISTRY_GENERATOR_MAX_FUEL;

// ---- Per-type derived tables ---------------------------------------------
//
// All tables below are projections of BUILDING_REGISTRY. The shape and
// values are byte-for-byte identical to the previous hand-written tables
// (verified via a one-time spot check during the refactor).

const REGISTRY_VALUES: BuildingDef[] = Object.values(BUILDING_REGISTRY);

function buildRecord<T>(project: (def: BuildingDef) => T): Record<BuildingType, T> {
  const out = {} as Record<BuildingType, T>;
  for (const def of REGISTRY_VALUES) {
    out[def.type] = project(def);
  }
  return out;
}

function buildSet(predicate: (def: BuildingDef) => boolean): Set<BuildingType> {
  const out = new Set<BuildingType>();
  for (const def of REGISTRY_VALUES) {
    if (predicate(def)) out.add(def.type);
  }
  return out;
}

export const BUILDING_COSTS: Record<
  BuildingType,
  Partial<Record<keyof Inventory, number>>
> = buildRecord((def) => def.cost);

export const BUILDING_LABELS: Record<BuildingType, string> = buildRecord(
  (def) => def.label,
);

/** Grid size each building type occupies (1×1 or 2×2) */
export const BUILDING_SIZES: Record<BuildingType, 1 | 2> = buildRecord(
  (def) => def.size,
);

/** Maximum number of warehouses a player can place. */
export const MAX_WAREHOUSES = 2;

/** Maximum number of production zones a player can create. */
export const MAX_ZONES = 8;

/** Maximum number of items per resource in one warehouse inventory. */
export const WAREHOUSE_CAPACITY = 20;

/** Building types that can be purchased/placed multiple times */
export const STACKABLE_BUILDINGS: Set<BuildingType> = buildSet(
  (def) => def.stackable,
);

/** Building types that receive an automatic default warehouse source on placement. */
export const BUILDINGS_WITH_DEFAULT_SOURCE: Set<BuildingType> = buildSet(
  (def) => def.hasDefaultSourceWarehouse,
);

/** Building types that require stone floor under ALL their cells before they can be placed */
export const REQUIRES_STONE_FLOOR: Set<BuildingType> = buildSet(
  (def) => def.requiresStoneFloor,
);

/** Buildings eligible for drone-based construction when a service hub exists. */
export const CONSTRUCTION_SITE_BUILDINGS: Set<BuildingType> = buildSet(
  (def) => def.eligibleAsConstructionSite,
);

// ---- Building Input Buffers ----------------------------------------------
//
// Per-type input-buffer configuration, projected from the registry.
// Today only the wood generator participates. New entries must be added
// in `BUILDING_REGISTRY` (field `inputBuffer`) — this map is derived.

/** Registry of building types that own a local input buffer. */
export const BUILDING_INPUT_BUFFERS: Partial<Record<BuildingType, BuildingInputBufferConfig>> =
  (() => {
    const out: Partial<Record<BuildingType, BuildingInputBufferConfig>> = {};
    for (const def of REGISTRY_VALUES) {
      if (def.inputBuffer) out[def.type] = def.inputBuffer;
    }
    return out;
  })();

/** Returns the input buffer config for a building type, or null if it has none. */
export function getBuildingInputConfig(
  type: AssetType | BuildingType,
): BuildingInputBufferConfig | null {
  return lookupBuildingInputConfig(type);
}
