import type { GameNotification, GameState } from "../types";

export type AddErrorNotification = (
  notifications: GameNotification[],
  message: string,
) => GameNotification[];

export function withErrorNotification<T extends Pick<GameState, "notifications">>(
  state: T,
  addErrorNotification: AddErrorNotification,
  message: string,
): T & { notifications: GameNotification[] } {
  return {
    ...state,
    notifications: addErrorNotification(state.notifications, message),
  };
}
