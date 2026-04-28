import type { GameState } from "../../../types";
import type { ExpireNotificationsAction } from "../types";

export interface ExpireNotificationsContext {
  state: GameState;
  action: ExpireNotificationsAction;
}

export function runExpireNotificationsPhase(
  ctx: ExpireNotificationsContext,
): GameState {
  const { state } = ctx;
  const now = Date.now();
  const alive = state.notifications.filter((n) => n.expiresAt > now);
  if (alive.length === state.notifications.length) return state;
  return { ...state, notifications: alive };
}
