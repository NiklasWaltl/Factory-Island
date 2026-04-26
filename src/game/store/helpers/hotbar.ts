import { HOTBAR_SIZE, HOTBAR_STACK_MAX, EMPTY_HOTBAR_SLOT } from "../constants/hotbar";
import { BUILDING_LABELS } from "../constants/buildings";
import { ASSET_EMOJIS } from "../constants/assets";
import { RESOURCE_EMOJIS, RESOURCE_LABELS } from "../constants/resources";
import type { BuildingType, HotbarSlot, ToolKind } from "../types";

export { EMPTY_HOTBAR_SLOT };

export function createInitialHotbar(): HotbarSlot[] {
  return Array.from({ length: HOTBAR_SIZE }, () => ({ ...EMPTY_HOTBAR_SLOT }));
}

function makeHotbarLabel(toolKind: ToolKind, amount: number, buildingType?: BuildingType): string {
  if (toolKind === "empty") return "";
  if (toolKind === "building" && buildingType) {
    return BUILDING_LABELS[buildingType] + (amount > 1 ? ` ×${amount}` : "");
  }
  const base = RESOURCE_LABELS[toolKind] ?? toolKind;
  return amount > 1 ? `${base} (${amount})` : base;
}

function makeHotbarEmoji(toolKind: ToolKind, buildingType?: BuildingType): string {
  if (toolKind === "empty") return "";
  if (toolKind === "building" && buildingType) return ASSET_EMOJIS[buildingType];
  return RESOURCE_EMOJIS[toolKind] ?? "";
}

export function hotbarAdd(
  slots: HotbarSlot[],
  toolKind: Exclude<ToolKind, "empty">,
  buildingType?: BuildingType,
  add = 1,
): HotbarSlot[] | null {
  const existingIdx = slots.findIndex(
    (slot) =>
      slot.toolKind === toolKind &&
      (toolKind !== "building" || slot.buildingType === buildingType) &&
      slot.amount < HOTBAR_STACK_MAX,
  );
  if (existingIdx >= 0) {
    return slots.map((slot, index) => {
      if (index !== existingIdx) return slot;
      const newAmount = Math.min(slot.amount + add, HOTBAR_STACK_MAX);
      return {
        ...slot,
        amount: newAmount,
        label: makeHotbarLabel(toolKind, newAmount, buildingType),
      };
    });
  }

  const emptyIdx = slots.findIndex((slot) => slot.toolKind === "empty");
  if (emptyIdx < 0) return null;

  return slots.map((slot, index) => {
    if (index !== emptyIdx) return slot;
    const amount = Math.min(add, HOTBAR_STACK_MAX);
    return {
      toolKind,
      buildingType,
      amount,
      label: makeHotbarLabel(toolKind, amount, buildingType),
      emoji: makeHotbarEmoji(toolKind, buildingType),
    };
  });
}

export function hotbarDecrement(slots: HotbarSlot[], idx: number): HotbarSlot[] {
  return slots.map((slot, index) => {
    if (index !== idx) return slot;
    if (slot.amount <= 1) return { ...EMPTY_HOTBAR_SLOT };
    const newAmount = slot.amount - 1;
    return {
      ...slot,
      amount: newAmount,
      label: makeHotbarLabel(slot.toolKind, newAmount, slot.buildingType),
    };
  });
}