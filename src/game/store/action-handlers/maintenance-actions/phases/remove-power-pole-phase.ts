import type { GameState } from "../../../types";
import type { RemovePowerPoleAction } from "../types";

export interface RemovePowerPoleContext {
  state: GameState;
  action: RemovePowerPoleAction;
}

export function runRemovePowerPolePhase(ctx: RemovePowerPoleContext): GameState {
  const { state } = ctx;
  // Power poles are removed exclusively via BUILD_REMOVE_ASSET in Build Mode.
  return state;
}
