import { debugLog } from "../../../../debug/debugLogger";
import type { GameState } from "../../../types";
import type { CraftWorkbenchAction } from "../types";

export interface CraftWorkbenchContext {
  state: GameState;
  action: CraftWorkbenchAction;
}

export function runCraftWorkbenchPhase(ctx: CraftWorkbenchContext): GameState {
  const { state } = ctx;
  if (import.meta.env.DEV) {
    console.warn("CRAFT_WORKBENCH deprecated - use queue");
  }
  debugLog.general("CRAFT_WORKBENCH deprecated - use queue");
  return state;
}
