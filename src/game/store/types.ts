// ============================================================
// Factory Island — Core Type Declarations
// ------------------------------------------------------------
// Extracted from store/reducer.ts. Pure type/interface module.
// The reducer re-exports every symbol declared here so existing
// `from "../store/reducer"` imports keep working.
//
// IMPORTANT: This module is type-only at runtime. Any value
// imports here would create a real ESM cycle with reducer.ts.
// `import type` is fine (erased at compile time).
// ============================================================

// Type-only forward reference into reducer.ts. ProductionZone is still
// declared there because it lives next to the runtime helpers that own
// MAX_ZONES / resolveCraftingSource. Erased at runtime → no cycle.
import type { ProductionZone } from "./reducer";

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
  | "auto_smelter"
  | "service_hub";

export type BuildingType = "workbench" | "warehouse" | "smithy" | "generator" | "cable" | "battery" | "power_pole" | "auto_miner" | "conveyor" | "conveyor_corner" | "manual_assembler" | "auto_smelter" | "service_hub";

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
  /** Asset ID of the smithy that started the current batch (for validation/output routing). */
  buildingId: string | null;
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
  | "service_hub"
  | null;

// ---- Battery ----
export interface BatteryState {
  stored: number;
  capacity: number;
}

// ---- Generator ----
export interface GeneratorState {
  /** Wood currently in the fuel slot (local input buffer, capped at GENERATOR_MAX_FUEL) */
  fuel: number;
  /** Fractional charge progress within the current wood unit (0–1) */
  progress: number;
  /** Whether the generator is actively burning */
  running: boolean;
  /**
   * Wood the player has explicitly requested but that has not yet been delivered.
   * Drones only refill the generator while this counter is positive (no auto-refill).
   * Decremented as wood is deposited; reset implicitly when the generator is rebuilt.
   * Optional for save backward compatibility (treated as 0 when absent).
   */
  requestedRefill?: number;
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
  sourceType: "auto_miner" | "conveyor" | "auto_smelter";
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

// ---- Collection Node ----
/**
 * Resources dropped by manual harvesting (axe, pickaxe). Live in the world at
 * their tile until picked up by a drone / service hub.
 * They are NOT part of warehouse / central inventory bookkeeping.
 */
export type CollectableItemType = "wood" | "stone" | "iron" | "copper";

export interface CollectionNode {
  id: string;
  itemType: CollectableItemType;
  amount: number;
  tileX: number;
  tileY: number;
  /** Marker that this node is ready to be picked up. Always true in V1. */
  collectable: true;
  /** Creation timestamp (used for ordering / debugging). */
  createdAt: number;
  /**
   * ID of the drone that has claimed this node for pickup.
   * null = unclaimed (any drone may select it).
   * Reservation is released when the drone collects, aborts, or is reset.
   */
  reservedByDroneId: string | null;
}

// ---- Drone Roles ----
/**
 * Optional role that biases a drone's task selection toward a specific work type.
 * "auto" = no preference — drone picks any best-scoring task (default).
 * "construction" = prefers construction_supply tasks (score bonus applied).
 * "supply" = prefers hub_restock tasks (score bonus applied).
 * Roles never block fallback: if the preferred task type has no candidates the
 * drone still picks the highest-scoring task of any type.
 */
export type DroneRole = "auto" | "construction" | "supply";

// ---- Starter Drone ----
export type DroneStatus =
  | "idle"
  | "moving_to_collect"
  | "collecting"
  | "moving_to_dropoff"
  | "depositing"
  /** Drone is flying back to its homeHub dock after finishing a task or on game start. */
  | "returning_to_dock";

export interface DroneCargoItem {
  itemType: CollectableItemType;
  amount: number;
}

/**
 * Singleton starter drone. Becomes the "hub drone" once a service hub is
 * introduced — no separate drone system needed.
 *
 * Hub-integration path: set `hubId` to a service-hub asset ID.
 * The drone then delivers to that hub's tile position instead of MAP_SHOP_POS.
 * All other state-machine logic stays identical.
 */
export interface StarterDroneState {
  status: DroneStatus;
  /** Conceptual tile position (for distance calc; no visual yet). */
  tileX: number;
  tileY: number;
  /** ID of the CollectionNode currently targeted (null when idle). */
  targetNodeId: string | null;
  /** Items being carried this trip. */
  cargo: DroneCargoItem | null;
  /** Ticks remaining for the current movement / action phase. */
  ticksRemaining: number;
  /**
   * When null: drone delivers to the start module (MAP_SHOP_POS).
   * When set to an asset ID: drone delivers to that hub asset's tile.
   * This is the only change required for hub integration.
   */
  hubId: string | null;
  /** Type of the active drone task. null when idle / no task. */
  currentTaskType: DroneTaskType | null;
  /** Asset ID of the delivery target (construction site or hub). null when idle or delivering to start module. */
  deliveryTargetId: string | null;
  /** Crafting job currently being delivered from a workbench. */
  craftingJobId: string | null;
  /**
   * Stable identifier for this drone instance.
   * Used as the claim/reservation token on collection nodes.
   * Remains constant for the lifetime of the drone object.
   */
  droneId: string;
  /**
   * Optional role preference — influences task scoring.
   * Defaults to "auto" when absent (backward compatible with older saves).
   */
  role?: DroneRole;
}

// ---- Drone Tasks ----
/**
 * hub_dispatch: drone flies to its hub, withdraws resources from hub.inventory,
 * then delivers them directly to a construction site.
 * nodeId format: "hub:{hubId}:{resourceType}"
 */
export type DroneTaskType = "construction_supply" | "hub_restock" | "hub_dispatch" | "workbench_delivery" | "building_supply";

// ---- Construction Sites ----

/** Tracks the outstanding resource debt for a building placed as a construction site. */
export interface ConstructionSite {
  buildingType: BuildingType;
  /** Resources still needed (only CollectableItemType keys). */
  remaining: Partial<Record<CollectableItemType, number>>;
}

// ---- Service Hub ----

/** Local inventory stored inside a service hub. Only collectable resource types. */
export type ServiceHubInventory = Record<CollectableItemType, number>;

/** Hub progression tier. Tier 1 = Proto-Hub (starter), Tier 2 = Service-Hub (upgraded). */
export type HubTier = 1 | 2;

/** Per-hub runtime state. Keyed by asset ID in GameState.serviceHubs. */
export interface ServiceHubEntry {
  /** Current stock per resource at this hub. */
  inventory: ServiceHubInventory;
  /** Player-configured desired stock level per resource. */
  targetStock: Record<CollectableItemType, number>;
  /** Progression tier: 1 = Proto-Hub, 2 = Service-Hub. */
  tier: HubTier;
  /** IDs of drones assigned to this hub, capped by getMaxDrones(tier). */
  droneIds: string[];
  /**
   * Marker for an in-flight Tier-2 upgrade.
   * Undefined = no upgrade in progress.
   *
   * Runtime fulfillment uses the shared construction-site delivery flow:
   * resources are picked up from valid physical sources and delivered by
   * drones; the tier flip happens after that demand is fully delivered.
   */
  pendingUpgrade?: Partial<Record<CollectableItemType, number>>;
}

/** Keep-in-stock target for one workbench recipe. */
export interface KeepStockTargetEntry {
  /** Whether automatic refill is active for this recipe. */
  enabled: boolean;
  /** Desired minimum stock for the recipe output item. */
  amount: number;
}

/** Keep-in-stock config map: workbenchId -> recipeId -> target entry. */
export type KeepStockByWorkbench = Record<string, Record<string, KeepStockTargetEntry>>;

export interface GameState {
  mode: GameMode;
  assets: Record<string, PlacedAsset>;
  cellMap: Record<string, string>;
  /** Global logistics buffer — passive fallback pool used when no warehouse or zone is assigned
   *  to a building. Receives manual harvest and auto-delivery output when no more specific
   *  target is configured. Use getCapacityPerResource(state) for the per-resource cap. */
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
  generators: Record<string, GeneratorState>;
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
  /** ID of the service hub whose panel is currently open */
  selectedServiceHubId: string | null;
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
  /**
   * World-bound drops from manual harvesting (Axt / Spitzhacke). Persisted.
   * Keyed by node ID. NOT a warehouse pool — drones address and remove these.
   */
  collectionNodes: Record<string, CollectionNode>;
  /** The single starter drone (future: hub drone). Persisted. */
  starterDrone: StarterDroneState;
  /** All drones keyed by droneId. Persisted. Kept in sync with starterDrone for backward compat. */
  drones: Record<string, StarterDroneState>;
  /** Per-service-hub state (keyed by asset ID). Persisted. */
  serviceHubs: Record<string, ServiceHubEntry>;
  /** Outstanding resource debts for buildings under construction (keyed by asset ID). Persisted. */
  constructionSites: Record<string, ConstructionSite>;
  /**
   * Inventory-network reservation slice (Step 2 of the new crafting/inventory
   * architecture). Tracks logical holds on top of the physical warehouse
   * inventories. The physical inventories remain the source of truth for
   * stored amounts; this slice tracks `reserved` and exposes `free`.
   */
  network: import("../inventory/reservationTypes").NetworkSlice;
  /**
   * Crafting job queue (Step 3). Holds all CraftingJobs across all
   * workbenches. The tick scheduler advances jobs through their state
   * machine; reservations live in `network`.
   */
  crafting: import("../crafting/types").CraftingQueueState;
  /**
   * Optional keep-in-stock targets for workbench recipes.
   * Kept optional so older tests/manual state literals remain valid.
   */
  keepStockByWorkbench?: KeepStockByWorkbench;
}
