import type {
  CollectableItemType,
  DroneTaskType,
  GameState,
  StarterDroneState,
} from "../../store/types";
import type { DroneSelectionCandidate } from "./types";

interface NearbyWarehouseDispatchCandidate {
  readonly warehouseId: string;
  readonly x: number;
  readonly y: number;
  readonly available: number;
  readonly distance: number;
}

export interface WarehouseConstructionCandidateConstants {
  demandBonusMax: number;
  stickyBonus: number;
  spreadPenaltyPerDrone: number;
  warehousePriorityBonus: number;
}

export interface WarehouseConstructionCandidateDeps {
  getOpenConstructionDroneSlots: (
    state: Pick<GameState, "drones" | "constructionSites">,
    siteId: string,
    excludeDroneId?: string,
  ) => number;
  getAssignedConstructionDroneCount: (
    state: Pick<GameState, "drones">,
    siteId: string,
    excludeDroneId?: string,
  ) => number;
  getRemainingConstructionNeed: (
    state: Pick<GameState, "drones" | "collectionNodes" | "constructionSites">,
    siteId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getNearbyWarehousesForDispatch: (
    state: GameState,
    fromX: number,
    fromY: number,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => NearbyWarehouseDispatchCandidate[];
  scoreDroneTask: (
    taskType: DroneTaskType,
    droneX: number,
    droneY: number,
    nodeX: number,
    nodeY: number,
    bonuses?: { role?: number; sticky?: number; urgency?: number; demand?: number; spread?: number },
  ) => number;
}

/**
 * Gather warehouse-source candidates for construction (PRIMARY over hub).
 * Same task_type "hub_dispatch" + same delivery target, but the synthetic
 * nodeId encodes a warehouse source ("wh:{warehouseId}:{resource}"). The
 * warehousePriorityBonus is added on top of the hub_dispatch base score so a
 * warehouse beats the hub at equal distance and stays preferred unless the
 * hub is dramatically closer.
 */
export function gatherWarehouseConstructionCandidates(
  state: GameState,
  drone: Pick<StarterDroneState, "droneId" | "tileX" | "tileY" | "targetNodeId">,
  constructionRoleBonus: number,
  constants: WarehouseConstructionCandidateConstants,
  deps: WarehouseConstructionCandidateDeps,
): DroneSelectionCandidate[] {
  const candidates: DroneSelectionCandidate[] = [];

  for (const [siteId, site] of Object.entries(state.constructionSites)) {
    if (!state.assets[siteId]) continue;
    const openSlots = deps.getOpenConstructionDroneSlots(state, siteId, drone.droneId);
    if (openSlots <= 0) continue;
    const assignedSoFar = deps.getAssignedConstructionDroneCount(state, siteId, drone.droneId);
    const spreadPenalty = -constants.spreadPenaltyPerDrone * assignedSoFar;
    for (const [res, amt] of Object.entries(site.remaining)) {
      if ((amt ?? 0) <= 0) continue;
      const itemType = res as CollectableItemType;
      const remainingNeed = deps.getRemainingConstructionNeed(state, siteId, itemType, drone.droneId);
      if (remainingNeed <= 0) continue;
      const demandBonus = Math.min(constants.demandBonusMax, remainingNeed);
      const nearby = deps.getNearbyWarehousesForDispatch(state, drone.tileX, drone.tileY, itemType, drone.droneId);
      for (const wh of nearby) {
        const syntheticNodeId = `wh:${wh.warehouseId}:${itemType}`;
        const stickyBonus = drone.targetNodeId === syntheticNodeId ? constants.stickyBonus : 0;
        const score = deps.scoreDroneTask("hub_dispatch", drone.tileX, drone.tileY, wh.x, wh.y, {
          role: constructionRoleBonus,
          sticky: stickyBonus,
          demand: demandBonus,
          spread: spreadPenalty,
        }) + constants.warehousePriorityBonus;
        candidates.push({
          taskType: "hub_dispatch",
          nodeId: syntheticNodeId,
          deliveryTargetId: siteId,
          score,
          _roleBonus: constructionRoleBonus,
          _stickyBonus: stickyBonus,
          _urgencyBonus: 0,
          _demandBonus: demandBonus,
          _spreadPenalty: spreadPenalty,
        });
      }
    }
  }

  return candidates;
}
