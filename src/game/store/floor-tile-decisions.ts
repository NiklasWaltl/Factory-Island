import type { FloorTileType } from "./types";

export type BuildFloorTileEligibilityBlockReason =
  | "stone_floor_already_present"
  | "stone_floor_cell_occupied"
  | "grass_block_no_stone_floor"
  | "grass_block_cell_occupied";

export type BuildFloorTileEligibilityDecision =
  | { kind: "eligible" }
  | { kind: "blocked"; blockReason: BuildFloorTileEligibilityBlockReason };

export interface DecideBuildFloorTileEligibilityInput {
  tileType: FloorTileType;
  hasFloorTile: boolean;
  hasPlacedAsset: boolean;
}

export const decideBuildFloorTileEligibility = (
  input: DecideBuildFloorTileEligibilityInput,
): BuildFloorTileEligibilityDecision => {
  if (input.tileType === "stone_floor") {
    if (input.hasFloorTile) {
      return { kind: "blocked", blockReason: "stone_floor_already_present" };
    }
    if (input.hasPlacedAsset) {
      return { kind: "blocked", blockReason: "stone_floor_cell_occupied" };
    }
    return { kind: "eligible" };
  }

  if (!input.hasFloorTile) {
    return { kind: "blocked", blockReason: "grass_block_no_stone_floor" };
  }
  if (input.hasPlacedAsset) {
    return { kind: "blocked", blockReason: "grass_block_cell_occupied" };
  }

  return { kind: "eligible" };
};
