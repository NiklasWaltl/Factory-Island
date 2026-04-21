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
  CollectionNode,
  StarterDroneState,
  ServiceHubEntry,
  ConstructionSite,
  DroneTaskType,
  DroneRole,
} from "../store/reducer";
import {
  computeConnectedAssetIds,
  createInitialState,
  cleanBuildingSourceIds,
  cleanBuildingZoneIds,
  createEmptyHubInventory,
  createDefaultHubTargetStock,
  createDefaultProtoHubTargetStock,
  getDroneHomeDock,
  MAP_SHOP_POS,
  GRID_W,
  GRID_H,
  cellKey,
} from "../store/reducer";
import type { HubTier } from "../store/reducer";
import type { NetworkSlice, Reservation } from "../inventory/reservationTypes";
import { createEmptyNetworkSlice } from "../inventory/reservationTypes";
import type { CraftingQueueState, CraftingJob, JobStatus, JobPriority, JobSource } from "../crafting/types";
import { createEmptyCraftingQueue } from "../crafting/types";
import { debugLog } from "../debug/debugLogger";

// ---- Version constants -----------------------------------------------

/** Current save format version.  Bump when GameState shape changes. */
export const CURRENT_SAVE_VERSION = 14;

// ---- Save schema (V1 – initial versioned format) ---------------------

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
  buildingSourceWarehouseIds?: Record<string, string>;
  productionZones?: Record<string, ProductionZone>;
  buildingZoneIds?: Record<string, string>;
}

// ---- Save schema (V2 – per-instance generator state) -----------------

export interface SaveGameV2 {
  version: 2;
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
  /** Per-instance generator state keyed by asset ID. */
  generators: Record<string, GeneratorState>;
  battery: BatteryState;
  floorMap: Record<string, "stone_floor">;
  autoMiners: Record<string, AutoMinerEntry>;
  conveyors: Record<string, ConveyorState>;
  autoSmelters: Record<string, AutoSmelterEntry>;
  manualAssembler: ManualAssemblerState;
  machinePowerRatio: Record<string, number>;
  saplingGrowAt: Record<string, number>;
  buildingSourceWarehouseIds?: Record<string, string>;
  productionZones?: Record<string, ProductionZone>;
  buildingZoneIds?: Record<string, string>;
}

// ---- Save schema (V3 – world-bound collection nodes for manual harvest) ----

export interface SaveGameV3 extends Omit<SaveGameV2, "version"> {
  version: 3;
  /** World-bound drops from manual harvesting (Axt / Spitzhacke). */
  collectionNodes: Record<string, CollectionNode>;
}

// ---- Save schema (V4 – starter drone) --------------------------------

export interface SaveGameV4 extends Omit<SaveGameV3, "version"> {
  version: 4;
  starterDrone: StarterDroneState;
}

// ---- Save schema (V5 – hubId on drone, hub-integration preparation) ---

export interface SaveGameV5 extends Omit<SaveGameV4, "version"> {
  version: 5;
  // StarterDroneState now includes hubId: string | null
}

// ---- Save schema (V6 – per-hub inventory / serviceHubs) ---------------

export interface SaveGameV6 extends Omit<SaveGameV5, "version"> {
  version: 6;
  /** Per-service-hub state (keyed by asset ID). */
  serviceHubs: Record<string, ServiceHubEntry>;
}

// ---- Save schema (V7 – construction sites + drone task fields) --------

export interface SaveGameV7 extends Omit<SaveGameV6, "version"> {
  version: 7;
  /** Outstanding resource debts for buildings under construction (keyed by asset ID). */
  constructionSites: Record<string, ConstructionSite>;
  // StarterDroneState now includes currentTaskType + deliveryTargetId
}

// ---- Save schema (V8 – claim/reservation layer) ----------------------

export interface SaveGameV8 extends Omit<SaveGameV7, "version"> {
  version: 8;
  // CollectionNode now has reservedByDroneId: string | null
  // StarterDroneState now has droneId: string
}

// ---- Save schema (V9 – per-hub configurable target stock) -------------

export interface SaveGameV9 extends Omit<SaveGameV8, "version"> {
  version: 9;
  // ServiceHubEntry now includes targetStock: Record<CollectableItemType, number>
}

// ---- Save schema (V10 – unified hub tier system) ---------------------

