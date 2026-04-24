import type { DroneTaskType } from "../../store/types";
import { DRONE_TASK_BASE_SCORE } from "./scoring-constants";

export interface ScoreDroneTaskDeps {
  taskBaseScore: Readonly<Record<DroneTaskType, number>>;
}

export type ScoreDroneTaskBonuses = {
  role?: number;
  sticky?: number;
  urgency?: number;
  demand?: number;
  spread?: number;
};

const defaultScoreDroneTaskDeps: ScoreDroneTaskDeps = {
  taskBaseScore: DRONE_TASK_BASE_SCORE,
};

/**
 * Scores a single drone task candidate.
 * score = BASE_PRIORITY[taskType] - chebyshevDistance(drone -> collectionNode) + bonuses
 * Higher score = preferred.
 */
export function scoreDroneTask(
  taskType: DroneTaskType,
  droneX: number,
  droneY: number,
  nodeX: number,
  nodeY: number,
  bonuses: ScoreDroneTaskBonuses = {},
  deps: ScoreDroneTaskDeps = defaultScoreDroneTaskDeps,
): number {
  const dist = Math.max(Math.abs(droneX - nodeX), Math.abs(droneY - nodeY));
  const { role = 0, sticky = 0, urgency = 0, demand = 0, spread = 0 } = bonuses;
  return deps.taskBaseScore[taskType] - dist + role + sticky + urgency + demand + spread;
}
