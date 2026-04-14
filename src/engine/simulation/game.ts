// ============================================================
// Factory Island - Game State & Logic
// ============================================================

import { debugLog } from "../../features/builder/debug/debugLogger";

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
  | "manual_assembler";

export type BuildingType = "workbench" | "warehouse" | "smithy" | "generator" | "cable" | "battery" | "power_pole" | "auto_miner" | "conveyor" | "conveyor_corner" | "manual_assembler";

/** Floor tiles that can be placed on the ground layer */
export type FloorTileType = "stone_floor" | "grass_block";

export type MachinePriority = 1 | 2 | 3 | 4 | 5;

export interface PlacedAsset {
  id: string;
  type: AssetType;
  x: number;
  y: number;
  size: 1 | 2;
  fixed?: boolean;
  direction?: Direction;
  /** Energy scheduling priority (1 highest, 5 lowest) for consumer machines */
  priority?: MachinePriority;
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
}

// ---- Directions ----
export type Direction = "north" | "east" | "south" | "west";

// ---- Auto-Miner ----
export interface AutoMinerEntry {
  depositId: string;
  resource: "stone" | "iron" | "copper";
  progress: number;
}

export type UIPanel =
  | "map_shop"
  | "building_shop"
  | "warehouse"
  | "smithy"
  | "workbench"
  | "generator"
  | "battery"
  | "power_pole"
  | "auto_miner"
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

export interface GameState {
  mode: GameMode;
  assets: Record<string, PlacedAsset>;
  cellMap: Record<string, string>;
  inventory: Inventory;
  purchasedBuildings: BuildingType[];
  placedBuildings: BuildingType[];
  warehousesPurchased: number;
  warehousesPlaced: number;
  /** Per-warehouse inventory instances (keyed by warehouse asset ID) */
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
  conveyors: Record<string, { item: "stone" | "iron" | "copper" | null }>;
  /** ID of the auto-miner whose panel is currently open */
  selectedAutoMinerId: string | null;
  /** Manual assembler production state */
  manualAssembler: ManualAssemblerState;
  /** Whether the energy debug overlay is visible */
  energyDebugOverlay: boolean;
}

// ============================================================
// CONSTANTS
// ============================================================

export const GRID_W = 80;
export const GRID_H = 50;
export const CELL_PX = 64;

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
};

/** Building types that can be purchased/placed multiple times */
export const STACKABLE_BUILDINGS = new Set<BuildingType>(["cable", "power_pole", "auto_miner", "conveyor", "conveyor_corner"]);

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

export interface WorkbenchRecipe {
  key: string;
  label: string;
  emoji: string;
  costs: Partial<Record<keyof Inventory, number>>;
  outputKey: keyof Inventory;
  outputAmount: number;
}

export const WORKBENCH_RECIPES: WorkbenchRecipe[] = [
  { key: "wood_pickaxe", label: "Holzspitzhacke", emoji: "\u26CF\uFE0F", costs: { wood: 5 }, outputKey: "wood_pickaxe", outputAmount: 1 },
  { key: "stone_pickaxe", label: "Steinspitzhacke", emoji: "\u26CF\uFE0F", costs: { wood: 10, stone: 5 }, outputKey: "stone_pickaxe", outputAmount: 1 },
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
};

export const DEFAULT_MACHINE_PRIORITY: MachinePriority = 3;

function clampMachinePriority(priority: number | undefined): MachinePriority {
  const raw = Number.isFinite(priority) ? Math.round(priority as number) : DEFAULT_MACHINE_PRIORITY;
  const clamped = Math.max(1, Math.min(5, raw));
  return clamped as MachinePriority;
}

function isEnergyConsumerType(type: AssetType): boolean {
  return ENERGY_DRAIN[type] != null;
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
  };
}

function getWarehouseCapacity(mode: GameMode): number {
  return mode === "debug" ? Infinity : WAREHOUSE_CAPACITY;
}

export function getCapacityPerResource(state: { mode: string; warehousesPlaced: number }): number {
  if (state.mode === "debug") return Infinity;
  return (state.warehousesPlaced + 1) * WAREHOUSE_CAPACITY;
}

export const MAP_SHOP_POS = { x: Math.floor(GRID_W / 2) - 1, y: Math.floor(GRID_H / 2) - 1 };

// ============================================================
// HELPERS
// ============================================================

let _idCounter = 0;
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

/**
 * The warehouse has exactly one input tile located directly below its bottom-left cell
 * (i.e. at { x: warehouse.x, y: warehouse.y + warehouse.size }).
 * Only a conveyor/miner facing "north" and positioned on that tile may feed items in.
 */
