import { GRID_H, GRID_W } from "../constants/grid";
import {
  POWER_CABLE_CONDUCTOR_TYPES,
  POWER_POLE_RANGE_TYPES,
} from "../store/constants/energy/energy-balance";
import { POWER_POLE_RANGE } from "../store/constants/energy/power-pole";
import type {
  GameState,
  PlacedAsset,
} from "../store/types";

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function assetWidth(asset: PlacedAsset): number {
  return asset.width ?? asset.size;
}

function assetHeight(asset: PlacedAsset): number {
  return asset.height ?? asset.size;
}

/**
 * Returns true if any cell of `candidate` is within `range` Chebyshev cells of the
 * top-left cell of `pole` (which is always 1x1).
 */
function assetInPoleRange(pole: PlacedAsset, candidate: PlacedAsset, range: number): boolean {
  for (let cy = 0; cy < assetHeight(candidate); cy++) {
    for (let cx = 0; cx < assetWidth(candidate); cx++) {
      const dx = Math.abs((candidate.x + cx) - pole.x);
      const dy = Math.abs((candidate.y + cy) - pole.y);
      if (Math.max(dx, dy) <= range) return true;
    }
  }
  return false;
}

/**
 * Two-phase connectivity computation:
 *
 * Phase 1 - Cable BFS:
 *   Seeds at all generators and expands ONLY through cables and power poles via
 *   direct cell adjacency. Machines and batteries are NOT cable conductors - they
 *   can only be reached by a power pole in Phase 2.
 *
 * Phase 2 - Power-pole range BFS:
 *   Every power pole reached in Phase 1 distributes wirelessly (Chebyshev range) to
 *   all assets within POWER_POLE_RANGE, including machines, batteries, and other
 *   power poles (which in turn distribute to their own range).
 *
 * Returns the IDs of all assets that are part of the active energy network.
 */
export function computeConnectedAssetIds(state: Pick<GameState, "assets" | "cellMap" | "constructionSites">): string[] {
  const underConstruction = state.constructionSites ?? {};

  const allAssets = Object.values(state.assets);
  const hasGenerator = allAssets.some((a) => a.type === "generator");
  if (!hasGenerator) return [];

  // ---- Phase 1: Cable BFS ----
  const cableVisitedCells = new Set<string>();
  const cableVisitedIds = new Set<string>();
  const cableQueue: PlacedAsset[] = [];
  const cableConnected = new Set<string>();

  function enqueueCable(asset: PlacedAsset) {
    if (cableVisitedIds.has(asset.id)) return;
    cableVisitedIds.add(asset.id);
    for (let dy = 0; dy < assetHeight(asset); dy++) {
      for (let dx = 0; dx < assetWidth(asset); dx++) {
        cableVisitedCells.add(cellKey(asset.x + dx, asset.y + dy));
      }
    }
    cableQueue.push(asset);
  }

  // Seed from generators (skip under-construction)
  for (const asset of allAssets) {
    if (asset.type === "generator" && !underConstruction[asset.id]) {
      cableConnected.add(asset.id);
      enqueueCable(asset);
    }
  }

  while (cableQueue.length > 0) {
    const current = cableQueue.shift()!;
    for (let dy = 0; dy < assetHeight(current); dy++) {
      for (let dx = 0; dx < assetWidth(current); dx++) {
        for (const [ndx, ndy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]) {
          const nx = current.x + dx + ndx;
          const ny = current.y + dy + ndy;
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
          const nk = cellKey(nx, ny);
          if (cableVisitedCells.has(nk)) continue;
          const nAssetId = state.cellMap[nk];
          if (!nAssetId) continue;
          const nAsset = state.assets[nAssetId];
          if (!nAsset || !POWER_CABLE_CONDUCTOR_TYPES.has(nAsset.type) || underConstruction[nAssetId]) continue;
          cableConnected.add(nAssetId);
          enqueueCable(nAsset);
        }
      }
    }
  }

  // ---- Phase 2: Power-pole range BFS ----
  const connected = new Set<string>(cableConnected);
  const poleQueue: PlacedAsset[] = [];
  for (const id of cableConnected) {
    const asset = state.assets[id];
    if (asset?.type === "power_pole") poleQueue.push(asset);
  }

  while (poleQueue.length > 0) {
    const pole = poleQueue.shift()!;
    for (const candidate of allAssets) {
      if (connected.has(candidate.id) || underConstruction[candidate.id]) continue;
      if (!POWER_POLE_RANGE_TYPES.has(candidate.type)) continue;
      if (!assetInPoleRange(pole, candidate, POWER_POLE_RANGE)) continue;
      connected.add(candidate.id);
      // Connected power poles also distribute to their range
      if (candidate.type === "power_pole") {
        poleQueue.push(candidate);
      }
    }
  }

  return [...connected];
}