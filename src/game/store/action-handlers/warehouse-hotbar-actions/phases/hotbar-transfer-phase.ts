import type { GameState, Inventory } from "../../../types";
import type { WarehouseHotbarActionDeps } from "../deps";
import type { HotbarTransferAction } from "../types";

type TransferWarehousePreflightDecision =
  | { kind: "blocked" }
  | { kind: "ready"; whId: string; whInv: Inventory };

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

export interface HotbarTransferContext {
  state: GameState;
  action: HotbarTransferAction;
  deps: WarehouseHotbarActionDeps;
}

export function runHotbarTransferPhase(
  ctx: HotbarTransferContext,
): GameState {
  const { state, action, deps } = ctx;

  switch (action.type) {
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

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}
