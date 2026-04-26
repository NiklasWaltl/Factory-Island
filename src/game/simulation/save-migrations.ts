import type {
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
  AutoSmelterEntry,
  ManualAssemblerState,
  ProductionZone,
  CollectionNode,
  StarterDroneState,
  ServiceHubEntry,
  ConstructionSite,
  KeepStockByWorkbench,
} from "../store/reducer";
import {
  createEmptyHubInventory,
  createDefaultHubTargetStock,
  MAP_SHOP_POS,
  GENERATOR_MAX_FUEL,
} from "../store/reducer";
import type { HubTier } from "../store/reducer";
import type { NetworkSlice } from "../inventory/reservationTypes";
import { createEmptyNetworkSlice } from "../inventory/reservationTypes";
import type { CraftingQueueState } from "../crafting/types";
import { createEmptyCraftingQueue } from "../crafting/types";
import { type RecipeAutomationPolicyMap } from "../crafting/policies";
import { debugLog } from "../debug/debugLogger";
import { migrateV0ToV1 } from "./save-legacy";

/** Current save format version. Bump when persisted shape changes. */
export const CURRENT_SAVE_VERSION = 16;

// ---- Save schema (V1 - initial versioned format) --------------------

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

// ---- Save schema (V2 - per-instance generator state) ----------------

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

export interface SaveGameV3 extends Omit<SaveGameV2, "version"> {
  version: 3;
  collectionNodes: Record<string, CollectionNode>;
}

export interface SaveGameV4 extends Omit<SaveGameV3, "version"> {
  version: 4;
  starterDrone: StarterDroneState;
}

export interface SaveGameV5 extends Omit<SaveGameV4, "version"> {
  version: 5;
}

export interface SaveGameV6 extends Omit<SaveGameV5, "version"> {
  version: 6;
  serviceHubs: Record<string, ServiceHubEntry>;
}

export interface SaveGameV7 extends Omit<SaveGameV6, "version"> {
  version: 7;
  constructionSites: Record<string, ConstructionSite>;
}

export interface SaveGameV8 extends Omit<SaveGameV7, "version"> {
  version: 8;
}

export interface SaveGameV9 extends Omit<SaveGameV8, "version"> {
  version: 9;
}

export interface SaveGameV10 extends Omit<SaveGameV9, "version"> {
  version: 10;
}

export interface SaveGameV11 extends Omit<SaveGameV10, "version"> {
  version: 11;
}

export interface SaveGameV12 extends Omit<SaveGameV11, "version"> {
  version: 12;
  drones: Record<string, StarterDroneState>;
}

export interface SaveGameV13 extends Omit<SaveGameV12, "version"> {
  version: 13;
}

export interface SaveGameV14 extends Omit<SaveGameV13, "version"> {
  version: 14;
  network: NetworkSlice;
  crafting: CraftingQueueState;
}

export interface SaveGameV15 extends Omit<SaveGameV14, "version"> {
  version: 15;
  keepStockByWorkbench: KeepStockByWorkbench;
}

export interface SaveGameV16 extends Omit<SaveGameV15, "version"> {
  version: 16;
  recipeAutomationPolicies: RecipeAutomationPolicyMap;
}

export type SaveGameLatest = SaveGameV16;

/**
 * Clamp each generator's local fuel buffer to GENERATOR_MAX_FUEL.
 * Pure and idempotent; applied on load.
 */
export function clampGeneratorFuel(
  generators: Record<string, GeneratorState>,
): Record<string, GeneratorState> {
  const out: Record<string, GeneratorState> = {};
  for (const [id, g] of Object.entries(generators)) {
    out[id] = g.fuel > GENERATOR_MAX_FUEL ? { ...g, fuel: GENERATOR_MAX_FUEL } : g;
  }
  return out;
}

type MigrationStep = {
  from: number;
  to: number;
  migrate: (save: any) => any;
};

function migrateV1ToV2(save: SaveGameV1): SaveGameV2 {
  const oldGen: GeneratorState = save.generator ?? { fuel: 0, progress: 0, running: false };
  const generators: Record<string, GeneratorState> = {};
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

function migrateV2ToV3(save: SaveGameV2): SaveGameV3 {
  return { ...save, version: 3, collectionNodes: {} };
}

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

function migrateV4ToV5(save: SaveGameV4): SaveGameV5 {
  return {
    ...save,
    version: 5,
    starterDrone: { ...save.starterDrone, hubId: null },
  };
}

function migrateV5ToV6(save: SaveGameV5): SaveGameV6 {
  const serviceHubs: Record<string, ServiceHubEntry> = {};
  for (const [id, asset] of Object.entries(save.assets)) {
    if (asset.type === "service_hub") {
      serviceHubs[id] = {
        inventory: createEmptyHubInventory(),
        targetStock: createDefaultHubTargetStock(),
        tier: 2,
        droneIds: [],
      };
    }
  }
  return {
    ...save,
    version: 6,
    serviceHubs,
  };
}

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
  const drones: Record<string, StarterDroneState> = {};
  if (save.starterDrone) {
    const droneId = (save.starterDrone as any).droneId ?? "starter";
    drones[droneId] = {
      ...save.starterDrone,
      droneId,
      craftingJobId: (save.starterDrone as any).craftingJobId ?? null,
    } as StarterDroneState;
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
  const drones: Record<string, StarterDroneState> = {};
  for (const [id, drone] of Object.entries(save.drones ?? {})) {
    drones[id] = {
      ...drone,
      droneId: (drone as any).droneId ?? id,
      craftingJobId: (drone as any).craftingJobId ?? null,
    } as StarterDroneState;
  }
  const starterDrone = save.starterDrone
    ? {
        ...save.starterDrone,
        craftingJobId: (save.starterDrone as any).craftingJobId ?? null,
      } as StarterDroneState
    : save.starterDrone;
  return { ...save, version: 13, drones, starterDrone };
}

function migrateV13ToV14(save: SaveGameV13): SaveGameV14 {
  debugLog.general("Migration v13->v14: old save -> empty reservations/jobs");
  return {
    ...save,
    version: 14,
    network: createEmptyNetworkSlice(),
    crafting: createEmptyCraftingQueue(),
  };
}

function migrateV14ToV15(save: SaveGameV14): SaveGameV15 {
  return {
    ...save,
    version: 15,
    keepStockByWorkbench: {},
  };
}

function migrateV15ToV16(save: SaveGameV15): SaveGameV16 {
  return {
    ...save,
    version: 16,
    recipeAutomationPolicies: {},
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
  { from: 14, to: 15, migrate: migrateV14ToV15 },
  { from: 15, to: 16, migrate: migrateV15ToV16 },
];

export function migrateSave(raw: unknown): SaveGameLatest | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Record<string, unknown>;
  let version: number =
    typeof data.version === "number" && Number.isFinite(data.version)
      ? data.version
      : 0;

  if (version > CURRENT_SAVE_VERSION) {
    console.warn(
      `[save] Save version ${version} is newer than code version ${CURRENT_SAVE_VERSION}. Ignoring save.`,
    );
    return null;
  }

  let save: any = data;
  for (const step of MIGRATIONS) {
    if (version === step.from) {
      save = step.migrate(save);
      version = step.to;
    }
  }

  if (version !== CURRENT_SAVE_VERSION) {
    console.warn(
      `[save] Migration ended at v${version}, expected v${CURRENT_SAVE_VERSION}. Save may be corrupted.`,
    );
    return null;
  }

  return save as SaveGameLatest;
}
