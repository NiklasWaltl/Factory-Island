import { DRONE_SPEED_TILES_PER_TICK } from "../store/constants/drone-config";

/**
 * Ticks for the drone to travel between two tile positions (Chebyshev distance,
 * rounded up to at least 1).
 */
export function droneTravelTicks(x1: number, y1: number, x2: number, y2: number): number {
  const dist = Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
  return Math.max(1, Math.ceil(dist / DRONE_SPEED_TILES_PER_TICK));
}
