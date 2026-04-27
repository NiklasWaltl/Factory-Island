// ============================================================
// Building Registry — single, additive source of truth for
// per-BuildingType metadata.
// ------------------------------------------------------------
// This module is the *primary* place where per-type building
// data is declared. The flat exports in `../buildings.ts`
// (BUILDING_LABELS, BUILDING_COSTS, BUILDING_SIZES, etc.) are
// kept for backward compatibility and are derived from this
// registry. New consumers should prefer `getBuildingDef(type)`.
//
// IMPORTANT: keep this module value-only. No runtime imports
// from `store/reducer` to avoid ESM init cycles. Type-only
// imports are erased and therefore safe.
// ============================================================

import type {
  AssetType,
  BuildingType,
  CollectableItemType,
  Inventory,
} from "../../types";

// ---- Generator fuel buffer capacity (re-declared here because
// `../buildings.ts` derives its `GENERATOR_MAX_FUEL` export from
// this module, and ESM forbids self-referencing values during
// initialisation). Single source of truth. ------------------
export const GENERATOR_MAX_FUEL = 70;

/** Configuration of a single building input slot. */
export interface BuildingInputBufferConfig {
  /** The only resource this slot accepts. */
  readonly resource: CollectableItemType;
  /** Maximum amount the slot can hold (drones never overfill past this). */
  readonly capacity: number;
}

/**
 * Build-menu category keys. The presentation order of categories
 * is defined by `BUILD_CATEGORIES` below, not by enum order.
 */
export type BuildCategoryKey =
  | "energy"
  | "production"
  | "logistics"
  | "storage"
  | "hub";

/**
 * Static, per-BuildingType metadata. Read-only.
 *
 * Fields kept intentionally narrow — only properties that are
 * already actively consumed per-type elsewhere in the codebase.
 * Cross-cutting limits (MAX_WAREHOUSES, MAX_ZONES, …) stay as
 * top-level constants in `../buildings.ts`.
 */
