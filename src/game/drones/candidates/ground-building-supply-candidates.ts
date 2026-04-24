import type {
  CollectableItemType,
  CollectionNode,
  DroneTaskType,
  GameState,
  StarterDroneState,
} from "../../store/types";
import type { DroneSelectionCandidate } from "./types";

export interface GroundBuildingSupplyCandidateConstants {
  demandBonusMax: number;
  stickyBonus: number;
  spreadPenaltyPerDrone: number;
}

export interface GroundBuildingSupplyCandidateDeps {
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
  scoreDroneTask: (
    taskType: DroneTaskType,
    droneX: number,
    droneY: number,
    nodeX: number,
    nodeY: number,
    bonuses?: { role?: number; sticky?: number; urgency?: number; demand?: number; spread?: number },
  ) => number;
}

export function gatherGroundBuildingSupplyCandidates(
  state: Pick<GameState, "assets" | "constructionSites" | "generators" | "drones" | "collectionNodes">,
  drone: Pick<StarterDroneState, "droneId" | "tileX" | "tileY">,
  availableNodes: readonly CollectionNode[],
  availableTypes: ReadonlySet<CollectableItemType>,
  constants: GroundBuildingSupplyCandidateConstants,
  deps: GroundBuildingSupplyCandidateDeps,
): DroneSelectionCandidate[] {
  const candidates: DroneSelectionCandidate[] = [];

  for (const target of deps.getBuildingInputTargets(state)) {
    if (deps.isUnderConstruction(state, target.assetId)) continue;
    if (!availableTypes.has(target.resource)) continue;
    const remainingDemand = deps.getRemainingBuildingInputDemand(state, target.assetId, target.resource, drone.droneId);
    if (remainingDemand <= 0) continue;
    const openSlots = deps.getOpenBuildingSupplyDroneSlots(state, target.assetId, target.resource, drone.droneId);
    if (openSlots <= 0) continue;
    const assignedSoFar = deps.getAssignedBuildingSupplyDroneCount(state, target.assetId, drone.droneId);
    const spreadPenalty = -constants.spreadPenaltyPerDrone * assignedSoFar;
    const demandBonus = Math.min(constants.demandBonusMax, remainingDemand);
    for (const node of availableNodes) {
      if (node.itemType !== target.resource) continue;
      const stickyBonus = node.reservedByDroneId === drone.droneId ? constants.stickyBonus : 0;
      candidates.push({
        taskType: "building_supply",
        nodeId: node.id,
        deliveryTargetId: target.assetId,
        score: deps.scoreDroneTask("building_supply", drone.tileX, drone.tileY, node.tileX, node.tileY, {
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
  }

  return candidates;
}