export interface SaveGameV10 extends Omit<SaveGameV9, "version"> {
  version: 10;
  // ServiceHubEntry now includes tier: HubTier
}

// ---- Save schema (V11 – hub droneIds for multi-drone prep) -----------

export interface SaveGameV11 extends Omit<SaveGameV10, "version"> {
  version: 11;
  // ServiceHubEntry now includes droneIds: string[]
}

export interface SaveGameV12 extends Omit<SaveGameV11, "version"> {
  version: 12;
  drones: Record<string, StarterDroneState>;
}

export interface SaveGameV13 extends Omit<SaveGameV12, "version"> {
  version: 13;
}

// ---- Save schema (V14 – persist reservation network + crafting queue) ----
//
// Save format for the new slices (Step 2 + Step 3 of the crafting/inventory
// architecture).
//
// `network` (NetworkSlice):
//   - reservations: Reservation[]      → all live holds; each entry is
//       { id, itemId, amount, ownerKind, ownerId, scopeKey?, createdAt }
//   - nextReservationId: number        → monotonic id counter
//   - lastError: NetworkError | null   → cleared on next successful action
//
// `crafting` (CraftingQueueState):
//   - jobs: CraftingJob[]              → all queued/reserved/crafting jobs.
//       Each entry carries a frozen recipe snapshot plus runtime fields
//       (status, progress, startedAt, finishesAt, reservationOwnerId).
//       Timer rekonstruktion: `progress` is the authoritative tick counter;
//       startedAt / finishesAt are wall-clock and informational only.
//   - nextJobSeq: number               → monotonic id / FIFO counter
//   - lastError: CraftingError | null  → cleared on next successful action
//
// Old saves without these slices are migrated to empty defaults
// (createEmptyNetworkSlice / createEmptyCraftingQueue).

export interface SaveGameV14 extends Omit<SaveGameV13, "version"> {
  version: 14;
  network: NetworkSlice;
  crafting: CraftingQueueState;
}

// ---- Latest alias (always points at the newest version) ---------------

export type SaveGameLatest = SaveGameV14;

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
      ? { fuel: 0, progress: 0, running: false, ...(raw.generator as Partial<GeneratorState>) }
      : { fuel: 0, progress: 0, running: false },
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

// ---- V1 → V2: singular `generator` → per-id `generators` map --------

function migrateV1ToV2(save: SaveGameV1): SaveGameV2 {
  const oldGen: GeneratorState = save.generator ?? { fuel: 0, progress: 0, running: false };
  const generators: Record<string, GeneratorState> = {};
  // Assign old singleton state to the first generator found; remaining generators start empty.
  let first = true;
  for (const [id, asset] of Object.entries(save.assets ?? {})) {
    if ((asset as PlacedAsset).type === "generator") {
      generators[id] = first ? { ...oldGen } : { fuel: 0, progress: 0, running: false };
      first = false;
    }
  }
  const { generator: _dropped, ...rest } = save as any;
  return { ...rest, version: 2, generators } as SaveGameV2;
}

// ---- Migration registry ----------------------------------------------

type MigrationStep = {
  from: number;
  to: number;
  migrate: (save: any) => any;
};

// ---- V2 → V3: introduce world-bound collectionNodes map --------------

function migrateV2ToV3(save: SaveGameV2): SaveGameV3 {
  return { ...save, version: 3, collectionNodes: {} };
}

// ---- V3 → V4: introduce starter drone --------------------------------

function migrateV3ToV4(save: SaveGameV3): SaveGameV4 {
  const starterDrone: StarterDroneState = {
    status: "idle",
    tileX: MAP_SHOP_POS.x,
    tileY: MAP_SHOP_POS.y,
    targetNodeId: null,
    cargo: null,
    ticksRemaining: 0,
    hubId: null,
    currentTaskType: null,
    deliveryTargetId: null,
    craftingJobId: null,
    droneId: "starter",
  };
  return { ...save, version: 4, starterDrone };
}

// ---- V4 → V5: add hubId to starterDrone (hub-integration preparation) ---

function migrateV4ToV5(save: SaveGameV4): SaveGameV5 {
  return {
    ...save,
    version: 5,
    starterDrone: { ...save.starterDrone, hubId: null },
  };
}

