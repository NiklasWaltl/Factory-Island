import {
  DRONE_SEPARATION_RADIUS,
  DRONE_SEPARATION_STRENGTH,
  DRONE_SPEED_TILES_PER_TICK,
} from "../store/constants/drone-config";
import { GRID_H, GRID_W } from "../constants/grid";
import type { StarterDroneState } from "../store/types";

/**
 * Ticks for the drone to travel between two tile positions (Chebyshev distance,
 * rounded up to at least 1).
 */
export function droneTravelTicks(x1: number, y1: number, x2: number, y2: number): number {
  const dist = Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
  return Math.max(1, Math.ceil(dist / DRONE_SPEED_TILES_PER_TICK));
}

export function moveDroneToward(
  fromX: number, fromY: number,
  toX: number, toY: number,
  maxStep: number,
): { x: number; y: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (dist <= maxStep) return { x: toX, y: toY };
  const ratio = maxStep / dist;
  return {
    x: Math.round(fromX + dx * ratio),
    y: Math.round(fromY + dy * ratio),
  };
}

/**
 * Apply a lightweight local separation nudge to a drone's computed next
 * position so nearby drones don't pixel-stack.
 *
 * Design rules:
 *   1. Skipped when the drone is in its arrival zone (dist to target ≤
 *      DRONE_SPEED_TILES_PER_TICK). This prevents oscillation at the
 *      destination because the arrival snap (rem === 0 branch) always
 *      overrides the nudge anyway, and we don't want to fight it in the
 *      penultimate tick.
 *   2. The nudge magnitude is bounded by DRONE_SEPARATION_STRENGTH (<1 tile)
 *      so it can never fully reverse the velocity vector.
 *   3. The result is clamped to valid grid bounds.
 *   4. Deterministic tie-break via droneId string comparison when two drones
 *      share the same tile or axis.
 */
export function nudgeAwayFromDrones(
  nextX: number,
  nextY: number,
  toX: number,
  toY: number,
  allDrones: Record<string, StarterDroneState>,
  selfId: string,
): { x: number; y: number } {
  const distToTarget = Math.max(Math.abs(toX - nextX), Math.abs(toY - nextY));
  if (distToTarget <= DRONE_SPEED_TILES_PER_TICK) return { x: nextX, y: nextY };

  let nudgeX = 0;
  let nudgeY = 0;

  for (const [id, other] of Object.entries(allDrones)) {
    if (id === selfId) continue;
    const dx = nextX - other.tileX;
    const dy = nextY - other.tileY;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d > DRONE_SEPARATION_RADIUS) continue;
    const strength = (DRONE_SEPARATION_RADIUS - d) / DRONE_SEPARATION_RADIUS;
    nudgeX += Math.abs(dx) > 0 ? dx * strength : (selfId > id ? 0.5 : -0.5) * strength;
    nudgeY += Math.abs(dy) > 0 ? dy * strength : (selfId > id ? 0.5 : -0.5) * strength;
  }

  if (nudgeX === 0 && nudgeY === 0) return { x: nextX, y: nextY };

  const mag = Math.max(Math.abs(nudgeX), Math.abs(nudgeY));
  const scale = DRONE_SEPARATION_STRENGTH / mag;
  const nx = Math.max(0, Math.min(GRID_W - 1, Math.round(nextX + nudgeX * scale)));
  const ny = Math.max(0, Math.min(GRID_H - 1, Math.round(nextY + nudgeY * scale)));
  return { x: nx, y: ny };
}
