import type { GameState } from "../../../types";
import type { RemoveBuildingAction } from "../types";

export interface RemoveBuildingContext {
  state: GameState;
  action: RemoveBuildingAction;
}

export function runRemoveBuildingPhase(ctx: RemoveBuildingContext): GameState {
  const { state } = ctx;
  // Buildings are removed exclusively via BUILD_REMOVE_ASSET in Build Mode.
  return state;
}
