import type { GameAction } from "../../reducer";

export type HandledActionType =
  | "EQUIP_BUILDING_FROM_WAREHOUSE"
  | "EQUIP_FROM_WAREHOUSE"
  | "TRANSFER_TO_WAREHOUSE"
  | "TRANSFER_FROM_WAREHOUSE"
  | "REMOVE_FROM_HOTBAR";

export type WarehouseHotbarHandledAction = Extract<
  GameAction,
  { type: HandledActionType }
>;

export type HotbarEquipAction = Extract<
  WarehouseHotbarHandledAction,
  { type: "EQUIP_BUILDING_FROM_WAREHOUSE" | "EQUIP_FROM_WAREHOUSE" }
>;

export type HotbarTransferAction = Extract<
  WarehouseHotbarHandledAction,
  { type: "TRANSFER_TO_WAREHOUSE" | "TRANSFER_FROM_WAREHOUSE" }
>;

export type HotbarRemoveAction = Extract<
  WarehouseHotbarHandledAction,
  { type: "REMOVE_FROM_HOTBAR" }
>;
