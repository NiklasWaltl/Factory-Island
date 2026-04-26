import type { GameState } from "../../../types";
import type { DebugSetStateAction } from "../types";

export interface DebugSetStateContext {
  state: GameState;
  action: DebugSetStateAction;
}

export function runDebugSetStatePhase(ctx: DebugSetStateContext): GameState {
  const { state, action } = ctx;
  if (!import.meta.env.DEV) return state;
  return action.state;
}
