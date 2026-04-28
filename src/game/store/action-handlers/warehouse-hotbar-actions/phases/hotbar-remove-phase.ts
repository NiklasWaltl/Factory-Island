import { debugLog } from "../../../../debug/debugLogger";
import type { GameState } from "../../../types";
import type { WarehouseHotbarActionDeps } from "../deps";
import type { HotbarRemoveAction } from "../types";

export interface HotbarRemoveContext {
  state: GameState;
  action: HotbarRemoveAction;
  deps: WarehouseHotbarActionDeps;
}

export function runHotbarRemovePhase(
  ctx: HotbarRemoveContext,
): GameState {
  const { state, action, deps } = ctx;

  const hs = state.hotbarSlots[action.slot];
  if (!hs || hs.toolKind === "empty") return state;
  debugLog.hotbar(
    `Removed ${hs.label || hs.toolKind} ×${hs.amount} from Hotbar slot ${action.slot}`,
  );
  const whId = state.selectedWarehouseId;
  if (!whId || !state.warehouseInventories[whId]) return state;
  const whInv = state.warehouseInventories[whId];
  const newHotbarSlots = state.hotbarSlots.map((s, i) =>
    i === action.slot ? { ...deps.EMPTY_HOTBAR_SLOT } : s,
  );
  let newWhInv = { ...whInv };
  if (hs.toolKind === "building" && hs.buildingType) {
    const bType = hs.buildingType;
    (newWhInv as any)[bType] = ((newWhInv as any)[bType] ?? 0) + hs.amount;
    return {
      ...state,
      warehouseInventories: {
        ...state.warehouseInventories,
        [whId]: newWhInv,
      },
      hotbarSlots: newHotbarSlots,
    };
  }
  if (hs.toolKind === "axe") {
    newWhInv = { ...newWhInv, axe: newWhInv.axe + hs.amount };
  } else if (hs.toolKind === "wood_pickaxe") {
    newWhInv = { ...newWhInv, wood_pickaxe: newWhInv.wood_pickaxe + hs.amount };
  } else if (hs.toolKind === "stone_pickaxe") {
    newWhInv = { ...newWhInv, stone_pickaxe: newWhInv.stone_pickaxe + hs.amount };
  } else if (hs.toolKind === "sapling") {
    newWhInv = { ...newWhInv, sapling: newWhInv.sapling + hs.amount };
  }
  return {
    ...state,
    warehouseInventories: {
      ...state.warehouseInventories,
      [whId]: newWhInv,
    },
    hotbarSlots: newHotbarSlots,
  };
}
