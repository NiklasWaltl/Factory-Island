import type { GameAction } from "../../reducer";

export type HandledActionType =
  | "SMITHY_ADD_FUEL"
  | "SMITHY_ADD_IRON"
  | "SMITHY_ADD_COPPER"
  | "SMITHY_SET_RECIPE"
  | "SMITHY_START"
  | "SMITHY_STOP"
  | "SMITHY_TICK"
  | "SMITHY_WITHDRAW"
  | "GENERATOR_ADD_FUEL"
  | "GENERATOR_REQUEST_REFILL"
  | "GENERATOR_START"
  | "GENERATOR_STOP"
  | "GENERATOR_TICK";

export type MachineHandledAction = Extract<
  GameAction,
  { type: HandledActionType }
>;

export type GeneratorToggleAction = Extract<
  MachineHandledAction,
  { type: "GENERATOR_START" | "GENERATOR_STOP" }
>;
