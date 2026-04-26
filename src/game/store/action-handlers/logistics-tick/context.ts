import { applyCraftingSourceInventory } from "../../../crafting/crafting-sources";
import type { CraftingSource } from "../../reducer";
import type {
  AutoDeliveryEntry,
  AutoMinerEntry,
  AutoSmelterEntry,
  ConveyorItem,
  ConveyorState,
  Direction,
  GameMode,
  GameNotification,
  GameState,
  Inventory,
  PlacedAsset,
  SmithyState,
} from "../../types";

export interface LogisticsTickActionDeps {
  /** Capacity per resource for warehouse storage in the current game mode. */
  getWarehouseCapacity(mode: GameMode): number;
  /** Capacity per resource for global inventory in the current state. */
  getCapacityPerResource(state: { mode: string; warehousesPlaced: number }): number;
  /** Capacity per resource for production zones. */
  getZoneItemCapacity(state: GameState, zoneId: string): number;
  /** Resolves the crafting source bound to a building (global / warehouse / zone). */
  resolveBuildingSource(state: GameState, buildingId: string | null): CraftingSource;
  /** Returns the placement-time direction offset for a cardinal direction. */
  directionOffset(dir: Direction): [number, number];
  /** Returns the throughput boost multiplier (1 by default, >1 if boosted). */
  getBoostMultiplier(asset: Pick<PlacedAsset, "type" | "boosted">): number;
  /** Returns the auto-smelter input/output cell coordinates. */
  getAutoSmelterIoCells(asset: PlacedAsset): {
    input: { x: number; y: number };
    output: { x: number; y: number };
  };
  /** Structural equality for auto-smelter entries to skip no-op mutations. */
  areAutoSmelterEntriesEqual(a: AutoSmelterEntry, b: AutoSmelterEntry): boolean;
  /** True when the (entityX, entityY, entityDir) match the warehouse-input cell. */
  isValidWarehouseInput(
    entityX: number,
    entityY: number,
    entityDir: Direction,
    warehouse: PlacedAsset,
  ): boolean;
  /** Pure addition of partial counts into an Inventory (immutable). */
  addResources(inv: Inventory, items: Partial<Record<keyof Inventory, number>>): Inventory;
  /** Append (or batch) a notification entry. */
  addNotification(
    notifications: GameNotification[],
    resource: string,
    amount: number,
  ): GameNotification[];
  /** Append (or batch) an auto-delivery log entry. */
  addAutoDelivery(
    log: AutoDeliveryEntry[],
    sourceType: AutoDeliveryEntry["sourceType"],
    sourceId: string,
    resource: string,
    warehouseId: string,
  ): AutoDeliveryEntry[];
  /** Conveyor tile capacity (items per tile). */
  CONVEYOR_TILE_CAPACITY: number;
  /** Auto-smelter input buffer capacity. */
  AUTO_SMELTER_BUFFER_CAPACITY: number;
  /** Optional override of AUTO_MINER_PRODUCE_TICKS (defaults to constants/drone-config). */
  AUTO_MINER_PRODUCE_TICKS?: number;
  /** Optional override of LOGISTICS_TICK_MS (defaults to constants/timing). */
  LOGISTICS_TICK_MS?: number;
}

export interface LogisticsTickContext {
  state: GameState;
  deps: LogisticsTickActionDeps;
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
  const { state, deps } = ctx;
  // Warehouse building must exist
  const whInv =
    ctx.newWarehouseInventoriesL === state.warehouseInventories
      ? state.warehouseInventories[warehouseId]
      : ctx.newWarehouseInventoriesL[warehouseId];
  if (!whInv) return false;
  // Store into the warehouse's own inventory (per-WH storage)
  const cap = deps.getWarehouseCapacity(state.mode);
  const resKey = resource as keyof Inventory;
  if ((whInv[resKey] as number) >= cap) return false;
  ctx.newWarehouseInventoriesL =
    ctx.newWarehouseInventoriesL === state.warehouseInventories
      ? { ...state.warehouseInventories }
      : ctx.newWarehouseInventoriesL;
  ctx.newWarehouseInventoriesL[warehouseId] = deps.addResources(whInv, { [resKey]: 1 });
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
  ctx: LogisticsTickContext,
  liveState: GameState,
  source: CraftingSource,
): number {
  const { deps } = ctx;
  if (source.kind === "global") return deps.getCapacityPerResource(liveState);
  if (source.kind === "zone") return deps.getZoneItemCapacity(liveState, source.zoneId);
  return deps.getWarehouseCapacity(liveState.mode);
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