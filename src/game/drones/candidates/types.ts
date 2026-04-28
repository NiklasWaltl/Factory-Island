// To add a new drone task type, touch all four of these locations in order:
//   1. store/types.ts          — add the new literal to DroneTaskType
//   2. candidates/             — create a new *-candidates.ts file that returns DroneSelectionCandidate[]
//   3. candidates/scoring/scoring-constants.ts — add a base score entry for the new type
//   4. selection/select-drone-task-bindings.ts — call the new candidates function and merge results

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
