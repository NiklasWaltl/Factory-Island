// ============================================================
// Factory Island - Game State & Logic
// ============================================================

import { debugLog } from "../debug/debugLogger";
import { CELL_PX, GRID_H, GRID_W } from "../constants/grid";
import {
  getManualAssemblerRecipe,
  getSmeltingRecipe,
  getWorkbenchRecipe,
  SMELTING_RECIPES,
} from "../simulation/recipes";

export type GameMode = "release" | "debug";

export type AssetType =
  | "tree"
  | "stone"
  | "iron"
  | "copper"
  | "sapling"
  | "workbench"
  | "warehouse"
  | "smithy"
  | "generator"
  | "cable"
  | "battery"
  | "power_pole"
  | "map_shop"
  | "stone_deposit"
  | "iron_deposit"
  | "copper_deposit"
  | "auto_miner"
  | "conveyor"
  | "conveyor_corner"
  | "manual_assembler"
  | "auto_smelter";

export type BuildingType = "workbench" | "warehouse" | "smithy" | "generator" | "cable" | "battery" | "power_pole" | "auto_miner" | "conveyor" | "conveyor_corner" | "manual_assembler" | "auto_smelter";

/** Floor tiles that can be placed on the ground layer */
export type FloorTileType = "stone_floor" | "grass_block";

export type MachinePriority = 1 | 2 | 3 | 4 | 5;

export interface PlacedAsset {
  id: string;
  type: AssetType;
  x: number;
  y: number;
  size: 1 | 2;
  width?: 1 | 2;
  height?: 1 | 2;
  fixed?: boolean;
  direction?: Direction;
  /** Energy scheduling priority (1 highest, 5 lowest) for consumer machines */
  priority?: MachinePriority;
  /**
   * Overclocking flag. Nur für auto_miner und auto_smelter unterstützt — die
   * SET_MACHINE_BOOST-Action erzwingt diesen Typ-Check. Andere Asset-Typen
   * ignorieren das Feld vollständig.
   */
  boosted?: boolean;
}

export interface Inventory {
  coins: number;
  wood: number;
  stone: number;
  iron: number;
  copper: number;
  sapling: number;
  ironIngot: number;
  copperIngot: number;
  metalPlate: number;
  gear: number;
  axe: number;
  wood_pickaxe: number;
  stone_pickaxe: number;
  workbench: number;
  warehouse: number;
  smithy: number;
  generator: number;
  cable: number;
  battery: number;
  power_pole: number;
  manual_assembler: number;
  auto_smelter: number;
}

export type ToolKind =
  | "axe"
  | "wood_pickaxe"
  | "stone_pickaxe"
  | "sapling"
  | "building"
  | "empty";

export interface HotbarSlot {
  toolKind: ToolKind;
  buildingType?: BuildingType;
  amount: number;
  label: string;
  emoji: string;
}

export interface SmithyState {
  fuel: number;
  iron: number;
  copper: number;
  selectedRecipe: "iron" | "copper";
  processing: boolean;
  progress: number;
  outputIngots: number;
  outputCopperIngots: number;
}

export interface ManualAssemblerState {
  processing: boolean;
  recipe: "metal_plate" | "gear" | null;
  progress: number;
  /** Asset ID of the building that started the current job (for output routing). */
  buildingId: string | null;
}

// ---- Directions ----
export type Direction = "north" | "east" | "south" | "west";

// ---- Auto-Miner ----
export interface AutoMinerEntry {
  depositId: string;
  resource: "stone" | "iron" | "copper";
  progress: number;
}

export type ConveyorItem =
  | "stone"
  | "iron"
  | "copper"
  | "ironIngot"
  | "copperIngot"
  | "metalPlate"
  | "gear";

export interface ConveyorState {
  queue: ConveyorItem[];
}

export type AutoSmelterStatus =
  | "IDLE"
  | "PROCESSING"
  | "OUTPUT_BLOCKED"
  | "NO_POWER"
  | "MISCONFIGURED";

export interface AutoSmelterProcessing {
  inputItem: ConveyorItem;
  outputItem: ConveyorItem;
  progressMs: number;
  durationMs: number;
}

export interface AutoSmelterEntry {
  inputBuffer: ConveyorItem[];
  processing: AutoSmelterProcessing | null;
  pendingOutput: ConveyorItem[];
  status: AutoSmelterStatus;
  lastRecipeInput: string | null;
  lastRecipeOutput: string | null;
  throughputEvents: number[];
  selectedRecipe: "iron" | "copper";
}

export type UIPanel =
  | "map_shop"
  | "warehouse"
  | "smithy"
  | "workbench"
  | "generator"
  | "battery"
  | "power_pole"
  | "auto_miner"
  | "auto_smelter"
  | "manual_assembler"
  | null;

// ---- Battery ----
export interface BatteryState {
  stored: number;
  capacity: number;
}

// ---- Generator ----
export interface GeneratorState {
  /** Wood currently in the fuel slot */
  fuel: number;
  /** Fractional charge progress within the current wood unit (0–1) */
  progress: number;
  /** Whether the generator is actively burning */
  running: boolean;
}

// ---- Energy Network ----
// NOTE: There is no central energy pool. Batteries are the sole energy storage.
// This interface is kept only as documentation of the removed concept.

export interface GameNotification {
  id: string;
  resource: string;
  displayName: string;
  amount: number;
  expiresAt: number;
  kind?: "success" | "error";
}

/**
 * A single entry in the auto-delivery log: records one batch of items
 * that an automatic device delivered into a warehouse.
 * `sourceType` is extendable for future auto-devices (e.g. "auto_smelter").
 */
export interface AutoDeliveryEntry {
  id: string;
  /** Type of the device that produced/delivered the item */
  sourceType: "auto_miner" | "conveyor";
  /** Asset ID of the source device */
  sourceId: string;
  /** The resource key that was delivered */
  resource: string;
  /** Total amount batched into this entry */
  amount: number;
  /** ID of the warehouse that received the items */
  warehouseId: string;
  /** Timestamp of the latest item in this batch */
  timestamp: number;
}

export interface GameState {
  mode: GameMode;
  assets: Record<string, PlacedAsset>;
  cellMap: Record<string, string>;
  /** Central resource pool for all island resources (manual harvest, crafting output, auto-delivery).
   *  This is the single source of truth for wood, stone, iron, copper, ingots, etc.
   *  Use getCapacityPerResource(state) for the per-resource cap. */
  inventory: Inventory;
  purchasedBuildings: BuildingType[];
  placedBuildings: BuildingType[];
  warehousesPurchased: number;
  warehousesPlaced: number;
  /** Per-warehouse storage (keyed by warehouse asset ID).
   *  Auto-delivery (conveyors, auto-miners) writes resources here.
   *  Also stores tools/equippable items that can be moved to/from the Hotbar.
   *  V1: Crafting, shop, build costs still use the global `inventory` pool. */
  warehouseInventories: Record<string, Inventory>;
  /** ID of the warehouse whose panel is currently open */
  selectedWarehouseId: string | null;
  cablesPlaced: number;
  powerPolesPlaced: number;
  /** ID of the power pole whose panel is currently open */
  selectedPowerPoleId: string | null;
  hotbarSlots: HotbarSlot[];
  activeSlot: number;
  smithy: SmithyState;
  generator: GeneratorState;
  battery: BatteryState;
  /** Asset IDs currently reachable from a generator via cables */
  connectedAssetIds: string[];
  /** Connected consumer machine IDs that actually received energy in the latest net tick */
  poweredMachineIds: string[];
  openPanel: UIPanel;
  notifications: GameNotification[];
  saplingGrowAt: Record<string, number>;
  /** Whether the Build Mode overlay is active */
  buildMode: boolean;
  /** Building type currently selected in the build menu (ghost preview) */
  selectedBuildingType: BuildingType | null;
  /** Floor tile currently selected in the build menu */
  selectedFloorTile: FloorTileType | null;
  /** Cells with stone floor: key → "stone_floor" */
  floorMap: Record<string, "stone_floor">;
  /** Per-auto-miner production state (keyed by asset ID) */
  autoMiners: Record<string, AutoMinerEntry>;
  /** Per-conveyor item state (keyed by asset ID) */
  conveyors: Record<string, ConveyorState>;
  /** ID of the auto-miner whose panel is currently open */
  selectedAutoMinerId: string | null;
  /** Per-auto-smelter processing state (keyed by asset ID) */
  autoSmelters: Record<string, AutoSmelterEntry>;
  /** ID of the auto-smelter whose panel is currently open */
  selectedAutoSmelterId: string | null;
  /** ID of the generator whose panel is currently open */
  selectedGeneratorId: string | null;
  /** Manual assembler production state */
  manualAssembler: ManualAssemblerState;
  /** Per-machine power ratio in [0,1] from the latest ENERGY_NET_TICK */
  machinePowerRatio: Record<string, number>;
  /** Whether the energy debug overlay is visible */
  energyDebugOverlay: boolean;
  /** Log of items automatically delivered into warehouses by auto-devices (auto_miner, conveyor, …) */
  autoDeliveryLog: AutoDeliveryEntry[];
  /** Per-building warehouse source assignment (buildingId → warehouseId). Missing key = global. Persisted.
   *  Legacy: superseded by zone assignments when a building has a zone. */
  buildingSourceWarehouseIds: Record<string, string>;
  /** Production zones: zoneId → zone metadata. Persisted. */
  productionZones: Record<string, ProductionZone>;
  /** Per-building zone assignment: buildingId → zoneId. Includes warehouses and crafting buildings. Persisted. */
  buildingZoneIds: Record<string, string>;
  /** ID of the workbench / smithy / assembler whose panel is currently open. Transient. */
  selectedCraftingBuildingId: string | null;
}

// ============================================================
// CONSTANTS
// ============================================================

export const CONVEYOR_TILE_CAPACITY = 4;
export { GRID_W, GRID_H, CELL_PX };

export const BUILDING_COSTS: Record<
  BuildingType,
  Partial<Record<keyof Inventory, number>>
> = {
  workbench: { wood: 5 },
  warehouse: { wood: 10, stone: 5 },
  smithy: { wood: 20, stone: 10 },
  generator: { wood: 15, stone: 8 },
  cable: { stone: 3 },
  battery: { ironIngot: 5, stone: 10 },
  power_pole: { wood: 3, stone: 5 },
  auto_miner: { ironIngot: 5, copperIngot: 3 },
  conveyor: { iron: 2 },
  conveyor_corner: { iron: 3 },
  manual_assembler: { wood: 10, ironIngot: 2 },
  auto_smelter: { stone: 12, ironIngot: 4, copperIngot: 2 },
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
};

/** Building types that can be purchased/placed multiple times */
export const STACKABLE_BUILDINGS = new Set<BuildingType>(["cable", "power_pole", "auto_miner", "conveyor", "conveyor_corner", "auto_smelter"]);

/** Building types that receive an automatic default warehouse source on placement. */
export const BUILDINGS_WITH_DEFAULT_SOURCE = new Set<BuildingType>(["workbench", "smithy", "manual_assembler", "auto_smelter", "auto_miner"]);

/** Floor tile costs (paid from inventory) */
export const FLOOR_TILE_COSTS: Record<FloorTileType, Partial<Record<keyof Inventory, number>>> = {
  stone_floor: { stone: 2 },
  grass_block: { sapling: 1 },
};

export const FLOOR_TILE_LABELS: Record<FloorTileType, string> = {
  stone_floor: "Steinboden",
  grass_block: "Grasblock",
};

export const FLOOR_TILE_EMOJIS: Record<FloorTileType, string> = {
  stone_floor: "\u{1FAA8}",  // 🪨
  grass_block: "\u{1F7E9}",  // 🟩
};

export const FLOOR_TILE_DESCRIPTIONS: Record<FloorTileType, string> = {
  stone_floor: "Legt Steinboden auf ein Grasfeld. Manche Gebäude benötigen Steinboden.",
  grass_block: "Wandelt Steinboden zurück in Gras um. Nur auf freiem Steinboden verwendbar.",
};

/** Building types that require stone floor under ALL their cells before they can be placed */
export const REQUIRES_STONE_FLOOR = new Set<BuildingType>(["generator"]);

export const ASSET_LABELS: Record<AssetType, string> = {
  tree: "Baum",
  stone: "Stein",
  iron: "Eisen",
  copper: "Kupfer",
  sapling: "Setzling",
  workbench: "Werkbank",
  warehouse: "Lagerhaus",
  smithy: "Schmiede",
  generator: "Holz-Generator",
  cable: "Stromleitung",
  battery: "Batterie",
  power_pole: "Stromknoten",
  map_shop: "Haendler",
  stone_deposit: "Stein-Vorkommen",
  iron_deposit: "Eisen-Vorkommen",
  copper_deposit: "Kupfer-Vorkommen",
  auto_miner: "Auto-Miner",
  conveyor: "Förderband",
  conveyor_corner: "Förderband-Ecke",
  manual_assembler: "Manueller Assembler",
  auto_smelter: "Auto Smelter",
};

export const ASSET_COLORS: Record<AssetType, string> = {
  tree: "#228B22",
  stone: "#808080",
  iron: "#A0A0B0",
  copper: "#CD7F32",
  sapling: "#90EE90",
  workbench: "#8B4513",
  warehouse: "#DAA520",
  smithy: "#B22222",
  generator: "#1E90FF",
  cable: "#FFD700",
  battery: "#2196F3",
  power_pole: "#FF8C00",
  map_shop: "#6A5ACD",
  stone_deposit: "#5a5a6a",
  iron_deposit: "#6a7080",
  copper_deposit: "#8b5e20",
  auto_miner: "#ff6b00",
  conveyor: "#ffa500",
  conveyor_corner: "#ff8c00",
  manual_assembler: "#4da6ff",
  auto_smelter: "#e64545",
};

export const ASSET_EMOJIS: Record<AssetType, string> = {
  tree: "\u{1F332}",
  stone: "\u{1FAA8}",
  iron: "\u2699\uFE0F",
  copper: "\u{1F536}",
  sapling: "\u{1F331}",
  workbench: "\u{1F528}",
  warehouse: "\u{1F4E6}",
  smithy: "\u{1F525}",
  generator: "\u26A1",
  cable: "\u{1F50C}",
  battery: "\u{1F50B}",
  power_pole: "\u{1F5FC}",
  map_shop: "\u{1F9D1}\u200D\u{1F33E}",
  stone_deposit: "\u26F0\uFE0F",
  iron_deposit: "\u2699\uFE0F",
  copper_deposit: "\u{1F536}",
  auto_miner: "\u2699\uFE0F",
  conveyor: "\u27A1\uFE0F",
  conveyor_corner: "\u21A9\uFE0F",
  manual_assembler: "\u{1F9F0}",
  auto_smelter: "\u{1F525}",
};

/** 2\u00d72 infinite resource deposits (unbreakable, require Auto-Miner) */
export const DEPOSIT_TYPES = new Set<AssetType>(["stone_deposit", "iron_deposit", "copper_deposit"]);

/** Fixed spawn positions for deposits \u2013 scaled with grid size and far from trader */
export const DEPOSIT_POSITIONS: { type: AssetType; x: number; y: number }[] = [
  { type: "stone_deposit", x: 2, y: 2 },
  { type: "iron_deposit", x: GRID_W - 5, y: 2 },
  { type: "copper_deposit", x: 2, y: GRID_H - 5 },
];

export const RESOURCE_LABELS: Record<string, string> = {
  coins: "Coins",
  wood: "Holz",
  stone: "Stein",
  iron: "Eisen",
  copper: "Kupfer",
  sapling: "Setzling",
  ironIngot: "Eisenbarren",
  copperIngot: "Kupferbarren",
  metalPlate: "Metallplatte",
  gear: "Zahnrad",
  axe: "Axt",
  wood_pickaxe: "Holzspitzhacke",
  stone_pickaxe: "Steinspitzhacke",
  workbench: "Werkbank",
  warehouse: "Lagerhaus",
  smithy: "Schmiede",
  generator: "Holz-Generator",
  cable: "Stromleitung",
  battery: "Batterie",
  power_pole: "Stromknoten",
  auto_miner: "Auto-Miner",
  conveyor: "F\u00f6rderband",
  conveyor_corner: "F\u00f6rderband-Ecke",
  manual_assembler: "Manueller Assembler",
};

export const RESOURCE_EMOJIS: Record<string, string> = {
  coins: "\u{1FA99}",
  wood: "\u{1FAB5}",
  stone: "\u{1FAA8}",
  iron: "\u2699\uFE0F",
  copper: "\u{1F536}",
  sapling: "\u{1F331}",
  ironIngot: "\u{1F9F1}",
  copperIngot: "\u{1F7EB}",
  metalPlate: "\u{1F4C4}",
  gear: "\u2699\uFE0F",
  axe: "\u{1FA93}",
  wood_pickaxe: "\u26CF\uFE0F",
  stone_pickaxe: "\u26CF\uFE0F",
  workbench: "\u{1F528}",
  warehouse: "\u{1F4E6}",
  smithy: "\u{1F525}",
  generator: "\u26A1",
  cable: "\u{1F50C}",
  battery: "\u{1F50B}",
  power_pole: "\u{1F5FC}",
  auto_miner: "\u2699\uFE0F",
  conveyor: "\u27A1\uFE0F",
  conveyor_corner: "\u21A9\uFE0F",
  manual_assembler: "\u{1F9F0}",
};

export interface MapShopItem {
  key: string;
  label: string;
  emoji: string;
  costCoins: number;
  inventoryKey: keyof Inventory;
}

export const MAP_SHOP_ITEMS: MapShopItem[] = [
  { key: "axe", label: "Axt", emoji: "\u{1FA93}", costCoins: 10, inventoryKey: "axe" },
];

export const SAPLING_GROW_MS = 30_000;
export const NATURAL_SPAWN_MS = 60_000;
export const NATURAL_SPAWN_CHANCE = 0.2;
export const NATURAL_SPAWN_CAP = 30;
export const DEBUG_FREE_ZONE_RADIUS = Math.floor(Math.min(GRID_W, GRID_H) * 0.48);
export const SAPLING_DROP_CHANCE = 0.6;
export const SMITHY_TICK_MS = 100;
export const SMITHY_PROCESS_MS = 5_000;
export const MANUAL_ASSEMBLER_TICK_MS = 100;
export const MANUAL_ASSEMBLER_PROCESS_MS = 1_500;
export const HOTBAR_SIZE = 9;
export const HOTBAR_STACK_MAX = 5;
export const WAREHOUSE_CAPACITY = 20;
export const MAX_WAREHOUSES = 2;

// ---- Energy / Generator ----
/** Tick interval for the generator fuel consumption (ms) */
export const GENERATOR_TICK_MS = 200;
/** Energy produced per generator tick while burning (J) */
export const GENERATOR_ENERGY_PER_TICK = 2;
/** How many ticks one wood unit lasts */
export const GENERATOR_TICKS_PER_WOOD = 25;
/** Tick interval for the energy network balance calculation (ms) */
export const ENERGY_NET_TICK_MS = 2000;
/**
 * Energy consumed per ENERGY_NET_TICK period by each machine type.
 * One period = ENERGY_NET_TICK_MS = 2000 ms.
 */
export const ENERGY_DRAIN: Record<string, number> = {
  smithy: 2,
  workbench: 3,
  auto_miner: 5,
  conveyor: 1,
  conveyor_corner: 1,
  auto_smelter: 5, // 5 J/period; actual drain computed dynamically in getConnectedConsumerDrainEntries
};

export const DEFAULT_MACHINE_PRIORITY: MachinePriority = 3;

/**
 * Tie-break order for machines with the same user priority.
 * Lower rank is served first so transport stays alive before downstream processing.
 */
