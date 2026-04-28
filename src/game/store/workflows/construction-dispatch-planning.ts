// ============================================================
// Construction dispatch planning workflow decisions
// ------------------------------------------------------------
// Pure decision layer for hub_dispatch candidate emission.
// Reducer remains responsible for applying emitted actions.
// ============================================================

import {
  DRONE_DEMAND_BONUS_MAX,
  DRONE_SPREAD_PENALTY_PER_DRONE,
  DRONE_STICKY_BONUS,
  DRONE_TASK_BASE_SCORE,
} from "../constants/drone-config";
import type { CollectableItemType } from "../types";

export interface ConstructionDispatchNeedInput {
  itemType: CollectableItemType;
  remainingNeed: number;
  availableHubSupply: number;
}

export interface ConstructionHubDispatchCandidate {
  taskType: "hub_dispatch";
  nodeId: string;
  deliveryTargetId: string;
  score: number;
  _roleBonus: number;
  _stickyBonus: number;
  _urgencyBonus: number;
  _demandBonus: number;
  _spreadPenalty: number;
}

export type ConstructionDispatchPlanningAction = {
  type: "queue_hub_dispatch_candidate";
  candidate: ConstructionHubDispatchCandidate;
};

export interface DecideConstructionDispatchPlanningInput {
  droneTileX: number;
  droneTileY: number;
  roleBonus: number;
  stickyNodeId: string | null;
  siteId: string;
  hubId: string;
  hubTileX: number;
  hubTileY: number;
  openSlots: number;
  assignedConstructionDrones: number;
  needs: readonly ConstructionDispatchNeedInput[];
}

function chebyshevDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function decideConstructionDispatchPlanningActions(
  input: DecideConstructionDispatchPlanningInput,
): ConstructionDispatchPlanningAction[] {
  if (input.openSlots <= 0) return [];

  const actions: ConstructionDispatchPlanningAction[] = [];
  const spreadPenalty =
    -DRONE_SPREAD_PENALTY_PER_DRONE * input.assignedConstructionDrones;
  const distanceToHub = chebyshevDistance(
    input.droneTileX,
    input.droneTileY,
    input.hubTileX,
    input.hubTileY,
  );

  for (const need of input.needs) {
    if (need.remainingNeed <= 0 || need.availableHubSupply <= 0) continue;

    const demandBonus = Math.min(DRONE_DEMAND_BONUS_MAX, need.remainingNeed);
    const syntheticNodeId = `hub:${input.hubId}:${need.itemType}`;
    const stickyBonus =
      input.stickyNodeId === syntheticNodeId ? DRONE_STICKY_BONUS : 0;
    const score =
      DRONE_TASK_BASE_SCORE.hub_dispatch -
      distanceToHub +
      input.roleBonus +
      stickyBonus +
      demandBonus +
      spreadPenalty;

    actions.push({
      type: "queue_hub_dispatch_candidate",
      candidate: {
        taskType: "hub_dispatch",
        nodeId: syntheticNodeId,
        deliveryTargetId: input.siteId,
        score,
        _roleBonus: input.roleBonus,
        _stickyBonus: stickyBonus,
        _urgencyBonus: 0,
        _demandBonus: demandBonus,
        _spreadPenalty: spreadPenalty,
      },
    });
  }

  return actions;
}
