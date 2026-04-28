// Action types handled by the hub-target action cluster.

import type { GameAction } from "../../actions";

export type HubTargetHandledActionType = "SET_HUB_TARGET_STOCK";

export const HANDLED_ACTION_TYPES = new Set<string>([
  "SET_HUB_TARGET_STOCK",
]);

export type HubTargetAction = Extract<
  GameAction,
  { type: HubTargetHandledActionType }
>;
