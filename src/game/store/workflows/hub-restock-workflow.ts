// ============================================================
// Hub restock workflow decisions
// ------------------------------------------------------------
// Pure decision layer for hub_restock candidate emission.
// Reducer remains responsible for applying emitted actions.
// ============================================================

import {
  DRONE_STICKY_BONUS,
  DRONE_TASK_BASE_SCORE,
  DRONE_URGENCY_BONUS_MAX,
} from "../constants/drone-config";
import type { CollectableItemType } from "../types";

export interface HubRestockNodeDecisionInput {
  nodeId: string;
  itemType: CollectableItemType;
  tileX: number;
  tileY: number;
  reservedByDroneId: string | null;
  remainingNeed: number;
  openSlots: number;
}

export interface HubRestockCandidate {
  taskType: "hub_restock";
  nodeId: string;
  deliveryTargetId: string;
  score: number;
  _roleBonus: number;
  _stickyBonus: number;
  _urgencyBonus: number;
  _demandBonus: number;
  _spreadPenalty: number;
}

export type HubRestockWorkflowAction = {
  type: "queue_restock_candidate";
  candidate: HubRestockCandidate;
};

export interface DecideHubRestockInput {
  droneId: string;
  hubId: string;
  droneTileX: number;
  droneTileY: number;
  roleBonus: number;
  nodes: readonly HubRestockNodeDecisionInput[];
}

function chebyshevDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function decideHubRestockActions(
  input: DecideHubRestockInput,
): HubRestockWorkflowAction[] {
  const actions: HubRestockWorkflowAction[] = [];

  for (const node of input.nodes) {
    if (node.remainingNeed <= 0 || node.openSlots <= 0) continue;

    const stickyBonus =
      node.reservedByDroneId === input.droneId ? DRONE_STICKY_BONUS : 0;
    const urgencyBonus = Math.min(DRONE_URGENCY_BONUS_MAX, node.remainingNeed);
    const distance = chebyshevDistance(
      input.droneTileX,
      input.droneTileY,
      node.tileX,
      node.tileY,
    );
    const score =
      DRONE_TASK_BASE_SCORE.hub_restock -
      distance +
      input.roleBonus +
      stickyBonus +
      urgencyBonus;

    actions.push({
      type: "queue_restock_candidate",
      candidate: {
        taskType: "hub_restock",
        nodeId: node.nodeId,
        deliveryTargetId: input.hubId,
        score,
        _roleBonus: input.roleBonus,
        _stickyBonus: stickyBonus,
        _urgencyBonus: urgencyBonus,
        _demandBonus: 0,
        _spreadPenalty: 0,
      },
    });
  }

  return actions;
}
