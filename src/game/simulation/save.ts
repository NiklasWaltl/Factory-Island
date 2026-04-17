// ============================================================
// Factory Island – Save/Load System with Versioned Migrations
// ============================================================
//
// This module handles serialisation, deserialisation and migration
// of persisted game state.  Every save carries a `version` field
// so older saves can be migrated forward automatically.
//
// To add a new migration (e.g. v2 → v3):
//   1. Define `SaveGameV3` describing the new shape.
//   2. Write `migrateV2ToV3(save: SaveGameV2): SaveGameV3`.
//   3. Append it to `MIGRATIONS`.
//   4. Update `CURRENT_SAVE_VERSION` and the `SaveGameLatest` alias.
// ============================================================

import type {
  GameState,
  GameMode,
  PlacedAsset,
  Inventory,
  BuildingType,
  HotbarSlot,
  SmithyState,
  GeneratorState,
  BatteryState,
  AutoMinerEntry,
  ConveyorState,
  ConveyorItem,
  AutoSmelterEntry,
  ManualAssemblerState,
  AutoDeliveryEntry,
  MachinePriority,
  FloorTileType,
  ProductionZone,
} from "../store/reducer";
import {
  computeConnectedAssetIds,
  createInitialState,
  cleanBuildingSourceIds,
  cleanBuildingZoneIds,
} from "../store/reducer";

// ---- Version constants -----------------------------------------------

/** Current save format version.  Bump when GameState shape changes. */
export const CURRENT_SAVE_VERSION = 1;

// ---- Save schema (V1 – initial versioned format) ---------------------

/**
 * V1 persists everything that is *not* purely derived at runtime.
 * Fields like `connectedAssetIds`, `poweredMachineIds`, transient UI
 * selections and the notification queue are intentionally excluded
 * because they are re-derived on load.
 */
export interface SaveGameV1 {
  version: 1;
  mode: GameMode;
  assets: Record<string, PlacedAsset>;
  cellMap: Record<string, string>;
  inventory: Inventory;
  purchasedBuildings: BuildingType[];
  placedBuildings: BuildingType[];
  warehousesPurchased: number;
  warehousesPlaced: number;
  warehouseInventories: Record<string, Inventory>;
  cablesPlaced: number;
  powerPolesPlaced: number;
  hotbarSlots: HotbarSlot[];
  activeSlot: number;
  smithy: SmithyState;
  generator: GeneratorState;
  battery: BatteryState;
  floorMap: Record<string, "stone_floor">;
  autoMiners: Record<string, AutoMinerEntry>;
  conveyors: Record<string, ConveyorState>;
  autoSmelters: Record<string, AutoSmelterEntry>;
  manualAssembler: ManualAssemblerState;
  machinePowerRatio: Record<string, number>;
  saplingGrowAt: Record<string, number>;
  /** Per-building warehouse source mapping (added after initial V1 release). */
  buildingSourceWarehouseIds?: Record<string, string>;
  /** Production zones (added after initial V1 release). */
  productionZones?: Record<string, ProductionZone>;
  /** Per-building zone assignment (added after initial V1 release). */
  buildingZoneIds?: Record<string, string>;
}

// ---- Latest alias (always points at the newest version) ---------------

export type SaveGameLatest = SaveGameV1;

// ---- Legacy (pre-version) format  ------------------------------------

/**
 * Represents the raw JSON blob from saves that were created *before*
 * the versioning system existed.  These have no `version` field.
 */
type SaveGameV0 = Record<string, unknown>;

// ---- Individual migrations -------------------------------------------

/**
 * Migrate a pre-version (V0) save into the first versioned format (V1).
 *
 * This absorbs all ad-hoc fixups that were previously inlined in
 * `normalizeLoadedState()`:
 * - Conveyor queue normalisation (legacy `item` field → `queue` array)
 * - Auto-smelter recipe validation
 * - Warehouse-inventory → unified-inventory migration
 */
