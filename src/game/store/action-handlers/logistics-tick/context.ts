import { applyCraftingSourceInventory } from "../../../crafting/crafting-sources";
import type { CraftingSource } from "../../types";
import type {
  AutoDeliveryEntry,
  AutoMinerEntry,
  AutoSmelterEntry,
  ConveyorItem,
  ConveyorState,
  GameNotification,
  GameState,
  Inventory,
  SmithyState,
} from "../../types";
import { addResources } from "../../inventory-ops";
import {
  getCapacityPerResource,
  getWarehouseCapacity,
  getZoneItemCapacity,
} from "../../warehouse-capacity";

/**
 * I/O-only deps for the LOGISTICS_TICK handler.
 *
 * Pure helpers and constants (capacities, geometry, equality, building-source,
 * boost multiplier, …) are imported directly inside the phase modules. Only
 * helpers that perform real I/O (ID generation via `makeId`, time via
 * `Date.now`) remain injected here so they can be mocked in tests.
 */
export interface LogisticsTickIoDeps {
  /** Append (or batch) a notification entry. Uses `makeId` + `Date.now`. */
  addNotification(
    notifications: GameNotification[],
    resource: string,
    amount: number,
  ): GameNotification[];
  /** Append (or batch) an auto-delivery log entry. Uses `makeId` + `Date.now`. */
  addAutoDelivery(
    log: AutoDeliveryEntry[],
    sourceType: AutoDeliveryEntry["sourceType"],
    sourceId: string,
    resource: string,
    warehouseId: string,
  ): AutoDeliveryEntry[];
}

export interface LogisticsTickContext {
  state: GameState;
  deps: LogisticsTickIoDeps;
  poweredSet: Set<string>;
  newAutoMinersL: Record<string, AutoMinerEntry>;
  newConveyorsL: Record<string, ConveyorState>;
  newInvL: Inventory;
  newWarehouseInventoriesL: Record<string, Inventory>;
  newSmithyL: SmithyState;
  newNotifsL: GameNotification[];
  newAutoDeliveryLogL: AutoDeliveryEntry[];
  newAutoSmeltersL: Record<string, AutoSmelterEntry>;
  changed: boolean;
}

export function tryStoreInWarehouse(
  ctx: LogisticsTickContext,
  warehouseId: string,
  resource: ConveyorItem,
): boolean {
  const { state } = ctx;
  // Warehouse building must exist
  const whInv =
    ctx.newWarehouseInventoriesL === state.warehouseInventories
      ? state.warehouseInventories[warehouseId]
      : ctx.newWarehouseInventoriesL[warehouseId];
  if (!whInv) return false;
  // Store into the warehouse's own inventory (per-WH storage)
  const cap = getWarehouseCapacity(state.mode);
  const resKey = resource as keyof Inventory;
  if ((whInv[resKey] as number) >= cap) return false;
  ctx.newWarehouseInventoriesL =
    ctx.newWarehouseInventoriesL === state.warehouseInventories
      ? { ...state.warehouseInventories }
      : ctx.newWarehouseInventoriesL;
  ctx.newWarehouseInventoriesL[warehouseId] = addResources(whInv, { [resKey]: 1 });
  return true;
}

export function getLiveLogisticsState(ctx: LogisticsTickContext): GameState {
  const { state } = ctx;
  if (
    ctx.newInvL === state.inventory &&
    ctx.newWarehouseInventoriesL === state.warehouseInventories
  ) {
    return state;
  }
  return {
    ...state,
    inventory: ctx.newInvL,
    warehouseInventories: ctx.newWarehouseInventoriesL,
  };
}

export function getSourceCapacity(
  _ctx: LogisticsTickContext,
  liveState: GameState,
  source: CraftingSource,
): number {
  if (source.kind === "global") return getCapacityPerResource(liveState);
  if (source.kind === "zone") return getZoneItemCapacity(liveState, source.zoneId);
  return getWarehouseCapacity(liveState.mode);
}

export function applySourceInventory(
  ctx: LogisticsTickContext,
  source: CraftingSource,
  nextInv: Inventory,
): void {
  const partial = applyCraftingSourceInventory(getLiveLogisticsState(ctx), source, nextInv);
  if (partial.inventory) {
    ctx.newInvL = partial.inventory;
  }
  if (partial.warehouseInventories) {
    ctx.newWarehouseInventoriesL = partial.warehouseInventories;
  }
}

export function getMachinePowerRatio(ctx: LogisticsTickContext, assetId: string): number {
  return Math.max(
    0,
    Math.min(
      1,
      ctx.state.machinePowerRatio?.[assetId] ?? (ctx.poweredSet.has(assetId) ? 1 : 0),
    ),
  );
}