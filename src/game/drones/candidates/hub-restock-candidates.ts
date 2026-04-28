import type {
  CollectionNode,
  CollectableItemType,
  DroneTaskType,
  GameState,
  StarterDroneState,
} from "../../store/types";
import type { DroneSelectionCandidate } from "./types";

export interface HubRestockCandidateConstants {
  stickyBonus: number;
  urgencyBonusMax: number;
}

export interface HubRestockCandidateDeps {
  getRemainingHubRestockNeed: (
    state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
    hubId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getOpenHubRestockDroneSlots: (
    state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
    hubId: string,
    itemType: CollectableItemType,
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

export function gatherHubRestockCandidates(
  state: Pick<GameState, "drones" | "collectionNodes" | "serviceHubs" | "constructionSites">,
  drone: Pick<StarterDroneState, "droneId" | "tileX" | "tileY">,
  hubId: string,
  availableNodes: readonly CollectionNode[],
  restockRoleBonus: number,
  constants: HubRestockCandidateConstants,
  deps: HubRestockCandidateDeps,
): DroneSelectionCandidate[] {
  const candidates: DroneSelectionCandidate[] = [];

  for (const node of availableNodes) {
    const remainingNeed = deps.getRemainingHubRestockNeed(state, hubId, node.itemType, drone.droneId);
    const openSlots = deps.getOpenHubRestockDroneSlots(state, hubId, node.itemType, drone.droneId);
    if (remainingNeed <= 0 || openSlots <= 0) continue;
    const stickyBonus = node.reservedByDroneId === drone.droneId ? constants.stickyBonus : 0;
    const urgencyBonus = Math.min(constants.urgencyBonusMax, remainingNeed);
    candidates.push({
      taskType: "hub_restock",
      nodeId: node.id,
      deliveryTargetId: hubId,
      score: deps.scoreDroneTask("hub_restock", drone.tileX, drone.tileY, node.tileX, node.tileY, {
        role: restockRoleBonus,
        sticky: stickyBonus,
        urgency: urgencyBonus,
      }),
      _roleBonus: restockRoleBonus,
      _stickyBonus: stickyBonus,
      _urgencyBonus: urgencyBonus,
      _demandBonus: 0,
      _spreadPenalty: 0,
    });
  }

  return candidates;
}