import { GRID_H, GRID_W } from "../../../../constants/grid";
import { placeAsset } from "../../../asset-mutation";
import { cellKey } from "../../../cell-key";
import {
  NATURAL_SPAWN_CAP,
  NATURAL_SPAWN_CHANCE,
  SAPLING_GROW_MS,
} from "../../../constants/timing";
import type { GameState } from "../../../types";
import type { NaturalSpawnAction } from "../types";

export interface NaturalSpawnContext {
  state: GameState;
  action: NaturalSpawnAction;
}

function hasNearbyAsset(
  cellMap: Record<string, string>,
  x: number,
  y: number,
): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (cellMap[cellKey(x + dx, y + dy)]) return true;
    }
  }
  return false;
}

export function runNaturalSpawnPhase(ctx: NaturalSpawnContext): GameState {
  const { state } = ctx;
  // Enforce per-type spawn cap
  const treeCount = Object.values(state.assets).filter(
    (a) => a.type === "tree" || a.type === "sapling",
  ).length;
  if (treeCount >= NATURAL_SPAWN_CAP) return state;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (Math.random() > NATURAL_SPAWN_CHANCE) continue;
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    if (state.cellMap[cellKey(x, y)]) continue;
    if (hasNearbyAsset(state.cellMap, x, y)) continue;
    const placed = placeAsset(state.assets, state.cellMap, "sapling", x, y, 1);
    if (!placed) continue;
    return {
      ...state,
      assets: placed.assets,
      cellMap: placed.cellMap,
      saplingGrowAt: {
        ...state.saplingGrowAt,
        [placed.id]: Date.now() + SAPLING_GROW_MS,
      },
    };
  }
  return state;
}