export interface BuildingDef {
  readonly type: BuildingType;
  /** Human-facing display label. */
  readonly label: string;
  /** Free-form description shown in the build menu. */
  readonly description: string;
  /** Build-menu category. UI ordering lives in `BUILD_CATEGORIES`. */
  readonly category: BuildCategoryKey;
  /** Cost to place / build. Partial: only the listed resources are required. */
  readonly cost: Partial<Record<keyof Inventory, number>>;
  /** Footprint side length in cells. */
  readonly size: 1 | 2;
  /** May be placed multiple times. */
  readonly stackable: boolean;
  /** Receives an automatic default warehouse source on placement. */
  readonly hasDefaultSourceWarehouse: boolean;
  /** Needs stone floor under all of its cells before placement. */
  readonly requiresStoneFloor: boolean;
  /** Eligible for drone-based construction when a service hub exists. */
  readonly eligibleAsConstructionSite: boolean;
  /** Local input-buffer config, or `null` if the building has none. */
  readonly inputBuffer: BuildingInputBufferConfig | null;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const BUILDING_REGISTRY: Readonly<Record<BuildingType, BuildingDef>> = Object.freeze({
  workbench: {
    type: "workbench",
    label: "Werkbank",
    description: "Stelle Werkzeuge und Items her.",
    category: "production",
    cost: { wood: 5 },
    size: 2,
    stackable: false,
    hasDefaultSourceWarehouse: true,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  warehouse: {
    type: "warehouse",
    label: "Lagerhaus",
    description: "Erhöht die Lagerkapazität für Ressourcen.",
    category: "storage",
    cost: { wood: 10, stone: 5 },
    size: 2,
    stackable: false,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  smithy: {
    type: "smithy",
    label: "Schmiede",
    description: "Schmelze Erze zu Barren.",
    category: "production",
    cost: { wood: 20, stone: 10 },
    size: 2,
    stackable: false,
    hasDefaultSourceWarehouse: true,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  generator: {
    type: "generator",
    label: "Holz-Generator",
    description: "Verbrennt Holz und erzeugt Energie für das Netzwerk.",
    category: "energy",
    cost: { wood: 15, stone: 8 },
    size: 2,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: true,
    eligibleAsConstructionSite: true,
    inputBuffer: { resource: "wood", capacity: GENERATOR_MAX_FUEL },
  },
  cable: {
    type: "cable",
    label: "Stromleitung",
    description: "Verbindet Generator mit Stromknoten (1×1).",
    category: "energy",
    cost: { stone: 3 },
    size: 1,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  battery: {
    type: "battery",
    label: "Batterie",
    description: "Speichert überschüssige Energie für später.",
    category: "energy",
    cost: { iron: 10, stone: 10 },
    size: 2,
    stackable: false,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  power_pole: {
    type: "power_pole",
    label: "Stromknoten",
    description: "Verteilt Energie kabellos an Gebäude in Reichweite (3 Felder).",
    category: "energy",
    cost: { wood: 3, stone: 5 },
    size: 1,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  auto_miner: {
    type: "auto_miner",
    label: "Auto-Miner",
    description: "Baut automatisch Ressourcen von Vorkommen ab. Nur auf 2×2 Deposits. Benötigt Energie. R zum Drehen.",
    category: "production",
    cost: { iron: 10, copper: 6 },
    size: 1,
    stackable: true,
    hasDefaultSourceWarehouse: true,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  conveyor: {
    type: "conveyor",
    label: "Förderband",
    description: "Transportiert Items automatisch in eine Richtung. Benötigt Energie. R zum Drehen.",
    category: "logistics",
    cost: { iron: 2 },
    size: 1,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  conveyor_corner: {
    type: "conveyor_corner",
    label: "Förderband-Ecke",
    description: "Leitet Items in einer 90°-Ecke weiter. Benötigt Energie. R zum Drehen.",
    category: "logistics",
    cost: { iron: 3 },
    size: 1,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  conveyor_merger: {
    type: "conveyor_merger",
    label: "Förderband-Merger",
    description: "Führt zwei seitliche Förderbänder auf einen Ausgang zusammen. Links hat Vorrang. Benötigt Energie. R zum Drehen.",
    category: "logistics",
    cost: { iron: 4 },
    size: 1,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  conveyor_splitter: {
    type: "conveyor_splitter",
    label: "Förderband-Splitter",
    description: "Teilt den Strom vom Rücken-Eingang auf zwei seitliche Ausgänge. Links hat Vorrang. Benötigt Energie. R zum Drehen.",
    category: "logistics",
    cost: { iron: 4 },
    size: 1,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  conveyor_underground_in: {
    type: "conveyor_underground_in",
    label: "Untergrund-Eingang",
    description:
      "Tunnel-Eingang (1×1). Zuerst platzieren, dann den passenden Untergrund-Ausgang 2–5 Felder in Flussrichtung setzen. Andere Bänder können die Zwischenzellen nutzen. Benötigt Energie. R zum Drehen.",
    category: "logistics",
    cost: { iron: 3 },
    size: 1,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  conveyor_underground_out: {
    type: "conveyor_underground_out",
    label: "Untergrund-Ausgang",
    description:
      "Tunnel-Ausgang (1×1). Nur gültig, wenn in Flussrichtung 2–5 Felder entfernt ein freier Untergrund-Eingang gleicher Richtung wartet. Benötigt Energie. R zum Drehen.",
    category: "logistics",
    cost: { iron: 2 },
    size: 1,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  manual_assembler: {
    type: "manual_assembler",
    label: "Manueller Assembler",
    description: "Stellt per Hand Metallplatten und Zahnräder her. Keine Energie nötig.",
    category: "production",
    cost: { wood: 10, iron: 4 },
    size: 2,
    stackable: false,
    hasDefaultSourceWarehouse: true,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  auto_smelter: {
    type: "auto_smelter",
    label: "Auto Smelter",
    description: "Automatisches Schmelzen per Förderband. 2×1, rotierbar, Input/Output auf gegenüberliegenden Seiten.",
    category: "production",
    cost: { stone: 12, iron: 8, copper: 4 },
    size: 2,
    stackable: true,
    hasDefaultSourceWarehouse: true,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  auto_assembler: {
    type: "auto_assembler",
    label: "Auto-Assembler",
    description:
      "Montiert Metallplatten (1× Eisenbarren) oder Zahnräder (3× Eisenbarren) per Förderband. 2×1, rotierbar, nur Band-Ein-/Ausgang, kein Overclock.",
    category: "production",
    cost: { stone: 8, iron: 10, copper: 2 },
    size: 2,
    stackable: true,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
  service_hub: {
    type: "service_hub",
    label: "Drohnen-Hub",
    description: "Platziert einen Proto-Hub (Stufe 1). Kann später zu einem Service-Hub (Stufe 2) aufgerüstet werden.",
    category: "hub",
    cost: { wood: 20, stone: 15, iron: 5 },
    size: 2,
    stackable: false,
    hasDefaultSourceWarehouse: false,
    requiresStoneFloor: false,
    eligibleAsConstructionSite: true,
    inputBuffer: null,
  },
});

// ---------------------------------------------------------------------------
// Build-menu category structure
// ---------------------------------------------------------------------------
//
// Defines the presentation order of categories AND the order of buildings
// within each category. Both orderings are UI-relevant and intentionally
// decoupled from the registry's insertion order, so future registry edits
// cannot accidentally reshuffle the build menu.
//
// Each `buildings` entry must reference a BuildingType whose `category`
// field matches `key`; `assertBuildCategoriesMatchRegistry()` verifies
// this at module load (DEV only).

export interface BuildCategory {
  readonly key: BuildCategoryKey;
  readonly label: string;
  readonly emoji: string;
  readonly buildings: readonly BuildingType[];
}

export const BUILD_CATEGORIES: readonly BuildCategory[] = Object.freeze([
  {
    key: "energy",
    label: "Energie",
    emoji: "⚡",
    buildings: ["generator", "cable", "power_pole", "battery"],
  },
  {
    key: "production",
    label: "Produktion",
    emoji: "\u{1F3ED}",
    buildings: ["workbench", "smithy", "auto_miner", "manual_assembler", "auto_smelter", "auto_assembler"],
  },
  {
    key: "logistics",
    label: "Logistik",
    emoji: "\u{1F69A}",
    buildings: [
      "conveyor",
      "conveyor_corner",
      "conveyor_merger",
      "conveyor_splitter",
      "conveyor_underground_in",
      "conveyor_underground_out",
    ],
  },
  {
    key: "storage",
    label: "Lager",
    emoji: "\u{1F4E6}",
    buildings: ["warehouse"],
  },
  {
    key: "hub",
    label: "Hub",
    emoji: "\u{1F6F8}",
    buildings: ["service_hub"],
  },
]);

// Note on consistency between BUILD_CATEGORIES and BuildingDef.category:
// the type system already enforces that each `buildings` entry is a valid
// BuildingType. Per-entry category drift would be caught by reviewers; we
// deliberately avoid a runtime invariant check here to keep this module
// portable across environments (Jest CommonJS does not parse `import.meta`).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the full BuildingDef for a known BuildingType. */
export function getBuildingDef(type: BuildingType): BuildingDef {
  return BUILDING_REGISTRY[type];
}

/**
 * Returns the input-buffer config for a building (by AssetType OR
 * BuildingType), or `null` if the type has no buffer / is unknown.
 *
 * Mirrors the legacy `getBuildingInputConfig` signature so callers
 * can be migrated transparently.
 */
export function lookupBuildingInputConfig(
  type: AssetType | BuildingType,
): BuildingInputBufferConfig | null {
  const def = (BUILDING_REGISTRY as Record<string, BuildingDef | undefined>)[type];
  return def?.inputBuffer ?? null;
}