/**
 * V5 → V6: Add per-hub inventory (serviceHubs).
 * Existing hubs (placed service_hub assets with matching drone.hubId) get an
 * empty inventory. Hubs without a drone assignment also get an empty inventory.
 */
function migrateV5ToV6(save: SaveGameV5): SaveGameV6 {
  const serviceHubs: Record<string, ServiceHubEntry> = {};
  // Create an entry for every service_hub asset that exists in the save
  for (const [id, asset] of Object.entries(save.assets)) {
    if (asset.type === "service_hub") {
      serviceHubs[id] = { inventory: createEmptyHubInventory(), targetStock: createDefaultHubTargetStock(), tier: 2, droneIds: [] };
    }
  }
  return {
    ...save,
    version: 6,
    serviceHubs,
  };
}

/**
 * V6 → V7: Add construction sites map + drone task fields.
 */
function migrateV6ToV7(save: SaveGameV6): SaveGameV7 {
  return {
    ...save,
    version: 7,
    constructionSites: {},
    starterDrone: {
      ...save.starterDrone,
      currentTaskType: null,
      deliveryTargetId: null,
    },
  };
}

/**
 * V7 → V8: Add claim/reservation fields.
 * - droneId added to starterDrone
 * - reservedByDroneId cleared on all collectionNodes (safe: drone re-claims on next tick)
 */
function migrateV7ToV8(save: SaveGameV7): SaveGameV8 {
  const clearedNodes: Record<string, CollectionNode> = {};
  for (const [id, node] of Object.entries(save.collectionNodes ?? {})) {
    clearedNodes[id] = { ...node, reservedByDroneId: null };
  }
  return {
    ...save,
    version: 8,
    collectionNodes: clearedNodes,
    starterDrone: {
      ...save.starterDrone,
      droneId: "starter",
    },
  };
}

/**
 * V8 → V9: Add per-hub configurable target stock.
 * - Each ServiceHubEntry gets a targetStock field with global defaults.
 */
function migrateV8ToV9(save: SaveGameV8): SaveGameV9 {
  const migratedHubs: Record<string, ServiceHubEntry> = {};
  for (const [id, entry] of Object.entries(save.serviceHubs ?? {})) {
    migratedHubs[id] = {
      ...entry,
      targetStock: (entry as any).targetStock ?? createDefaultHubTargetStock(),
    };
  }
  return {
    ...save,
    version: 9,
    serviceHubs: migratedHubs,
  };
}

/**
 * V9 → V10: Unified hub tier system.
 * - Each ServiceHubEntry gets a tier field. Existing hubs become Tier 2.
 * - If no hub exists, the save will get a proto-hub created in deserializeState.
 */
function migrateV9ToV10(save: SaveGameV9): SaveGameV10 {
  const migratedHubs: Record<string, ServiceHubEntry> = {};
  for (const [id, entry] of Object.entries(save.serviceHubs ?? {})) {
    migratedHubs[id] = {
      ...entry,
      tier: ((entry as any).tier as HubTier) ?? 2,
    };
  }
  return {
    ...save,
    version: 10,
    serviceHubs: migratedHubs,
  };
}

/**
 * V10 → V11: Add droneIds to ServiceHubEntry for multi-drone prep.
 * - Each hub gets a droneIds array derived from the starterDrone's hubId.
 */
function migrateV10ToV11(save: SaveGameV10): SaveGameV11 {
  const droneHubId = save.starterDrone?.hubId ?? null;
  const migratedHubs: Record<string, ServiceHubEntry> = {};
  for (const [id, entry] of Object.entries(save.serviceHubs ?? {})) {
    migratedHubs[id] = {
      ...entry,
      droneIds: (entry as any).droneIds ?? (droneHubId === id ? ["starter"] : []),
    };
  }
  return {
    ...save,
    version: 11,
    serviceHubs: migratedHubs,
  };
}

function migrateV11ToV12(save: SaveGameV11): SaveGameV12 {
  // Convert single starterDrone into drones record
  const drones: Record<string, StarterDroneState> = {};
  if (save.starterDrone) {
    const droneId = (save.starterDrone as any).droneId ?? "starter";
    drones[droneId] = { ...save.starterDrone, droneId, craftingJobId: (save.starterDrone as any).craftingJobId ?? null } as StarterDroneState;
  } else {
    drones["starter"] = {
      status: "idle",
      tileX: MAP_SHOP_POS.x,
      tileY: MAP_SHOP_POS.y,
      targetNodeId: null,
      cargo: null,
      ticksRemaining: 0,
      hubId: null,
      currentTaskType: null,
      deliveryTargetId: null,
      craftingJobId: null,
      droneId: "starter",
    };
  }
  return { ...save, version: 12, drones };
}

