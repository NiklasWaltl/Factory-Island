import type { GameAction } from "../../actions";

export type DroneRoleHandledActionType = "DRONE_SET_ROLE";

export const HANDLED_ACTION_TYPES = new Set<string>([
  "DRONE_SET_ROLE",
]);

export type DroneRoleHandledAction = Extract<
  GameAction,
  { type: DroneRoleHandledActionType }
>;

export type DroneSetRoleAction = Extract<
  GameAction,
  { type: "DRONE_SET_ROLE" }
>;
