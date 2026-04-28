import {
  decideBuildFloorTileEligibility,
  type BuildFloorTileEligibilityBlockReason,
} from "../floor-tile-decisions";
import type { GameState } from "../types";

export type FloorPlacementEligibilityResult =
  | { eligible: true }
  | {
      eligible: false;
      blockReason: BuildFloorTileEligibilityBlockReason;
    };

export function checkFloorPlacementEligibility(input: {
  tileType: NonNullable<GameState["selectedFloorTile"]>;
  x: number;
  y: number;
  floorMap: GameState["floorMap"];
  cellMap: GameState["cellMap"];
}): FloorPlacementEligibilityResult {
  const key = `${input.x},${input.y}`;
  const decision = decideBuildFloorTileEligibility({
    tileType: input.tileType,
    hasFloorTile: !!input.floorMap[key],
    hasPlacedAsset: !!input.cellMap[key],
  });

  if (decision.kind === "blocked") {
    return {
      eligible: false,
      blockReason: decision.blockReason,
    };
  }

  return { eligible: true };
}

export function mapFloorPlacementError(
  blockReason: BuildFloorTileEligibilityBlockReason,
): string {
  if (blockReason === "stone_floor_already_present") {
    return "Hier liegt bereits Steinboden.";
  }
  if (blockReason === "stone_floor_cell_occupied") {
    return "Das Feld ist belegt.";
  }
  if (blockReason === "grass_block_no_stone_floor") {
    return "Kein Steinboden auf diesem Feld.";
  }
  return "Das Feld ist belegt – Gebäude zuerst entfernen.";
}