function migrateV12ToV13(save: SaveGameV12): SaveGameV13 {
  // Ensure droneId field on all existing drones
  const drones: Record<string, StarterDroneState> = {};
  for (const [id, drone] of Object.entries(save.drones ?? {})) {
    drones[id] = { ...drone, droneId: (drone as any).droneId ?? id, craftingJobId: (drone as any).craftingJobId ?? null } as StarterDroneState;
  }
  const starterDrone = save.starterDrone
    ? { ...save.starterDrone, craftingJobId: (save.starterDrone as any).craftingJobId ?? null } as StarterDroneState
    : save.starterDrone;
  return { ...save, version: 13, drones, starterDrone };
}

/**
 * V13 → V14: introduce persisted `network` (reservations) and `crafting`
 * (job queue) slices. Old saves had no concept of either, so we seed
 * empty defaults — no jobs, no reservations.
 */
function migrateV13ToV14(save: SaveGameV13): SaveGameV14 {
  debugLog.general("Migration v13→v14: old save → empty reservations/jobs");
  return {
    ...save,
    version: 14,
    network: createEmptyNetworkSlice(),
    crafting: createEmptyCraftingQueue(),
  };
}

const MIGRATIONS: MigrationStep[] = [
  { from: 0, to: 1, migrate: migrateV0ToV1 },
  { from: 1, to: 2, migrate: migrateV1ToV2 },
  { from: 2, to: 3, migrate: migrateV2ToV3 },
  { from: 3, to: 4, migrate: migrateV3ToV4 },
  { from: 4, to: 5, migrate: migrateV4ToV5 },
  { from: 5, to: 6, migrate: migrateV5ToV6 },
  { from: 6, to: 7, migrate: migrateV6ToV7 },
  { from: 7, to: 8, migrate: migrateV7ToV8 },
  { from: 8, to: 9, migrate: migrateV8ToV9 },
  { from: 9, to: 10, migrate: migrateV9ToV10 },
  { from: 10, to: 11, migrate: migrateV10ToV11 },
  { from: 11, to: 12, migrate: migrateV11ToV12 },
  { from: 12, to: 13, migrate: migrateV12ToV13 },
  { from: 13, to: 14, migrate: migrateV13ToV14 },
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
  debugLog.general(
    `Save: ${state.network.reservations.length} reservations, ${state.crafting.jobs.length} jobs`,
  );
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
    generators: state.generators,
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
    collectionNodes: state.collectionNodes,
    starterDrone: state.starterDrone,
    serviceHubs: state.serviceHubs,
    constructionSites: state.constructionSites,
    drones: state.drones,
    network: state.network,
    crafting: state.crafting,
  };
}

// ---- Validation helpers for restored network/crafting slices ---------

const VALID_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  "queued", "reserved", "crafting", "delivering", "done", "cancelled",
]);
const VALID_JOB_PRIORITIES: ReadonlySet<JobPriority> = new Set([
  "high", "normal", "low",
]);
const VALID_JOB_SOURCES: ReadonlySet<JobSource> = new Set([
  "player", "automation",
]);

/**
 * Sanitize a raw NetworkSlice from a save. Drops malformed reservations
 * and ensures the id counter is consistent with the surviving entries.
 * Reservations whose `ownerKind === "crafting_job"` but whose `ownerId`
 * does not match a surviving job are also dropped (consistency).
 */
