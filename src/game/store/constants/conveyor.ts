// ============================================================
// Conveyor constants.
// ------------------------------------------------------------
// Extracted from store/reducer.ts. reducer.ts re-exports these
// symbols for backward compatibility.
// ============================================================

import { GRID_H, GRID_W } from "../../constants/grid";
import { directionOffset } from "../direction";
import type { Direction, PlacedAsset } from "../types";

/** Maximum number of items a single conveyor tile can queue. */
export const CONVEYOR_TILE_CAPACITY = 4;

/** Minimum inclusive grid distance (in flow cells) between UG entrance and exit. */
export const MIN_UNDERGROUND_SPAN = 2;

/** Maximum inclusive grid distance between UG entrance and exit along the tunnel axis. */
export const MAX_UNDERGROUND_SPAN = 5;

/**
 * Returns k when `out` lies exactly k cells ahead of `in` along `in`'s direction,
 * with matching directions and k within [MIN_UNDERGROUND_SPAN, MAX_UNDERGROUND_SPAN].
 */
export function undergroundSpanSteps(
  inAsset: Pick<PlacedAsset, "x" | "y" | "direction">,
  outAsset: Pick<PlacedAsset, "x" | "y" | "direction">,
): number | null {
  const dir = inAsset.direction ?? "east";
  if ((outAsset.direction ?? "east") !== dir) return null;
  const [ox, oy] = directionOffset(dir);
  const dx = outAsset.x - inAsset.x;
  const dy = outAsset.y - inAsset.y;
  if (ox !== 0) {
    if (dy !== 0 || dx % ox !== 0) return null;
    const k = dx / ox;
    if (k < MIN_UNDERGROUND_SPAN || k > MAX_UNDERGROUND_SPAN) return null;
    return k;
  }
  if (oy !== 0) {
    if (dx !== 0 || dy % oy !== 0) return null;
    const k = dy / oy;
    if (k < MIN_UNDERGROUND_SPAN || k > MAX_UNDERGROUND_SPAN) return null;
    return k;
  }
  return null;
}

/** True if every cell strictly between entrance and exit is inside the grid. */
export function undergroundSpanCellsInBounds(
  inAsset: Pick<PlacedAsset, "x" | "y" | "direction">,
  outAsset: Pick<PlacedAsset, "x" | "y" | "direction">,
): boolean {
  const k = undergroundSpanSteps(inAsset, outAsset);
  if (k === null) return false;
  const [ox, oy] = directionOffset(inAsset.direction ?? "east");
  for (let step = 1; step < k; step++) {
    const cx = inAsset.x + ox * step;
    const cy = inAsset.y + oy * step;
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
  }
  return true;
}
