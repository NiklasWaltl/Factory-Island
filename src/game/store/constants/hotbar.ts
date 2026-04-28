// Hotbar layout/stack/slot-template constants.
// Pure constants; no runtime imports from reducer.

import type { HotbarSlot } from "../types";

export const HOTBAR_SIZE = 9;
export const HOTBAR_STACK_MAX = 5;
export const EMPTY_HOTBAR_SLOT: HotbarSlot = { toolKind: "empty", amount: 0, label: "", emoji: "" };