const ENERGY_ALLOCATION_RANK: Partial<Record<AssetType, number>> = {
  conveyor: 0,
  conveyor_corner: 0,
  auto_miner: 1,
  smithy: 2,
  workbench: 2,
  auto_smelter: 3,
};

function clampMachinePriority(priority: number | undefined): MachinePriority {
  const raw = Number.isFinite(priority) ? Math.round(priority as number) : DEFAULT_MACHINE_PRIORITY;
  const clamped = Math.max(1, Math.min(5, raw));
  return clamped as MachinePriority;
}

function isEnergyConsumerType(type: AssetType): boolean {
  return ENERGY_DRAIN[type] != null;
}

function getEnergyAllocationRank(type: AssetType): number {
  return ENERGY_ALLOCATION_RANK[type] ?? 4;
}

export function getConnectedConsumerDrainEntries(
  state: Pick<GameState, "assets" | "connectedAssetIds" | "autoSmelters">
): Array<{ id: string; drain: number }> {
  return state.connectedAssetIds
    .map((id) => state.assets[id])
    .filter((a): a is PlacedAsset => !!a && isEnergyConsumerType(a.type))
    .map((asset) => {
      const baseDrain =
        asset.type === "auto_smelter"
          ? (state.autoSmelters?.[asset.id]?.processing
              ? AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD
              : AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD)
          : ENERGY_DRAIN[asset.type];
      return { id: asset.id, drain: baseDrain * getBoostMultiplier(asset) };
    });
}

export function getEnergyProductionPerPeriod(
  state: Pick<GameState, "assets" | "connectedAssetIds" | "generator">
): number {
  const genConnectedToPole = state.connectedAssetIds.some(
    (id) => state.assets[id]?.type === "power_pole"
  );
  const ticksPerPeriod = Math.round(ENERGY_NET_TICK_MS / GENERATOR_TICK_MS);
  return state.generator.running && genConnectedToPole
    ? ticksPerPeriod * GENERATOR_ENERGY_PER_TICK
    : 0;
}

export function getConnectedDemandPerPeriod(
  state: Pick<GameState, "assets" | "connectedAssetIds" | "autoSmelters">
): number {
  return getConnectedConsumerDrainEntries(state).reduce((sum, entry) => sum + entry.drain, 0);
}

function withDefaultMachinePriority(type: AssetType): Pick<PlacedAsset, "priority"> | {} {
  if (!isEnergyConsumerType(type)) return {};
  return { priority: DEFAULT_MACHINE_PRIORITY };
}

// ---- Auto-Miner / Conveyor ----
/** Logistics tick interval (ms) – shared by auto-miners and conveyors */
export const LOGISTICS_TICK_MS = 500;
/** Number of logistics ticks for one auto-miner production cycle (6 × 500ms = 3s) */
export const AUTO_MINER_PRODUCE_TICKS = 6;
export const AUTO_SMELTER_BUFFER_CAPACITY = 5;
export const AUTO_SMELTER_IDLE_ENERGY_PER_SEC = 2.5; // 2.5 J/s = 5 J/period (ENERGY_NET_TICK_MS=2000ms)
export const AUTO_SMELTER_PROCESSING_ENERGY_PER_SEC = 2.5; // 2.5 J/s = 5 J/period — same target drain as idle
export const AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD = Math.round((AUTO_SMELTER_IDLE_ENERGY_PER_SEC * ENERGY_NET_TICK_MS) / 1000);
export const AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD = Math.round((AUTO_SMELTER_PROCESSING_ENERGY_PER_SEC * ENERGY_NET_TICK_MS) / 1000);

/**
 * Overclocking-Stufe 1: Zwei feste Modi (normal / boosted), nur für auto_miner
 * und auto_smelter. Multiplikator wirkt konsistent auf Strom UND Produktion.
 */
export const AUTO_MINER_BOOST_MULTIPLIER = 2;
export const AUTO_SMELTER_BOOST_MULTIPLIER = 2;

export function isBoostSupportedType(type: AssetType): boolean {
  return type === "auto_miner" || type === "auto_smelter";
}

/** Effektiver Boost-Multiplikator für ein Asset. 1 wenn nicht boosted oder nicht unterstützt. */
export function getBoostMultiplier(asset: Pick<PlacedAsset, "type" | "boosted">): number {
  if (!asset.boosted) return 1;
  if (asset.type === "auto_miner") return AUTO_MINER_BOOST_MULTIPLIER;
  if (asset.type === "auto_smelter") return AUTO_SMELTER_BOOST_MULTIPLIER;
  return 1;
}

/** Maps deposit asset type to the resource it produces */
export const DEPOSIT_RESOURCE: Record<string, "stone" | "iron" | "copper"> = {
  stone_deposit: "stone",
  iron_deposit: "iron",
  copper_deposit: "copper",
};

// ---- Battery ----
/** Maximum energy stored in a battery (J) */
export const BATTERY_CAPACITY = 1000;

// ---- Power Pole ----
/** Chebyshev range (cells) in which a power_pole connects to neighbouring conductors */
export const POWER_POLE_RANGE = 3;

function createEmptyInventory(): Inventory {
  return {
    coins: 0,
    wood: 0,
    stone: 0,
    iron: 0,
    copper: 0,
    sapling: 0,
    ironIngot: 0,
    copperIngot: 0,
    metalPlate: 0,
    gear: 0,
    axe: 0,
    wood_pickaxe: 0,
    stone_pickaxe: 0,
    workbench: 0,
    warehouse: 0,
    smithy: 0,
    generator: 0,
    cable: 0,
    battery: 0,
    power_pole: 0,
    manual_assembler: 0,
    auto_smelter: 0,
  };
}

function getWarehouseCapacity(mode: GameMode): number {
  return mode === "debug" ? Infinity : WAREHOUSE_CAPACITY;
}

export function getCapacityPerResource(state: { mode: string; warehousesPlaced: number }): number {
  if (state.mode === "debug") return Infinity;
  return (state.warehousesPlaced + 1) * WAREHOUSE_CAPACITY;
}

// ============================================================
// INVENTORY WRAPPERS
// V1: operate on the global `state.inventory` pool.
// Future versions may aggregate per-warehouse inventories.
// ============================================================

/** Read the available amount of a single resource from the global pool. */
export function getAvailableResource(state: { inventory: Inventory }, key: keyof Inventory): number {
  return state.inventory[key] as number;
}

/** Check whether the global inventory can cover all of `costs`. */
export function hasResources(inv: Inventory, costs: Partial<Record<keyof Inventory, number>>): boolean {
  for (const [key, amt] of Object.entries(costs)) {
    if (((inv as unknown as Record<string, number>)[key] ?? 0) < (amt ?? 0)) return false;
  }
  return true;
}

/**
 * Return a new Inventory with `costs` deducted.
 * DEV: warns if any resulting value becomes negative (indicates a missing hasResources check).
 */
export function consumeResources(inv: Inventory, costs: Partial<Record<keyof Inventory, number>>): Inventory {
  const result = { ...inv } as Record<string, number>;
  for (const [key, amt] of Object.entries(costs)) {
    result[key] = (result[key] ?? 0) - (amt ?? 0);
    if (import.meta.env.DEV && result[key] < 0) {
      console.warn(`[consumeResources] Negative value for "${key}": ${result[key]}. Missing hasResources() guard?`);
    }
  }
  return result as unknown as Inventory;
}

/** Return a new Inventory with `items` added. */
export function addResources(inv: Inventory, items: Partial<Record<keyof Inventory, number>>): Inventory {
  const result = { ...inv } as Record<string, number>;
  for (const [key, amt] of Object.entries(items)) {
    result[key] = (result[key] ?? 0) + (amt ?? 0);
  }
  return result as unknown as Inventory;
}

/**
 * DEV-only: assert no inventory field is negative.
 * Call after reducer transitions to catch silent corruption early.
 */
export function devAssertInventoryNonNegative(label: string, inv: Inventory): void {
  if (!import.meta.env.DEV) return;
  for (const [key, val] of Object.entries(inv)) {
    if ((val as number) < 0) {
      console.error(`[Invariant] ${label}: "${key}" is negative (${val})`);
    }
  }
}

// ============================================================
// CRAFTING SOURCE POLICY
//
// Determines where a crafting device reads/writes resources.
// - "global": uses state.inventory (default, backward-compatible)
// - "warehouse": uses a specific warehouseInventories[id]
//
// The resolver validates the assignment on every call: if the
// warehouse was removed or its inventory is missing, the
// device silently falls back to global.
// ============================================================

export type CraftingSource =
  | { kind: "global" }
  | { kind: "warehouse"; warehouseId: string }
  | { kind: "zone"; zoneId: string };

/** A production zone groups warehouses and crafting buildings into a shared local resource pool. */
export interface ProductionZone {
  id: string;
  name: string;
}

/** Maximum number of production zones a player can create. */
export const MAX_ZONES = 8;

/**
 * Resolve a crafting resource source from an optional warehouse ID.
 * Returns "global" when null or when the warehouse is invalid/missing.
 */
export function resolveCraftingSource(state: GameState, warehouseId: string | null): CraftingSource {
  if (!warehouseId) return { kind: "global" };
  if (!state.assets[warehouseId] || !state.warehouseInventories[warehouseId]) return { kind: "global" };
  return { kind: "warehouse", warehouseId };
}

/** Read the inventory for a resolved crafting source. */
export function getCraftingSourceInventory(state: GameState, source: CraftingSource): Inventory {
  if (source.kind === "global") return state.inventory;
  if (source.kind === "zone") return getZoneAggregateInventory(state, source.zoneId);
  return state.warehouseInventories[source.warehouseId];
}

/**
 * Apply an inventory mutation to the correct source (global or warehouse).
 * For zones, computes the delta from the current aggregate and distributes
 * consumption/production across the zone's warehouses deterministically.
 * Returns partial state update to spread into the next state.
 */
export function applyCraftingSourceInventory(
  state: GameState,
  source: CraftingSource,
  newInv: Inventory,
): Partial<GameState> {
  if (source.kind === "global") {
    return { inventory: newInv };
  }
  if (source.kind === "zone") {
    return applyZoneDelta(state, source.zoneId, newInv);
  }
  return { warehouseInventories: { ...state.warehouseInventories, [source.warehouseId]: newInv } };
}

// ============================================================
// PRODUCTION ZONE HELPERS
// ============================================================

/**
 * Returns sorted warehouse IDs that belong to the given zone.
 * Only includes warehouses that still exist in assets and warehouseInventories.
 */
export function getZoneWarehouseIds(state: GameState, zoneId: string): string[] {
  const result: string[] = [];
  for (const [bid, zid] of Object.entries(state.buildingZoneIds)) {
    if (zid !== zoneId) continue;
    if (state.assets[bid]?.type === "warehouse" && state.warehouseInventories[bid]) {
      result.push(bid);
    }
  }
  return result.sort();
}

/**
 * Returns IDs of non-warehouse buildings (crafting devices) assigned to a zone.
 */
export function getZoneBuildingIds(state: GameState, zoneId: string): string[] {
  const result: string[] = [];
  for (const [bid, zid] of Object.entries(state.buildingZoneIds)) {
    if (zid !== zoneId) continue;
    if (state.assets[bid] && state.assets[bid].type !== "warehouse") {
      result.push(bid);
    }
  }
  return result.sort();
}

/**
 * Returns the aggregated inventory across all warehouses in a zone.
 * If the zone has no warehouses, returns an empty inventory.
 */
export function getZoneAggregateInventory(state: GameState, zoneId: string): Inventory {
  const whIds = getZoneWarehouseIds(state, zoneId);
  if (whIds.length === 0) return createEmptyInventory();
  let agg = createEmptyInventory();
  for (const whId of whIds) {
    agg = addResources(agg, state.warehouseInventories[whId]);
  }
  return agg;
}

/**
 * Returns the total capacity per item for a zone (sum of warehouse capacities).
 */
export function getZoneItemCapacity(state: GameState, zoneId: string): number {
  if (state.mode === "debug") return Infinity;
  const count = getZoneWarehouseIds(state, zoneId).length;
  return count * WAREHOUSE_CAPACITY;
}

/**
 * Distributes the delta between the current zone aggregate and `newAgg`
 * across the zone's warehouses. Consumption is deducted from warehouses
 * in sorted-ID order; production is added in sorted-ID order respecting
 * per-warehouse capacity (overflow goes to the first warehouse).
 */
function applyZoneDelta(
  state: GameState,
  zoneId: string,
  newAgg: Inventory,
): Partial<GameState> {
  const whIds = getZoneWarehouseIds(state, zoneId);
  if (whIds.length === 0) return {};

  const oldAgg = getZoneAggregateInventory(state, zoneId);

  // Shallow-copy the outer map, then deep-copy each zone warehouse inventory
  const newWhInvs = { ...state.warehouseInventories };
  for (const whId of whIds) {
    newWhInvs[whId] = { ...newWhInvs[whId] };
  }

  const invKeys = Object.keys(oldAgg) as (keyof Inventory)[];
  for (const key of invKeys) {
    const oldVal = oldAgg[key] as number;
    const newVal = newAgg[key] as number;
    const diff = newVal - oldVal;
    if (diff === 0) continue;

    if (diff < 0) {
      // Consumption: deduct from warehouses in sorted order
      let remaining = -diff;
      for (const whId of whIds) {
        if (remaining <= 0) break;
        const inv = newWhInvs[whId] as unknown as Record<string, number>;
        const current = inv[key as string] ?? 0;
        const take = Math.min(current, remaining);
        if (take > 0) {
          inv[key as string] = current - take;
          remaining -= take;
        }
      }
    } else {
      // Production: add to warehouses in sorted order, respecting capacity
      let remaining = diff;
      const cap = state.mode === "debug" ? Infinity : WAREHOUSE_CAPACITY;
      for (const whId of whIds) {
        if (remaining <= 0) break;
        const inv = newWhInvs[whId] as unknown as Record<string, number>;
        const current = inv[key as string] ?? 0;
        const space = Math.max(0, cap - current);
        const add = Math.min(space, remaining);
        if (add > 0) {
          inv[key as string] = current + add;
          remaining -= add;
        }
      }
      // Overflow: add to first warehouse (matches single-warehouse behavior)
      if (remaining > 0 && whIds.length > 0) {
        const inv = newWhInvs[whIds[0]] as unknown as Record<string, number>;
        inv[key as string] = (inv[key as string] ?? 0) + remaining;
      }
    }
  }

  return { warehouseInventories: newWhInvs };
}

/**
 * Remove buildingZoneIds entries whose building or zone no longer exists.
 * Used for defensive cleanup on Save/Load.
 */
export function cleanBuildingZoneIds(
  mapping: Record<string, string>,
  validBuildingIds: Set<string>,
  validZoneIds: Set<string>,
): Record<string, string> {
  let changed = false;
  const result: Record<string, string> = {};
  for (const [buildingId, zoneId] of Object.entries(mapping)) {
    if (validBuildingIds.has(buildingId) && validZoneIds.has(zoneId)) {
      result[buildingId] = zoneId;
    } else {
      changed = true;
    }
  }
  return changed ? result : mapping;
}

// ============================================================
// CONVEYOR ZONE HELPERS
// Pure helpers for zone-aware belt transport checks.
// ============================================================

/**
 * Returns the zone ID assigned to a conveyor belt, or null if unzoned.
 * Unzoned belts are treated as global and pass items to any target.
 */
export function getConveyorZone(state: GameState, conveyorId: string): string | null {
  return state.buildingZoneIds[conveyorId] ?? null;
}

/**
 * Returns true when two zone assignments are compatible for item transport.
 * Compatible means: at least one side is unzoned (null) OR both share the same zone.
 * This is the V1 rule: physical connection > zone — only block when BOTH sides
 * have explicit, differing zone assignments.
 */
export function areZonesTransportCompatible(zoneA: string | null, zoneB: string | null): boolean {
  if (zoneA === null || zoneB === null) return true;
  return zoneA === zoneB;
}

export interface ConveyorZoneStatus {
  /** Zone assigned to this belt (null = unzoned / global). */
  zone: string | null;
  /** Human-readable zone name (null if unzoned). */
  zoneName: string | null;
  /** Zone of the next tile this belt is pointing at (null = unzoned or no next asset). */
  nextTileZone: string | null;
  /** True when both this belt and the next tile have differing explicit zones. */
  hasConflict: boolean;
  /** Human-readable conflict reason, or null when no conflict. */
  conflictReason: string | null;
}

/**
 * Derive zone/conflict status for a conveyor belt.
 * Pure function — safe to call from any UI component.
 */
export function getConveyorZoneStatus(state: GameState, conveyorId: string): ConveyorZoneStatus {
  const convAsset = state.assets[conveyorId];
  const zone = state.buildingZoneIds[conveyorId] ?? null;
  const zoneName = zone ? (state.productionZones[zone]?.name ?? zone) : null;

  let nextTileZone: string | null = null;
  let hasConflict = false;
  let conflictReason: string | null = null;

  if (convAsset) {
    const dir = convAsset.direction ?? "east";
    const [ox, oy] = directionOffset(dir);
    const nextX = convAsset.x + ox;
    const nextY = convAsset.y + oy;
    if (nextX >= 0 && nextX < GRID_W && nextY >= 0 && nextY < GRID_H) {
      const nextId = state.cellMap[cellKey(nextX, nextY)];
      if (nextId) {
        nextTileZone = state.buildingZoneIds[nextId] ?? null;
        if (!areZonesTransportCompatible(zone, nextTileZone)) {
          hasConflict = true;
          const thisName = zoneName ?? zone ?? "Global";
          const nextName = nextTileZone ? (state.productionZones[nextTileZone]?.name ?? nextTileZone) : "Global";
          conflictReason = `Ziel-Zone mismatch: ${thisName} → ${nextName}`;
        }
      }
    }
  }

  return { zone, zoneName, nextTileZone, hasConflict, conflictReason };
}

// Backward-compatible aliases (used by existing workbench code & tests)
/** @deprecated Use CraftingSource */
export type WorkbenchSource = CraftingSource;

/**
 * Resolve crafting source for a specific building instance.
 * Priority: zone (if assigned + has warehouses) > legacy per-building warehouse > global.
 */
export function resolveBuildingSource(state: GameState, buildingId: string | null): CraftingSource {
  if (!buildingId) return { kind: "global" };
  // Zone takes priority
  const zoneId = state.buildingZoneIds[buildingId];
  if (zoneId && state.productionZones[zoneId]) {
    const whIds = getZoneWarehouseIds(state, zoneId);
    if (whIds.length > 0) {
      return { kind: "zone", zoneId };
    }
    // Zone exists but has no warehouses → fall through to legacy/global
  }
  // Legacy per-building warehouse mapping
  const whId = state.buildingSourceWarehouseIds[buildingId] ?? null;
  return resolveCraftingSource(state, whId);
}

/** @deprecated Use resolveBuildingSource */
export function resolveWorkbenchSource(state: GameState): CraftingSource {
  return resolveBuildingSource(state, state.selectedCraftingBuildingId);
}

// ============================================================
// SOURCE STATUS VIEW-MODEL
// Pure derivation for UI transparency — no side effects.
// ============================================================

export type FallbackReason =
  | "none"                  // source is primary (zone or explicitly set)
  | "zone_no_warehouses"    // building has a zone, but zone has no warehouses
  | "no_zone"               // building has no zone assignment
  | "stale_warehouse"       // legacy warehouse mapping points to deleted warehouse
  | "no_assignment";        // no zone and no legacy mapping

