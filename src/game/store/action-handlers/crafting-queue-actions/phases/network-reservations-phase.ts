import { applyNetworkAction } from "../../../../inventory/reservations";
import type { GameAction } from "../../../actions";
import type { GameState, Inventory } from "../../../types";

type NetworkReservationAction = Extract<
  GameAction,
  {
    type:
      | "NETWORK_RESERVE_BATCH"
      | "NETWORK_COMMIT_RESERVATION"
      | "NETWORK_COMMIT_BY_OWNER"
      | "NETWORK_CANCEL_RESERVATION"
      | "NETWORK_CANCEL_BY_OWNER";
  }
>;

export interface NetworkReservationsContext {
  state: GameState;
  action: NetworkReservationAction;
}

export function runNetworkReservationsPhase(
  ctx: NetworkReservationsContext,
): GameState {
  const { state, action } = ctx;

  const result = applyNetworkAction(
    state.warehouseInventories,
    state.network,
    action,
  );
  if (
    result.warehouseInventories === state.warehouseInventories &&
    result.network === state.network
  ) {
    return state;
  }
  return {
    ...state,
    warehouseInventories: result.warehouseInventories as Record<string, Inventory>,
    network: result.network,
  };
}
