import { HOTBAR_STACK_MAX } from "../constants/hotbar";
import type { GameState, ToolKind } from "../types";

export type ShopItemTargetDecision =
  | {
      targetArray: "hotbar";
      targetIndex: number;
    }
  | {
      targetArray: "inventory";
      targetIndex: null;
    };

export function resolveShopItemTarget(input: {
  itemId: string;
  hotbar: GameState["hotbarSlots"];
  inventory: GameState["inventory"];
}): ShopItemTargetDecision {
  void input.inventory;

  const toolHotbarKinds: ToolKind[] = ["axe", "wood_pickaxe", "stone_pickaxe"];
  const toolKind = input.itemId as ToolKind;
  if (!toolHotbarKinds.includes(toolKind)) {
    return { targetArray: "inventory", targetIndex: null };
  }

  const existingIdx = input.hotbar.findIndex(
    (slot) => slot.toolKind === toolKind && slot.amount < HOTBAR_STACK_MAX,
  );
  if (existingIdx >= 0) {
    return { targetArray: "hotbar", targetIndex: existingIdx };
  }

  const emptyIdx = input.hotbar.findIndex((slot) => slot.toolKind === "empty");
  if (emptyIdx >= 0) {
    return { targetArray: "hotbar", targetIndex: emptyIdx };
  }

  return { targetArray: "inventory", targetIndex: null };
}
