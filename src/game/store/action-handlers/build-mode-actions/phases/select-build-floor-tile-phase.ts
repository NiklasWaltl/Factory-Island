import type { GameState } from "../../../types";
import type { SelectBuildFloorTileAction } from "../types";

export interface SelectBuildFloorTileContext {
  state: GameState;
  action: SelectBuildFloorTileAction;
}

export function runSelectBuildFloorTilePhase(
  ctx: SelectBuildFloorTileContext,
): GameState {
  const { state, action } = ctx;
  return {
    ...state,
    selectedFloorTile: action.tileType,
    selectedBuildingType: null,
  };
}
