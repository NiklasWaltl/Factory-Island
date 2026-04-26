// ============================================================
// Warehouse + hotbar action handler
// ------------------------------------------------------------
// Extracts warehouse-panel equip/transfer branches:
// - EQUIP_FROM_WAREHOUSE
// - EQUIP_BUILDING_FROM_WAREHOUSE
// - TRANSFER_TO_WAREHOUSE
// - TRANSFER_FROM_WAREHOUSE
// ============================================================

import { debugLog } from "../../debug/debugLogger";
import { RESOURCE_LABELS } from "../constants/resources";
import type { GameAction } from "../reducer";
import type {
  BuildingType,
  GameNotification,
  GameState,
  HotbarSlot,
  Inventory,
  ToolKind,
} from "../types";

export interface WarehouseHotbarActionDeps {
  EMPTY_HOTBAR_SLOT: HotbarSlot;
  hotbarAdd: (
    slots: HotbarSlot[],
    toolKind: Exclude<ToolKind, "empty">,
    buildingType?: BuildingType,
    add?: number,
  ) => HotbarSlot[] | null;
  addErrorNotification(
    notifications: GameNotification[],
    message: string,
  ): GameNotification[];
  isUnderConstruction(
    state: Pick<GameState, "constructionSites">,
    assetId: string,
  ): boolean;
  getAvailableResource(
    state: Pick<GameState, "inventory">,
    key: keyof Inventory,
  ): number;
  getWarehouseCapacity(mode: GameState["mode"]): number;
  consumeResources(
    inv: Inventory,
    costs: Partial<Record<keyof Inventory, number>>,
  ): Inventory;
  addResources(
    inv: Inventory,
    items: Partial<Record<keyof Inventory, number>>,
  ): Inventory;
}

type TransferWarehousePreflightDecision =
  | { kind: "blocked" }
  | { kind: "ready"; whId: string; whInv: Inventory };

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

function decideTransferWarehousePreflight(
  amount: number,
  whId: string,
  whInv: Inventory,
  isUnderConstruction: boolean,
): TransferWarehousePreflightDecision;
function decideTransferWarehousePreflight(
  amount: number,
  whId: string | null | undefined,
  whInv: Inventory | undefined,
  isUnderConstruction: boolean,
): TransferWarehousePreflightDecision;
function decideTransferWarehousePreflight(
  amount: number,
  whId: string | null | undefined,
  whInv: Inventory | undefined,
  isUnderConstruction: boolean,
): TransferWarehousePreflightDecision {
  if (amount <= 0) return { kind: "blocked" };
  if (!whId) return { kind: "blocked" };
  if (isUnderConstruction) return { kind: "blocked" };
  if (!whInv) return { kind: "blocked" };
  return { kind: "ready", whId, whInv };
}

export function handleWarehouseHotbarAction(
  state: GameState,
  action: GameAction,
  deps: WarehouseHotbarActionDeps,
): GameState | null {
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

    case "TRANSFER_TO_WAREHOUSE": {
      const { item, amount } = action;
      const whId = state.selectedWarehouseId;
      const whInv = whId ? state.warehouseInventories[whId] : undefined;
      const preflight = decideTransferWarehousePreflight(
        amount,
        whId,
        whInv,
        whId ? deps.isUnderConstruction(state, whId) : false,
      );
      if (preflight.kind === "blocked") return state;
      const { whId: readyWhId, whInv: readyWhInv } = preflight;

      const globalAvailable = deps.getAvailableResource(state, item);
      const whCap = deps.getWarehouseCapacity(state.mode);
      const whCurrent = readyWhInv[item] as number;
      const spaceInWarehouse =
        item === "coins" ? Infinity : Math.max(0, whCap - whCurrent);
      const transferAmount = Math.min(amount, globalAvailable, spaceInWarehouse);
      if (transferAmount <= 0) return state;

      return {
        ...state,
        inventory: deps.consumeResources(state.inventory, { [item]: transferAmount }),
        warehouseInventories: {
          ...state.warehouseInventories,
          [readyWhId]: deps.addResources(readyWhInv, { [item]: transferAmount }),
        },
      };
    }

    case "TRANSFER_FROM_WAREHOUSE": {
      const { item, amount } = action;
      const whId = state.selectedWarehouseId;
      const whInv = whId ? state.warehouseInventories[whId] : undefined;
      const preflight = decideTransferWarehousePreflight(
        amount,
        whId,
        whInv,
        whId ? deps.isUnderConstruction(state, whId) : false,
      );
      if (preflight.kind === "blocked") return state;
      const { whId: readyWhId, whInv: readyWhInv } = preflight;

      const whAvailable = readyWhInv[item] as number;
      const transferAmount = Math.min(amount, whAvailable);
      if (transferAmount <= 0) return state;

      return {
        ...state,
        inventory: deps.addResources(state.inventory, { [item]: transferAmount }),
        warehouseInventories: {
          ...state.warehouseInventories,
          [readyWhId]: deps.consumeResources(readyWhInv, { [item]: transferAmount }),
        },
      };
    }

    case "REMOVE_FROM_HOTBAR": {
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

    default:
      return null;
  }
}
