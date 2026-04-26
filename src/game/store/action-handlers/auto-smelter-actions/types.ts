// Action types handled by the auto-smelter action cluster.

import type { GameAction } from "../../reducer";

export type AutoSmelterHandledActionType = "AUTO_SMELTER_SET_RECIPE";

export const HANDLED_ACTION_TYPES = new Set<string>([
  "AUTO_SMELTER_SET_RECIPE",
]);

export type AutoSmelterAction = Extract<
  GameAction,
  { type: AutoSmelterHandledActionType }
>;
