import type { GameState } from "../../../types";
import type { ToggleBuildModeAction } from "../types";

export interface ToggleBuildModeContext {
  state: GameState;
  action: ToggleBuildModeAction;
}

export function runToggleBuildModePhase(ctx: ToggleBuildModeContext): GameState {
  const { state } = ctx;
  const newBuildMode = !state.buildMode;
  return {
    ...state,
    buildMode: newBuildMode,
    selectedBuildingType: newBuildMode ? state.selectedBuildingType : null,
    selectedFloorTile: newBuildMode ? state.selectedFloorTile : null,
    openPanel: newBuildMode ? null : state.openPanel,
    selectedWarehouseId: newBuildMode ? null : state.selectedWarehouseId,
  };
}
