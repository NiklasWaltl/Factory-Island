import { debugLog } from "../../../../debug/debugLogger";
import { RESOURCE_LABELS } from "../../../constants/resources";
import type { GameState, HotbarSlot, Inventory, ToolKind } from "../../../types";
import type { WarehouseHotbarActionDeps } from "../deps";
import type { HotbarEquipAction } from "../types";

type EquipWarehousePreflightDecision =
  | { kind: "blocked" }
  | { kind: "ready"; invKey: string; newWhInv: Inventory };

function decideEquipWarehousePreflight(
  whId: string,
  whInv: Inventory,
  invKey: string,
  hotbarSlots: HotbarSlot[],
): EquipWarehousePreflightDecision;
function decideEquipWarehousePreflight(
  whId: string | null | undefined,
  whInv: Inventory | undefined,
  invKey: string,
  hotbarSlots: HotbarSlot[],
  amount: number,
): EquipWarehousePreflightDecision;
function decideEquipWarehousePreflight(
  whId: string | null | undefined,
  whInv: Inventory | undefined,
  invKey: string,
  hotbarSlots: HotbarSlot[],
  amount = 1,
): EquipWarehousePreflightDecision {
  void hotbarSlots;
  if (!whId) return { kind: "blocked" };
  if (!whInv) return { kind: "blocked" };
  const key = invKey as keyof Inventory;
  if ((whInv[key] as number) < amount) return { kind: "blocked" };
  return {
    kind: "ready",
    invKey,
    newWhInv: {
      ...whInv,
      [key]: (whInv[key] as number) - amount,
    },
  };
}

export interface HotbarEquipContext {
  state: GameState;
  action: HotbarEquipAction;
  deps: WarehouseHotbarActionDeps;
}

export function runHotbarEquipPhase(
  ctx: HotbarEquipContext,
): GameState {
  const { state, action, deps } = ctx;

  switch (action.type) {
    case "EQUIP_BUILDING_FROM_WAREHOUSE": {
      const { buildingType, amount = 1 } = action;
      const invKey = buildingType as keyof Inventory;
      const whId = state.selectedWarehouseId;
      const whInv = whId ? state.warehouseInventories[whId] : undefined;
      const preflight = decideEquipWarehousePreflight(
        whId,
        whInv,
        invKey,
        state.hotbarSlots,
        amount,
      );
      if (preflight.kind === "blocked") return state;
      const { invKey: readyInvKey, newWhInv } = preflight;
      void readyInvKey;
      const readyWhId = whId as string;

      const newHotbar = deps.hotbarAdd(
        state.hotbarSlots,
        "building",
        buildingType,
        amount,
      );
      if (!newHotbar) {
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            "Hotbar voll! Kein Platz zum Ausrüsten.",
          ),
        };
      }

      return {
        ...state,
        warehouseInventories: {
          ...state.warehouseInventories,
          [readyWhId]: newWhInv,
        },
        hotbarSlots: newHotbar,
      };
    }

    case "EQUIP_FROM_WAREHOUSE": {
      const { itemKind, amount = 1 } = action;
      debugLog.hotbar(
        `Equip ${RESOURCE_LABELS[itemKind] ?? itemKind} ×${amount} from warehouse → hotbar`,
      );
      const invKey = itemKind as keyof Inventory;
      const whId = state.selectedWarehouseId;
      const whInv = whId ? state.warehouseInventories[whId] : undefined;
      const preflight = decideEquipWarehousePreflight(
        whId,
        whInv,
        invKey,
        state.hotbarSlots,
        amount,
      );
      if (preflight.kind === "blocked") return state;
      const { invKey: readyInvKey, newWhInv } = preflight;
      void readyInvKey;
      const readyWhId = whId as string;
      const newHotbar = deps.hotbarAdd(
        state.hotbarSlots,
        itemKind as Exclude<ToolKind, "empty">,
        undefined,
        amount,
      );
      if (!newHotbar) {
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            "Hotbar voll! Kein Platz zum Ausrüsten.",
          ),
        };
      }
      return {
        ...state,
        warehouseInventories: {
          ...state.warehouseInventories,
          [readyWhId]: newWhInv,
        },
        hotbarSlots: newHotbar,
      };
    }

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}