function sanitizeNetworkSlice(
  raw: NetworkSlice | undefined | null,
  liveJobIds: ReadonlySet<string>,
): NetworkSlice {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.reservations)) {
    return createEmptyNetworkSlice();
  }
  const cleaned: Reservation[] = [];
  for (const r of raw.reservations) {
    if (!r || typeof r !== "object") continue;
    if (typeof r.id !== "string" || !r.id) continue;
    if (typeof r.itemId !== "string" || !r.itemId) continue;
    if (typeof r.amount !== "number" || !Number.isFinite(r.amount) || r.amount <= 0) continue;
    if (r.ownerKind !== "crafting_job" && r.ownerKind !== "system_request") continue;
    if (typeof r.ownerId !== "string" || !r.ownerId) continue;
    if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) continue;
    // Drop crafting_job reservations whose owning job no longer exists
    if (r.ownerKind === "crafting_job" && !liveJobIds.has(r.ownerId)) continue;
    cleaned.push(r);
  }
  const maxId = cleaned.reduce((m, r) => {
    const n = Number.parseInt(r.id.replace(/^[^0-9]*/, ""), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  const nextReservationId = Math.max(
    typeof raw.nextReservationId === "number" && Number.isFinite(raw.nextReservationId)
      ? raw.nextReservationId
      : 1,
    maxId + 1,
  );
  return {
    reservations: cleaned,
    nextReservationId,
    lastError: null, // Always clear transient error on load
  };
}

/**
 * Sanitize a raw CraftingQueueState from a save. Drops malformed jobs
 * and cancels (drops) jobs whose workbench asset has been deleted.
 * Returns the cleaned queue plus the count of invalid/cancelled jobs.
 */
function sanitizeCraftingQueue(
  raw: CraftingQueueState | undefined | null,
  liveAssetIds: ReadonlySet<string>,
): { queue: CraftingQueueState; cancelled: number } {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.jobs)) {
    return { queue: createEmptyCraftingQueue(), cancelled: 0 };
  }
  const cleaned: CraftingJob[] = [];
  let cancelled = 0;
  for (const j of raw.jobs) {
    if (!j || typeof j !== "object") { cancelled++; continue; }
    if (typeof j.id !== "string" || !j.id) { cancelled++; continue; }
    if (typeof j.recipeId !== "string" || !j.recipeId) { cancelled++; continue; }
    if (typeof j.workbenchId !== "string" || !j.workbenchId) { cancelled++; continue; }
    if (!VALID_JOB_STATUSES.has(j.status)) { cancelled++; continue; }
    if (!VALID_JOB_PRIORITIES.has(j.priority)) { cancelled++; continue; }
    if (!VALID_JOB_SOURCES.has(j.source)) { cancelled++; continue; }
    if (typeof j.enqueuedAt !== "number" || !Number.isFinite(j.enqueuedAt)) { cancelled++; continue; }
    if (!Array.isArray(j.ingredients) || !j.output || typeof j.output !== "object") { cancelled++; continue; }
    if (typeof j.processingTime !== "number" || j.processingTime < 0) { cancelled++; continue; }
    if (typeof j.progress !== "number" || j.progress < 0) { cancelled++; continue; }
    // Cancel terminal jobs from prior runs (they should never have been saved
    // alive, but be defensive).
    if (j.status === "done" || j.status === "cancelled") { cancelled++; continue; }
    // Cancel jobs whose workbench was deleted between save and load
    if (!liveAssetIds.has(j.workbenchId)) { cancelled++; continue; }
    cleaned.push({
      ...j,
      inputBuffer: Array.isArray((j as Partial<CraftingJob>).inputBuffer)
        ? (j as Partial<CraftingJob>).inputBuffer!.filter(
            (stack): stack is CraftingJob["ingredients"][number] =>
              !!stack &&
              typeof stack === "object" &&
              typeof stack.itemId === "string" &&
              typeof stack.count === "number" &&
              Number.isFinite(stack.count) &&
              stack.count > 0,
          )
        : [],
    });
  }
  const maxSeq = cleaned.reduce((m, j) => (j.enqueuedAt > m ? j.enqueuedAt : m), 0);
  const nextJobSeq = Math.max(
    typeof raw.nextJobSeq === "number" && Number.isFinite(raw.nextJobSeq)
      ? raw.nextJobSeq
      : 1,
    maxSeq + 1,
  );
  return {
    queue: { jobs: cleaned, nextJobSeq, lastError: null },
    cancelled,
  };
}

// ---- Deserialisation (SaveGameLatest → GameState) --------------------

const VALID_DRONE_STATUSES = new Set([
  "idle", "moving_to_collect", "collecting", "moving_to_dropoff", "depositing", "returning_to_dock",
]);