export interface SourceStatusInfo {
  /** The resolved source used for crafting. */
  source: CraftingSource;
  /** Human-readable label for the active source (e.g. "Zone 1 (2 Lagerhäuser)"). */
  sourceLabel: string;
  /** Why this source was chosen — helpful when source is a fallback. */
  fallbackReason: FallbackReason;
  /** Short human-readable explanation of why this source is active. */
  reasonLabel: string;
  /** Zone ID if building is assigned to a zone (even if zone is empty). */
  assignedZoneId: string | null;
  /** Zone name if assigned. */
  assignedZoneName: string | null;
  /** Warehouse IDs in the active zone (empty if not zone source). */
  zoneWarehouseIds: string[];
  /** Building IDs (non-warehouse) in the active zone. */
  zoneBuildingIds: string[];
  /** Legacy warehouse ID from buildingSourceWarehouseIds (may be stale). */
  legacyWarehouseId: string | null;
  /** Whether the legacy warehouse mapping is stale (points to deleted warehouse). */
  isStale: boolean;
}

/**
 * Compute full source status diagnosis for a building.
 * Pure function — used by UI panels for transparency and debug info.
 */
export function getSourceStatusInfo(state: GameState, buildingId: string | null): SourceStatusInfo {
  const source = resolveBuildingSource(state, buildingId);
  const assignedZoneId = buildingId ? (state.buildingZoneIds[buildingId] ?? null) : null;
  const assignedZoneName = assignedZoneId ? (state.productionZones[assignedZoneId]?.name ?? null) : null;
  const legacyWhId = buildingId ? (state.buildingSourceWarehouseIds[buildingId] ?? null) : null;
  const isStale = hasStaleWarehouseAssignment(state, buildingId);

  let fallbackReason: FallbackReason = "none";
  let sourceLabel: string;
  let reasonLabel: string;
  let zoneWarehouseIds: string[] = [];
  let zoneBuildingIds: string[] = [];

  if (source.kind === "zone") {
    zoneWarehouseIds = getZoneWarehouseIds(state, source.zoneId);
    zoneBuildingIds = getZoneBuildingIds(state, source.zoneId);
    const zoneName = state.productionZones[source.zoneId]?.name ?? source.zoneId;
    sourceLabel = `${zoneName} (${zoneWarehouseIds.length} Lagerhaus${zoneWarehouseIds.length !== 1 ? "\u00e4user" : ""})`;
    reasonLabel = "Zone aktiv";
  } else if (source.kind === "warehouse") {
    const whIdx = Object.keys(state.warehouseInventories).indexOf(source.warehouseId) + 1;
    sourceLabel = `Lagerhaus ${whIdx || "?"}`;
    if (assignedZoneId && state.productionZones[assignedZoneId]) {
      fallbackReason = "zone_no_warehouses";
      reasonLabel = "Zone hat keine Lagerhäuser — Einzelzuweisung aktiv";
    } else {
      fallbackReason = "no_zone";
      reasonLabel = "Keine Zone — Einzelzuweisung aktiv";
    }
  } else {
    // global
    sourceLabel = "Globales Inventar";
    if (assignedZoneId && state.productionZones[assignedZoneId]) {
      const zwhIds = getZoneWarehouseIds(state, assignedZoneId);
      if (zwhIds.length === 0) {
        fallbackReason = "zone_no_warehouses";
        reasonLabel = "Zone hat keine Lagerhäuser — Fallback: Global";
      } else {
        fallbackReason = "none";
        reasonLabel = "Global";
      }
    } else if (isStale) {
      fallbackReason = "stale_warehouse";
      reasonLabel = "Zugewiesenes Lagerhaus entfernt — Fallback: Global";
    } else if (legacyWhId) {
      fallbackReason = "stale_warehouse";
      reasonLabel = "Ungültige Lagerhauszuweisung — Fallback: Global";
    } else {
      fallbackReason = "no_assignment";
      reasonLabel = "Keine Zone oder Lagerhaus zugewiesen";
    }
  }

  return {
    source,
    sourceLabel,
    fallbackReason,
    reasonLabel,
    assignedZoneId,
    assignedZoneName,
    zoneWarehouseIds,
    zoneBuildingIds,
    legacyWarehouseId: legacyWhId,
    isStale,
  };
}

export const MAP_SHOP_POS = { x: Math.floor(GRID_W / 2) - 1, y: Math.floor(GRID_H / 2) - 1 };

/**
 * Manhattan distance between two grid positions.
 */
export function manhattanDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Returns the ID of the nearest valid warehouse to the given grid position,
 * or `null` when no warehouse exists.
 *
 * Distance metric: Manhattan distance on top-left grid coordinates.
 * Tie-break: lexicographically smaller ID wins (deterministic).
 *
 * @param excludeId  optional warehouse ID to skip (used during deletion)
 */
export function getNearestWarehouseId(
  state: GameState,
  bx: number,
  by: number,
  excludeId?: string,
): string | null {
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const whId of Object.keys(state.warehouseInventories)) {
    if (whId === excludeId) continue;
    const wh = state.assets[whId];
    if (!wh) continue;
    const d = manhattanDist(bx, by, wh.x, wh.y);
    if (d < bestDist || (d === bestDist && bestId !== null && whId < bestId)) {
      bestDist = d;
      bestId = whId;
    }
  }
  return bestId;
}

/**
 * Remove all entries from buildingSourceWarehouseIds whose warehouse ID
 * no longer exists in warehouseInventories. Returns a new object (or the
 * same reference if nothing changed).
 * Used for defensive cleanup on Save/Load (no reassign, just purge).
 */
export function cleanBuildingSourceIds(
  mapping: Record<string, string>,
  validWarehouseIds: Set<string>,
): Record<string, string> {
  let changed = false;
  const result: Record<string, string> = {};
  for (const [buildingId, whId] of Object.entries(mapping)) {
    if (validWarehouseIds.has(whId)) {
      result[buildingId] = whId;
    } else {
      changed = true;
    }
  }
  return changed ? result : mapping;
}

/**
 * Reassign-or-clean: for each mapping entry whose warehouse is no longer
 * valid, reassign to the **nearest** remaining warehouse (by Manhattan
 * distance). If no replacement exists, the entry is removed (→ global).
 * Used at runtime when a warehouse is deleted.
 */
export function reassignBuildingSourceIds(
  mapping: Record<string, string>,
  state: GameState,
  deletedWarehouseId: string,
): Record<string, string> {
  let changed = false;
  const result: Record<string, string> = {};
  for (const [buildingId, whId] of Object.entries(mapping)) {
    if (whId !== deletedWarehouseId) {
      result[buildingId] = whId;
    } else {
      const building = state.assets[buildingId];
      const replacement = building
        ? getNearestWarehouseId(state, building.x, building.y, deletedWarehouseId)
        : null;
      if (replacement) {
        result[buildingId] = replacement;
      }
      // else: entry dropped → global fallback
      changed = true;
    }
  }
  return changed ? result : mapping;
}

/**
 * Returns true if a building has a warehouse mapping that no longer resolves
 * to a valid warehouse (stale reference). Used by panels to show a hint.
 */
export function hasStaleWarehouseAssignment(state: GameState, buildingId: string | null): boolean {
  if (!buildingId) return false;
  const whId = state.buildingSourceWarehouseIds[buildingId];
  if (!whId) return false;
  return !state.assets[whId] || !state.warehouseInventories[whId];
}

// ============================================================
// HELPERS
// ============================================================

let _idCounter = 0;
let _smelterRecipesLogged = false;
export function makeId(): string {
  return `a${Date.now()}_${_idCounter++}`;
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Returns [dx, dy] offset for a direction. */
export function directionOffset(dir: Direction): [number, number] {
  switch (dir) {
    case "north": return [0, -1];
    case "south": return [0, 1];
    case "east": return [1, 0];
    case "west": return [-1, 0];
  }
}

function assetWidth(asset: PlacedAsset): number {
  return asset.width ?? asset.size;
}

function assetHeight(asset: PlacedAsset): number {
  return asset.height ?? asset.size;
}

function getAutoSmelterIoCells(asset: PlacedAsset): { input: { x: number; y: number }; output: { x: number; y: number } } {
  const dir = asset.direction ?? "east";
  const w = assetWidth(asset);
  const h = assetHeight(asset);
  switch (dir) {
    case "east":
      return { input: { x: asset.x - 1, y: asset.y }, output: { x: asset.x + w, y: asset.y } };
    case "west":
      return { input: { x: asset.x + w, y: asset.y }, output: { x: asset.x - 1, y: asset.y } };
    case "north":
      return { input: { x: asset.x, y: asset.y + h }, output: { x: asset.x, y: asset.y - 1 } };
    case "south":
      return { input: { x: asset.x, y: asset.y - 1 }, output: { x: asset.x, y: asset.y + h } };
  }
}

/**
 * Returns the input tile position and the required conveyor direction for a warehouse,
 * based on its `direction` field. Default direction is "south" (input below bottom-left
 * cell, conveyor must face "north") — preserving backward-compatible behavior.
 */
export function getWarehouseInputCell(warehouse: {
  x: number;
  y: number;
  size: 1 | 2;
  width?: 1 | 2;
  height?: 1 | 2;
  direction?: Direction;
}): { x: number; y: number; requiredDir: Direction } {
  const dir = warehouse.direction ?? "south";
  const w = warehouse.width ?? warehouse.size;
  const h = warehouse.height ?? warehouse.size;
  switch (dir) {
    case "south": return { x: warehouse.x,     y: warehouse.y + h, requiredDir: "north" };
    case "north": return { x: warehouse.x,     y: warehouse.y - 1, requiredDir: "south" };
    case "east":  return { x: warehouse.x + w, y: warehouse.y,     requiredDir: "west"  };
    case "west":  return { x: warehouse.x - 1, y: warehouse.y,     requiredDir: "east"  };
  }
}

/**
 * The warehouse has exactly one input tile whose position depends on the warehouse's
 * `direction` (defaults to "south" — directly below bottom-left cell).
 * Only a conveyor/miner at the correct tile and facing the required direction may feed items in.
 */
export function isValidWarehouseInput(
  entityX: number,
  entityY: number,
  entityDir: Direction,
  warehouse: PlacedAsset
): boolean {
  const { x, y, requiredDir } = getWarehouseInputCell(warehouse);
  return entityDir === requiredDir && entityX === x && entityY === y;
}

/** True when a cell falls inside the debug-mode spawn-free zone centered on the grid. */
export function isInDebugFreeZone(x: number, y: number): boolean {
  const cx = Math.floor(GRID_W / 2);
  const cy = Math.floor(GRID_H / 2);
  return Math.abs(x - cx) < DEBUG_FREE_ZONE_RADIUS && Math.abs(y - cy) < DEBUG_FREE_ZONE_RADIUS;
}

function hasNearbyAsset(
  cellMap: Record<string, string>,
  x: number,
  y: number
): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (cellMap[cellKey(x + dx, y + dy)]) return true;
    }
  }
  return false;
}

function removeAsset(
  state: GameState,
  assetId: string
): Pick<GameState, "assets" | "cellMap" | "saplingGrowAt"> {
  const asset = state.assets[assetId];
  if (asset.fixed) return { assets: state.assets, cellMap: state.cellMap, saplingGrowAt: state.saplingGrowAt };
  const newAssets = { ...state.assets };
  delete newAssets[assetId];
  const newCellMap = { ...state.cellMap };
  for (let dy = 0; dy < assetHeight(asset); dy++) {
    for (let dx = 0; dx < assetWidth(asset); dx++) {
      delete newCellMap[cellKey(asset.x + dx, asset.y + dy)];
    }
  }
  const newGrow = { ...state.saplingGrowAt };
  delete newGrow[assetId];
  return { assets: newAssets, cellMap: newCellMap, saplingGrowAt: newGrow };
}

function tryTogglePanelFromAsset(state: GameState, asset: PlacedAsset | null): GameState | null {
  if (!asset) return null;

  if ((["workbench", "warehouse", "smithy", "generator", "battery", "power_pole", "manual_assembler"] as string[]).includes(asset.type)) {
    const panel = asset.type as UIPanel;
    if (asset.type === "warehouse") {
      const newPanel = state.openPanel === panel && state.selectedWarehouseId === asset.id ? null : panel;
      return { ...state, openPanel: newPanel, selectedWarehouseId: newPanel ? asset.id : null };
    }
    if (asset.type === "power_pole") {
      const newPanel = state.openPanel === panel ? null : panel;
      return { ...state, openPanel: newPanel, selectedPowerPoleId: newPanel ? asset.id : state.selectedPowerPoleId };
    }
    // Crafting buildings: track which specific instance is open
    if (asset.type === "workbench" || asset.type === "smithy" || asset.type === "manual_assembler") {
      const opening = state.openPanel !== panel || state.selectedCraftingBuildingId !== asset.id;
      return {
        ...state,
        openPanel: opening ? panel : null,
        selectedCraftingBuildingId: opening ? asset.id : null,
      };
    }
    if (asset.type === "generator") {
      const opening = state.openPanel !== panel || state.selectedGeneratorId !== asset.id;
      return {
        ...state,
        openPanel: opening ? panel : null,
        selectedGeneratorId: opening ? asset.id : null,
      };
    }
    return { ...state, openPanel: state.openPanel === panel ? null : panel };
  }

  if (asset.type === "auto_miner") {
    const opening = state.openPanel !== "auto_miner" || state.selectedAutoMinerId !== asset.id;
    return {
      ...state,
      openPanel: opening ? "auto_miner" : null,
      selectedAutoMinerId: opening ? asset.id : null,
    };
  }

  if (asset.type === "auto_smelter") {
    const opening = state.openPanel !== "auto_smelter" || state.selectedAutoSmelterId !== asset.id;
    return {
      ...state,
      openPanel: opening ? "auto_smelter" : null,
      selectedAutoSmelterId: opening ? asset.id : null,
    };
  }

  return null;
}

function areConveyorItemsEqual(a: ConveyorItem[], b: ConveyorItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areNumberArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areAutoSmelterEntriesEqual(a: AutoSmelterEntry, b: AutoSmelterEntry): boolean {
  const aProc = a.processing;
  const bProc = b.processing;
  const sameProcessing =
    aProc === bProc ||
    (!!aProc &&
      !!bProc &&
      aProc.inputItem === bProc.inputItem &&
      aProc.outputItem === bProc.outputItem &&
      aProc.progressMs === bProc.progressMs &&
      aProc.durationMs === bProc.durationMs);

  return (
    sameProcessing &&
    a.status === b.status &&
    a.lastRecipeInput === b.lastRecipeInput &&
    a.lastRecipeOutput === b.lastRecipeOutput &&
    a.selectedRecipe === b.selectedRecipe &&
    areConveyorItemsEqual(a.inputBuffer, b.inputBuffer) &&
    areConveyorItemsEqual(a.pendingOutput, b.pendingOutput) &&
    areNumberArraysEqual(a.throughputEvents, b.throughputEvents)
  );
}

function placeAsset(
  assets: Record<string, PlacedAsset>,
  cellMap: Record<string, string>,
  type: AssetType,
  x: number,
  y: number,
  size: 1 | 2,
  width?: 1 | 2,
  height?: 1 | 2,
  fixed?: boolean
): {
  assets: Record<string, PlacedAsset>;
  cellMap: Record<string, string>;
  id: string;
} | null {
  const w = width ?? size;
  const h = height ?? size;
  if (x + w > GRID_W || y + h > GRID_H) return null;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (cellMap[cellKey(x + dx, y + dy)]) return null;
    }
  }
  const id = makeId();
  const newAssets = {
    ...assets,
    [id]: {
      id,
      type,
      x,
      y,
      size,
      width: w,
      height: h,
      ...(fixed ? { fixed: true } : {}),
      ...withDefaultMachinePriority(type),
    } as PlacedAsset,
  };
  const newCellMap = { ...cellMap };
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      newCellMap[cellKey(x + dx, y + dy)] = id;
    }
  }
  return { assets: newAssets, cellMap: newCellMap, id };
}

function addNotification(
  notifications: GameNotification[],
  resource: string,
  amount: number
): GameNotification[] {
  const displayName = RESOURCE_LABELS[resource] ?? resource;
  const now = Date.now();
  const existing = notifications.find((n) => n.resource === resource);
  if (existing) {
    return notifications.map((n) =>
      n.resource === resource
        ? { ...n, amount: n.amount + amount, expiresAt: now + 4000 }
        : n
    );
  }
  return [
    ...notifications.slice(-5),
    { id: makeId(), resource, displayName, amount, expiresAt: now + 4000 },
  ];
}

function addErrorNotification(
  notifications: GameNotification[],
  message: string
): GameNotification[] {
  const now = Date.now();
  const filtered = notifications.filter(
    (n) => !(n.kind === "error" && n.displayName === message)
  );
  return [
    ...filtered.slice(-5),
    { id: makeId(), resource: "error", displayName: message, amount: 0, kind: "error" as const, expiresAt: now + 3000 },
  ];
}

/** Max entries kept in the auto-delivery log. */
const AUTO_DELIVERY_LOG_MAX = 50;
/** Entries with the same source+resource within this window are batched together. */
const AUTO_DELIVERY_BATCH_WINDOW_MS = 8_000;

/**
 * Appends (or batches into the latest matching entry) one unit delivered to a warehouse.
 * Same sourceId + resource within the batch window → increments amount.
 * Older entries are evicted when the log exceeds AUTO_DELIVERY_LOG_MAX.
 */
function addAutoDelivery(
  log: AutoDeliveryEntry[],
  sourceType: AutoDeliveryEntry["sourceType"],
  sourceId: string,
  resource: string,
  warehouseId: string,
): AutoDeliveryEntry[] {
  const now = Date.now();
  const lastIdx = log.length - 1;
  const last = lastIdx >= 0 ? log[lastIdx] : null;
  if (
    last &&
    last.sourceId === sourceId &&
    last.resource === resource &&
    now - last.timestamp <= AUTO_DELIVERY_BATCH_WINDOW_MS
  ) {
    return [
      ...log.slice(0, lastIdx),
      { ...last, amount: last.amount + 1, timestamp: now },
    ];
  }
  const entry: AutoDeliveryEntry = {
    id: makeId(),
    sourceType,
    sourceId,
    resource,
    amount: 1,
    warehouseId,
    timestamp: now,
  };
  return log.length >= AUTO_DELIVERY_LOG_MAX
    ? [...log.slice(1), entry]
    : [...log, entry];
}

export const EMPTY_HOTBAR_SLOT: HotbarSlot = { toolKind: "empty", amount: 0, label: "", emoji: "" };

export function createInitialHotbar(): HotbarSlot[] {
  return Array.from({ length: HOTBAR_SIZE }, () => ({ ...EMPTY_HOTBAR_SLOT }));
}

function makeHotbarLabel(toolKind: ToolKind, amount: number, buildingType?: BuildingType): string {
  if (toolKind === "empty") return "";
  if (toolKind === "building" && buildingType) {
    return BUILDING_LABELS[buildingType] + (amount > 1 ? ` ×${amount}` : "");
  }
  const base = RESOURCE_LABELS[toolKind] ?? toolKind;
  return amount > 1 ? `${base} (${amount})` : base;
}

function makeHotbarEmoji(toolKind: ToolKind, buildingType?: BuildingType): string {
  if (toolKind === "empty") return "";
  if (toolKind === "building" && buildingType) return ASSET_EMOJIS[buildingType];
  return RESOURCE_EMOJIS[toolKind] ?? "";
}