function migrateV0ToV1(raw: SaveGameV0): SaveGameV1 {
  const mode: GameMode =
    raw.mode === "debug" || raw.mode === "release"
      ? (raw.mode as GameMode)
      : "release";
  const base = createInitialState(mode);

  // --- Conveyor normalisation (legacy `item` field → queue array) ---
  const VALID_CONVEYOR_ITEMS: ConveyorItem[] = [
    "stone", "iron", "copper", "ironIngot", "copperIngot", "metalPlate", "gear",
  ];
  const isConveyorItem = (v: unknown): v is ConveyorItem =>
    typeof v === "string" && VALID_CONVEYOR_ITEMS.includes(v as ConveyorItem);

  const normalizedConveyors: Record<string, ConveyorState> = {};
  const conveyorsRaw = raw.conveyors;
  if (conveyorsRaw && typeof conveyorsRaw === "object") {
    for (const [id, value] of Object.entries(conveyorsRaw as Record<string, unknown>)) {
      const conv = value as { queue?: unknown[]; item?: unknown } | null;
      if (conv && Array.isArray(conv.queue)) {
        normalizedConveyors[id] = { queue: conv.queue.filter(isConveyorItem) };
      } else if (conv && isConveyorItem((conv as any)?.item)) {
        normalizedConveyors[id] = { queue: [(conv as any).item] };
      } else {
        normalizedConveyors[id] = { queue: [] };
      }
    }
  }

  // --- Auto-smelter recipe validation ---
  const autoSmelters: Record<string, AutoSmelterEntry> =
    raw.autoSmelters && typeof raw.autoSmelters === "object"
      ? Object.entries(raw.autoSmelters as Record<string, unknown>).reduce(
          (acc, [id, smelter]) => {
            const s = (smelter as Record<string, unknown>) || {};
            acc[id] = {
              inputBuffer: Array.isArray(s.inputBuffer)
                ? (s.inputBuffer as ConveyorItem[]).filter(isConveyorItem)
                : [],
              processing: (s.processing as AutoSmelterEntry["processing"]) ?? null,
              pendingOutput: Array.isArray(s.pendingOutput)
                ? (s.pendingOutput as ConveyorItem[]).filter(isConveyorItem)
                : [],
              status: (typeof s.status === "string" ? s.status : "IDLE") as AutoSmelterEntry["status"],
              lastRecipeInput: (typeof s.lastRecipeInput === "string" ? s.lastRecipeInput : null) as string | null,
              lastRecipeOutput: (typeof s.lastRecipeOutput === "string" ? s.lastRecipeOutput : null) as string | null,
              throughputEvents: Array.isArray(s.throughputEvents) ? (s.throughputEvents as number[]) : [],
              selectedRecipe:
                s.selectedRecipe === "iron" || s.selectedRecipe === "copper"
                  ? s.selectedRecipe
                  : "iron",
            };
            return acc;
          },
          {} as Record<string, AutoSmelterEntry>,
        )
      : {};

  // --- Warehouse-inventory → unified inventory migration ---
  const CONVEYOR_RESOURCE_KEYS: readonly string[] = [
    "stone", "iron", "copper", "ironIngot", "copperIngot", "metalPlate", "gear",
  ];
  const rawInv: Inventory =
    raw.inventory && typeof raw.inventory === "object"
      ? { ...base.inventory, ...(raw.inventory as Partial<Inventory>) }
      : { ...base.inventory };
  const rawWhInvs =
    raw.warehouseInventories && typeof raw.warehouseInventories === "object"
      ? (raw.warehouseInventories as Record<string, Record<string, number>>)
      : {};
  const migratedInv = { ...rawInv } as Record<string, number> & Inventory;
  const migratedWhInvs: Record<string, Inventory> = {};
  for (const [whId, whInv] of Object.entries(rawWhInvs)) {
    if (!whInv || typeof whInv !== "object") {
      migratedWhInvs[whId] = { ...base.inventory };
      continue;
    }
    const newWhInv = { ...whInv } as Record<string, number>;
    for (const key of CONVEYOR_RESOURCE_KEYS) {
      const amt = typeof whInv[key] === "number" ? whInv[key] : 0;
      if (amt > 0) {
        migratedInv[key] = (migratedInv[key] ?? 0) + amt;
        newWhInv[key] = 0;
      }
    }
    migratedWhInvs[whId] = newWhInv as unknown as Inventory;
  }

  // --- MachinePowerRatio ---
  const machinePowerRatio =
    raw.machinePowerRatio && typeof raw.machinePowerRatio === "object"
      ? (raw.machinePowerRatio as Record<string, number>)
      : {};

  // --- Build the V1 save from raw + base defaults ---
  const safeRecord = <T>(v: unknown, fallback: Record<string, T>): Record<string, T> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : fallback;
  const safeArray = <T>(v: unknown, fallback: T[]): T[] =>
    Array.isArray(v) ? (v as T[]) : fallback;
  const safeNum = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  return {
    version: 1,
    mode,
    assets: safeRecord<PlacedAsset>(raw.assets, base.assets),
    cellMap: safeRecord<string>(raw.cellMap, base.cellMap),
    inventory: migratedInv as Inventory,
    purchasedBuildings: safeArray<BuildingType>(raw.purchasedBuildings, base.purchasedBuildings),
    placedBuildings: safeArray<BuildingType>(raw.placedBuildings, base.placedBuildings),
    warehousesPurchased: safeNum(raw.warehousesPurchased, base.warehousesPurchased),
    warehousesPlaced: safeNum(raw.warehousesPlaced, base.warehousesPlaced),
    warehouseInventories: Object.keys(migratedWhInvs).length > 0
      ? migratedWhInvs
      : (safeRecord<Inventory>(raw.warehouseInventories, base.warehouseInventories)),
    cablesPlaced: safeNum(raw.cablesPlaced, base.cablesPlaced),
    powerPolesPlaced: safeNum(raw.powerPolesPlaced, base.powerPolesPlaced),
    hotbarSlots: safeArray<HotbarSlot>(raw.hotbarSlots, base.hotbarSlots),
    activeSlot: safeNum(raw.activeSlot, base.activeSlot),
    smithy: raw.smithy && typeof raw.smithy === "object"
      ? { ...base.smithy, ...(raw.smithy as Partial<SmithyState>) }
      : base.smithy,
    generator: raw.generator && typeof raw.generator === "object"
      ? { ...base.generator, ...(raw.generator as Partial<GeneratorState>) }
      : base.generator,
    battery: raw.battery && typeof raw.battery === "object"
      ? { ...base.battery, ...(raw.battery as Partial<BatteryState>) }
      : base.battery,
    floorMap: safeRecord<"stone_floor">(raw.floorMap, base.floorMap),
    autoMiners: safeRecord<AutoMinerEntry>(raw.autoMiners, base.autoMiners),
    conveyors: { ...safeRecord<ConveyorState>(undefined, base.conveyors), ...normalizedConveyors },
    autoSmelters,
    manualAssembler: raw.manualAssembler && typeof raw.manualAssembler === "object"
      ? { ...base.manualAssembler, ...(raw.manualAssembler as Partial<ManualAssemblerState>) }
      : base.manualAssembler,
    machinePowerRatio,
    saplingGrowAt: safeRecord<number>(raw.saplingGrowAt, base.saplingGrowAt),
  };
}

