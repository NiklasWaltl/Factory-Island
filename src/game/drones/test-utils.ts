import {
  addToCollectionNodeAt,
  createInitialState,
  gameReducer,
  getDroneDockOffset,
  getMaxDrones,
  MAP_SHOP_POS,
} from "../store/reducer";
import type {
  CollectionNode,
  CollectableItemType,
  ConstructionSite,
  GameState,
  Inventory,
  ServiceHubEntry,
  StarterDroneState,
} from "../store/types";
import type { GameAction } from "../store/actions";

export {
  BUILDING_COSTS,
  createDefaultHubTargetStock,
  createEmptyHubInventory,
  DRONE_CAPACITY,
  DRONE_COLLECT_TICKS,
  DRONE_DEMAND_BONUS_MAX,
  DRONE_DEPOSIT_TICKS,
  DRONE_ROLE_BONUS,
  DRONE_SPREAD_PENALTY_PER_DRONE,
  DRONE_STICKY_BONUS,
  DRONE_TASK_BASE_SCORE,
  DRONE_URGENCY_BONUS_MAX,
  getDroneHomeDock,
  getParkedDrones,
  MAX_DRONES_PER_CONSTRUCTION_TARGET,
  MAX_HUB_TARGET_STOCK,
  PROTO_HUB_TARGET_STOCK,
  scoreDroneTask,
  selectDroneTask,
  SERVICE_HUB_TARGET_STOCK,
} from "../store/reducer";

export { addToCollectionNodeAt, createInitialState, gameReducer, MAP_SHOP_POS };

export type {
  CollectionNode,
  CollectableItemType,
  ConstructionSite,
  GameAction,
  GameState,
  Inventory,
  ServiceHubEntry,
  StarterDroneState,
};

/** Proto-hub is placed at MAP_SHOP_POS.x + 3 in createInitialState. */
export const HUB_POS = { x: MAP_SHOP_POS.x + 3, y: MAP_SHOP_POS.y };

export function droneTick(state: GameState): GameState {
  return gameReducer(state, { type: "DRONE_TICK" });
}

export function withDrone(
  state: GameState,
  patch: Partial<StarterDroneState>,
): GameState {
  return { ...state, starterDrone: { ...state.starterDrone, ...patch } };
}

export function addNode(
  state: GameState,
  itemType: CollectionNode["itemType"],
  tileX: number,
  tileY: number,
  amount: number,
): GameState {
  return {
    ...state,
    collectionNodes: addToCollectionNodeAt(
      state.collectionNodes,
      itemType,
      tileX,
      tileY,
      amount,
    ),
  };
}

export function withTier2HubAndDockedDrones(
  state: GameState,
  hubId: string,
): GameState {
  const hub = state.serviceHubs[hubId];
  const hubAsset = state.assets[hubId];
  if (!hub || !hubAsset) return state;

  const targetDroneCount = getMaxDrones(2);
  const nextDrones = { ...state.drones };
  const nextHubDroneIds = [...hub.droneIds];
  let seq = 1;

  while (nextHubDroneIds.length < targetDroneCount) {
    const droneId = `test-drone-${hubId}-${seq++}`;
    if (nextDrones[droneId]) continue;
    const dockSlot = nextHubDroneIds.length;
    const offset = getDroneDockOffset(dockSlot);
    nextDrones[droneId] = {
      status: "idle",
      tileX: hubAsset.x + offset.dx,
      tileY: hubAsset.y + offset.dy,
      targetNodeId: null,
      cargo: null,
      ticksRemaining: 0,
      hubId,
      currentTaskType: null,
      deliveryTargetId: null,
      craftingJobId: null,
      droneId,
    };
    nextHubDroneIds.push(droneId);
  }

  return {
    ...state,
    drones: nextDrones,
    serviceHubs: {
      ...state.serviceHubs,
      [hubId]: {
        ...hub,
        tier: 2,
        pendingUpgrade: undefined,
        droneIds: nextHubDroneIds,
      },
    },
  };
}

/**
 * Place a service_hub via reducer and return updated state + hub asset ID.
 * Explicitly assigns the starter drone to the new hub via ASSIGN_DRONE_TO_HUB.
 */
export function placeServiceHub(
  state: GameState,
  x: number,
  y: number,
): { state: GameState; hubId: string } {
  const clearedCellMap = { ...state.cellMap };
  const clearedAssets = { ...state.assets };
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const key = `${x + dx},${y + dy}`;
      const occupant = clearedCellMap[key];
      if (occupant && !clearedAssets[occupant]?.fixed) {
        delete clearedAssets[occupant];
        delete clearedCellMap[key];
      }
    }
  }

  let s: GameState = {
    ...state,
    assets: clearedAssets,
    cellMap: clearedCellMap,
    buildMode: true,
    selectedBuildingType: "service_hub" as GameState["selectedBuildingType"],
  };

  const existingHubIds = new Set(
    Object.keys(state.assets).filter((id) => state.assets[id].type === "service_hub"),
  );
  s = gameReducer(s, { type: "BUILD_PLACE_BUILDING", x, y });
  const hubId = Object.keys(s.assets).find(
    (id) => s.assets[id].type === "service_hub" && !existingHubIds.has(id),
  );
  if (!hubId) throw new Error("service_hub placement failed");

  const { [hubId]: _site, ...restSites } = s.constructionSites;
  s = { ...s, constructionSites: restSites };
  s = gameReducer(s, {
    type: "ASSIGN_DRONE_TO_HUB",
    droneId: s.starterDrone.droneId,
    hubId,
  });

  return { state: s, hubId };
}

export function placeBuilding(
  state: GameState,
  bType: string,
  x: number,
  y: number,
): GameState {
  const clearedCellMap = { ...state.cellMap };
  const clearedAssets = { ...state.assets };
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const key = `${x + dx},${y + dy}`;
      const occupant = clearedCellMap[key];
      if (occupant && !clearedAssets[occupant]?.fixed) {
        delete clearedAssets[occupant];
        delete clearedCellMap[key];
      }
    }
  }

  const s: GameState = {
    ...state,
    assets: clearedAssets,
    cellMap: clearedCellMap,
    buildMode: true,
    selectedBuildingType: bType as GameState["selectedBuildingType"],
  };

  return gameReducer(s, { type: "BUILD_PLACE_BUILDING", x, y });
}

export function withHubInventory(
  state: GameState,
  hubId: string,
  inv: Partial<Record<"wood" | "stone" | "iron" | "copper", number>>,
): GameState {
  const entry = state.serviceHubs[hubId];
  if (!entry) throw new Error(`No hub entry for ${hubId}`);

  return {
    ...state,
    serviceHubs: {
      ...state.serviceHubs,
      [hubId]: { ...entry, inventory: { ...entry.inventory, ...inv } },
    },
  };
}