export function hotbarAdd(
  slots: HotbarSlot[],
  toolKind: Exclude<ToolKind, "empty">,
  buildingType?: BuildingType,
  add = 1
): HotbarSlot[] | null {
  const existingIdx = slots.findIndex(
    (s) =>
      s.toolKind === toolKind &&
      (toolKind !== "building" || s.buildingType === buildingType) &&
      s.amount < HOTBAR_STACK_MAX
  );
  if (existingIdx >= 0) {
    return slots.map((s, i) => {
      if (i !== existingIdx) return s;
      const newAmt = Math.min(s.amount + add, HOTBAR_STACK_MAX);
      return { ...s, amount: newAmt, label: makeHotbarLabel(toolKind, newAmt, buildingType) };
    });
  }
  const emptyIdx = slots.findIndex((s) => s.toolKind === "empty");
  if (emptyIdx < 0) return null;
  return slots.map((s, i) => {
    if (i !== emptyIdx) return s;
    const amt = Math.min(add, HOTBAR_STACK_MAX);
    return { toolKind, buildingType, amount: amt, label: makeHotbarLabel(toolKind, amt, buildingType), emoji: makeHotbarEmoji(toolKind, buildingType) };
  });
}

export function hotbarDecrement(slots: HotbarSlot[], idx: number): HotbarSlot[] {
  return slots.map((s, i) => {
    if (i !== idx) return s;
    if (s.amount <= 1) return { ...EMPTY_HOTBAR_SLOT };
    const newAmt = s.amount - 1;
    return { ...s, amount: newAmt, label: makeHotbarLabel(s.toolKind, newAmt, s.buildingType) };
  });
}

// ============================================================
// CONNECTIVITY
// ============================================================

/**
 * Returns true if any cell of `candidate` is within `range` Chebyshev cells of the
 * top-left cell of `pole` (which is always 1×1).
 */
function assetInPoleRange(pole: PlacedAsset, candidate: PlacedAsset, range: number): boolean {
  for (let cy = 0; cy < assetHeight(candidate); cy++) {
    for (let cx = 0; cx < assetWidth(candidate); cx++) {
      const dx = Math.abs((candidate.x + cx) - pole.x);
      const dy = Math.abs((candidate.y + cy) - pole.y);
      if (Math.max(dx, dy) <= range) return true;
    }
  }
  return false;
}

/**
 * Two-phase connectivity computation:
 *
 * Phase 1 – Cable BFS:
 *   Seeds at all generators and expands ONLY through cables and power poles via
 *   direct cell adjacency. Machines and batteries are NOT cable conductors – they
 *   can only be reached by a power pole in Phase 2.
 *
 * Phase 2 – Power-pole range BFS:
 *   Every power pole reached in Phase 1 distributes wirelessly (Chebyshev range) to
 *   all assets within POWER_POLE_RANGE, including machines, batteries, and other
 *   power poles (which in turn distribute to their own range).
 *
 * Returns the IDs of all assets that are part of the active energy network.
 */
export function computeConnectedAssetIds(state: Pick<GameState, "assets" | "cellMap">): string[] {
  /** Only these types conduct energy through cable adjacency */
  const CABLE_CONDUCTOR_TYPES = new Set<AssetType>(["cable", "generator", "power_pole"]);

  const allAssets = Object.values(state.assets);
  const hasGenerator = allAssets.some((a) => a.type === "generator");
  if (!hasGenerator) return [];

  // ---- Phase 1: Cable BFS ----
  const cableVisitedCells = new Set<string>();
  const cableVisitedIds = new Set<string>();
  const cableQueue: PlacedAsset[] = [];
  const cableConnected = new Set<string>();

  function enqueueCable(asset: PlacedAsset) {
    if (cableVisitedIds.has(asset.id)) return;
    cableVisitedIds.add(asset.id);
    for (let dy = 0; dy < assetHeight(asset); dy++) {
      for (let dx = 0; dx < assetWidth(asset); dx++) {
        cableVisitedCells.add(cellKey(asset.x + dx, asset.y + dy));
      }
    }
    cableQueue.push(asset);
  }

  // Seed from generators
  for (const asset of allAssets) {
    if (asset.type === "generator") {
      cableConnected.add(asset.id);
      enqueueCable(asset);
    }
  }

  while (cableQueue.length > 0) {
    const current = cableQueue.shift()!;
    for (let dy = 0; dy < assetHeight(current); dy++) {
      for (let dx = 0; dx < assetWidth(current); dx++) {
        for (const [ndx, ndy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]) {
          const nx = current.x + dx + ndx;
          const ny = current.y + dy + ndy;
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
          const nk = cellKey(nx, ny);
          if (cableVisitedCells.has(nk)) continue;
          const nAssetId = state.cellMap[nk];
          if (!nAssetId) continue;
          const nAsset = state.assets[nAssetId];
          if (!nAsset || !CABLE_CONDUCTOR_TYPES.has(nAsset.type)) continue;
          cableConnected.add(nAssetId);
          enqueueCable(nAsset);
        }
      }
    }
  }

  // ---- Phase 2: Power-pole range BFS ----
  const connected = new Set<string>(cableConnected);
  const poleQueue: PlacedAsset[] = [];
  for (const id of cableConnected) {
    const asset = state.assets[id];
    if (asset?.type === "power_pole") poleQueue.push(asset);
  }

  while (poleQueue.length > 0) {
    const pole = poleQueue.shift()!;
    for (const candidate of allAssets) {
      if (connected.has(candidate.id)) continue;
      if (!assetInPoleRange(pole, candidate, POWER_POLE_RANGE)) continue;
      connected.add(candidate.id);
      // Connected power poles also distribute to their range
      if (candidate.type === "power_pole") {
        poleQueue.push(candidate);
      }
    }
  }

  return [...connected];
}

// ============================================================
// INITIAL STATE
// ============================================================

export function createInitialState(mode: GameMode): GameState {
  const assets: Record<string, PlacedAsset> = {};
  const cellMap: Record<string, string> = {};

  function tryPlace(type: AssetType, x: number, y: number, size: 1 | 2, fixed?: boolean): string | undefined {
    if (x + size > GRID_W || y + size > GRID_H) return;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (cellMap[cellKey(x + dx, y + dy)]) return;
      }
    }
    const id = makeId();
    assets[id] = {
      id,
      type,
      x,
      y,
      size,
      ...(fixed ? { fixed: true } : {}),
      ...withDefaultMachinePriority(type),
    } as PlacedAsset;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        cellMap[cellKey(x + dx, y + dy)] = id;
      }
    }
    return id;
  }

  // Place fixed map shop (2x2) near center
  tryPlace("map_shop", MAP_SHOP_POS.x, MAP_SHOP_POS.y, 2, true);

  // Place fixed 2\u00d72 resource deposits at predetermined positions
  for (const dp of DEPOSIT_POSITIONS) {
    tryPlace(dp.type, dp.x, dp.y, 2, true);
  }

  // Place starting warehouse (2x2) at the nearest free spot within 10 cells of map_shop
  {
    const shopX = MAP_SHOP_POS.x;
    const shopY = MAP_SHOP_POS.y;
    const candidates: { x: number; y: number; dist: number }[] = [];
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const wx = shopX + dx;
        const wy = shopY + dy;
        if (wx < 0 || wy < 0 || wx + 2 > GRID_W || wy + 2 > GRID_H) continue;
        candidates.push({ x: wx, y: wy, dist: Math.abs(dx) + Math.abs(dy) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const { x, y } of candidates) {
      if (
        !cellMap[cellKey(x, y)] &&
        !cellMap[cellKey(x + 1, y)] &&
        !cellMap[cellKey(x, y + 1)] &&
        !cellMap[cellKey(x + 1, y + 1)]
      ) {
        tryPlace("warehouse", x, y, 2);
        break;
      }
    }
  }

  // Place resources randomly (in debug mode skip the 24×24 free zone around the center)
  const debugFreeZone = mode === "debug";
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    if (debugFreeZone && isInDebugFreeZone(x, y)) continue;
    tryPlace("tree", x, y, 1);
  }
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    if (debugFreeZone && isInDebugFreeZone(x, y)) continue;
    tryPlace("stone", x, y, 1);
  }
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    if (debugFreeZone && isInDebugFreeZone(x, y)) continue;
    tryPlace("iron", x, y, 1);
  }
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    if (debugFreeZone && isInDebugFreeZone(x, y)) continue;
    tryPlace("copper", x, y, 1);
  }

  const isDebug = mode === "debug";
  const floorMap: Record<string, "stone_floor"> = {};
  const autoMiners: Record<string, AutoMinerEntry> = {};
  const conveyors: Record<string, ConveyorState> = {};
  const autoSmelters: Record<string, AutoSmelterEntry> = {};
  let generatorState: GeneratorState = { fuel: 0, progress: 0, running: false };
  let selectedPowerPoleId: string | null = null;

  function removeNonFixedAssetAtCell(x: number, y: number) {
    const id = cellMap[cellKey(x, y)];
    if (!id) return;
    const a = assets[id];
    if (!a || a.fixed) return;
    delete assets[id];
    for (let dy = 0; dy < assetHeight(a); dy++) {
      for (let dx = 0; dx < assetWidth(a); dx++) {
        const k = cellKey(a.x + dx, a.y + dy);
        if (cellMap[k] === id) delete cellMap[k];
      }
    }
  }

  function clearAreaForDebug(x: number, y: number, size: 1 | 2) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        removeNonFixedAssetAtCell(x + dx, y + dy);
      }
    }
  }

  function placeDirectedForDebug(type: AssetType, x: number, y: number, direction: Direction) {
    clearAreaForDebug(x, y, 1);
    const placedId = tryPlace(type, x, y, 1);
    if (!placedId) return null;
    assets[placedId] = { ...assets[placedId], direction };
    return placedId;
  }

  if (isDebug) {
    // Deterministisches Debug-Setup:
    // Auto-Miner (Eisen) -> 3 Förderbänder -> Auto Smelter -> 3 Förderbänder -> Lagerhaus,
    // plus 2 Generatoren + Stromknoten für stabile Vollversorgung.
    const ironDeposit = Object.values(assets).find((a) => a.type === "iron_deposit") ?? null;
    if (ironDeposit) {
      const minerPos = { x: ironDeposit.x, y: ironDeposit.y, dir: "west" as Direction };
      const autoSmelterPos = {
        x: Math.max(2, minerPos.x - 5),
        y: minerPos.y,
      };
      const warehousePos = {
        x: Math.max(1, minerPos.x - 8),
        y: Math.max(0, minerPos.y - 2),
      };
      const generatorA = {
        x: Math.max(0, autoSmelterPos.x - 2),
        y: Math.min(GRID_H - 2, autoSmelterPos.y + 3),
      };
      const generatorB = {
        x: Math.min(GRID_W - 2, autoSmelterPos.x + 1),
        y: Math.min(GRID_H - 2, autoSmelterPos.y + 3),
      };
      const polePositions = [
        { x: autoSmelterPos.x + 1, y: autoSmelterPos.y + 2 },
        { x: autoSmelterPos.x - 1, y: autoSmelterPos.y + 2 },
        { x: warehousePos.x + 1, y: warehousePos.y + 2 },
        // Bridge pole so the auto-miner tile is within POWER_POLE_RANGE in debug setup.
        { x: minerPos.x - 3, y: minerPos.y + 1 },
      ].filter((p) => p.x >= 0 && p.x < GRID_W && p.y >= 0 && p.y < GRID_H);

      const inputBelts = [
        { x: minerPos.x - 1, y: minerPos.y, dir: "west" as Direction },
        { x: minerPos.x - 2, y: minerPos.y, dir: "west" as Direction },
        { x: minerPos.x - 3, y: minerPos.y, dir: "west" as Direction },
      ];
      const outputBelts = [
        { x: autoSmelterPos.x - 1, y: autoSmelterPos.y, dir: "west" as Direction },
        { x: autoSmelterPos.x - 2, y: autoSmelterPos.y, dir: "west" as Direction },
        { x: autoSmelterPos.x - 3, y: autoSmelterPos.y, dir: "west" as Direction },
      ];

      clearAreaForDebug(warehousePos.x, warehousePos.y, 2);
      clearAreaForDebug(autoSmelterPos.x, autoSmelterPos.y, 2);
      clearAreaForDebug(generatorA.x, generatorA.y, 2);
      clearAreaForDebug(generatorB.x, generatorB.y, 2);
      for (const p of polePositions) clearAreaForDebug(p.x, p.y, 1);
      for (const belt of [...inputBelts, ...outputBelts]) clearAreaForDebug(belt.x, belt.y, 1);

      for (const g of [generatorA, generatorB]) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            floorMap[cellKey(g.x + dx, g.y + dy)] = "stone_floor";
          }
        }
      }

      tryPlace("warehouse", warehousePos.x, warehousePos.y, 2);
      tryPlace("generator", generatorA.x, generatorA.y, 2);
      tryPlace("generator", generatorB.x, generatorB.y, 2);

      for (const p of polePositions) {
        const poleId = placeDirectedForDebug("power_pole", p.x, p.y, "north");
        if (!selectedPowerPoleId && poleId) selectedPowerPoleId = poleId;
      }

      const depositCellId = cellMap[cellKey(minerPos.x, minerPos.y)];
      const depositAsset = depositCellId ? assets[depositCellId] : null;
      let minerId: string | null = null;
      if (depositAsset && depositAsset.type === "iron_deposit") {
        minerId = makeId();
        assets[minerId] = {
          id: minerId,
          type: "auto_miner",
          x: minerPos.x,
          y: minerPos.y,
          size: 1,
          direction: minerPos.dir,
          priority: DEFAULT_MACHINE_PRIORITY,
        };
        cellMap[cellKey(minerPos.x, minerPos.y)] = minerId;
        autoMiners[minerId] = {
          depositId: depositCellId,
          resource: "iron",
          progress: 0,
        };
      }

      for (const belt of [...inputBelts, ...outputBelts]) {
        const convId = placeDirectedForDebug("conveyor", belt.x, belt.y, belt.dir);
        if (convId) conveyors[convId] = { queue: [] };
      }

      const smelterPlaced = placeAsset(assets, cellMap, "auto_smelter", autoSmelterPos.x, autoSmelterPos.y, 2, 2, 1);
      if (smelterPlaced) {
        Object.assign(assets, smelterPlaced.assets);
        assets[smelterPlaced.id] = {
          ...smelterPlaced.assets[smelterPlaced.id],
          direction: "west",
          priority: DEFAULT_MACHINE_PRIORITY,
        };
        for (const [k, v] of Object.entries(smelterPlaced.cellMap)) {
          cellMap[k] = v;
        }
        autoSmelters[smelterPlaced.id] = {
          inputBuffer: [],
          processing: null,
          pendingOutput: [],
          status: "IDLE",
          lastRecipeInput: null,
          lastRecipeOutput: null,
          throughputEvents: [],
          selectedRecipe: "iron",
        };

        const io = getAutoSmelterIoCells(assets[smelterPlaced.id]);
        const inputNeighborId = cellMap[cellKey(io.input.x, io.input.y)];
        const outputNeighborId = cellMap[cellKey(io.output.x, io.output.y)];
        const inputNeighbor = inputNeighborId ? assets[inputNeighborId] : null;
        const outputNeighbor = outputNeighborId ? assets[outputNeighborId] : null;
        const beltFound =
          (inputNeighbor?.type === "conveyor" || inputNeighbor?.type === "conveyor_corner") &&
          (outputNeighbor?.type === "conveyor" || outputNeighbor?.type === "conveyor_corner");

        console.log("[DebugSetup] Auto-Miner:", minerId ? assets[minerId] : null);
        console.log("[DebugSetup] Auto-Smelter:", assets[smelterPlaced.id]);
        console.log("[DebugSetup] Lagerhaus:", Object.values(assets).find((a) => a.type === "warehouse"));
        console.log("[DebugSetup] Generator A:", generatorA, "Generator B:", generatorB);
        console.log("[DebugSetup] Smelter Input-Tile:", io.input);
        console.log("[DebugSetup] Smelter Output-Tile:", io.output);
        console.log("[DebugSetup] Förderbänder korrekt erkannt:", beltFound, {
          inputType: inputNeighbor?.type ?? null,
          outputType: outputNeighbor?.type ?? null,
        });
        console.log("[DebugSetup] Miner -> Input-Band verbunden:", {
          minerOutputTile: { x: minerPos.x - 1, y: minerPos.y },
          inputTile: io.input,
          connected: minerPos.x - 1 === inputBelts[0].x && minerPos.y === inputBelts[0].y,
        });
      }

      generatorState = { fuel: 500, progress: 0, running: true };
    }
  }

  const inventory: Inventory = {
    ...createEmptyInventory(),
    ...(isDebug
      ? {
          coins: 99999,
          wood: 1000,
          stone: 1000,
          iron: 1000,
          copper: 1000,
          sapling: 1000,
          ironIngot: 1000,
          copperIngot: 1000,
          metalPlate: 1000,
          gear: 1000,
          axe: 100,
          wood_pickaxe: 100,
          stone_pickaxe: 100,
        }
      : { coins: 100 }),
  };

  const warehouseInventories: Record<string, Inventory> = {};
  for (const a of Object.values(assets)) {
    if (a.type === "warehouse") {
      warehouseInventories[a.id] = createEmptyInventory();
    }
  }

  const hotbar = createInitialHotbar();
  if (isDebug) {
    hotbar[0] = { toolKind: "axe", amount: 5, label: "Axt (5)", emoji: "\u{1FA93}" };
    hotbar[1] = { toolKind: "wood_pickaxe", amount: 5, label: "Holzspitzhacke (5)", emoji: "\u26CF\uFE0F" };
    hotbar[2] = { toolKind: "stone_pickaxe", amount: 5, label: "Steinspitzhacke (5)", emoji: "\u26CF\uFE0F" };
    hotbar[3] = { toolKind: "sapling", amount: 5, label: "Setzling (5)", emoji: "\u{1F331}" };
  }
  const warehouseCount = Object.values(assets).filter((a) => a.type === "warehouse").length;
  const powerPoleCount = Object.values(assets).filter((a) => a.type === "power_pole").length;
  const hasGenerator = Object.values(assets).some((a) => a.type === "generator");
  const connectedAssetIds = computeConnectedAssetIds({ assets, cellMap });
  const poweredMachineIds = generatorState.running
    ? connectedAssetIds.filter((id) => {
        const a = assets[id];
        return !!a && isEnergyConsumerType(a.type);
      })
    : [];

  return {
    mode,
    assets,
    cellMap,
    inventory,
    purchasedBuildings: hasGenerator ? ["generator"] : [],
    placedBuildings: hasGenerator ? ["generator"] : [],
    warehousesPurchased: warehouseCount,
    warehousesPlaced: warehouseCount,
    warehouseInventories,
    selectedWarehouseId: null,
    cablesPlaced: 0,
    powerPolesPlaced: powerPoleCount,
    selectedPowerPoleId,
    hotbarSlots: hotbar,
    activeSlot: 0,
    smithy: { fuel: 0, iron: 0, copper: 0, selectedRecipe: "iron", processing: false, progress: 0, outputIngots: 0, outputCopperIngots: 0 },
    generator: generatorState,
    battery: { stored: 0, capacity: BATTERY_CAPACITY },
    connectedAssetIds,
    poweredMachineIds,
    openPanel: null,
    notifications: [],
    saplingGrowAt: {},
    buildMode: false,
    selectedBuildingType: null,
    selectedFloorTile: null,
    floorMap,
    autoMiners,
    conveyors,
    selectedAutoMinerId: null,
    autoSmelters,
    selectedAutoSmelterId: null,
    selectedGeneratorId: null,
    manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
    machinePowerRatio: {},
    energyDebugOverlay: false,
    autoDeliveryLog: [],
    buildingSourceWarehouseIds: {},
    productionZones: {},
    buildingZoneIds: {},
    selectedCraftingBuildingId: null,
  };
}