/**
 * Sanitize a raw drone state from a save. Guards against:
 * - Missing field (null/undefined save)
 * - Unrecognized status string (e.g. from a rolled-back feature branch)
 * - Negative or NaN ticksRemaining
 */
function sanitizeStarterDrone(raw: StarterDroneState | undefined | null): StarterDroneState {
  const fallback: StarterDroneState = {
    status: "idle",
    tileX: MAP_SHOP_POS.x,
    tileY: MAP_SHOP_POS.y,
    targetNodeId: null,
    cargo: null,
    ticksRemaining: 0,
    hubId: null,
    currentTaskType: null,
    deliveryTargetId: null,
    craftingJobId: null,
    droneId: "starter",
  };
  if (!raw || typeof raw !== "object") return fallback;

  const status = VALID_DRONE_STATUSES.has(raw.status) ? raw.status : "idle";
  const ticksRemaining = Number.isFinite(raw.ticksRemaining) && raw.ticksRemaining >= 0
    ? raw.ticksRemaining
    : 0;
  // If status reset to idle, also clear transient fields to avoid stale references
  const needsReset = status !== raw.status;
  return {
    status,
    tileX: Number.isFinite(raw.tileX) ? raw.tileX : MAP_SHOP_POS.x,
    tileY: Number.isFinite(raw.tileY) ? raw.tileY : MAP_SHOP_POS.y,
    targetNodeId: needsReset ? null : (raw.targetNodeId ?? null),
    cargo: needsReset ? null : (raw.cargo ?? null),
    ticksRemaining: needsReset ? 0 : ticksRemaining,
    hubId: typeof raw.hubId === "string" ? raw.hubId : null,
    currentTaskType: needsReset ? null : ((raw as any).currentTaskType ?? null),
    deliveryTargetId: needsReset ? null : ((raw as any).deliveryTargetId ?? null),
    craftingJobId: needsReset ? null : (typeof (raw as any).craftingJobId === "string" ? (raw as any).craftingJobId : null),
    droneId: typeof (raw as any).droneId === "string" ? (raw as any).droneId : "starter",
    // Preserve role if valid; silently fall back to "auto" for unrecognised values
    role: (["auto", "construction", "supply"] as DroneRole[]).includes((raw as any).role)
      ? (raw as any).role as DroneRole
      : "auto",
  };
}

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
    smithy: { ...base.smithy, ...save.smithy, buildingId: save.smithy?.buildingId ?? null },
    generators: save.generators ?? {},
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

    // Collection nodes (world-bound drops from manual harvest)
    // Always clear reservations on load — the drone re-claims on its first idle tick
    collectionNodes: (() => {
      const raw = save.collectionNodes ?? {};
      const cleaned: Record<string, CollectionNode> = {};
      for (const [id, node] of Object.entries(raw)) {
        cleaned[id] = { ...node, reservedByDroneId: null };
      }
      return cleaned;
    })(),
    // Starter drone — sanitized, then stale hubId cleared if hub asset is gone
    starterDrone: (() => {
      const drone = sanitizeStarterDrone(save.starterDrone);
      let d = drone;
      if (d.hubId && !save.assets[d.hubId]) {
        d = { ...d, hubId: null };
      }
      if (d.deliveryTargetId && !save.assets[d.deliveryTargetId]) {
        d = { ...d, deliveryTargetId: null, currentTaskType: null };
      }
      // Re-assign to first existing hub if hubId was cleared but hubs exist
      if (!d.hubId) {
        const existingHubId = Object.keys(save.assets).find((id) => save.assets[id]?.type === "service_hub") ?? null;
        if (existingHubId) {
          d = { ...d, hubId: existingHubId };
        }
      }
      // Snap idle drone to its home position
      if (d.status === "idle") {
        if (d.hubId && save.assets[d.hubId]) {
          d = { ...d, tileX: save.assets[d.hubId].x, tileY: save.assets[d.hubId].y };
        } else if (!d.hubId) {
          d = { ...d, tileX: MAP_SHOP_POS.x, tileY: MAP_SHOP_POS.y };
        }
      }
      return d;
    })(),
    // Drones record — sanitize each drone, clear stale references
    drones: (() => {
      const raw = save.drones ?? {};
      const cleaned: Record<string, StarterDroneState> = {};
      for (const [id, rawDrone] of Object.entries(raw)) {
        let d = sanitizeStarterDrone(rawDrone);
        if (d.hubId && !save.assets[d.hubId]) d = { ...d, hubId: null };
        if (d.deliveryTargetId && !save.assets[d.deliveryTargetId]) d = { ...d, deliveryTargetId: null, currentTaskType: null };
        if (!d.hubId) {
          const existingHubId = Object.keys(save.assets).find((aid) => save.assets[aid]?.type === "service_hub") ?? null;
          if (existingHubId) d = { ...d, hubId: existingHubId };
        }
        if (d.status === "idle" && d.hubId && save.assets[d.hubId]) {
          d = { ...d, tileX: save.assets[d.hubId].x, tileY: save.assets[d.hubId].y };
        }
        cleaned[id] = d;
      }
      return cleaned;
    })(),
    // Per-hub state — clean out entries for removed hub assets, ensure tier + droneIds fields
    serviceHubs: (() => {
      const raw = save.serviceHubs ?? {};
      const cleaned: Record<string, ServiceHubEntry> = {};
      for (const [id, entry] of Object.entries(raw)) {
        if (save.assets[id]?.type === "service_hub") {
          const tier: HubTier = (entry as any).tier === 1 ? 1 : 2;
          cleaned[id] = {
            inventory: { ...createEmptyHubInventory(), ...entry.inventory },
            targetStock: entry.targetStock ?? (tier === 1 ? createDefaultProtoHubTargetStock() : createDefaultHubTargetStock()),
            tier,
            droneIds: Array.isArray((entry as any).droneIds) ? (entry as any).droneIds : [],
          };
        }
      }
      return cleaned;
    })(),
    // Construction sites — clean out entries for removed assets
    constructionSites: (() => {
      const raw = save.constructionSites ?? {};
      const cleaned: Record<string, ConstructionSite> = {};
      for (const [id, site] of Object.entries(raw)) {
        if (save.assets[id]) {
          cleaned[id] = site;
        }
      }
      return cleaned;
    })(),

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
    selectedServiceHubId: null,
    energyDebugOverlay: false,
    autoDeliveryLog: [],
    selectedCraftingBuildingId: null,
  };

  // --- Ensure at least one hub exists (proto-hub for old saves without any) ---
  const hasAnyHub = Object.values(partial.assets).some((a) => a.type === "service_hub");
  if (!hasAnyHub) {
    // Find a free 2×2 spot near MAP_SHOP_POS
    const candidates: { x: number; y: number; dist: number }[] = [];
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const wx = MAP_SHOP_POS.x + dx;
        const wy = MAP_SHOP_POS.y + dy;
        if (wx < 0 || wy < 0 || wx + 2 > GRID_W || wy + 2 > GRID_H) continue;
        candidates.push({ x: wx, y: wy, dist: Math.abs(dx) + Math.abs(dy) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const { x, y } of candidates) {
      const k00 = cellKey(x, y);
      const k10 = cellKey(x + 1, y);
      const k01 = cellKey(x, y + 1);
      const k11 = cellKey(x + 1, y + 1);
      if (!partial.cellMap[k00] && !partial.cellMap[k10] && !partial.cellMap[k01] && !partial.cellMap[k11]) {
        const hubId = `proto-hub-${Date.now()}`;
        const hubAsset: PlacedAsset = { id: hubId, type: "service_hub", x, y, size: 2, fixed: true } as PlacedAsset;
        partial.assets = { ...partial.assets, [hubId]: hubAsset };
        partial.cellMap = { ...partial.cellMap, [k00]: hubId, [k10]: hubId, [k01]: hubId, [k11]: hubId };
        partial.serviceHubs = {
          ...partial.serviceHubs,
          [hubId]: { inventory: createEmptyHubInventory(), targetStock: createDefaultProtoHubTargetStock(), tier: 1, droneIds: [partial.starterDrone.droneId] },
        };
        partial.starterDrone = { ...partial.starterDrone, hubId, tileX: x, tileY: y };
        break;
      }
    }
  }

  // Consistency: ensure drone's hubId is reflected in the hub's droneIds
  if (partial.starterDrone.hubId) {
    const dHub = partial.serviceHubs[partial.starterDrone.hubId];
    if (dHub && !dHub.droneIds.includes(partial.starterDrone.droneId)) {
      partial.serviceHubs = {
        ...partial.serviceHubs,
        [partial.starterDrone.hubId]: { ...dHub, droneIds: [...dHub.droneIds, partial.starterDrone.droneId] },
      };
    }
  }

  const snapIdleDroneToDock = (drone: StarterDroneState): StarterDroneState => {
    if (drone.status !== "idle") return drone;
    const dock = getDroneHomeDock(drone, partial);
    if (dock) {
      return { ...drone, tileX: dock.x, tileY: dock.y };
    }
    if (!drone.hubId) {
      return { ...drone, tileX: MAP_SHOP_POS.x, tileY: MAP_SHOP_POS.y };
    }
    return drone;
  };

  partial.starterDrone = snapIdleDroneToDock(partial.starterDrone);
  partial.drones = Object.fromEntries(
    Object.entries(partial.drones).map(([id, drone]) => [id, snapIdleDroneToDock(drone)]),
  );

  // ---- Phase 1: re-derive globalInventory from physical stores ------
  // `state.inventory` is no longer the primary source of truth for keys that
  // have a physical home (wood/stone/iron/copper/ingots). Any such value
  // coming from an older save would double-count with warehouse/hub stock in
  // `selectGlobalInventoryView` and diverge from what build/consume paths see.
  //
  // Rule (mirrors the debug-fill & consume priority introduced in Phase 1):
  //   - If at least one warehouse exists → zero every physical key in global
  //     (warehouses can hold every physical key).
  //   - Else if at least one hub exists  → zero only hub-eligible keys
  //     (wood/stone/iron/copper). Ingots stay in global as legacy fallback
  //     because no hub can hold them.
  //   - Else → keep globalInventory as-is (pure legacy fallback: no physical
  //     home exists anywhere in the loaded state).
  //
  // Non-physical keys (coins, sapling, tools, building counters) are never
  // touched — they only ever live in `state.inventory`.
  {
    const hasWarehouse = Object.keys(partial.warehouseInventories).length > 0;
    const hasHub = Object.keys(partial.serviceHubs).length > 0;
    const PHYSICAL_WAREHOUSE_KEYS = ["wood", "stone", "iron", "copper", "ironIngot", "copperIngot"] as const;
    const PHYSICAL_HUB_KEYS = ["wood", "stone", "iron", "copper"] as const;
    const keysToZero: ReadonlyArray<keyof Inventory> = hasWarehouse
      ? (PHYSICAL_WAREHOUSE_KEYS as unknown as ReadonlyArray<keyof Inventory>)
      : hasHub
        ? (PHYSICAL_HUB_KEYS as unknown as ReadonlyArray<keyof Inventory>)
        : [];
    if (keysToZero.length > 0) {
      const nextInv = { ...partial.inventory } as Record<string, number>;
      let changed = false;
      for (const key of keysToZero) {
        if ((nextInv[key as string] ?? 0) !== 0) {
          nextInv[key as string] = 0;
          changed = true;
        }
      }
      if (changed) {
        partial.inventory = nextInv as unknown as Inventory;
        debugLog.general(
          `Load: re-derived globalInventory — zeroed physical keys [${keysToZero.join(", ")}] ` +
            `(warehouse=${hasWarehouse}, hub=${hasHub}).`,
        );
      }
    }
  }

  // Re-derive connectivity (two-phase BFS)
  partial.connectedAssetIds = computeConnectedAssetIds(partial);

  // ---- Restore persisted network + crafting slices ------------------
  // Order matters: sanitize crafting first so we know which job ids are
  // alive, then sanitize network and drop crafting_job reservations whose
  // owner job did not survive validation.
  const liveAssetIds = new Set(Object.keys(partial.assets));
  const craftingResult = sanitizeCraftingQueue((save as any).crafting, liveAssetIds);
  partial.crafting = craftingResult.queue;
  const liveJobIds = new Set(craftingResult.queue.jobs.map((j) => j.id));
  partial.network = sanitizeNetworkSlice((save as any).network, liveJobIds);

  debugLog.general(
    `Load: restored ${partial.network.reservations.length} reservations, ${partial.crafting.jobs.length} jobs`,
  );
  if (craftingResult.cancelled > 0) {
    debugLog.general(
      `Load validation: ${craftingResult.cancelled} invalid jobs cancelled`,
    );
  }

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