// ---- Migration registry ----------------------------------------------

/**
 * Each entry maps `fromVersion → { toVersion, migrate }`.
 * Migrations are applied sequentially: v0→v1→v2→…→CURRENT.
 */
type MigrationStep = {
  from: number;
  to: number;
  migrate: (save: any) => any;
};

const MIGRATIONS: MigrationStep[] = [
  { from: 0, to: 1, migrate: migrateV0ToV1 },
  // Future: { from: 1, to: 2, migrate: migrateV1ToV2 },
];

// ---- Central migration entry-point -----------------------------------

/**
 * Detect the save version and run all necessary migrations to bring
 * it to `CURRENT_SAVE_VERSION`.
 *
 * @param raw  The parsed JSON blob from storage (unknown shape).
 * @returns    A fully-migrated `SaveGameLatest` or `null` if the input
 *             is irrecoverably broken.
 */
export function migrateSave(raw: unknown): SaveGameLatest | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Record<string, unknown>;

  // Determine version (pre-version saves have no field → treat as v0)
  let version: number =
    typeof data.version === "number" && Number.isFinite(data.version)
      ? data.version
      : 0;

  // Reject saves from the future (newer than our code knows about)
  if (version > CURRENT_SAVE_VERSION) {
    console.warn(
      `[save] Save version ${version} is newer than code version ${CURRENT_SAVE_VERSION}. Ignoring save.`,
    );
    return null;
  }

  // Apply migrations sequentially
  let save: any = data;
  for (const step of MIGRATIONS) {
    if (version === step.from) {
      save = step.migrate(save);
      version = step.to;
    }
  }

  // Sanity check: we should be at the current version now
  if (version !== CURRENT_SAVE_VERSION) {
    console.warn(
      `[save] Migration ended at v${version}, expected v${CURRENT_SAVE_VERSION}. Save may be corrupted.`,
    );
    return null;
  }

  return save as SaveGameLatest;
}

// ---- Serialisation (GameState → SaveGameLatest) ----------------------

/**
 * Extract the persistable subset of runtime `GameState` and stamp it
 * with the current save version.  Transient / derived fields are
 * intentionally dropped.
 */
