// Action types handled by the deterministic growth action cluster.

import type { GameAction } from "../../actions";

export type GrowthHandledActionType =
  | "GROW_SAPLING"
  | "GROW_SAPLINGS"
  | "NATURAL_SPAWN";

export const HANDLED_ACTION_TYPES = new Set<string>([
  "GROW_SAPLING",
  "GROW_SAPLINGS",
  "NATURAL_SPAWN",
]);

export type GrowthHandledAction = Extract<
  GameAction,
  { type: GrowthHandledActionType }
>;

export type GrowSaplingAction = Extract<
  GameAction,
  { type: "GROW_SAPLING" }
>;

export type GrowSaplingsAction = Extract<
  GameAction,
  { type: "GROW_SAPLINGS" }
>;

export type NaturalSpawnAction = Extract<
  GameAction,
  { type: "NATURAL_SPAWN" }
>;
