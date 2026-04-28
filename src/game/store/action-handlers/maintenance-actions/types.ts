// Action types handled by the maintenance/no-op action cluster.

import type { GameAction } from "../../actions";

export type MaintenanceHandledActionType =
  | "CRAFT_WORKBENCH"
  | "REMOVE_BUILDING"
  | "REMOVE_POWER_POLE"
  | "DEBUG_SET_STATE"
  | "EXPIRE_NOTIFICATIONS";

export const HANDLED_ACTION_TYPES = new Set<string>([
  "CRAFT_WORKBENCH",
  "REMOVE_BUILDING",
  "REMOVE_POWER_POLE",
  "DEBUG_SET_STATE",
  "EXPIRE_NOTIFICATIONS",
]);

export type MaintenanceHandledAction = Extract<
  GameAction,
  { type: MaintenanceHandledActionType }
>;

export type CraftWorkbenchAction = Extract<
  GameAction,
  { type: "CRAFT_WORKBENCH" }
>;

export type RemoveBuildingAction = Extract<
  GameAction,
  { type: "REMOVE_BUILDING" }
>;

export type RemovePowerPoleAction = Extract<
  GameAction,
  { type: "REMOVE_POWER_POLE" }
>;

export type DebugSetStateAction = Extract<
  GameAction,
  { type: "DEBUG_SET_STATE" }
>;

export type ExpireNotificationsAction = Extract<
  GameAction,
  { type: "EXPIRE_NOTIFICATIONS" }
>;
