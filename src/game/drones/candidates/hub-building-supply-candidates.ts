import type {
  CollectableItemType,
  DroneTaskType,
  GameState,
  StarterDroneState,
} from "../../store/types";
import type { DroneSelectionCandidate } from "./types";

export interface HubBuildingSupplyCandidateConstants {
  demandBonusMax: number;
  stickyBonus: number;
  spreadPenaltyPerDrone: number;
}

export interface HubBuildingSupplyCandidateDeps {
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
  getAvailableHubDispatchSupply: (
    state: Pick<GameState, "drones" | "serviceHubs" | "constructionSites">,
    hubId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getAssignedBuildingSupplyDroneCount: (
    state: Pick<GameState, "drones">,
    assetId: string,
    excludeDroneId?: string,
  ) => number;
  scoreDroneTask: (
    taskType: DroneTaskType,
    droneX: number,
    droneY: number,
    nodeX: number,
    nodeY: number,
    bonuses?: { role?: number; sticky?: number; urgency?: number; demand?: number; spread?: number },
  ) => number;
}

export function gatherHubBuildingSupplyCandidates(
  state: GameState,
  drone: Pick<StarterDroneState, "droneId" | "hubId" | "tileX" | "tileY" | "targetNodeId">,
  constants: HubBuildingSupplyCandidateConstants,
  deps: HubBuildingSupplyCandidateDeps,
): DroneSelectionCandidate[] {
  if (!drone.hubId) return [];

  const hubAsset = state.assets[drone.hubId];
  if (!hubAsset) return [];

  const candidates: DroneSelectionCandidate[] = [];

  for (const target of deps.getBuildingInputTargets(state)) {
    if (deps.isUnderConstruction(state, target.assetId)) continue;
    const remainingDemand = deps.getRemainingBuildingInputDemand(
      state,
      target.assetId,
      target.resource,
      drone.droneId,
    );
    if (remainingDemand <= 0) continue;
    const openSlots = deps.getOpenBuildingSupplyDroneSlots(state, target.assetId, target.resource, drone.droneId);
    if (openSlots <= 0) continue;
    const availableHubSupply = deps.getAvailableHubDispatchSupply(state, drone.hubId, target.resource, drone.droneId);
    if (availableHubSupply <= 0) continue;
    const assignedSoFar = deps.getAssignedBuildingSupplyDroneCount(state, target.assetId, drone.droneId);
    const spreadPenalty = -constants.spreadPenaltyPerDrone * assignedSoFar;
    const demandBonus = Math.min(constants.demandBonusMax, remainingDemand);
    const syntheticNodeId = `hub:${drone.hubId}:${target.resource}`;
    const stickyBonus = drone.targetNodeId === syntheticNodeId ? constants.stickyBonus : 0;
    candidates.push({
      taskType: "building_supply",
      nodeId: syntheticNodeId,
      deliveryTargetId: target.assetId,
      score: deps.scoreDroneTask("building_supply", drone.tileX, drone.tileY, hubAsset.x, hubAsset.y, {
        sticky: stickyBonus,
        demand: demandBonus,
        spread: spreadPenalty,
      }),
      _roleBonus: 0,
      _stickyBonus: stickyBonus,
      _urgencyBonus: 0,
      _demandBonus: demandBonus,
      _spreadPenalty: spreadPenalty,
    });
  }

  return candidates;
}