// ============================================================
// ACTIONS
// ============================================================

export type GameAction =
  | { type: "CLICK_CELL"; x: number; y: number }
  | { type: "SET_ACTIVE_SLOT"; slot: number }
  | { type: "BUY_MAP_SHOP_ITEM"; itemKey: string }
  | { type: "CRAFT_WORKBENCH"; recipeKey: string }
  | { type: "TOGGLE_PANEL"; panel: UIPanel }
  | { type: "CLOSE_PANEL" }
  | { type: "SMITHY_ADD_FUEL"; amount: number }
  | { type: "SMITHY_ADD_IRON"; amount: number }
  | { type: "SMITHY_START" }
  | { type: "SMITHY_STOP" }
  | { type: "SMITHY_TICK" }
  | { type: "SMITHY_WITHDRAW" }
  | { type: "MANUAL_ASSEMBLER_START"; recipe: "metal_plate" | "gear" }
  | { type: "MANUAL_ASSEMBLER_TICK" }
  | { type: "AUTO_SMELTER_TICK" }
  | { type: "AUTO_SMELTER_SET_RECIPE"; assetId: string; recipe: "iron" | "copper" }
  | { type: "GROW_SAPLING"; assetId: string }
  | { type: "GROW_SAPLINGS"; assetIds: string[] }
  | { type: "NATURAL_SPAWN" }
  | { type: "REMOVE_BUILDING"; buildingType: BuildingType }
  | { type: "REMOVE_FROM_HOTBAR"; slot: number }
  | { type: "EQUIP_BUILDING_FROM_WAREHOUSE"; buildingType: BuildingType; amount?: number }
  | { type: "EQUIP_FROM_WAREHOUSE"; itemKind: "axe" | "wood_pickaxe" | "stone_pickaxe" | "sapling"; amount?: number }
  | { type: "TRANSFER_TO_WAREHOUSE"; item: keyof Inventory; amount: number }
  | { type: "TRANSFER_FROM_WAREHOUSE"; item: keyof Inventory; amount: number }
  | { type: "SMITHY_ADD_COPPER"; amount: number }
  | { type: "SMITHY_SET_RECIPE"; recipe: "iron" | "copper" }
  | { type: "EXPIRE_NOTIFICATIONS" }
  | { type: "DEBUG_SET_STATE"; state: GameState }
  // Generator / Energy
  | { type: "GENERATOR_ADD_FUEL"; amount: number }
  | { type: "GENERATOR_START" }
  | { type: "GENERATOR_STOP" }
  | { type: "GENERATOR_TICK" }
  // Unified energy-network balance tick (production – consumption → battery)
  | { type: "ENERGY_NET_TICK" }
  // Power pole removal (by specific asset ID)
  | { type: "REMOVE_POWER_POLE"; assetId: string }
  // Build mode
  | { type: "TOGGLE_BUILD_MODE" }
  | { type: "SELECT_BUILD_BUILDING"; buildingType: BuildingType | null }
  | { type: "SELECT_BUILD_FLOOR_TILE"; tileType: FloorTileType | null }
  | { type: "BUILD_PLACE_BUILDING"; x: number; y: number; direction?: Direction }
  | { type: "BUILD_PLACE_FLOOR_TILE"; x: number; y: number }
  | { type: "BUILD_REMOVE_ASSET"; assetId: string }
  | { type: "LOGISTICS_TICK" }
  | { type: "TOGGLE_ENERGY_DEBUG" }
  | { type: "SET_MACHINE_PRIORITY"; assetId: string; priority: MachinePriority }
  | { type: "SET_MACHINE_BOOST"; assetId: string; boosted: boolean }
  // Per-building resource source selection
  | { type: "SET_BUILDING_SOURCE"; buildingId: string; warehouseId: string | null }
  // Production zones
  | { type: "CREATE_ZONE"; name?: string }
  | { type: "DELETE_ZONE"; zoneId: string }
  | { type: "SET_BUILDING_ZONE"; buildingId: string; zoneId: string | null };

