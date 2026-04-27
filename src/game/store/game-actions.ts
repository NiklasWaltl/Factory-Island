import type { NetworkAction } from "../inventory/reservationTypes";
import type { CraftingAction } from "../crafting/types";
import type {
  BuildingType,
  FloorTileType,
  MachinePriority,
  Direction,
  UIPanel,
  CollectableItemType,
  DroneRole,
  GameState,
  Inventory,
} from "./types";
import type { RecipeAutomationPolicyPatch } from "../crafting/policies";

// ============================================================
// ACTIONS
// ============================================================

export type GameAction =
  | { type: "CLICK_CELL"; x: number; y: number }
  | { type: "SET_ACTIVE_SLOT"; slot: number }
  | { type: "BUY_MAP_SHOP_ITEM"; itemKey: string }
  /** @deprecated Use JOB_ENQUEUE and JOB_TICK. */
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
  | { type: "GENERATOR_REQUEST_REFILL"; amount: number | "max" }
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
  // Per-workbench keep-in-stock targets for workbench recipes
  | { type: "SET_KEEP_STOCK_TARGET"; workbenchId: string; recipeId: string; amount: number; enabled: boolean }
  // Per-recipe automation policy overrides
  | { type: "SET_RECIPE_AUTOMATION_POLICY"; recipeId: string; patch: RecipeAutomationPolicyPatch }
  // Production zones
  | { type: "CREATE_ZONE"; name?: string }
  | { type: "DELETE_ZONE"; zoneId: string }
  | { type: "SET_BUILDING_ZONE"; buildingId: string; zoneId: string | null }
  // Starter drone state machine tick
  | { type: "DRONE_TICK" }
  // Service hub target stock adjustment
  | { type: "SET_HUB_TARGET_STOCK"; hubId: string; resource: CollectableItemType; amount: number }
  // Hub upgrade from Tier 1 to Tier 2
  | { type: "UPGRADE_HUB"; hubId: string }
  /**
   * Explicitly assign a drone to a hub. The drone is immediately repositioned
   * to the hub's dock slot and any in-progress task is aborted cleanly.
   * This is the ONLY way a drone changes its homeHub after initial game setup.
   */
  | { type: "ASSIGN_DRONE_TO_HUB"; droneId: string; hubId: string }
  /**
   * Set the preferred role for a drone. Only meaningful for Tier 2 hubs.
   * The UI enforces this but the reducer does not check tier — game logic is
   * always valid (role is purely an advisory scoring hint).
   */
  | { type: "DRONE_SET_ROLE"; droneId: string; role: DroneRole }
  // Inventory-network reservations (Step 2)
  | NetworkAction
  // Crafting jobs (Step 3)
  | CraftingAction;
