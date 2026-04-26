import type { GameState } from "../../../types";
import type { SelectBuildBuildingAction } from "../types";

export interface SelectBuildBuildingContext {
  state: GameState;
  action: SelectBuildBuildingAction;
}

export function runSelectBuildBuildingPhase(
  ctx: SelectBuildBuildingContext,
): GameState {
  const { state, action } = ctx;
  return {
    ...state,
    selectedBuildingType: action.buildingType,
    selectedFloorTile: null,
  };
}
