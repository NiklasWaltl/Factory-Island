import { isUnderConstruction } from "../../../asset-status";
import { getMaxTargetStockForTier } from "../../../hub-tier-selectors";
import type { GameState } from "../../../types";
import type { HubTargetAction } from "../types";

export interface SetHubTargetStockContext {
  state: GameState;
  action: HubTargetAction;
}

export function runSetHubTargetStockPhase(
  ctx: SetHubTargetStockContext,
): GameState {
  const { state, action } = ctx;
  const hub = state.serviceHubs[action.hubId];
  if (!hub) return state;
  if (isUnderConstruction(state, action.hubId)) return state;
  const maxStock = getMaxTargetStockForTier(hub.tier);
  const clamped = Math.max(0, Math.min(maxStock, Math.round(action.amount)));
  return {
    ...state,
    serviceHubs: {
      ...state.serviceHubs,
      [action.hubId]: {
        ...hub,
        targetStock: { ...hub.targetStock, [action.resource]: clamped },
      },
    },
  };
}
