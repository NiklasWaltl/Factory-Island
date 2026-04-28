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

export interface WarehouseSupplyCandidateConstants {
  demandBonusMax: number;
  stickyBonus: number;
  spreadPenaltyPerDrone: number;
  warehousePriorityBonus: number;
}

export interface WarehouseSupplyCandidateDeps {
  getBuildingInputTargets: (
    state: Pick<GameState, "assets">,
  ) => { assetId: string; resource: CollectableItemType; capacity: number }[];
  isUnderConstruction: (state: Pick<GameState, "constructionSites">, assetId: string) => boolean;
  getRemainingBuildingInputDemand: (
    state: Pick<GameState, "assets" | "generators" | "drones" | "collectionNodes">,
    assetId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getOpenBuildingSupplyDroneSlots: (
    state: Pick<GameState, "assets" | "generators" | "drones">,
    assetId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getAssignedBuildingSupplyDroneCount: (
    state: Pick<GameState, "drones">,
    assetId: string,
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

export function gatherWarehouseBuildingSupplyCandidates(
  state: GameState,
  drone: Pick<StarterDroneState, "droneId" | "tileX" | "tileY" | "targetNodeId">,
  constants: WarehouseSupplyCandidateConstants,
  deps: WarehouseSupplyCandidateDeps,
): DroneSelectionCandidate[] {
  const candidates: DroneSelectionCandidate[] = [];

  for (const target of deps.getBuildingInputTargets(state)) {
    if (deps.isUnderConstruction(state, target.assetId)) continue;
    const remainingDemand = deps.getRemainingBuildingInputDemand(state, target.assetId, target.resource, drone.droneId);
    if (remainingDemand <= 0) continue;
    const openSlots = deps.getOpenBuildingSupplyDroneSlots(state, target.assetId, target.resource, drone.droneId);
    if (openSlots <= 0) continue;
    const assignedSoFar = deps.getAssignedBuildingSupplyDroneCount(state, target.assetId, drone.droneId);
    const spreadPenalty = -constants.spreadPenaltyPerDrone * assignedSoFar;
    const demandBonus = Math.min(constants.demandBonusMax, remainingDemand);
    const nearby = deps.getNearbyWarehousesForDispatch(state, drone.tileX, drone.tileY, target.resource, drone.droneId);
    for (const warehouse of nearby) {
      const syntheticNodeId = `wh:${warehouse.warehouseId}:${target.resource}`;
      const stickyBonus = drone.targetNodeId === syntheticNodeId ? constants.stickyBonus : 0;
      const score = deps.scoreDroneTask("building_supply", drone.tileX, drone.tileY, warehouse.x, warehouse.y, {
        sticky: stickyBonus,
        demand: demandBonus,
        spread: spreadPenalty,
      }) + constants.warehousePriorityBonus;
      candidates.push({
        taskType: "building_supply",
        nodeId: syntheticNodeId,
        deliveryTargetId: target.assetId,
        score,
        _roleBonus: 0,
        _stickyBonus: stickyBonus,
        _urgencyBonus: 0,
        _demandBonus: demandBonus,
        _spreadPenalty: spreadPenalty,
      });
    }
  }

  return candidates;
}