// Action types handled by the build-mode action cluster.
// Mirrors the pattern used by other action-handler clusters
// (zone-actions, warehouse-hotbar-actions, ...).

import type { GameAction } from "../../actions";

export type BuildModeHandledActionType =
  | "TOGGLE_BUILD_MODE"
  | "SELECT_BUILD_BUILDING"
  | "SELECT_BUILD_FLOOR_TILE";

export const HANDLED_ACTION_TYPES = new Set<string>([
  "TOGGLE_BUILD_MODE",
  "SELECT_BUILD_BUILDING",
  "SELECT_BUILD_FLOOR_TILE",
]);

export type BuildModeHandledAction = Extract<
  GameAction,
  { type: BuildModeHandledActionType }
>;

export type ToggleBuildModeAction = Extract<
  GameAction,
  { type: "TOGGLE_BUILD_MODE" }
>;

export type SelectBuildBuildingAction = Extract<
  GameAction,
  { type: "SELECT_BUILD_BUILDING" }
>;

export type SelectBuildFloorTileAction = Extract<
  GameAction,
  { type: "SELECT_BUILD_FLOOR_TILE" }
>;
