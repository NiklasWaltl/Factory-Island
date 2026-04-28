// ============================================================
// Drone scheduler slice: choose next task from scored candidates.
// ------------------------------------------------------------
// Pure decision step extracted from reducer task-selection flow.
// No reducer imports to avoid runtime cycles.
// ============================================================

import type { DroneTaskType } from "../types";

type SchedulableDroneTaskCandidate = {
  taskType: DroneTaskType;
  nodeId: string;
  deliveryTargetId: string;
  score: number;
};

function isBetterCandidate(
  candidate: SchedulableDroneTaskCandidate,
  currentBest: SchedulableDroneTaskCandidate,
): boolean {
  if (candidate.score !== currentBest.score) {
    return candidate.score > currentBest.score;
  }
  // Deterministic tie-break: lexicographically smaller nodeId wins.
  return candidate.nodeId.localeCompare(currentBest.nodeId) < 0;
}

export function scheduleNextDroneTask<T extends SchedulableDroneTaskCandidate>(
  candidates: readonly T[],
): T | null {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (isBetterCandidate(candidate, best)) {
      best = candidate;
    }
  }

  return best;
}
