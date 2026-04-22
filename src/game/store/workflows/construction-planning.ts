// ============================================================
// Construction planning workflow decisions
// ------------------------------------------------------------
// Pure decision layer for construction_supply candidate emission.
// Reducer remains responsible for applying emitted actions.
// ============================================================

import {
  DRONE_DEMAND_BONUS_MAX,
  DRONE_SPREAD_PENALTY_PER_DRONE,
  DRONE_STICKY_BONUS,
  DRONE_TASK_BASE_SCORE,
} from "../constants/drone-config";
import type { CollectableItemType } from "../types";

export interface ConstructionPlanningNodeInput {
  nodeId: string;
  itemType: CollectableItemType;
  tileX: number;
  tileY: number;
  reservedByDroneId: string | null;
}

export interface ConstructionPlanningNeedInput {
  itemType: CollectableItemType;
  remainingNeed: number;
}

export interface ConstructionSupplyCandidate {
  taskType: "construction_supply";
  nodeId: string;
  deliveryTargetId: string;
  score: number;
  _roleBonus: number;
  _stickyBonus: number;
  _urgencyBonus: number;
  _demandBonus: number;
  _spreadPenalty: number;
}

export type ConstructionPlanningAction = {
  type: "queue_site_supply_candidate";
  candidate: ConstructionSupplyCandidate;
};

export interface DecideConstructionPlanningInput {
  droneId: string;
  droneTileX: number;
  droneTileY: number;
  roleBonus: number;
  siteId: string;
  openSlots: number;
  assignedConstructionDrones: number;
  siteNeeds: readonly ConstructionPlanningNeedInput[];
  availableNodes: readonly ConstructionPlanningNodeInput[];
}

function chebyshevDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function decideConstructionPlanningActions(
  input: DecideConstructionPlanningInput,
): ConstructionPlanningAction[] {
  if (input.openSlots <= 0) return [];

  const actions: ConstructionPlanningAction[] = [];
  const spreadPenalty =
    -DRONE_SPREAD_PENALTY_PER_DRONE * input.assignedConstructionDrones;

  for (const need of input.siteNeeds) {
    if (need.remainingNeed <= 0) continue;

    const demandBonus = Math.min(DRONE_DEMAND_BONUS_MAX, need.remainingNeed);

    for (const node of input.availableNodes) {
      if (node.itemType !== need.itemType) continue;

      const stickyBonus =
        node.reservedByDroneId === input.droneId ? DRONE_STICKY_BONUS : 0;
      const distance = chebyshevDistance(
        input.droneTileX,
        input.droneTileY,
        node.tileX,
        node.tileY,
      );
      const score =
        DRONE_TASK_BASE_SCORE.construction_supply -
        distance +
        input.roleBonus +
        stickyBonus +
        demandBonus +
        spreadPenalty;

      actions.push({
        type: "queue_site_supply_candidate",
        candidate: {
          taskType: "construction_supply",
          nodeId: node.nodeId,
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
  }

  return actions;
}
