import type { GameAction } from "../../reducer";

export type DroneTickHandledActionType = "DRONE_TICK";

export const HANDLED_ACTION_TYPES = new Set<string>([
  "DRONE_TICK",
]);

export type DroneTickHandledAction = Extract<
  GameAction,
  { type: DroneTickHandledActionType }
>;

export type DroneTickAction = Extract<
  GameAction,
  { type: "DRONE_TICK" }
>;