export function isValidWarehouseInput(
  entityX: number,
  entityY: number,
  entityDir: Direction,
  warehouse: PlacedAsset
): boolean {
  return (
    entityDir === "north" &&
    entityX === warehouse.x &&
    entityY === warehouse.y + warehouse.size
  );
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
  for (let dy = 0; dy < asset.size; dy++) {
    for (let dx = 0; dx < asset.size; dx++) {
      delete newCellMap[cellKey(asset.x + dx, asset.y + dy)];
    }
  }
  const newGrow = { ...state.saplingGrowAt };
  delete newGrow[assetId];
  return { assets: newAssets, cellMap: newCellMap, saplingGrowAt: newGrow };
}

function placeAsset(
  assets: Record<string, PlacedAsset>,
  cellMap: Record<string, string>,
  type: AssetType,
  x: number,
  y: number,
  size: 1 | 2,
  fixed?: boolean
): {
  assets: Record<string, PlacedAsset>;
  cellMap: Record<string, string>;
  id: string;
} | null {
  if (x + size > GRID_W || y + size > GRID_H) return null;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
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
      ...(fixed ? { fixed: true } : {}),
      ...withDefaultMachinePriority(type),
    } as PlacedAsset,
  };
  const newCellMap = { ...cellMap };
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
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
  for (let cy = 0; cy < candidate.size; cy++) {
    for (let cx = 0; cx < candidate.size; cx++) {
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
    for (let dy = 0; dy < asset.size; dy++) {
      for (let dx = 0; dx < asset.size; dx++) {
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
    for (let dy = 0; dy < current.size; dy++) {
      for (let dx = 0; dx < current.size; dx++) {
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
  const conveyors: Record<string, { item: "stone" | "iron" | "copper" | null }> = {};
  let generatorState: GeneratorState = { fuel: 0, progress: 0, running: false };
  let selectedPowerPoleId: string | null = null;

  function removeNonFixedAssetAtCell(x: number, y: number) {
    const id = cellMap[cellKey(x, y)];
    if (!id) return;
    const a = assets[id];
    if (!a || a.fixed) return;
    delete assets[id];
    for (let dy = 0; dy < a.size; dy++) {
      for (let dx = 0; dx < a.size; dx++) {
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
    // Deterministic autonomous debug setup:
    // stone deposit -> auto-miner -> conveyors (incl. corner) -> warehouse,
    // all powered through generator + overlapping power poles.
    const BASE_W = 80;
    const BASE_H = 50;
    const scaleX = (v: number) => Math.round((v / BASE_W) * GRID_W);
    const scaleY = (v: number) => Math.round((v / BASE_H) * GRID_H);
    const clampCell = (v: number, max: number) => Math.max(0, Math.min(max, v));

    const baseMinerPos = { x: scaleX(3), y: scaleY(3) };
    const minerPos = { x: baseMinerPos.x, y: baseMinerPos.y, dir: "east" as Direction };
    const scaledDepositId = cellMap[cellKey(minerPos.x, minerPos.y)];
    const scaledDeposit = scaledDepositId ? assets[scaledDepositId] : null;
    if (!scaledDeposit || !DEPOSIT_TYPES.has(scaledDeposit.type)) {
      const fallbackStone = DEPOSIT_POSITIONS.find((d) => d.type === "stone_deposit");
      if (fallbackStone) {
        minerPos.x = fallbackStone.x + 1;
        minerPos.y = fallbackStone.y + 1;
      }
    }

    const shiftX = minerPos.x - baseMinerPos.x;
    const shiftY = minerPos.y - baseMinerPos.y;

    const generatorPos = {
      x: clampCell(scaleX(6) + shiftX, GRID_W - 2),
      y: clampCell(scaleY(6) + shiftY, GRID_H - 2),
    };
    const warehousePos = {
      x: clampCell(scaleX(10) + shiftX, GRID_W - 2),
      y: clampCell(scaleY(1) + shiftY, GRID_H - 2),
    };
    const polePositions = [
      { x: clampCell(scaleX(8) + shiftX, GRID_W - 1), y: clampCell(scaleY(6) + shiftY, GRID_H - 1) },
      { x: clampCell(scaleX(8) + shiftX, GRID_W - 1), y: clampCell(scaleY(4) + shiftY, GRID_H - 1) },
      { x: clampCell(scaleX(5) + shiftX, GRID_W - 1), y: clampCell(scaleY(4) + shiftY, GRID_H - 1) },
      { x: clampCell(scaleX(11) + shiftX, GRID_W - 1), y: clampCell(scaleY(4) + shiftY, GRID_H - 1) },
    ];
    const conveyorBlueprint: { type: AssetType; x: number; y: number; dir: Direction }[] = [
      { type: "conveyor", x: clampCell(scaleX(4) + shiftX, GRID_W - 1), y: clampCell(scaleY(3) + shiftY, GRID_H - 1), dir: "east" },
      { type: "conveyor", x: clampCell(scaleX(5) + shiftX, GRID_W - 1), y: clampCell(scaleY(3) + shiftY, GRID_H - 1), dir: "east" },
      { type: "conveyor", x: clampCell(scaleX(6) + shiftX, GRID_W - 1), y: clampCell(scaleY(3) + shiftY, GRID_H - 1), dir: "east" },
      { type: "conveyor", x: clampCell(scaleX(7) + shiftX, GRID_W - 1), y: clampCell(scaleY(3) + shiftY, GRID_H - 1), dir: "east" },
      { type: "conveyor", x: clampCell(scaleX(8) + shiftX, GRID_W - 1), y: clampCell(scaleY(3) + shiftY, GRID_H - 1), dir: "east" },
      { type: "conveyor", x: clampCell(scaleX(9) + shiftX, GRID_W - 1), y: clampCell(scaleY(3) + shiftY, GRID_H - 1), dir: "east" },
      { type: "conveyor", x: clampCell(scaleX(10) + shiftX, GRID_W - 1), y: clampCell(scaleY(3) + shiftY, GRID_H - 1), dir: "north" },
    ];

    // Prepare build area (non-fixed assets only) and generator floor.
    clearAreaForDebug(generatorPos.x, generatorPos.y, 2);
    clearAreaForDebug(warehousePos.x, warehousePos.y, 2);
    for (const p of polePositions) clearAreaForDebug(p.x, p.y, 1);
    for (const c of conveyorBlueprint) clearAreaForDebug(c.x, c.y, 1);
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        floorMap[cellKey(generatorPos.x + dx, generatorPos.y + dy)] = "stone_floor";
      }
    }

    // Place warehouse endpoint and generator power source.
    tryPlace("warehouse", warehousePos.x, warehousePos.y, 2);
    tryPlace("generator", generatorPos.x, generatorPos.y, 2);

    // Place overlapping power poles (single shared energy network).
    for (const p of polePositions) {
      const poleId = placeDirectedForDebug("power_pole", p.x, p.y, "north");
      if (!selectedPowerPoleId && poleId) selectedPowerPoleId = poleId;
    }

    // Place auto-miner on stone deposit and bind miner state to that deposit.
    const depositCellId = cellMap[cellKey(minerPos.x, minerPos.y)];
    const depositAsset = depositCellId ? assets[depositCellId] : null;
    if (depositAsset && DEPOSIT_TYPES.has(depositAsset.type)) {
      const minerId = makeId();
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
        resource: DEPOSIT_RESOURCE[depositAsset.type],
        progress: 0,
      };
    }

    // Place full conveyor route and initialize conveyor item states.
    for (const c of conveyorBlueprint) {
      const convId = placeDirectedForDebug(c.type, c.x, c.y, c.dir);
      if (convId) conveyors[convId] = { item: null };
    }

    // Start generator immediately with enough reserve for continuous autonomous operation.
    generatorState = { fuel: 250, progress: 0, running: true };
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
    manualAssembler: { processing: false, recipe: null, progress: 0 },
    energyDebugOverlay: false,
  };
}

// ============================================================
// ACTIONS
// ============================================================

export type GameAction =
  | { type: "CLICK_CELL"; x: number; y: number }
  | { type: "SET_ACTIVE_SLOT"; slot: number }
  | { type: "BUY_BUILDING"; buildingType: BuildingType }
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
  | { type: "GROW_SAPLING"; assetId: string }
  | { type: "NATURAL_SPAWN" }
  | { type: "REMOVE_BUILDING"; buildingType: BuildingType }
  | { type: "REMOVE_FROM_HOTBAR"; slot: number }
  | { type: "EQUIP_BUILDING_FROM_WAREHOUSE"; buildingType: BuildingType; amount?: number }
  | { type: "EQUIP_FROM_WAREHOUSE"; itemKind: "axe" | "wood_pickaxe" | "stone_pickaxe" | "sapling"; amount?: number }
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
  | { type: "SET_MACHINE_PRIORITY"; assetId: string; priority: MachinePriority };

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
        // In build mode: clicking a building opens its panel
        if (asset && (["workbench", "warehouse", "smithy", "generator", "battery", "power_pole", "manual_assembler"] as string[]).includes(asset.type)) {
          const panel = asset.type as UIPanel;
          if (asset.type === "warehouse") {
            const newPanel = state.openPanel === panel && state.selectedWarehouseId === asset.id ? null : panel;
            return { ...state, openPanel: newPanel, selectedWarehouseId: newPanel ? asset.id : null };
          }
          if (asset.type === "power_pole") {
            const newPanel = state.openPanel === panel ? null : panel;
            return { ...state, openPanel: newPanel, selectedPowerPoleId: newPanel ? asset.id : state.selectedPowerPoleId };
          }
          return { ...state, openPanel: state.openPanel === panel ? null : panel };
        }
        if (asset && asset.type === "auto_miner") {
          const opening = state.openPanel !== "auto_miner" || state.selectedAutoMinerId !== asset.id;
          return {
            ...state,
            openPanel: opening ? "auto_miner" : null,
            selectedAutoMinerId: opening ? asset.id : null,
          };
        }
        // In build mode: no mining, no hotbar tools, no cable clicking – only BUILD_PLACE_BUILDING / BUILD_REMOVE_ASSET via dispatch
        return state;
      }

      // ----- NORMAL MODE (build mode OFF) -----
      // Click on building => open its panel (panels still accessible)
      if (asset && (["workbench", "warehouse", "smithy", "generator", "battery", "power_pole", "manual_assembler"] as string[]).includes(asset.type)) {
        const panel = asset.type as UIPanel;
        if (asset.type === "warehouse") {
          const newPanel = state.openPanel === panel && state.selectedWarehouseId === asset.id ? null : panel;
          return { ...state, openPanel: newPanel, selectedWarehouseId: newPanel ? asset.id : null };
        }
        if (asset.type === "power_pole") {
          const newPanel = state.openPanel === panel ? null : panel;
          return { ...state, openPanel: newPanel, selectedPowerPoleId: newPanel ? asset.id : state.selectedPowerPoleId };
        }
        return { ...state, openPanel: state.openPanel === panel ? null : panel };
      }

      if (asset && asset.type === "auto_miner") {
        const opening = state.openPanel !== "auto_miner" || state.selectedAutoMinerId !== asset.id;
        return {
          ...state,
          openPanel: opening ? "auto_miner" : null,
          selectedAutoMinerId: opening ? asset.id : null,
        };
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
        if (state.inventory.wood >= cap) {
          debugLog.warehouse(`Capacity check FAILED: wood ${state.inventory.wood}/${cap}`);
          return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
        }
        const removed = removeAsset(state, assetId);
        let inv = { ...state.inventory, wood: state.inventory.wood + 1 };
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
            inv = { ...inv, sapling: inv.sapling + 1 };
            notifs = addNotification(notifs, "sapling", 1);
            debugLog.inventory("Sapling drop → added to warehouse inventory");
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
        if (state.inventory.stone >= cap) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
        }
        const removed = removeAsset(state, assetId);
        const inv = { ...state.inventory, stone: state.inventory.stone + 1 };
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
        if ((state.inventory[resKey] as number) >= cap) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
        }
        const removed = removeAsset(state, assetId);
        const inv = { ...state.inventory, [resKey]: (state.inventory[resKey] as number) + 1 };
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

    case "BUY_BUILDING": {
      // Buildings are placed exclusively via BUILD_PLACE_BUILDING in Build Mode.
      // This action is kept for backwards compatibility but does nothing.
      return state;
    }

    case "BUY_MAP_SHOP_ITEM": {
      const item = MAP_SHOP_ITEMS.find((i) => i.key === action.itemKey);
      if (!item) return state;
      if (state.inventory.coins < item.costCoins) return state;
      const baseInv = { ...state.inventory, coins: state.inventory.coins - item.costCoins };
      const notifs = addNotification(state.notifications, item.key, 1);
      const toolHotbarKinds: ToolKind[] = ["axe", "wood_pickaxe", "stone_pickaxe"];
      const toolKind = item.key as ToolKind;
      if (toolHotbarKinds.includes(toolKind)) {
        const newHotbar = hotbarAdd(state.hotbarSlots, toolKind as Exclude<ToolKind, "empty">);
        if (newHotbar) {
          return { ...state, inventory: baseInv, hotbarSlots: newHotbar, notifications: notifs };
        }
      }
      const newInv = { ...baseInv, [item.inventoryKey]: (baseInv[item.inventoryKey] as number) + 1 };
      return { ...state, inventory: newInv, notifications: notifs };
    }

    case "CRAFT_WORKBENCH": {
      const recipe = WORKBENCH_RECIPES.find((r) => r.key === action.recipeKey);
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
      const inv = state.inventory;
      for (const [res, amt] of Object.entries(recipe.costs)) {
        if ((inv[res as keyof Inventory] ?? 0) < (amt ?? 0)) return state;
      }
      const newInv = { ...inv };
      for (const [res, amt] of Object.entries(recipe.costs)) {
        (newInv as any)[res] -= amt ?? 0;
      }
      const notifs = addNotification(state.notifications, recipe.outputKey, recipe.outputAmount);
      const toolHotbarKindsW: ToolKind[] = ["axe", "wood_pickaxe", "stone_pickaxe"];
      const outKind = recipe.outputKey as ToolKind;
      if (toolHotbarKindsW.includes(outKind)) {
        const newHotbar = hotbarAdd(state.hotbarSlots, outKind as Exclude<ToolKind, "empty">, undefined, recipe.outputAmount);
        if (newHotbar) {
          return { ...state, inventory: newInv, hotbarSlots: newHotbar, notifications: notifs };
        }
      }
      (newInv as any)[recipe.outputKey] += recipe.outputAmount;
      return { ...state, inventory: newInv, notifications: notifs };
    }

    case "TOGGLE_PANEL":
      return { ...state, openPanel: state.openPanel === action.panel ? null : action.panel };

    case "CLOSE_PANEL":
      return { ...state, openPanel: null, selectedAutoMinerId: null, selectedWarehouseId: null };

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

    case "SMITHY_ADD_FUEL": {
      const amt = Math.min(action.amount, state.inventory.wood);
      if (amt > 0) debugLog.smithy(`Added ${amt} Wood as fuel`);
      if (amt <= 0) return state;
      return {
        ...state,
        inventory: { ...state.inventory, wood: state.inventory.wood - amt },
        smithy: { ...state.smithy, fuel: state.smithy.fuel + amt },
      };
    }

    case "SMITHY_ADD_IRON": {
      const amt = Math.min(action.amount, state.inventory.iron);
      if (amt > 0) debugLog.smithy(`Added ${amt} Iron ore`);
      if (amt <= 0) return state;
      return {
        ...state,
        inventory: { ...state.inventory, iron: state.inventory.iron - amt },
        smithy: { ...state.smithy, iron: state.smithy.iron + amt },
      };
    }

    case "SMITHY_ADD_COPPER": {
      const amt = Math.min(action.amount, state.inventory.copper);
      if (amt > 0) debugLog.smithy(`Added ${amt} Copper ore`);
      if (amt <= 0) return state;
      return {
        ...state,
        inventory: { ...state.inventory, copper: state.inventory.copper - amt },
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
      const rawAmt = s.selectedRecipe === "iron" ? s.iron : s.copper;
      if (rawAmt < 5) return state;
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
      const rawAmt = s.selectedRecipe === "iron" ? s.iron : s.copper;
      if (!s.processing || s.fuel <= 0 || rawAmt < 5)
        return { ...state, smithy: { ...s, processing: false } };
      const newProgress = s.progress + SMITHY_TICK_MS / SMITHY_PROCESS_MS;
      if (newProgress >= 1) {
        const newFuel = s.fuel - 1;
        if (s.selectedRecipe === "iron") {
          const newIron = s.iron - 5;
          const canContinue = newFuel > 0 && newIron >= 5;
          return {
            ...state,
            smithy: { ...s, iron: newIron, fuel: newFuel, outputIngots: s.outputIngots + 1, progress: 0, processing: canContinue },
            notifications: addNotification(state.notifications, "ironIngot", 1),
          };
        } else {
          const newCopper = s.copper - 5;
          const canContinue = newFuel > 0 && newCopper >= 5;
          return {
            ...state,
            smithy: { ...s, copper: newCopper, fuel: newFuel, outputCopperIngots: s.outputCopperIngots + 1, progress: 0, processing: canContinue },
            notifications: addNotification(state.notifications, "copperIngot", 1),
          };
        }
      }
      return { ...state, smithy: { ...s, progress: newProgress } };
    }

    case "SMITHY_WITHDRAW": {
      const ironAmt = state.smithy.outputIngots;
      const copperAmt = state.smithy.outputCopperIngots;
      if (ironAmt <= 0 && copperAmt <= 0) return state;
      return {
        ...state,
        inventory: {
          ...state.inventory,
          ironIngot: state.inventory.ironIngot + ironAmt,
          copperIngot: state.inventory.copperIngot + copperAmt,
        },
        smithy: { ...state.smithy, outputIngots: 0, outputCopperIngots: 0 },
      };
    }

    case "MANUAL_ASSEMBLER_START": {
      if (!Object.values(state.assets).some((a) => a.type === "manual_assembler")) return state;
      if (state.manualAssembler.processing) return state;
      const cap = getCapacityPerResource(state);

      if (action.recipe === "metal_plate") {
        if (state.inventory.metalPlate >= cap) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
        }
        if (state.inventory.ironIngot < 1) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Nicht genug Metallbarren!") };
        }
        return {
          ...state,
          inventory: { ...state.inventory, ironIngot: state.inventory.ironIngot - 1 },
          manualAssembler: { processing: true, recipe: "metal_plate", progress: 0 },
        };
      }

      if (state.inventory.gear >= cap) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser.") };
      }
      if (state.inventory.metalPlate < 1) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Nicht genug Metallplatten!") };
      }

      return {
        ...state,
        inventory: { ...state.inventory, metalPlate: state.inventory.metalPlate - 1 },
        manualAssembler: { processing: true, recipe: "gear", progress: 0 },
      };
    }

    case "MANUAL_ASSEMBLER_TICK": {
      const m = state.manualAssembler;
      if (!m.processing || !m.recipe) return state;

      const newProgress = m.progress + MANUAL_ASSEMBLER_TICK_MS / MANUAL_ASSEMBLER_PROCESS_MS;
      if (newProgress < 1) {
        return { ...state, manualAssembler: { ...m, progress: newProgress } };
      }

      const outputKey: keyof Inventory = m.recipe === "metal_plate" ? "metalPlate" : "gear";
      const cap = getCapacityPerResource(state);
      if ((state.inventory[outputKey] as number) >= cap) {
        return {
          ...state,
          manualAssembler: { processing: false, recipe: null, progress: 0 },
          notifications: addErrorNotification(state.notifications, "Lager voll! Baue mehr Lagerhäuser."),
        };
      }

      return {
        ...state,
        inventory: { ...state.inventory, [outputKey]: (state.inventory[outputKey] as number) + 1 },
        manualAssembler: { processing: false, recipe: null, progress: 0 },
        notifications: addNotification(state.notifications, outputKey, 1),
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
      const amt = Math.min(action.amount, state.inventory.wood);
      if (amt <= 0) return state;
      debugLog.building(`Generator: added ${amt} wood as fuel`);
      return {
        ...state,
        inventory: { ...state.inventory, wood: state.inventory.wood - amt },
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
      // Generator only produces if it is cable-connected to at least one power pole.
      // (Generators seed the BFS in Phase 1; power poles are only in connectedAssetIds
      //  when a cable path exists from the generator to them.)
      const genConnectedToPole = state.connectedAssetIds.some(
        (id) => state.assets[id]?.type === "power_pole"
      );
      // Ticks that fit in one ENERGY_NET_TICK period
      const ticksPerPeriod = Math.round(ENERGY_NET_TICK_MS / GENERATOR_TICK_MS);
      const production =
        state.generator.running && genConnectedToPole
          ? ticksPerPeriod * GENERATOR_ENERGY_PER_TICK
          : 0;

      // === Connected consumer machines ===
      const connectedConsumers = state.connectedAssetIds
        .map((id) => state.assets[id])
        .filter((a): a is PlacedAsset => !!a && isEnergyConsumerType(a.type));

      // Priority scheduling: lower number gets energy first.
      // For equal priority, keep the existing connectedAssetIds order.
      const prioritizedConsumers = connectedConsumers
        .map((asset, index) => ({
          asset,
          index,
          priority: clampMachinePriority(asset.priority),
          drain: ENERGY_DRAIN[asset.type],
        }))
        .sort((a, b) => a.priority - b.priority || a.index - b.index);

      // === Battery is the sole energy storage ===
      const batteryAsset = Object.values(state.assets).find((a) => a.type === "battery");
      const batteryConnected = batteryAsset ? state.connectedAssetIds.includes(batteryAsset.id) : false;

      // Available energy in this period = production + (optional) battery discharge potential.
      let remainingEnergy = production + (batteryConnected ? state.battery.stored : 0);
      const poweredMachineIds: string[] = [];

      for (const consumer of prioritizedConsumers) {
        if (remainingEnergy < consumer.drain) continue;
        remainingEnergy -= consumer.drain;
        poweredMachineIds.push(consumer.asset.id);
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

      if (newBatteryStored === state.battery.stored && samePoweredSet) return state;

      return {
        ...state,
        battery: { ...state.battery, stored: newBatteryStored },
        poweredMachineIds,
      };
    }

    case "REMOVE_POWER_POLE": {
      // Power poles are removed exclusively via BUILD_REMOVE_ASSET in Build Mode.
      return state;
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
      for (const [res, amt] of Object.entries(costs)) {
        if ((state.inventory[res as keyof Inventory] ?? 0) < (amt ?? 0)) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Nicht genug Ressourcen!") };
        }
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
        const newInvM = { ...state.inventory };
        for (const [res, amt] of Object.entries(costs)) (newInvM as any)[res] -= amt ?? 0;
        const resource = DEPOSIT_RESOURCE[depositAsset.type];
        const newAutoMiners = { ...state.autoMiners, [minerId]: { depositId: depositAssetId, resource, progress: 0 } };
        debugLog.building(`[BuildMode] Placed Auto-Miner at (${x},${y}) on ${depositAsset.type}`);
        const partialM: GameState = { ...state, assets: newAssets, cellMap: newCellMap, inventory: newInvM, autoMiners: newAutoMiners };
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
        const newInvC = { ...state.inventory };
        for (const [res, amt] of Object.entries(costs)) (newInvC as any)[res] -= amt ?? 0;
        const newConveyors = { ...state.conveyors, [convPlaced.id]: { item: null as "stone" | "iron" | "copper" | null } };
        debugLog.building(`[BuildMode] Placed ${BUILDING_LABELS[bType]} at (${x},${y}) facing ${dir}`);
        const partialC: GameState = { ...state, assets: newAssetsC, cellMap: convPlaced.cellMap, inventory: newInvC, conveyors: newConveyors };
        return { ...partialC, connectedAssetIds: computeConnectedAssetIds(partialC) };
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
      const newInvB = { ...state.inventory };
      for (const [res, amt] of Object.entries(costs)) {
        (newInvB as any)[res] -= amt ?? 0;
      }

      debugLog.building(`[BuildMode] Placed ${BUILDING_LABELS[bType]} at (${x},${y})`);

      const partialBuild: GameState =
        bType === "warehouse"
          ? {
              ...state,
              assets: placed.assets,
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
      const removableTypes = new Set<string>(["workbench", "warehouse", "smithy", "generator", "cable", "battery", "power_pole", "auto_miner", "conveyor", "conveyor_corner", "manual_assembler"]);
      if (!removableTypes.has(targetAsset.type)) return state;
      if (targetAsset.fixed) return state;

      debugLog.building(`[BuildMode] Removed ${ASSET_LABELS[targetAsset.type]} at (${targetAsset.x},${targetAsset.y}) – ~1/3 refund`);
      const removedB = removeAsset(state, action.assetId);
      const bTypeR = targetAsset.type as BuildingType;
      const costsR = BUILDING_COSTS[bTypeR];
      const newInvR = { ...state.inventory };
      for (const [res, amt] of Object.entries(costsR)) {
        const refund = Math.max(1, Math.floor((amt ?? 0) / 3));
        (newInvR as any)[res] = ((newInvR as any)[res] ?? 0) + refund;
      }

      let partialRemove: GameState;
      if (bTypeR === "warehouse") {
        const newWarehouseInventories = { ...state.warehouseInventories };
        delete newWarehouseInventories[action.assetId];
        partialRemove = {
          ...state,
          ...removedB,
          inventory: newInvR,
          warehousesPlaced: state.warehousesPlaced - 1,
          warehousesPurchased: state.warehousesPurchased - 1,
          warehouseInventories: newWarehouseInventories,
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
          manualAssembler: { processing: false, recipe: null, progress: 0 },
        };
      } else {
        partialRemove = { ...state, ...removedB, inventory: newInvR, placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR), purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR), openPanel: null as UIPanel };
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
      for (const [res, amt] of Object.entries(tileCosts)) {
        if ((state.inventory[res as keyof Inventory] ?? 0) < (amt ?? 0)) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Nicht genug Ressourcen!") };
        }
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
        const newInvF = { ...state.inventory };
        for (const [res, amt] of Object.entries(tileCosts)) (newInvF as any)[res] -= amt ?? 0;
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
        const newInvF = { ...state.inventory };
        for (const [res, amt] of Object.entries(tileCosts)) (newInvF as any)[res] -= amt ?? 0;
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
      let changed = false;

      const tryStoreInWarehouse = (warehouseId: string, resource: "stone" | "iron" | "copper"): boolean => {
        const whInv = (newWarehouseInventoriesL === state.warehouseInventories
          ? state.warehouseInventories[warehouseId]
          : newWarehouseInventoriesL[warehouseId]);
        if (!whInv) return false;
        const cap = getWarehouseCapacity(state.mode);
        const resKey = resource as keyof Inventory;
        if ((whInv[resKey] as number) >= cap) return false;
        const updated = { ...whInv, [resKey]: (whInv[resKey] as number) + 1 };
        newWarehouseInventoriesL = newWarehouseInventoriesL === state.warehouseInventories
          ? { ...state.warehouseInventories, [warehouseId]: updated }
          : { ...newWarehouseInventoriesL, [warehouseId]: updated };
        return true;
      };

      // ---- Auto-Miners: produce resources ----
      for (const [minerId, miner] of Object.entries(state.autoMiners)) {
        const minerAsset = state.assets[minerId];
        if (!minerAsset) continue;
        const isConnected = state.connectedAssetIds.includes(minerId);
        const isPowered = poweredSet.has(minerId);
        if (!isConnected || !isPowered) continue;

        let progress = miner.progress + 1;
        if (progress >= AUTO_MINER_PRODUCE_TICKS) {
          const dir = minerAsset.direction ?? "east";
          const [ox, oy] = directionOffset(dir);
          const outX = minerAsset.x + ox;
          const outY = minerAsset.y + oy;
          if (outX >= 0 && outX < GRID_W && outY >= 0 && outY < GRID_H) {
            const outAssetId = state.cellMap[cellKey(outX, outY)];
            const outAsset = outAssetId ? state.assets[outAssetId] : null;
            if ((outAsset?.type === "conveyor" || outAsset?.type === "conveyor_corner") && (newConveyorsL === state.conveyors ? state.conveyors[outAssetId] : newConveyorsL[outAssetId])?.item === null) {
              newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
              newConveyorsL[outAssetId] = { item: miner.resource };
              progress = 0;
              changed = true;
            } else if (outAsset?.type === "warehouse" && isValidWarehouseInput(minerAsset.x, minerAsset.y, dir, outAsset)) {
              if (tryStoreInWarehouse(outAsset.id, miner.resource)) {
                newNotifsL = addNotification(newNotifsL, miner.resource, 1);
                progress = 0;
                changed = true;
              }
            }
          }
          // If still at max, stay blocked
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
        const currentItem = (newConveyorsL === state.conveyors ? conv : newConveyorsL[convId])?.item;
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
          if (convAsset.x === wAsset.x && convAsset.y === wAsset.y + wAsset.size) {
            if (tryStoreInWarehouse(wAsset.id, currentItem)) {
              newNotifsL = addNotification(newNotifsL, currentItem, 1);
              newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
              newConveyorsL[convId] = { item: null };
              changed = true;
            }
            deliveredToWarehouse = true;
            break;
          }
        }
        if (deliveredToWarehouse) continue;

        const inDir = convAsset.direction ?? "east";
        const dir =
          convAsset.type === "conveyor_corner"
            ? inDir === "north"
              ? "east"
              : inDir === "east"
              ? "south"
              : inDir === "south"
              ? "west"
              : "north"
            : inDir;
        const [ox, oy] = directionOffset(dir);
        const nextX = convAsset.x + ox;
        const nextY = convAsset.y + oy;
        if (nextX < 0 || nextX >= GRID_W || nextY < 0 || nextY >= GRID_H) continue;

        const nextAssetId = state.cellMap[cellKey(nextX, nextY)];
        const nextAsset = nextAssetId ? state.assets[nextAssetId] : null;

        if ((nextAsset?.type === "conveyor" || nextAsset?.type === "conveyor_corner") && !movedThisTick.has(nextAssetId)) {
          const nextConv = newConveyorsL === state.conveyors ? state.conveyors[nextAssetId] : newConveyorsL[nextAssetId];
          if (nextConv?.item === null) {
            newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
            newConveyorsL[nextAssetId] = { item: currentItem };
            newConveyorsL[convId] = { item: null };
            movedThisTick.add(nextAssetId);
            changed = true;
          }
        } else if (nextAsset?.type === "warehouse" && isValidWarehouseInput(convAsset.x, convAsset.y, convAsset.direction ?? "east", nextAsset)) {
          if (tryStoreInWarehouse(nextAsset.id, currentItem)) {
            newNotifsL = addNotification(newNotifsL, currentItem, 1);
            newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
            newConveyorsL[convId] = { item: null };
            changed = true;
          }
        } else if (nextAsset?.type === "workbench") {
          // Workbench has no dedicated input slots; inject into shared inventory as crafting supply.
          const cap = getCapacityPerResource(state);
          const resKey = currentItem as keyof Inventory;
          if ((newInvL[resKey] as number) < cap) {
            newInvL = newInvL === state.inventory ? { ...state.inventory } : newInvL;
            (newInvL as any)[resKey] = (newInvL[resKey] as number) + 1;
            newNotifsL = addNotification(newNotifsL, currentItem, 1);
            newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
            newConveyorsL[convId] = { item: null };
            changed = true;
          }
        } else if (nextAsset?.type === "smithy") {
          // Feed ore into smithy internal slots
          if (currentItem === "iron" || currentItem === "copper") {
            const oreKey = currentItem === "iron" ? "iron" : "copper";
            if ((newSmithyL as any)[oreKey] < 50) {
              newSmithyL = { ...newSmithyL, [oreKey]: (newSmithyL as any)[oreKey] + 1 };
              newConveyorsL = newConveyorsL === state.conveyors ? { ...state.conveyors } : newConveyorsL;
              newConveyorsL[convId] = { item: null };
              changed = true;
            }
          }
        }
      }

      if (!changed) return state;
      return {
        ...state,
        inventory: newInvL,
        warehouseInventories: newWarehouseInventoriesL,
        smithy: newSmithyL,
        autoMiners: newAutoMinersL,
        conveyors: newConveyorsL,
        notifications: newNotifsL,
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

    default:
      return state;
  }
}
