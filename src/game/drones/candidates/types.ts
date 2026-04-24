import type { DroneTaskType } from "../../store/types";

export type DroneSelectionCandidate = {
  taskType: DroneTaskType;
  nodeId: string;
  deliveryTargetId: string;
  score: number;
  _roleBonus: number;
  _stickyBonus: number;
  _urgencyBonus: number;
  _demandBonus: number;
  _spreadPenalty: number;
};
