import type { GameAction } from "../reducer";
import type {
  CollectableItemType,
  GameNotification,
  GameState,
  Inventory,
  ServiceHubEntry,
} from "../types";
import type { FloorPlacementEligibilityResult } from "../helpers/floorPlacement";

export interface FloorPlacementActionDeps {
  GRID_W: number;
  GRID_H: number;
  FLOOR_TILE_COSTS: Record<
    NonNullable<GameState["selectedFloorTile"]>,
    Partial<Record<keyof Inventory, number>>
  >;
  cellKey(x: number, y: number): string;
  hasResources(
    inv: Inventory,
    costs: Partial<Record<keyof Inventory, number>>,
  ): boolean;
  getEffectiveBuildInventory(state: GameState): Inventory;
  addErrorNotification(
    notifications: GameNotification[],
    message: string,
  ): GameNotification[];
  checkFloorPlacementEligibility(input: {
    tileType: NonNullable<GameState["selectedFloorTile"]>;
    x: number;
    y: number;
    floorMap: GameState["floorMap"];
    cellMap: GameState["cellMap"];
  }): FloorPlacementEligibilityResult;
  mapFloorPlacementError(
    blockReason: Extract<
      FloorPlacementEligibilityResult,
      { eligible: false }
    >["blockReason"],
  ): string;
  consumeBuildResources(
    state: GameState,
    costs: Partial<Record<keyof Inventory, number>>,
  ): {
    inventory: Inventory;
    warehouseInventories: Record<string, Inventory>;
    serviceHubs: Record<string, ServiceHubEntry>;
    remaining: Partial<Record<CollectableItemType, number>>;
  };
  debugLog: {
    building(message: string): void;
  };
}

export function handleFloorPlacementAction(
  state: GameState,
  action: GameAction,
  deps: FloorPlacementActionDeps,
): GameState | null {
  switch (action.type) {
    case "BUILD_PLACE_FLOOR_TILE": {
      if (!state.buildMode || !state.selectedFloorTile) return state;

      const tileType = state.selectedFloorTile;
      const { x, y } = action;
      if (x < 0 || y < 0 || x >= deps.GRID_W || y >= deps.GRID_H) return state;

      const key = deps.cellKey(x, y);
      const tileCosts = deps.FLOOR_TILE_COSTS[tileType];
      const costs = tileCosts as Partial<Record<keyof Inventory, number>>;
      if (!deps.hasResources(deps.getEffectiveBuildInventory(state), costs)) {
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            "Nicht genug Ressourcen!",
          ),
        };
      }

      const eligibilityDecision = deps.checkFloorPlacementEligibility({
        tileType,
        x,
        y,
        floorMap: state.floorMap,
        cellMap: state.cellMap,
      });
      if (!eligibilityDecision.eligible) {
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            deps.mapFloorPlacementError(eligibilityDecision.blockReason),
          ),
        };
      }

      if (tileType === "stone_floor") {
        const newFloorMap = { ...state.floorMap, [key]: "stone_floor" as const };
        const consumed = deps.consumeBuildResources(state, costs);
        deps.debugLog.building(`[BuildMode] Placed stone_floor at (${x},${y})`);
        return {
          ...state,
          floorMap: newFloorMap,
          inventory: consumed.inventory,
          warehouseInventories: consumed.warehouseInventories,
          serviceHubs: consumed.serviceHubs,
        };
      }

      const newFloorMap = { ...state.floorMap };
      delete newFloorMap[key];
      const consumed = deps.consumeBuildResources(state, costs);
      deps.debugLog.building(
        `[BuildMode] Placed grass_block at (${x},${y}) – stone floor removed`,
      );
      return {
        ...state,
        floorMap: newFloorMap,
        inventory: consumed.inventory,
        warehouseInventories: consumed.warehouseInventories,
        serviceHubs: consumed.serviceHubs,
      };
    }

    default:
      return null;
  }
}