export function serializeState(state: GameState): SaveGameLatest {
  return {
    version: CURRENT_SAVE_VERSION,
    mode: state.mode,
    assets: state.assets,
    cellMap: state.cellMap,
    inventory: state.inventory,
    purchasedBuildings: state.purchasedBuildings,
    placedBuildings: state.placedBuildings,
    warehousesPurchased: state.warehousesPurchased,
    warehousesPlaced: state.warehousesPlaced,
    warehouseInventories: state.warehouseInventories,
    cablesPlaced: state.cablesPlaced,
    powerPolesPlaced: state.powerPolesPlaced,
    hotbarSlots: state.hotbarSlots,
    activeSlot: state.activeSlot,
    smithy: state.smithy,
    generator: state.generator,
    battery: state.battery,
    floorMap: state.floorMap,
    autoMiners: state.autoMiners,
    conveyors: state.conveyors,
    autoSmelters: state.autoSmelters,
    manualAssembler: state.manualAssembler,
    machinePowerRatio: state.machinePowerRatio,
    saplingGrowAt: state.saplingGrowAt,
    buildingSourceWarehouseIds: state.buildingSourceWarehouseIds,
    productionZones: state.productionZones,
    buildingZoneIds: state.buildingZoneIds,
  };
}

// ---- Deserialisation (SaveGameLatest → GameState) --------------------

/**
 * Hydrate a migrated save into a full `GameState` by re-deriving
 * runtime-only fields (connectivity, powered machines, UI defaults).
 */
export function deserializeState(save: SaveGameLatest): GameState {
  const base = createInitialState(save.mode);

  const partial: GameState = {
    ...base,
    // Persisted fields from save
    mode: save.mode,
    assets: save.assets,
    cellMap: save.cellMap,
    inventory: save.inventory,
    purchasedBuildings: save.purchasedBuildings,
    placedBuildings: save.placedBuildings,
    warehousesPurchased: save.warehousesPurchased,
    warehousesPlaced: save.warehousesPlaced,
    warehouseInventories: save.warehouseInventories,
    cablesPlaced: save.cablesPlaced,
    powerPolesPlaced: save.powerPolesPlaced,
    hotbarSlots: save.hotbarSlots,
    activeSlot: save.activeSlot,
    smithy: save.smithy,
    generator: save.generator,
    battery: save.battery,
    floorMap: save.floorMap,
    autoMiners: save.autoMiners,
    conveyors: save.conveyors,
    autoSmelters: save.autoSmelters,
    manualAssembler: { ...save.manualAssembler, buildingId: save.manualAssembler?.buildingId ?? null },
    machinePowerRatio: save.machinePowerRatio,
    saplingGrowAt: save.saplingGrowAt,

    // Persisted per-building warehouse source mapping (new; old saves → empty)
    // Clean out any stale warehouse references that no longer exist in the save
    buildingSourceWarehouseIds: cleanBuildingSourceIds(
      save.buildingSourceWarehouseIds ?? {},
      new Set(Object.keys(save.warehouseInventories)),
    ),

    // Production zones (new; old saves → empty)
    productionZones: save.productionZones ?? {},
    // Per-building zone assignments – clean out entries for deleted buildings or deleted zones
    buildingZoneIds: cleanBuildingZoneIds(
      save.buildingZoneIds ?? {},
      new Set(Object.keys(save.assets)),
      new Set(Object.keys(save.productionZones ?? {})),
    ),

    // Derived / transient fields → defaults
    connectedAssetIds: [],           // recomputed below
    poweredMachineIds: [],           // recomputed on next ENERGY_NET_TICK
    openPanel: null,
    notifications: [],
    buildMode: false,
    selectedBuildingType: null,
    selectedFloorTile: null,
    selectedWarehouseId: null,
    selectedPowerPoleId: null,
    selectedAutoMinerId: null,
    selectedAutoSmelterId: null,
    selectedGeneratorId: null,
    energyDebugOverlay: false,
    autoDeliveryLog: [],
    selectedCraftingBuildingId: null,
  };

  // Re-derive connectivity (two-phase BFS)
  partial.connectedAssetIds = computeConnectedAssetIds(partial);

  return partial;
}

// ---- Combined load helper --------------------------------------------

/**
 * One-stop helper for loading: parse → migrate → hydrate.
 * Returns a fresh initial state if anything goes wrong.
 */
export function loadAndHydrate(raw: unknown, mode: GameMode): GameState {
  const migrated = migrateSave(raw);
  if (!migrated) return createInitialState(mode);

  // Only load if the saved mode matches the requested mode
  if (migrated.mode !== mode) return createInitialState(mode);

  return deserializeState(migrated);
}