// ============================================================
// REDUCER
// ============================================================

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "CLICK_CELL": {
      const { x, y } = action;
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return state;

      const assetId = state.cellMap[cellKey(x, y)];
      const asset = assetId ? state.assets[assetId] : null;

      // Click on map shop => open shop panel (always works)
      if (asset && asset.type === "map_shop") {
        return { ...state, openPanel: state.openPanel === "map_shop" ? null : "map_shop" };
      }

      // ----- BUILD MODE ACTIVE -----
      if (state.buildMode) {
        const panelState = tryTogglePanelFromAsset(state, asset);
        if (panelState) return panelState;
        // In build mode: no mining, no hotbar tools, no cable clicking – only BUILD_PLACE_BUILDING / BUILD_REMOVE_ASSET via dispatch
        return state;
      }

      // ----- NORMAL MODE (build mode OFF) -----
      // Click on building => open its panel (panels still accessible)
      {
        const panelState = tryTogglePanelFromAsset(state, asset);
        if (panelState) return panelState;
      }

      // ---- NO cable removal outside build mode ----
      // (removed old cable-click-remove logic here; cables are removed via BUILD_REMOVE_ASSET)

      const slot = state.hotbarSlots[state.activeSlot];
      if (!slot || slot.toolKind === "empty") return state;

      // Block building placement from hotbar in normal mode
      if (slot.toolKind === "building") return state;

      // Block tool usage on 2×2 deposits – they require an Auto-Miner
      if (asset && DEPOSIT_TYPES.has(asset.type)) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Benötigt Auto-Miner") };
      }

      // === AXE: fell tree (durability 1) ===
      if (slot.toolKind === "axe") {
        if (!asset || asset.type !== "tree") {
          if (asset && ((["stone", "iron", "copper"] as string[]).includes(asset.type))) {
            const msg = asset.type === "stone"
              ? "Du brauchst eine Holz- oder Steinspitzhacke."
              : "Du brauchst eine Steinspitzhacke.";
            return { ...state, notifications: addErrorNotification(state.notifications, msg) };
          }
          return state;
        }
        if (slot.amount <= 0) return state;
        const cap = getCapacityPerResource(state);
        if (getAvailableResource(state, "wood") >= cap) {
          debugLog.warehouse(`Capacity check FAILED: wood ${getAvailableResource(state, "wood")}/${cap}`);
          return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
        }
        const removed = removeAsset(state, assetId);
        let inv = addResources(state.inventory, { wood: 1 });
        let notifs = addNotification(state.notifications, "wood", 1);
        let hotbar0 = hotbarDecrement(state.hotbarSlots, state.activeSlot);
        debugLog.mining(`Felled tree at (${x},${y}) with Axe`);
        debugLog.inventory("Added 1 Wood to inventory");
        if (Math.random() < SAPLING_DROP_CHANCE) {
          const withSapling = hotbarAdd(hotbar0, "sapling");
          if (withSapling) {
            hotbar0 = withSapling;
            notifs = addNotification(notifs, "sapling", 1);
          } else if (inv.sapling < cap) {
            inv = addResources(inv, { sapling: 1 });
            notifs = addNotification(notifs, "sapling", 1);
            debugLog.inventory("Sapling drop → added to central inventory");
          }
        }
        return { ...state, ...removed, inventory: inv, hotbarSlots: hotbar0, notifications: notifs };
      }
      if (slot.toolKind === "wood_pickaxe") {
        if (!asset || asset.type !== "stone") {
          if (asset && asset.type === "tree") {
            return { ...state, notifications: addErrorNotification(state.notifications, "Du brauchst eine Axt.") };
          }
          if (asset && (["iron", "copper"] as string[]).includes(asset.type)) {
            return { ...state, notifications: addErrorNotification(state.notifications, "Du brauchst eine Steinspitzhacke.") };
          }
          return state;
        }
        if (slot.amount <= 0) return state;
        const cap = getCapacityPerResource(state);
        if (getAvailableResource(state, "stone") >= cap) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
        }
        const removed = removeAsset(state, assetId);
        const inv = addResources(state.inventory, { stone: 1 });
        const notifs = addNotification(state.notifications, "stone", 1);
        const newHotbar1 = hotbarDecrement(state.hotbarSlots, state.activeSlot);
        debugLog.mining(`Mined stone at (${x},${y}) with Wood Pickaxe`);
        debugLog.inventory("Added 1 Stone to inventory");
        return { ...state, ...removed, inventory: inv, hotbarSlots: newHotbar1, notifications: notifs };
      }

      // === STONE_PICKAXE: mine stone, iron, copper ===
      if (slot.toolKind === "stone_pickaxe") {
        if (!asset || !(["stone", "iron", "copper"] as string[]).includes(asset.type)) {
          if (asset && asset.type === "tree") {
            return { ...state, notifications: addErrorNotification(state.notifications, "Du brauchst eine Axt.") };
          }
          return state;
        }
        if (slot.amount <= 0) return state;
        const resKey = asset.type as keyof Inventory;
        const cap = getCapacityPerResource(state);
        if (getAvailableResource(state, resKey) >= cap) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
        }
        const removed = removeAsset(state, assetId);
        const inv = addResources(state.inventory, { [resKey]: 1 });
        const notifs = addNotification(state.notifications, asset.type, 1);
        const newHotbar2 = hotbarDecrement(state.hotbarSlots, state.activeSlot);
        debugLog.mining(`Mined ${asset.type} at (${x},${y}) with Stone Pickaxe`);
        debugLog.inventory(`Added 1 ${RESOURCE_LABELS[asset.type] ?? asset.type} to inventory`);
        return { ...state, ...removed, inventory: inv, hotbarSlots: newHotbar2, notifications: notifs };
      }

      // === PLACE SAPLING ===
      if (slot.toolKind === "sapling") {
        if (slot.amount <= 0 || asset) return state;
        const placed = placeAsset(state.assets, state.cellMap, "sapling", x, y, 1);
        if (!placed) return state;
        const newHotbar3 = hotbarDecrement(state.hotbarSlots, state.activeSlot);
        debugLog.building(`Placed Sapling at (${x},${y})`);
        return {
          ...state,
          assets: placed.assets,
          cellMap: placed.cellMap,
          hotbarSlots: newHotbar3,
          saplingGrowAt: { ...state.saplingGrowAt, [placed.id]: Date.now() + SAPLING_GROW_MS },
        };
      }

      // Buildings are placed exclusively via BUILD_PLACE_BUILDING (build mode)

      return state;
    }

    case "SET_ACTIVE_SLOT":
      return { ...state, activeSlot: Math.min(action.slot, Math.max(0, state.hotbarSlots.length - 1)) };

    case "BUY_MAP_SHOP_ITEM": {
      const item = MAP_SHOP_ITEMS.find((i) => i.key === action.itemKey);
      if (!item) return state;
      if (!hasResources(state.inventory, { coins: item.costCoins })) return state;
      const baseInv = consumeResources(state.inventory, { coins: item.costCoins });
      const notifs = addNotification(state.notifications, item.key, 1);
      const toolHotbarKinds: ToolKind[] = ["axe", "wood_pickaxe", "stone_pickaxe"];
      const toolKind = item.key as ToolKind;
      if (toolHotbarKinds.includes(toolKind)) {
        const newHotbar = hotbarAdd(state.hotbarSlots, toolKind as Exclude<ToolKind, "empty">);
        if (newHotbar) {
          return { ...state, inventory: baseInv, hotbarSlots: newHotbar, notifications: notifs };
        }
      }
      const newInv = addResources(baseInv, { [item.inventoryKey]: 1 });
      return { ...state, inventory: newInv, notifications: notifs };
    }

    case "CRAFT_WORKBENCH": {
      const recipe = getWorkbenchRecipe(action.recipeKey);
      if (!recipe) return state;
      if (!state.placedBuildings.includes("workbench")) return state;
      const workbenchAsset = Object.values(state.assets).find((a) => a.type === "workbench");
      const workbenchPowered =
        !!workbenchAsset && (state.poweredMachineIds ?? []).includes(workbenchAsset.id);
      if (!workbenchPowered) {
        return {
          ...state,
          notifications: addErrorNotification(state.notifications, "Werkbank hat keinen Strom."),
        };
      }
      const costs = recipe.costs as Partial<Record<keyof Inventory, number>>;
      const source = resolveBuildingSource(state, state.selectedCraftingBuildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      if (!hasResources(sourceInv, costs)) return state;
      let newSourceInv = consumeResources(sourceInv, costs);
      const outputKey = recipe.outputItem as keyof Inventory;
      const notifs = addNotification(state.notifications, outputKey, recipe.outputAmount);
      const toolHotbarKindsW: ToolKind[] = ["axe", "wood_pickaxe", "stone_pickaxe"];
      const outKind = outputKey as ToolKind;
      if (toolHotbarKindsW.includes(outKind)) {
        const newHotbar = hotbarAdd(state.hotbarSlots, outKind as Exclude<ToolKind, "empty">, undefined, recipe.outputAmount);
        if (newHotbar) {
          return { ...state, ...applyCraftingSourceInventory(state, source, newSourceInv), hotbarSlots: newHotbar, notifications: notifs };
        }
      }
      newSourceInv = addResources(newSourceInv, { [outputKey]: recipe.outputAmount });
      return { ...state, ...applyCraftingSourceInventory(state, source, newSourceInv), notifications: notifs };
    }

    case "TOGGLE_PANEL":
      return { ...state, openPanel: state.openPanel === action.panel ? null : action.panel };

    case "CLOSE_PANEL":
      return { ...state, openPanel: null, selectedAutoMinerId: null, selectedAutoSmelterId: null, selectedGeneratorId: null, selectedWarehouseId: null, selectedCraftingBuildingId: null };

    case "EQUIP_BUILDING_FROM_WAREHOUSE": {
      const { buildingType, amount = 1 } = action;
      const whId = state.selectedWarehouseId;
      if (!whId) return state;
      const whInv = state.warehouseInventories[whId];
      if (!whInv) return state;
      const invKey = buildingType as keyof Inventory;
      if ((whInv[invKey] as number) < amount) return state;

      const newHotbar = hotbarAdd(state.hotbarSlots, "building", buildingType, amount);
      if (!newHotbar) {
        return {
          ...state,
          notifications: addErrorNotification(
            state.notifications,
            "Hotbar voll! Kein Platz zum Ausrüsten.",
          ),
        };
      }

      const newWhInv = {
        ...whInv,
        [invKey]: (whInv[invKey] as number) - amount,
      };

      return {
        ...state,
        warehouseInventories: {
          ...state.warehouseInventories,
          [whId]: newWhInv,
        },
        hotbarSlots: newHotbar,
      };
    }

    case "EQUIP_FROM_WAREHOUSE": {
      const { itemKind, amount = 1 } = action;
      debugLog.hotbar(`Equip ${RESOURCE_LABELS[itemKind] ?? itemKind} ×${amount} from warehouse → hotbar`);
      const invKey = itemKind as keyof Inventory;
      const whId = state.selectedWarehouseId;
      if (!whId) return state;
      const whInv = state.warehouseInventories[whId];
      if (!whInv) return state;
      if ((whInv[invKey] as number) < amount) return state;
      const newHotbar = hotbarAdd(state.hotbarSlots, itemKind as Exclude<ToolKind, "empty">, undefined, amount);
      if (!newHotbar) return { ...state, notifications: addErrorNotification(state.notifications, "Hotbar voll! Kein Platz zum Ausrüsten.") };
      const newWhInv = { ...whInv, [invKey]: (whInv[invKey] as number) - amount };
      return { ...state, warehouseInventories: { ...state.warehouseInventories, [whId]: newWhInv }, hotbarSlots: newHotbar };
    }

    // ---- Manual resource transfers: global ↔ selected warehouse ----

    case "TRANSFER_TO_WAREHOUSE": {
      const { item, amount } = action;
      if (amount <= 0) return state;
      const whId = state.selectedWarehouseId;
      if (!whId) return state;
      const whInv = state.warehouseInventories[whId];
      if (!whInv) return state;

      // Clamp to what is actually available in global inventory
      const globalAvailable = getAvailableResource(state, item);
      const whCap = getWarehouseCapacity(state.mode);
      const whCurrent = whInv[item] as number;
      const spaceInWarehouse = item === "coins" ? Infinity : Math.max(0, whCap - whCurrent);
      const transferAmount = Math.min(amount, globalAvailable, spaceInWarehouse);
      if (transferAmount <= 0) return state;

      return {
        ...state,
        inventory: consumeResources(state.inventory, { [item]: transferAmount }),
        warehouseInventories: {
          ...state.warehouseInventories,
          [whId]: addResources(whInv, { [item]: transferAmount }),
        },
      };
    }

    case "TRANSFER_FROM_WAREHOUSE": {
      const { item, amount } = action;
      if (amount <= 0) return state;
      const whId = state.selectedWarehouseId;
      if (!whId) return state;
      const whInv = state.warehouseInventories[whId];
      if (!whInv) return state;

      // Clamp to what the warehouse actually holds
      const whAvailable = whInv[item] as number;
      const transferAmount = Math.min(amount, whAvailable);
      if (transferAmount <= 0) return state;

      return {
        ...state,
        inventory: addResources(state.inventory, { [item]: transferAmount }),
        warehouseInventories: {
          ...state.warehouseInventories,
          [whId]: consumeResources(whInv, { [item]: transferAmount }),
        },
      };
    }

    case "SMITHY_ADD_FUEL": {
      const source = resolveBuildingSource(state, state.selectedCraftingBuildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const amt = Math.min(action.amount, sourceInv.wood as number);
      if (amt > 0) debugLog.smithy(`Added ${amt} Wood as fuel`);
      if (amt <= 0) return state;
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { wood: amt })),
        smithy: { ...state.smithy, fuel: state.smithy.fuel + amt },
      };
    }

    case "SMITHY_ADD_IRON": {
      const source = resolveBuildingSource(state, state.selectedCraftingBuildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const amt = Math.min(action.amount, sourceInv.iron as number);
      if (amt > 0) debugLog.smithy(`Added ${amt} Iron ore`);
      if (amt <= 0) return state;
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { iron: amt })),
        smithy: { ...state.smithy, iron: state.smithy.iron + amt },
      };
    }

    case "SMITHY_ADD_COPPER": {
      const source = resolveBuildingSource(state, state.selectedCraftingBuildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const amt = Math.min(action.amount, sourceInv.copper as number);
      if (amt > 0) debugLog.smithy(`Added ${amt} Copper ore`);
      if (amt <= 0) return state;
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { copper: amt })),
        smithy: { ...state.smithy, copper: state.smithy.copper + amt },
      };
    }

    case "SMITHY_SET_RECIPE": {
      if (state.smithy.processing) return state;
      return { ...state, smithy: { ...state.smithy, selectedRecipe: action.recipe } };
    }

    case "SMITHY_START": {
      const s = state.smithy;
      const smithyAsset = Object.values(state.assets).find((a) => a.type === "smithy");
      const smithyPowered =
        !!smithyAsset && (state.poweredMachineIds ?? []).includes(smithyAsset.id);
      if (!smithyPowered) {
        return {
          ...state,
          notifications: addErrorNotification(state.notifications, "Schmelze hat keinen Strom."),
        };
      }
      if (s.processing || s.fuel <= 0) return state;
      const recipe = getSmeltingRecipe(s.selectedRecipe);
      if (!recipe) return state;
      const rawAmt = s.selectedRecipe === "iron" ? s.iron : s.copper;
      if (rawAmt < recipe.inputAmount) return state;
      debugLog.smithy(`Started smelting ${s.selectedRecipe} (fuel=${s.fuel}, ore=${rawAmt})`);
      return { ...state, smithy: { ...s, processing: true, progress: 0 } };
    }

    case "SMITHY_STOP":
      return { ...state, smithy: { ...state.smithy, processing: false } };

    case "SMITHY_TICK": {
      const s = state.smithy;
      const smithyAsset = Object.values(state.assets).find((a) => a.type === "smithy");
      const smithyPowered =
        !!smithyAsset && (state.poweredMachineIds ?? []).includes(smithyAsset.id);
      if (!smithyPowered) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      const recipe = getSmeltingRecipe(s.selectedRecipe);
      if (!recipe) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      const rawAmt = s.selectedRecipe === "iron" ? s.iron : s.copper;
      if (!s.processing || s.fuel <= 0 || rawAmt < recipe.inputAmount)
        return { ...state, smithy: { ...s, processing: false } };
      const newProgress = s.progress + SMITHY_TICK_MS / SMITHY_PROCESS_MS;
      if (newProgress >= 1) {
        const newFuel = s.fuel - 1;
        if (recipe.inputItem === "iron") {
          const newIron = s.iron - recipe.inputAmount;
          const canContinue = newFuel > 0 && newIron >= recipe.inputAmount;
          return {
            ...state,
            smithy: { ...s, iron: newIron, fuel: newFuel, outputIngots: s.outputIngots + recipe.outputAmount, progress: 0, processing: canContinue },
            notifications: addNotification(state.notifications, recipe.outputItem, recipe.outputAmount),
          };
        } else {
          const newCopper = s.copper - recipe.inputAmount;
          const canContinue = newFuel > 0 && newCopper >= recipe.inputAmount;
          return {
            ...state,
            smithy: { ...s, copper: newCopper, fuel: newFuel, outputCopperIngots: s.outputCopperIngots + recipe.outputAmount, progress: 0, processing: canContinue },
            notifications: addNotification(state.notifications, recipe.outputItem, recipe.outputAmount),
          };
        }
      }
      return { ...state, smithy: { ...s, progress: newProgress } };
    }

    case "SMITHY_WITHDRAW": {
      const ironAmt = state.smithy.outputIngots;
      const copperAmt = state.smithy.outputCopperIngots;
      if (ironAmt <= 0 && copperAmt <= 0) return state;
      const source = resolveBuildingSource(state, state.selectedCraftingBuildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const newSourceInv = addResources(sourceInv, { ironIngot: ironAmt, copperIngot: copperAmt });
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, newSourceInv),
        smithy: { ...state.smithy, outputIngots: 0, outputCopperIngots: 0 },
      };
    }

    case "MANUAL_ASSEMBLER_START": {
      if (!Object.values(state.assets).some((a) => a.type === "manual_assembler")) return state;
      if (state.manualAssembler.processing) return state;
      const recipe = getManualAssemblerRecipe(action.recipe);
      if (!recipe) return state;
      const bId = state.selectedCraftingBuildingId;
      const source = resolveBuildingSource(state, bId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const outputKey = recipe.outputItem as keyof Inventory;
      const inputKey = recipe.inputItem as keyof Inventory;

      // Capacity check against active source
      const cap = source.kind === "global" ? getCapacityPerResource(state) : source.kind === "zone" ? getZoneItemCapacity(state, source.zoneId) : (state.mode === "debug" ? Infinity : WAREHOUSE_CAPACITY);
      if ((sourceInv[outputKey] as number) >= cap) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
      }
      if ((sourceInv[inputKey] as number) < recipe.inputAmount) {
        const error = recipe.key === "metal_plate" ? "Nicht genug Metallbarren!" : "Nicht genug Metallplatten!";
        return { ...state, notifications: addErrorNotification(state.notifications, error) };
      }

      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { [inputKey]: recipe.inputAmount })),
        manualAssembler: { processing: true, recipe: recipe.key, progress: 0, buildingId: bId },
      };
    }

    case "MANUAL_ASSEMBLER_TICK": {
      const m = state.manualAssembler;
      if (!m.processing || !m.recipe) return state;
      const recipe = getManualAssemblerRecipe(m.recipe);
      if (!recipe) return { ...state, manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null } };

      const newProgress = m.progress + MANUAL_ASSEMBLER_TICK_MS / Math.max(1, recipe.processingTime * 1000);
      if (newProgress < 1) {
        return { ...state, manualAssembler: { ...m, progress: newProgress } };
      }

      // Use the building ID stored at START time for output routing
      const source = resolveBuildingSource(state, m.buildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const outputKey = recipe.outputItem as keyof Inventory;
      const cap = source.kind === "global" ? getCapacityPerResource(state) : source.kind === "zone" ? getZoneItemCapacity(state, source.zoneId) : (state.mode === "debug" ? Infinity : WAREHOUSE_CAPACITY);
      if ((sourceInv[outputKey] as number) >= cap) {
        return {
          ...state,
          manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
          notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser."),
        };
      }

      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, addResources(sourceInv, { [outputKey]: recipe.outputAmount })),
        manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
        notifications: addNotification(state.notifications, outputKey, recipe.outputAmount),
      };
    }

    case "GROW_SAPLING": {
      const asset = state.assets[action.assetId];
      if (!asset || asset.type !== "sapling") return state;
      const removed = removeAsset(state, action.assetId);
      const placed = placeAsset(removed.assets, removed.cellMap, "tree", asset.x, asset.y, 1);
      if (!placed) return state;
      return { ...state, assets: placed.assets, cellMap: placed.cellMap, saplingGrowAt: removed.saplingGrowAt };
    }

    case "GROW_SAPLINGS": {
      let { assets, cellMap, saplingGrowAt } = state;
      let changed = false;
      for (const assetId of action.assetIds) {
        const asset = assets[assetId];
        if (!asset || asset.type !== "sapling") continue;
        const removed = removeAsset({ ...state, assets, cellMap, saplingGrowAt }, assetId);
        const placed = placeAsset(removed.assets, removed.cellMap, "tree", asset.x, asset.y, 1);
        if (placed) {
          assets = placed.assets;
          cellMap = placed.cellMap;
        } else {
          assets = removed.assets;
          cellMap = removed.cellMap;
        }
        saplingGrowAt = removed.saplingGrowAt;
        changed = true;
      }
      if (!changed) return state;
      return { ...state, assets, cellMap, saplingGrowAt };
    }

    case "NATURAL_SPAWN": {
      // Enforce per-type spawn cap
      const treeCount = Object.values(state.assets).filter(
        (a) => a.type === "tree" || a.type === "sapling"
      ).length;
      if (treeCount >= NATURAL_SPAWN_CAP) return state;
      const inDebug = state.mode === "debug";
      for (let attempt = 0; attempt < 20; attempt++) {
        if (Math.random() > NATURAL_SPAWN_CHANCE) continue;
        const x = Math.floor(Math.random() * GRID_W);
        const y = Math.floor(Math.random() * GRID_H);
        if (inDebug && isInDebugFreeZone(x, y)) continue;
        if (state.cellMap[cellKey(x, y)]) continue;
        if (hasNearbyAsset(state.cellMap, x, y)) continue;
        const placed = placeAsset(state.assets, state.cellMap, "sapling", x, y, 1);
        if (!placed) continue;
        return {
          ...state,
          assets: placed.assets,
          cellMap: placed.cellMap,
          saplingGrowAt: { ...state.saplingGrowAt, [placed.id]: Date.now() + SAPLING_GROW_MS },
        };
      }
      return state;
    }

    case "REMOVE_BUILDING": {
      // Buildings are removed exclusively via BUILD_REMOVE_ASSET in Build Mode.
      return state;
    }

    case "REMOVE_FROM_HOTBAR": {
      const hs = state.hotbarSlots[action.slot];
      if (!hs || hs.toolKind === "empty") return state;
      debugLog.hotbar(`Removed ${hs.label || hs.toolKind} ×${hs.amount} from Hotbar slot ${action.slot}`);
      const whId = state.selectedWarehouseId;
      if (!whId || !state.warehouseInventories[whId]) return state;
      const whInv = state.warehouseInventories[whId];
      const newHotbarSlots = state.hotbarSlots.map((s, i) =>
        i === action.slot ? { ...EMPTY_HOTBAR_SLOT } : s
      );
      let newWhInv = { ...whInv };
      if (hs.toolKind === "building" && hs.buildingType) {
        const bType = hs.buildingType;
        (newWhInv as any)[bType] = ((newWhInv as any)[bType] ?? 0) + hs.amount;
        return { ...state, warehouseInventories: { ...state.warehouseInventories, [whId]: newWhInv }, hotbarSlots: newHotbarSlots };
      }
      if (hs.toolKind === "axe") newWhInv = { ...newWhInv, axe: newWhInv.axe + hs.amount };
      else if (hs.toolKind === "wood_pickaxe") newWhInv = { ...newWhInv, wood_pickaxe: newWhInv.wood_pickaxe + hs.amount };
      else if (hs.toolKind === "stone_pickaxe") newWhInv = { ...newWhInv, stone_pickaxe: newWhInv.stone_pickaxe + hs.amount };
      else if (hs.toolKind === "sapling") newWhInv = { ...newWhInv, sapling: newWhInv.sapling + hs.amount };
      return { ...state, warehouseInventories: { ...state.warehouseInventories, [whId]: newWhInv }, hotbarSlots: newHotbarSlots };
    }

    case "EXPIRE_NOTIFICATIONS": {
      const now = Date.now();
      const alive = state.notifications.filter((n) => n.expiresAt > now);
      if (alive.length === state.notifications.length) return state;
      return { ...state, notifications: alive };
    }

    case "DEBUG_SET_STATE": {
      if (!import.meta.env.DEV) return state;
      return action.state;
    }

    // ============================================================
    // GENERATOR & ENERGY CASES
    // ============================================================

    case "GENERATOR_ADD_FUEL": {
      const source = resolveBuildingSource(state, state.selectedGeneratorId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const amt = Math.min(action.amount, (sourceInv.wood as number) ?? 0);
      if (amt <= 0) return state;
      debugLog.building(`Generator: added ${amt} wood as fuel`);
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, consumeResources(sourceInv, { wood: amt })),
        generator: { ...state.generator, fuel: state.generator.fuel + amt },
      };
    }

    case "GENERATOR_START": {
      if (state.generator.running || state.generator.fuel <= 0) return state;
      debugLog.building("Generator: started");
      return { ...state, generator: { ...state.generator, running: true } };
    }

    case "GENERATOR_STOP": {
      debugLog.building("Generator: stopped – current burn progress discarded");
      const g = state.generator;
      // If the generator was mid-burn, the current wood unit is consumed
      const fuelAfterStop = g.progress > 0 ? Math.max(0, g.fuel - 1) : g.fuel;
      return { ...state, generator: { ...g, running: false, progress: 0, fuel: fuelAfterStop } };
    }

    case "GENERATOR_TICK": {
      const g = state.generator;
      if (!g.running || g.fuel <= 0) {
        return { ...state, generator: { ...g, running: false } };
      }
      // Burning progresses; each full cycle consumes one wood unit
      const newProgress = g.progress + 1 / GENERATOR_TICKS_PER_WOOD;
      if (newProgress >= 1) {
        const newFuel = g.fuel - 1;
        return {
          ...state,
          generator: { ...g, fuel: newFuel, progress: 0, running: newFuel > 0 },
        };
      }
      return { ...state, generator: { ...g, progress: newProgress } };
    }

    case "ENERGY_NET_TICK": {
      // === Generator production over this 2-second period ===
      const production = getEnergyProductionPerPeriod(state);

      // === Connected consumer machines ===
      const connectedConsumers = state.connectedAssetIds
        .map((id) => state.assets[id])
        .filter((a): a is PlacedAsset => !!a && isEnergyConsumerType(a.type));

      // Priority scheduling: lower number gets energy first.
      // For equal priority, keep the logistics backbone stable by serving
      // conveyors first, then miners, then other machines, then smelters.
      const prioritizedConsumers = connectedConsumers
        .map((asset, index) => ({
          asset,
          index,
          priority: clampMachinePriority(asset.priority),
          allocationRank: getEnergyAllocationRank(asset.type),
          drain:
            (asset.type === "auto_smelter"
              ? (state.autoSmelters?.[asset.id]?.processing ? AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD : AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD)
              : ENERGY_DRAIN[asset.type]) * getBoostMultiplier(asset),
        }))
        .sort((a, b) => a.priority - b.priority || a.allocationRank - b.allocationRank || a.index - b.index);

      // === Battery is the sole energy storage ===
      const batteryAsset = Object.values(state.assets).find((a) => a.type === "battery");
      const batteryConnected = batteryAsset ? state.connectedAssetIds.includes(batteryAsset.id) : false;

      // Available energy in this period = production + (optional) battery discharge potential.
      let remainingEnergy = production + (batteryConnected ? state.battery.stored : 0);
      const poweredMachineIds: string[] = [];
      const machinePowerRatio: Record<string, number> = {};

      for (const consumer of prioritizedConsumers) {
        if (consumer.drain <= 0) {
          machinePowerRatio[consumer.asset.id] = 1;
          poweredMachineIds.push(consumer.asset.id);
          continue;
        }
        if (remainingEnergy <= 0) {
          machinePowerRatio[consumer.asset.id] = 0;
          continue;
        }
        const ratio = Math.max(0, Math.min(1, remainingEnergy / consumer.drain));
        machinePowerRatio[consumer.asset.id] = ratio;
        remainingEnergy -= consumer.drain * ratio;
        if (ratio >= 1) poweredMachineIds.push(consumer.asset.id);
      }

      let newBatteryStored = state.battery.stored;
      if (batteryConnected) {
        // Whatever remains after serving prioritized consumers is the new battery level.
        newBatteryStored = Math.min(state.battery.capacity, Math.max(0, remainingEnergy));
      }

      const prevPowered = state.poweredMachineIds ?? [];
      const samePoweredSet =
        poweredMachineIds.length === prevPowered.length &&
        poweredMachineIds.every((id, idx) => prevPowered[idx] === id);

      const samePowerRatio =
        Object.keys(machinePowerRatio).length === Object.keys(state.machinePowerRatio ?? {}).length &&
        Object.entries(machinePowerRatio).every(([id, ratio]) => Math.abs((state.machinePowerRatio?.[id] ?? 0) - ratio) < 0.0001);

      if (newBatteryStored === state.battery.stored && samePoweredSet && samePowerRatio) return state;

      return {
        ...state,
        battery: { ...state.battery, stored: newBatteryStored },
        poweredMachineIds,
        machinePowerRatio,
      };
    }

    case "REMOVE_POWER_POLE": {
      // Power poles are removed exclusively via BUILD_REMOVE_ASSET in Build Mode.
      return state;
    }

    case "AUTO_SMELTER_SET_RECIPE": {
      const { assetId, recipe } = action;
      const smelter = state.autoSmelters[assetId];
      if (!smelter) return state;
      return {
        ...state,
        autoSmelters: {
          ...state.autoSmelters,
          [assetId]: { ...smelter, selectedRecipe: recipe },
        },
      };
    }

    // ============================================================
    // BUILD MODE
    // ============================================================

    case "TOGGLE_BUILD_MODE": {
      const newBuildMode = !state.buildMode;
      return {
        ...state,
        buildMode: newBuildMode,
        selectedBuildingType: newBuildMode ? state.selectedBuildingType : null,
        selectedFloorTile: newBuildMode ? state.selectedFloorTile : null,
        openPanel: newBuildMode ? null : state.openPanel,
        selectedWarehouseId: newBuildMode ? null : state.selectedWarehouseId,
      };
    }

    case "SELECT_BUILD_BUILDING": {
      return { ...state, selectedBuildingType: action.buildingType, selectedFloorTile: null };
    }

    case "SELECT_BUILD_FLOOR_TILE": {
      return { ...state, selectedFloorTile: action.tileType, selectedBuildingType: null };
    }

    case "BUILD_PLACE_BUILDING": {
      const activeHotbarSlot = state.hotbarSlots[state.activeSlot];
      const hotbarBuildingType =
        activeHotbarSlot?.toolKind === "building"
          ? activeHotbarSlot.buildingType ?? null
          : null;
      const bType = state.buildMode ? state.selectedBuildingType : hotbarBuildingType;
      if (!bType) return state;
      const { x, y } = action;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return state;

      // Cost check
      const costs = BUILDING_COSTS[bType];
      if (!hasResources(state.inventory, costs as Partial<Record<keyof Inventory, number>>)) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Nicht genug Ressourcen!") };
      }

      // ---- SPECIAL: Auto-Miner placement on deposit ----
      if (bType === "auto_miner") {
        const depositAssetId = state.cellMap[cellKey(x, y)];
        if (!depositAssetId) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Auto-Miner kann nur auf einem Ressourcenvorkommen platziert werden.") };
        }
        const depositAsset = state.assets[depositAssetId];
        if (!depositAsset || !DEPOSIT_TYPES.has(depositAsset.type)) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Auto-Miner kann nur auf einem Ressourcenvorkommen platziert werden.") };
        }
        // Only one auto-miner per deposit
        const existingMiner = Object.values(state.autoMiners).find(m => m.depositId === depositAssetId);
        if (existingMiner) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Dieses Vorkommen hat bereits einen Auto-Miner.") };
        }
        const dir: Direction = action.direction ?? "east";
        const minerId = makeId();
        const newAssets = {
          ...state.assets,
          [minerId]: {
            id: minerId,
            type: "auto_miner" as AssetType,
            x,
            y,
            size: 1 as const,
            direction: dir,
            priority: DEFAULT_MACHINE_PRIORITY,
          },
        };
        const newCellMap = { ...state.cellMap, [cellKey(x, y)]: minerId };
        const newInvM = consumeResources(state.inventory, costs as Partial<Record<keyof Inventory, number>>);
        const resource = DEPOSIT_RESOURCE[depositAsset.type];
        const newAutoMiners = { ...state.autoMiners, [minerId]: { depositId: depositAssetId, resource, progress: 0 } };
        debugLog.building(`[BuildMode] Placed Auto-Miner at (${x},${y}) on ${depositAsset.type}`);
        let partialM: GameState = { ...state, assets: newAssets, cellMap: newCellMap, inventory: newInvM, autoMiners: newAutoMiners };
        // Auto-assign nearest warehouse source for zone-aware output
        const nearestWhIdM = getNearestWarehouseId(partialM, x, y);
        if (nearestWhIdM) {
          partialM = { ...partialM, buildingSourceWarehouseIds: { ...partialM.buildingSourceWarehouseIds, [minerId]: nearestWhIdM } };
        }
        return { ...partialM, connectedAssetIds: computeConnectedAssetIds(partialM) };
      }

      // ---- SPECIAL: Conveyor placement with direction ----
      if (bType === "conveyor" || bType === "conveyor_corner") {
        if (state.cellMap[cellKey(x, y)]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Das Feld ist belegt.") };
        }
        const dir: Direction = action.direction ?? "east";
        const placeType: AssetType = bType === "conveyor_corner" ? "conveyor_corner" : "conveyor";
        const convPlaced = placeAsset(state.assets, state.cellMap, placeType, x, y, 1);
        if (!convPlaced) return state;
        const assetWithDir = { ...convPlaced.assets[convPlaced.id], direction: dir };
        const newAssetsC = { ...convPlaced.assets, [convPlaced.id]: assetWithDir };
        const newInvC = consumeResources(state.inventory, costs as Partial<Record<keyof Inventory, number>>);
        const newConveyors = { ...state.conveyors, [convPlaced.id]: { queue: [] as ConveyorItem[] } };
        debugLog.building(`[BuildMode] Placed ${BUILDING_LABELS[bType]} at (${x},${y}) facing ${dir}`);
        const partialC: GameState = { ...state, assets: newAssetsC, cellMap: convPlaced.cellMap, inventory: newInvC, conveyors: newConveyors };
        return { ...partialC, connectedAssetIds: computeConnectedAssetIds(partialC) };
      }

      // ---- SPECIAL: Auto Smelter placement with directional 2x1 footprint ----
      if (bType === "auto_smelter") {
        const dir: Direction = action.direction ?? "east";
        const width: 1 | 2 = dir === "east" || dir === "west" ? 2 : 1;
        const height: 1 | 2 = dir === "east" || dir === "west" ? 1 : 2;

        // Footprint validation
        for (let dy = 0; dy < height; dy++) {
          for (let dx = 0; dx < width; dx++) {
            if (x + dx >= GRID_W || y + dy >= GRID_H) {
              return { ...state, notifications: addErrorNotification(state.notifications, "Kein Platz für Auto Smelter.") };
            }
            if (state.cellMap[cellKey(x + dx, y + dy)]) {
              return { ...state, notifications: addErrorNotification(state.notifications, "Das Feld ist belegt.") };
            }
          }
        }

        // Connector-field validation
        const tempAsset: PlacedAsset = { id: "temp", type: "auto_smelter", x, y, size: 2, width, height, direction: dir };
        const io = getAutoSmelterIoCells(tempAsset);
        const inputNeighborId = state.cellMap[cellKey(io.input.x, io.input.y)];
        const outputNeighborId = state.cellMap[cellKey(io.output.x, io.output.y)];
        const inputNeighbor = inputNeighborId ? state.assets[inputNeighborId] : null;
        const outputNeighbor = outputNeighborId ? state.assets[outputNeighborId] : null;
        const beltFound =
          (inputNeighbor?.type === "conveyor" || inputNeighbor?.type === "conveyor_corner") &&
          (outputNeighbor?.type === "conveyor" || outputNeighbor?.type === "conveyor_corner");
        if (import.meta.env.DEV) {
          console.log("[Smelter] Input-Tile:", io.input);
          console.log("[Smelter] Output-Tile:", io.output);
          console.log("[Smelter] Förderband erkannt:", beltFound, {
            inputType: inputNeighbor?.type ?? null,
            outputType: outputNeighbor?.type ?? null,
          });
        }
        if (io.input.x < 0 || io.input.x >= GRID_W || io.input.y < 0 || io.input.y >= GRID_H || io.output.x < 0 || io.output.x >= GRID_W || io.output.y < 0 || io.output.y >= GRID_H) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Input/Output-Felder liegen außerhalb der Karte.") };
        }

        const placed = placeAsset(state.assets, state.cellMap, "auto_smelter", x, y, 2, width, height);
        if (!placed) return state;
        const newAssets = {
          ...placed.assets,
          [placed.id]: {
            ...placed.assets[placed.id],
            direction: dir,
            priority: DEFAULT_MACHINE_PRIORITY,
          },
        };
        const newInv = consumeResources(state.inventory, costs as Partial<Record<keyof Inventory, number>>);
        const newAutoSmelters = {
          ...state.autoSmelters,
          [placed.id]: {
            inputBuffer: [],
            processing: null,
            pendingOutput: [],
            status: "IDLE" as AutoSmelterStatus,
            lastRecipeInput: null,
            lastRecipeOutput: null,
            throughputEvents: [],
            selectedRecipe: "iron" as const,
          },
        };
        const partialSmelter: GameState = {
          ...state,
          assets: newAssets,
          cellMap: placed.cellMap,
          inventory: newInv,
          autoSmelters: newAutoSmelters,
          placedBuildings: [...state.placedBuildings, bType],
          purchasedBuildings: [...state.purchasedBuildings, bType],
        };
        return { ...partialSmelter, connectedAssetIds: computeConnectedAssetIds(partialSmelter) };
      }

      // Non-stackable uniqueness check
      if (!STACKABLE_BUILDINGS.has(bType) && bType !== "warehouse") {
        const isPlaced = state.placedBuildings.includes(bType);
        if (isPlaced) {
          return { ...state, notifications: addErrorNotification(state.notifications, `${BUILDING_LABELS[bType]} ist bereits platziert.`) };
        }
      }
      if (bType === "warehouse" && state.warehousesPlaced >= MAX_WAREHOUSES) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Maximale Anzahl an Lagerhäusern erreicht.") };
      }

      const bSize = BUILDING_SIZES[bType] ?? 2;
      for (let dy = 0; dy < bSize; dy++) {
        for (let dx = 0; dx < bSize; dx++) {
          if (x + dx >= GRID_W || y + dy >= GRID_H) return state;
          if (state.cellMap[cellKey(x + dx, y + dy)]) return state;
        }
      }

      // Stone floor requirement check
      if (REQUIRES_STONE_FLOOR.has(bType)) {
        for (let dy = 0; dy < bSize; dy++) {
          for (let dx = 0; dx < bSize; dx++) {
            if (!state.floorMap[cellKey(x + dx, y + dy)]) {
              return { ...state, notifications: addErrorNotification(state.notifications, `${BUILDING_LABELS[bType]} benötigt Steinboden unter allen Feldern!`) };
            }
          }
        }
      }

      const placed = placeAsset(state.assets, state.cellMap, bType, x, y, bSize);
      if (!placed) return state;

      // Deduct costs
      const newInvB = consumeResources(state.inventory, costs as Partial<Record<keyof Inventory, number>>);

      debugLog.building(`[BuildMode] Placed ${BUILDING_LABELS[bType]} at (${x},${y})`);

      let partialBuild: GameState =
        bType === "warehouse"
          ? {
              ...state,
              assets: {
                ...placed.assets,
                [placed.id]: {
                  ...placed.assets[placed.id],
                  direction: action.direction ?? "south",
                },
              },
              cellMap: placed.cellMap,
              inventory: newInvB,
              warehousesPlaced: state.warehousesPlaced + 1,
              warehousesPurchased: state.warehousesPurchased + 1,
              warehouseInventories: {
                ...state.warehouseInventories,
                [placed.id]: createEmptyInventory(),
              },
            }
          : bType === "cable"
          ? { ...state, assets: placed.assets, cellMap: placed.cellMap, inventory: newInvB, cablesPlaced: state.cablesPlaced + 1 }
          : bType === "power_pole"
          ? { ...state, assets: placed.assets, cellMap: placed.cellMap, inventory: newInvB, powerPolesPlaced: state.powerPolesPlaced + 1 }
          : { ...state, assets: placed.assets, cellMap: placed.cellMap, inventory: newInvB, placedBuildings: [...state.placedBuildings, bType], purchasedBuildings: [...state.purchasedBuildings, bType] };

      // Auto-assign nearest warehouse source for newly placed crafting buildings
      if (BUILDINGS_WITH_DEFAULT_SOURCE.has(bType)) {
        const nearestWhId = getNearestWarehouseId(partialBuild, x, y);
        if (nearestWhId) {
          partialBuild = {
            ...partialBuild,
            buildingSourceWarehouseIds: { ...partialBuild.buildingSourceWarehouseIds, [placed.id]: nearestWhId },
          };
        }
      }

      return { ...partialBuild, connectedAssetIds: computeConnectedAssetIds(partialBuild) };
    }

    case "BUILD_REMOVE_ASSET": {
      const activeHotbarSlot = state.hotbarSlots[state.activeSlot];
      const removeToolActive =
        state.buildMode || activeHotbarSlot?.toolKind === "building";
      if (!removeToolActive) return state;
      const targetAsset = state.assets[action.assetId];
      if (!targetAsset) return state;
      // Only buildings can be removed via build mode; resources and map_shop are off-limits
      const removableTypes = new Set<string>(["workbench", "warehouse", "smithy", "generator", "cable", "battery", "power_pole", "auto_miner", "conveyor", "conveyor_corner", "manual_assembler", "auto_smelter"]);
      if (!removableTypes.has(targetAsset.type)) return state;
      if (targetAsset.fixed) return state;

      debugLog.building(`[BuildMode] Removed ${ASSET_LABELS[targetAsset.type]} at (${targetAsset.x},${targetAsset.y}) – ~1/3 refund`);
      const removedB = removeAsset(state, action.assetId);
      const bTypeR = targetAsset.type as BuildingType;
      const costsR = BUILDING_COSTS[bTypeR];
      const refundMap: Partial<Record<keyof Inventory, number>> = {};
      for (const [res, amt] of Object.entries(costsR)) {
        refundMap[res as keyof Inventory] = Math.max(1, Math.floor((amt ?? 0) / 3));
      }
      const newInvR = addResources(state.inventory, refundMap);

      let partialRemove: GameState;
      if (bTypeR === "warehouse") {
        const newWarehouseInventories = { ...state.warehouseInventories };
        delete newWarehouseInventories[action.assetId];
        // Reassign affected building→warehouse mappings to nearest remaining warehouse (or drop → global)
        const stateForReassign: GameState = { ...state, warehouseInventories: newWarehouseInventories };
        const reassignedSources = reassignBuildingSourceIds(state.buildingSourceWarehouseIds, stateForReassign, action.assetId);
        partialRemove = {
          ...state,
          ...removedB,
          inventory: newInvR,
          warehousesPlaced: state.warehousesPlaced - 1,
          warehousesPurchased: state.warehousesPurchased - 1,
          warehouseInventories: newWarehouseInventories,
          buildingSourceWarehouseIds: reassignedSources,
          selectedWarehouseId: state.selectedWarehouseId === action.assetId ? null : state.selectedWarehouseId,
          openPanel: null as UIPanel,
        };
      } else if (bTypeR === "cable") {
        partialRemove = { ...state, ...removedB, inventory: newInvR, cablesPlaced: state.cablesPlaced - 1, openPanel: null as UIPanel };
      } else if (bTypeR === "power_pole") {
        partialRemove = { ...state, ...removedB, inventory: newInvR, powerPolesPlaced: state.powerPolesPlaced - 1, openPanel: null as UIPanel, selectedPowerPoleId: null };
      } else if (bTypeR === "auto_miner") {
        const minerState = state.autoMiners[action.assetId];
        const newAutoMiners = { ...state.autoMiners };
        delete newAutoMiners[action.assetId];
        // Restore deposit cell in cellMap
        const restoredCellMap = minerState
          ? { ...removedB.cellMap, [cellKey(targetAsset.x, targetAsset.y)]: minerState.depositId }
          : removedB.cellMap;
        partialRemove = {
          ...state,
          ...removedB,
          cellMap: restoredCellMap,
          inventory: newInvR,
          autoMiners: newAutoMiners,
          openPanel: null as UIPanel,
          selectedAutoMinerId: null,
        };
      } else if (bTypeR === "conveyor" || bTypeR === "conveyor_corner") {
        const newConveyors = { ...state.conveyors };
        delete newConveyors[action.assetId];
        partialRemove = { ...state, ...removedB, inventory: newInvR, conveyors: newConveyors, openPanel: null as UIPanel };
      } else if (bTypeR === "manual_assembler") {
        partialRemove = {
          ...state,
          ...removedB,
          inventory: newInvR,
          placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR),
          purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR),
          openPanel: null as UIPanel,
          manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
        };
      } else if (bTypeR === "auto_smelter") {
        const newAutoSmelters = { ...state.autoSmelters };
        delete newAutoSmelters[action.assetId];
        partialRemove = {
          ...state,
          ...removedB,
          inventory: newInvR,
          autoSmelters: newAutoSmelters,
          selectedAutoSmelterId: state.selectedAutoSmelterId === action.assetId ? null : state.selectedAutoSmelterId,
          placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR),
          purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR),
          openPanel: null as UIPanel,
        };
      } else {
        partialRemove = { ...state, ...removedB, inventory: newInvR, placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR), purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR), openPanel: null as UIPanel };
      }
      // Clean up zone assignment for the removed building
      if (partialRemove.buildingZoneIds[action.assetId]) {
        const { [action.assetId]: _z, ...restZoneIds } = partialRemove.buildingZoneIds;
        partialRemove = { ...partialRemove, buildingZoneIds: restZoneIds };
      }
      return { ...partialRemove, connectedAssetIds: computeConnectedAssetIds(partialRemove) };
    }

    case "BUILD_PLACE_FLOOR_TILE": {
      if (!state.buildMode || !state.selectedFloorTile) return state;
      const tileType = state.selectedFloorTile;
      const { x, y } = action;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return state;
      const key = cellKey(x, y);

      // Cost check
      const tileCosts = FLOOR_TILE_COSTS[tileType];
      if (!hasResources(state.inventory, tileCosts as Partial<Record<keyof Inventory, number>>)) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Nicht genug Ressourcen!") };
      }

      if (tileType === "stone_floor") {
        // Can only be placed on empty grass (no floor, no object)
        if (state.floorMap[key]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Hier liegt bereits Steinboden.") };
        }
        if (state.cellMap[key]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Das Feld ist belegt.") };
        }
        const newFloorMap = { ...state.floorMap, [key]: "stone_floor" as const };
        const newInvF = consumeResources(state.inventory, tileCosts as Partial<Record<keyof Inventory, number>>);
        debugLog.building(`[BuildMode] Placed stone_floor at (${x},${y})`);
        return { ...state, floorMap: newFloorMap, inventory: newInvF };
      } else {
        // grass_block: convert stone_floor back to grass (no object on cell)
        if (!state.floorMap[key]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Kein Steinboden auf diesem Feld.") };
        }
        if (state.cellMap[key]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Das Feld ist belegt – Gebäude zuerst entfernen.") };
        }
        const newFloorMap = { ...state.floorMap };
        delete newFloorMap[key];
        const newInvF = consumeResources(state.inventory, tileCosts as Partial<Record<keyof Inventory, number>>);
        debugLog.building(`[BuildMode] Placed grass_block at (${x},${y}) – stone floor removed`);
        return { ...state, floorMap: newFloorMap, inventory: newInvF };
      }
    }

    case "LOGISTICS_TICK": {
      const poweredSet = new Set(state.poweredMachineIds ?? []);
      let newAutoMinersL = state.autoMiners;
      let newConveyorsL = state.conveyors;
      let newInvL = state.inventory;
      let newWarehouseInventoriesL = state.warehouseInventories;
      let newSmithyL = state.smithy;
      let newNotifsL = state.notifications;
      let newAutoDeliveryLogL = state.autoDeliveryLog;
      let changed = false;

      const tryStoreInWarehouse = (warehouseId: string, resource: ConveyorItem): boolean => {
        // Warehouse building must exist
        const whInv = (newWarehouseInventoriesL === state.warehouseInventories
          ? state.warehouseInventories[warehouseId]
          : newWarehouseInventoriesL[warehouseId]);
        if (!whInv) return false;
        // Store into the warehouse's own inventory (per-WH storage)
        const cap = getWarehouseCapacity(state.mode);
        const resKey = resource as keyof Inventory;
        if ((whInv[resKey] as number) >= cap) return false;
        newWarehouseInventoriesL = newWarehouseInventoriesL === state.warehouseInventories
          ? { ...state.warehouseInventories }
          : newWarehouseInventoriesL;
        newWarehouseInventoriesL[warehouseId] = addResources(whInv, { [resKey]: 1 });
        return true;
      };

      const getLiveLogisticsState = (): GameState => {
        if (newInvL === state.inventory && newWarehouseInventoriesL === state.warehouseInventories) {
          return state;
        }
        return {
          ...state,
          inventory: newInvL,
          warehouseInventories: newWarehouseInventoriesL,
        };
      };

      const getSourceCapacity = (liveState: GameState, source: CraftingSource): number => {
        if (source.kind === "global") return getCapacityPerResource(liveState);
        if (source.kind === "zone") return getZoneItemCapacity(liveState, source.zoneId);
        return getWarehouseCapacity(liveState.mode);
      };

      const applySourceInventory = (source: CraftingSource, nextInv: Inventory): void => {
        const partial = applyCraftingSourceInventory(getLiveLogisticsState(), source, nextInv);
        if (partial.inventory) {
          newInvL = partial.inventory;
        }
        if (partial.warehouseInventories) {
          newWarehouseInventoriesL = partial.warehouseInventories;
        }
      };

      // ---- Auto-Miners: produce resources ----
      for (const [minerId, miner] of Object.entries(state.autoMiners)) {
        const minerAsset = state.assets[minerId];
        if (!minerAsset) continue;
        const isConnected = state.connectedAssetIds.includes(minerId);
        const powerRatio = Math.max(0, Math.min(1, state.machinePowerRatio?.[minerId] ?? (poweredSet.has(minerId) ? 1 : 0)));
        // Unterstrom = kompletter Stopp: Progress bleibt eingefroren, bis die Maschine wieder voll versorgt ist.
        // Hinweis: der Scheduler hat den (ggf. boosted) Mehrverbrauch bereits eingerechnet — liefert er ratio === 1,
        // ist der Bedarf gedeckt. Ist der Bedarf nicht gedeckt, ratio < 1 → hier wird abgebrochen.
        if (!isConnected || powerRatio < 1) continue;

        const minerBoost = getBoostMultiplier(minerAsset);
        let progress = miner.progress + minerBoost;
        if (progress >= AUTO_MINER_PRODUCE_TICKS) {
          const dir = minerAsset.direction ?? "east";
          const [ox, oy] = directionOffset(dir);
          const outX = minerAsset.x + ox;
          const outY = minerAsset.y + oy;
          let outputDone = false;

          // Priority 1: Adjacent conveyor — unchanged physical belt output.
          if (!outputDone && outX >= 0 && outX < GRID_W && outY >= 0 && outY < GRID_H) {
            const outAssetId = state.cellMap[cellKey(outX, outY)];
            const outAsset = outAssetId ? state.assets[outAssetId] : null;
            if (outAsset?.type === "conveyor" || outAsset?.type === "conveyor_corner") {
              const outConv = newConveyorsL === state.conveyors ? state.conveyors[outAssetId] : newConveyorsL[outAssetId];
              const outQueue = outConv?.queue ?? [];
              if (outQueue.length < CONVEYOR_TILE_CAPACITY) {
                newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
                newConveyorsL[outAssetId] = { queue: [...outQueue, miner.resource] };
                progress = 0;
                changed = true;
                outputDone = true;
              }
            }
          }

          // Priority 2: Zone-aware source output (Zone > Legacy-Warehouse > Global).
          if (!outputDone) {
            const liveState = getLiveLogisticsState();
            const source = resolveBuildingSource(liveState, minerId);
            const sourceInv = getCraftingSourceInventory(liveState, source);
            const sourceCapacity = getSourceCapacity(liveState, source);
            const resKey = miner.resource as keyof Inventory;
            if ((sourceInv[resKey] as number) < sourceCapacity) {
              const newSourceInv = addResources(sourceInv, { [resKey]: 1 });
              applySourceInventory(source, newSourceInv);
              const logWhId = source.kind === "warehouse"
                ? source.warehouseId
                : source.kind === "zone"
                ? (getZoneWarehouseIds(liveState, source.zoneId)[0] ?? minerId)
                : minerId;
              newAutoDeliveryLogL = addAutoDelivery(newAutoDeliveryLogL, "auto_miner", minerId, miner.resource, logWhId);
              progress = 0;
              changed = true;
              outputDone = true;
            }
          }

          // If still at max, stay blocked (output-Ziel hat keinen Platz).
          if (progress >= AUTO_MINER_PRODUCE_TICKS) progress = AUTO_MINER_PRODUCE_TICKS;
        }
        if (progress !== miner.progress) {
          newAutoMinersL = newAutoMinersL === state.autoMiners ? { ...state.autoMiners } : newAutoMinersL;
          newAutoMinersL[minerId] = { ...miner, progress };
          changed = true;
        }
      }

      // ---- Conveyors: move items ----
      const movedThisTick = new Set<string>();
      for (const [convId, conv] of Object.entries(state.conveyors)) {
        const activeConv = newConveyorsL === state.conveyors ? conv : newConveyorsL[convId];
        const activeQueue = activeConv?.queue ?? [];
        const currentItem = activeQueue[0] ?? null;
        if (!currentItem) continue;
        if (movedThisTick.has(convId)) continue;
        const convAsset = state.assets[convId];
        if (!convAsset) continue;
        const isConnected = state.connectedAssetIds.includes(convId);
        const isPowered = poweredSet.has(convId);
        if (!isConnected || !isPowered) continue;

        // ---- Priority: if this belt is sitting on a warehouse input tile, deliver directly ----
        // This overrides directional movement so the item always goes into the warehouse
        // regardless of which direction the belt faces.
        let deliveredToWarehouse = false;
        for (const wAsset of Object.values(state.assets)) {
          if (wAsset.type !== "warehouse") continue;
          if (convAsset.x === wAsset.x && convAsset.y === wAsset.y + assetHeight(wAsset)) {
            const convZoneDirect = state.buildingZoneIds[convId] ?? null;
            const whZoneDirect = state.buildingZoneIds[wAsset.id] ?? null;
            if (areZonesTransportCompatible(convZoneDirect, whZoneDirect) && tryStoreInWarehouse(wAsset.id, currentItem)) {
              newAutoDeliveryLogL = addAutoDelivery(newAutoDeliveryLogL, "conveyor", convId, currentItem, wAsset.id);
              newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
              newConveyorsL[convId] = { queue: activeQueue.slice(1) };
              changed = true;
            }
            deliveredToWarehouse = true;
            break;
          }
        }
        if (deliveredToWarehouse) continue;

        const inDir = convAsset.direction ?? "east";
        // For both conveyor and conveyor_corner, `direction` is the OUTPUT direction.
        // The corner shape is purely visual (sprite rotation); the tile pushes items
        // in the direction the asset is facing — identical to a straight belt.
        const dir = inDir;
        const [ox, oy] = directionOffset(dir);
        const nextX = convAsset.x + ox;
        const nextY = convAsset.y + oy;
        if (nextX < 0 || nextX >= GRID_W || nextY < 0 || nextY >= GRID_H) continue;

        const nextAssetId = state.cellMap[cellKey(nextX, nextY)];
        const nextAsset = nextAssetId ? state.assets[nextAssetId] : null;

        // Straight belts only accept items arriving from behind (same output direction).
        // Corner belts accept from any direction — they are the intended turn mechanism.
        const nextBeltCompatible =
          nextAsset?.type === "conveyor_corner" ||
          (nextAsset?.type === "conveyor" && (nextAsset.direction ?? "east") === dir);
        // Zone-aware transport: block belt-to-belt if both have explicit, differing zones.
        const convZone = state.buildingZoneIds[convId] ?? null;
        const nextTileZone = nextAssetId ? (state.buildingZoneIds[nextAssetId] ?? null) : null;
        const beltToNextZoneOk = areZonesTransportCompatible(convZone, nextTileZone);
        if (nextBeltCompatible && !movedThisTick.has(nextAssetId) && beltToNextZoneOk) {
          const nextConv = newConveyorsL === state.conveyors ? state.conveyors[nextAssetId] : newConveyorsL[nextAssetId];
          const nextQueue = nextConv?.queue ?? [];
          if (nextQueue.length < CONVEYOR_TILE_CAPACITY) {
            newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
            newConveyorsL[nextAssetId] = { queue: [...nextQueue, currentItem] };
            newConveyorsL[convId] = { queue: activeQueue.slice(1) };
            movedThisTick.add(nextAssetId);
            changed = true;
          }
        } else if (nextAsset?.type === "warehouse" && isValidWarehouseInput(convAsset.x, convAsset.y, dir, nextAsset)) {
          const adjWhZone = state.buildingZoneIds[nextAsset.id] ?? null;
          if (areZonesTransportCompatible(convZone, adjWhZone) && tryStoreInWarehouse(nextAsset.id, currentItem)) {
            newAutoDeliveryLogL = addAutoDelivery(newAutoDeliveryLogL, "conveyor", convId, currentItem, nextAsset.id);
            newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
            newConveyorsL[convId] = { queue: activeQueue.slice(1) };
            changed = true;
          }
        } else if (nextAsset?.type === "workbench") {
          // Inject into the workbench's resolved source (zone/warehouse/global) so zone-assigned workbenches
          // receive conveyor items in their zone inventory, not always in global.
          const wbZone = state.buildingZoneIds[nextAsset.id] ?? null;
          if (areZonesTransportCompatible(convZone, wbZone)) {
            const liveForWb = getLiveLogisticsState();
            const wbSource = resolveBuildingSource(liveForWb, nextAsset.id);
            const wbSourceInv = getCraftingSourceInventory(liveForWb, wbSource);
            const wbCap = getSourceCapacity(liveForWb, wbSource);
            const resKey = currentItem as keyof Inventory;
            if ((wbSourceInv[resKey] as number) < wbCap) {
              applySourceInventory(wbSource, addResources(wbSourceInv, { [resKey]: 1 }));
              newNotifsL = addNotification(newNotifsL, currentItem, 1);
              newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
              newConveyorsL[convId] = { queue: activeQueue.slice(1) };
              changed = true;
            }
          }
        } else if (nextAsset?.type === "smithy") {
          // Feed ore into smithy internal slots
          const smithyZone = state.buildingZoneIds[nextAsset.id] ?? null;
          if (areZonesTransportCompatible(convZone, smithyZone) && (currentItem === "iron" || currentItem === "copper")) {
            const oreKey = currentItem === "iron" ? "iron" : "copper";
            if ((newSmithyL as any)[oreKey] < 50) {
              newSmithyL = { ...newSmithyL, [oreKey]: (newSmithyL as any)[oreKey] + 1 };
              newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
              newConveyorsL[convId] = { queue: activeQueue.slice(1) };
              changed = true;
            }
          }
        }
      }

      // ---- Auto Smelters: source input -> process -> source output ----
      let newAutoSmeltersL = state.autoSmelters;
      for (const [smelterId, smelterState] of Object.entries(state.autoSmelters ?? {})) {
        const smelterAsset = state.assets[smelterId];
        if (!smelterAsset || smelterAsset.type !== "auto_smelter") continue;

        const powerRatio = Math.max(0, Math.min(1, state.machinePowerRatio?.[smelterId] ?? (poweredSet.has(smelterId) ? 1 : 0)));
        // Unterstrom = kompletter Stopp: jede Unterversorgung (ratio < 1) stoppt die Verarbeitung vollständig.
        // Laufender progressMs bleibt erhalten und wird pausiert, bis wieder volle Versorgung anliegt.
        if (powerRatio < 1) {
          newAutoSmeltersL = newAutoSmeltersL === state.autoSmelters ? { ...state.autoSmelters } : newAutoSmeltersL;
          newAutoSmeltersL[smelterId] = { ...smelterState, status: "NO_POWER" };
          changed = true;
          continue;
        }

        let nextSmelter = { ...smelterState };
        const selectedRecipe = getSmeltingRecipe(nextSmelter.selectedRecipe);
        if (!selectedRecipe) {
          nextSmelter.status = "MISCONFIGURED";
          if (!areAutoSmelterEntriesEqual(nextSmelter, smelterState)) {
            newAutoSmeltersL = newAutoSmeltersL === state.autoSmelters ? { ...state.autoSmelters } : newAutoSmeltersL;
            newAutoSmeltersL[smelterId] = nextSmelter;
            changed = true;
          }
          continue;
        }

        const source = resolveBuildingSource(getLiveLogisticsState(), smelterId);
        let sourceInv = getCraftingSourceInventory(getLiveLogisticsState(), source);
        const sourceCapacity = getSourceCapacity(getLiveLogisticsState(), source);
        const inputKey = selectedRecipe.inputItem as keyof Inventory;

        // Pull recipe-sized batches from source inventory into the internal input buffer.
        while (
          nextSmelter.inputBuffer.length < AUTO_SMELTER_BUFFER_CAPACITY &&
          hasResources(sourceInv, { [inputKey]: selectedRecipe.inputAmount })
        ) {
          const consumed = consumeResources(sourceInv, { [inputKey]: selectedRecipe.inputAmount });
          applySourceInventory(source, consumed);
          sourceInv = consumed;
          nextSmelter.inputBuffer = [...nextSmelter.inputBuffer, nextSmelter.selectedRecipe];
          nextSmelter.lastRecipeInput = selectedRecipe.inputItem;
          nextSmelter.lastRecipeOutput = selectedRecipe.outputItem;
          changed = true;
        }

        // Flush pending output — Priority 1: output conveyor belt, Priority 2: source inventory.
        while (nextSmelter.pendingOutput.length > 0) {
          const pendingInputItem = nextSmelter.pendingOutput[0];
          const pendingRecipe = getSmeltingRecipe(pendingInputItem);
          if (!pendingRecipe) {
            nextSmelter.pendingOutput = nextSmelter.pendingOutput.slice(1);
            changed = true;
            continue;
          }
          const pendingOutputKey = pendingRecipe.outputItem as keyof Inventory;
          const pendingOutputItem = pendingRecipe.outputItem as ConveyorItem;
          let outputDone = false;

          // Priority 1: Adjacent output conveyor belt (direction-aware, mirrors Auto-Miner logic).
          const smelterIo = getAutoSmelterIoCells(smelterAsset);
          const outX = smelterIo.output.x;
          const outY = smelterIo.output.y;
          if (outX >= 0 && outX < GRID_W && outY >= 0 && outY < GRID_H) {
            const outAssetId = state.cellMap[cellKey(outX, outY)];
            const outAsset = outAssetId ? state.assets[outAssetId] : null;
            if (outAsset?.type === "conveyor" || outAsset?.type === "conveyor_corner") {
              const outConv = newConveyorsL === state.conveyors ? state.conveyors[outAssetId] : newConveyorsL[outAssetId];
              const outQueue = outConv?.queue ?? [];
              if (outQueue.length < CONVEYOR_TILE_CAPACITY) {
                newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
                newConveyorsL[outAssetId] = { queue: [...outQueue, pendingOutputItem] };
                nextSmelter.pendingOutput = nextSmelter.pendingOutput.slice(1);
                nextSmelter.throughputEvents = [...nextSmelter.throughputEvents, Date.now()];
                changed = true;
                outputDone = true;
              } else {
                // Output conveyor is present but full — stay blocked, don't bypass to source inventory.
                break;
              }
            }
          }

          // Priority 2: Source inventory fallback (no conveyor at output cell).
          if (!outputDone) {
            if ((sourceInv[pendingOutputKey] as number) + pendingRecipe.outputAmount > sourceCapacity) {
              break;
            }
            const added = addResources(sourceInv, { [pendingOutputKey]: pendingRecipe.outputAmount });
            applySourceInventory(source, added);
            sourceInv = added;
            nextSmelter.pendingOutput = nextSmelter.pendingOutput.slice(1);
            nextSmelter.throughputEvents = [...nextSmelter.throughputEvents, Date.now()];
            changed = true;
          }
        }

        // Start processing if idle.
        if (!nextSmelter.processing && nextSmelter.pendingOutput.length === 0 && nextSmelter.inputBuffer.length > 0) {
          const inputItem = nextSmelter.inputBuffer[0];
          const recipe = getSmeltingRecipe(inputItem);
          if (recipe) {
            if (import.meta.env.DEV && !_smelterRecipesLogged) {
              console.log("[Smelter] Rezepte geladen:", SMELTING_RECIPES);
              _smelterRecipesLogged = true;
            }
            nextSmelter.inputBuffer = nextSmelter.inputBuffer.slice(1);
            nextSmelter.processing = {
              inputItem,
              outputItem: recipe.outputItem as ConveyorItem,
              progressMs: 0,
              durationMs: Math.max(1, recipe.processingTime * 1000),
            };
            nextSmelter.lastRecipeInput = recipe.inputItem;
            nextSmelter.lastRecipeOutput = recipe.outputItem;
            changed = true;
          }
        }

        // Ab hier gilt powerRatio === 1 (volle Versorgung). Produktion läuft mit voller Geschwindigkeit
        // oder — bei Unterstrom — wurde oben bereits per `continue` komplett gestoppt.
        if (nextSmelter.processing) {
          const smelterBoost = getBoostMultiplier(smelterAsset);
          nextSmelter.processing = {
            ...nextSmelter.processing,
            progressMs: nextSmelter.processing.progressMs + LOGISTICS_TICK_MS * smelterBoost,
          };
          if (nextSmelter.processing.progressMs >= nextSmelter.processing.durationMs) {
            // Store the recipe input token (iron/copper) to resolve deterministic output metadata later.
            nextSmelter.pendingOutput = [...nextSmelter.pendingOutput, nextSmelter.processing.inputItem];
            nextSmelter.processing = null;
          }
          changed = true;
        }

        // Keep only last 60s throughput data.
        const cutoff = Date.now() - 60_000;
        const trimmed = nextSmelter.throughputEvents.filter((ts) => ts >= cutoff);
        if (trimmed.length !== nextSmelter.throughputEvents.length) {
          nextSmelter.throughputEvents = trimmed;
          changed = true;
        }

        if (nextSmelter.pendingOutput.length > 0) {
          const pendingRecipe = getSmeltingRecipe(nextSmelter.pendingOutput[0]);
          if (!pendingRecipe) {
            nextSmelter.status = "MISCONFIGURED";
          } else {
            const pendingOutputKey = pendingRecipe.outputItem as keyof Inventory;
            // Check output route: conveyor takes priority over source inventory.
            const statusIo = getAutoSmelterIoCells(smelterAsset);
            const statusOutX = statusIo.output.x;
            const statusOutY = statusIo.output.y;
            let hasOutputConveyor = false;
            let outputConveyorHasSpace = false;
            if (statusOutX >= 0 && statusOutX < GRID_W && statusOutY >= 0 && statusOutY < GRID_H) {
              const statusOutId = state.cellMap[cellKey(statusOutX, statusOutY)];
              const statusOutAsset = statusOutId ? state.assets[statusOutId] : null;
              if (statusOutAsset?.type === "conveyor" || statusOutAsset?.type === "conveyor_corner") {
                hasOutputConveyor = true;
                const statusConv = newConveyorsL === state.conveyors ? state.conveyors[statusOutId] : newConveyorsL[statusOutId];
                outputConveyorHasSpace = (statusConv?.queue?.length ?? 0) < CONVEYOR_TILE_CAPACITY;
              }
            }
            const outputCanProceed = hasOutputConveyor
              ? outputConveyorHasSpace
              : (sourceInv[pendingOutputKey] as number) + pendingRecipe.outputAmount <= sourceCapacity;
            nextSmelter.status = outputCanProceed ? "IDLE" : "OUTPUT_BLOCKED";
          }
        } else if (nextSmelter.processing) {
          nextSmelter.status = "PROCESSING";
        } else if (nextSmelter.inputBuffer.length > 0) {
          nextSmelter.status = "IDLE";
        } else {
          nextSmelter.status = "IDLE";
        }

        if (!areAutoSmelterEntriesEqual(nextSmelter, smelterState)) {
          newAutoSmeltersL = newAutoSmeltersL === state.autoSmelters ? { ...state.autoSmelters } : newAutoSmeltersL;
          newAutoSmeltersL[smelterId] = nextSmelter;
        }
      }

      if (!changed) return state;
      return {
        ...state,
        inventory: newInvL,
        warehouseInventories: newWarehouseInventoriesL,
        smithy: newSmithyL,
        autoMiners: newAutoMinersL,
        autoSmelters: newAutoSmeltersL,
        conveyors: newConveyorsL,
        notifications: newNotifsL,
        autoDeliveryLog: newAutoDeliveryLogL,
      };
    }

    case "TOGGLE_ENERGY_DEBUG": {
      return { ...state, energyDebugOverlay: !state.energyDebugOverlay };
    }

    case "SET_MACHINE_PRIORITY": {
      const asset = state.assets[action.assetId];
      if (!asset) return state;
      if (!isEnergyConsumerType(asset.type)) return state;
      const nextPriority = clampMachinePriority(action.priority);
      if ((asset.priority ?? DEFAULT_MACHINE_PRIORITY) === nextPriority) return state;
      return {
        ...state,
        assets: {
          ...state.assets,
          [action.assetId]: {
            ...asset,
            priority: nextPriority,
          },
        },
      };
    }

    case "SET_MACHINE_BOOST": {
      const asset = state.assets[action.assetId];
      if (!asset) return state;
      // Harte Einschränkung: Overclocking-Stufe 1 ist nur für auto_miner und auto_smelter.
      if (!isBoostSupportedType(asset.type)) return state;
      const nextBoost = !!action.boosted;
      if ((asset.boosted ?? false) === nextBoost) return state;
      return {
        ...state,
        assets: {
          ...state.assets,
          [action.assetId]: {
            ...asset,
            boosted: nextBoost,
          },
        },
      };
    }

    case "SET_BUILDING_SOURCE": {
      const { buildingId, warehouseId } = action;
      if (!state.assets[buildingId]) return state;
      if (!warehouseId) {
        // Reset to global: remove the mapping entry
        const { [buildingId]: _, ...rest } = state.buildingSourceWarehouseIds;
        return { ...state, buildingSourceWarehouseIds: rest };
      }
      if (!state.assets[warehouseId] || !state.warehouseInventories[warehouseId]) return state;
      return { ...state, buildingSourceWarehouseIds: { ...state.buildingSourceWarehouseIds, [buildingId]: warehouseId } };
    }

    // ---- Production Zone Actions ----

    case "CREATE_ZONE": {
      if (Object.keys(state.productionZones).length >= MAX_ZONES) return state;
      const zoneId = makeId();
      const idx = Object.keys(state.productionZones).length + 1;
      const name = action.name || `Zone ${idx}`;
      return {
        ...state,
        productionZones: { ...state.productionZones, [zoneId]: { id: zoneId, name } },
      };
    }

    case "DELETE_ZONE": {
      const { zoneId } = action;
      if (!state.productionZones[zoneId]) return state;
      const { [zoneId]: _, ...remainingZones } = state.productionZones;
      // Remove all building-zone assignments for this zone
      const newBuildingZoneIds: Record<string, string> = {};
      for (const [bid, zid] of Object.entries(state.buildingZoneIds)) {
        if (zid !== zoneId) newBuildingZoneIds[bid] = zid;
      }
      return {
        ...state,
        productionZones: remainingZones,
        buildingZoneIds: newBuildingZoneIds,
      };
    }

    case "SET_BUILDING_ZONE": {
      const { buildingId, zoneId } = action;
      if (!state.assets[buildingId]) return state;
      if (!zoneId) {
        // Remove from zone
        const { [buildingId]: _, ...rest } = state.buildingZoneIds;
        return { ...state, buildingZoneIds: rest };
      }
      if (!state.productionZones[zoneId]) return state;
      return { ...state, buildingZoneIds: { ...state.buildingZoneIds, [buildingId]: zoneId } };
    }

    default:
      return state;
  }
}

/** Wraps the core reducer with dev-mode invariant assertions. */
export function gameReducerWithInvariants(state: GameState, action: GameAction): GameState {
  const next = gameReducer(state, action);
  if (import.meta.env.DEV && next !== state) {
    devAssertInventoryNonNegative("state.inventory", next.inventory);
    for (const [whId, whInv] of Object.entries(next.warehouseInventories)) {
      devAssertInventoryNonNegative(`warehouseInventories[${whId}]`, whInv);
    }
  }
  return next;
}
