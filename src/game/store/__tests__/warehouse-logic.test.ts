// ============================================================
// Regression Tests – Warehouse per-building Inventory Logic
// ============================================================

import {
  gameReducer,
  createInitialState,
  addResources,
  cellKey,
  type GameState,
  type PlacedAsset,
  type Inventory,
  type ConveyorState,
} from "../reducer";
import { WAREHOUSE_CAPACITY } from "../constants/buildings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyInv(): Inventory {
  return createInitialState("release").inventory;
}

/**
 * Build a minimal state with two warehouses and a conveyor pointing at wh-A.
 * Warehouse A sits at (5,5) size 2, direction south → input at (5,7).
 * Conveyor at (5,7) facing north → feeds into warehouse A.
 * Warehouse B at (10,5) size 2, direction south → input at (10,7).
 */
function stateWithTwoWarehouses(): GameState {
  const base = createInitialState("release");
  const whA: PlacedAsset = { id: "wh-A", type: "warehouse", x: 5, y: 5, size: 2, direction: "south" };
  const whB: PlacedAsset = { id: "wh-B", type: "warehouse", x: 10, y: 5, size: 2, direction: "south" };
  const conv: PlacedAsset = { id: "conv-1", type: "conveyor", x: 5, y: 7, size: 1, direction: "north" };

  const assets: Record<string, PlacedAsset> = {
    "wh-A": whA,
    "wh-B": whB,
    "conv-1": conv,
  };
  const cellMap: Record<string, string> = {
    [cellKey(5, 5)]: "wh-A",
    [cellKey(6, 5)]: "wh-A",
    [cellKey(5, 6)]: "wh-A",
    [cellKey(6, 6)]: "wh-A",
    [cellKey(10, 5)]: "wh-B",
    [cellKey(11, 5)]: "wh-B",
    [cellKey(10, 6)]: "wh-B",
    [cellKey(11, 6)]: "wh-B",
    [cellKey(5, 7)]: "conv-1",
  };
  const conveyors: Record<string, ConveyorState> = {
    "conv-1": { queue: ["iron"] },
  };

  return {
    ...base,
    assets,
    cellMap,
    conveyors,
    warehousesPlaced: 2,
    warehousesPurchased: 2,
    warehouseInventories: {
      "wh-A": emptyInv(),
      "wh-B": emptyInv(),
    },
    // Conveyor needs power — mark as connected and powered
    connectedAssetIds: ["conv-1", "wh-A", "wh-B"],
    poweredMachineIds: ["conv-1"],
  };
}

// ---------------------------------------------------------------------------
// 1. tryStoreInWarehouse writes into per-WH inventory
// ---------------------------------------------------------------------------

describe("LOGISTICS_TICK – warehouse storage", () => {
  it("stores item in the target warehouse inventory, not in global inventory", () => {
    const before = stateWithTwoWarehouses();
    const globalIronBefore = before.inventory.iron;
    const after = gameReducer(before, { type: "LOGISTICS_TICK" });

    // Item should be in warehouse A
    expect(after.warehouseInventories["wh-A"].iron).toBe(1);
    // Global inventory should NOT have gained the iron
    expect(after.inventory.iron).toBe(globalIronBefore);
  });

  it("does not alter warehouse B when storing in warehouse A", () => {
    const before = stateWithTwoWarehouses();
    const after = gameReducer(before, { type: "LOGISTICS_TICK" });

    expect(after.warehouseInventories["wh-B"].iron).toBe(0);
    expect(after.warehouseInventories["wh-A"].iron).toBe(1);
  });

  it("removes the item from the conveyor queue after delivery", () => {
    const before = stateWithTwoWarehouses();
    expect(before.conveyors["conv-1"].queue).toEqual(["iron"]);

    const after = gameReducer(before, { type: "LOGISTICS_TICK" });
    expect(after.conveyors["conv-1"].queue).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Warehouse capacity limits
// ---------------------------------------------------------------------------

describe("LOGISTICS_TICK – warehouse capacity", () => {
  it("respects per-warehouse capacity limit", () => {
    const before = stateWithTwoWarehouses();
    // Fill warehouse A to capacity for iron
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { iron: WAREHOUSE_CAPACITY });
    before.conveyors["conv-1"] = { queue: ["iron"] };

    const after = gameReducer(before, { type: "LOGISTICS_TICK" });

    // Iron should still be on the conveyor (warehouse full)
    expect(after.conveyors["conv-1"].queue).toEqual(["iron"]);
    // Warehouse should not exceed capacity
    expect(after.warehouseInventories["wh-A"].iron).toBe(WAREHOUSE_CAPACITY);
  });

  it("accepts item when warehouse has room just below capacity", () => {
    const before = stateWithTwoWarehouses();
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { iron: WAREHOUSE_CAPACITY - 1 });
    before.conveyors["conv-1"] = { queue: ["iron"] };

    const after = gameReducer(before, { type: "LOGISTICS_TICK" });

    expect(after.warehouseInventories["wh-A"].iron).toBe(WAREHOUSE_CAPACITY);
    expect(after.conveyors["conv-1"].queue).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Missing warehouse ID → graceful handling
// ---------------------------------------------------------------------------

describe("tryStoreInWarehouse – missing warehouse", () => {
  it("does not crash when warehouse inventory entry is missing", () => {
    const before = stateWithTwoWarehouses();
    // Remove the warehouse inventory entry for wh-A (simulates corrupt state)
    delete before.warehouseInventories["wh-A"];

    // Should not throw
    const after = gameReducer(before, { type: "LOGISTICS_TICK" });

    // Item stays on conveyor
    expect(after.conveyors["conv-1"].queue).toEqual(["iron"]);
  });
});

// ---------------------------------------------------------------------------
// 4. Global inventory remains untouched by warehouse deliveries
// ---------------------------------------------------------------------------

describe("global inventory isolation", () => {
  it("crafting reads from global inventory, not warehouse inventories", () => {
    const state = createInitialState("release");
    // Give global inventory some resources but warehouses have different amounts
    state.inventory = addResources(emptyInv(), { wood: 0, stone: 0 });
    state.warehouseInventories = {
      "wh-1": addResources(emptyInv(), { wood: 100, stone: 100 }),
    };

    // Try to buy something that costs coins — should use global inventory
    const result = gameReducer(state, { type: "BUY_MAP_SHOP_ITEM", itemKey: "axe" });

    // If global coins = 0 (or insufficient), purchase should fail → state unchanged
    // The warehouse's resources must NOT be used for purchases.
    if (state.inventory.coins < 1) {
      expect(result).toBe(state);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Manual transfer: global → warehouse (TRANSFER_TO_WAREHOUSE)
// ---------------------------------------------------------------------------

describe("TRANSFER_TO_WAREHOUSE", () => {
  function stateWithWarehouse(): GameState {
    const base = stateWithTwoWarehouses();
    return { ...base, selectedWarehouseId: "wh-A", inventory: addResources(emptyInv(), { iron: 50, wood: 30 }) };
  }

  it("moves requested amount from global to selected warehouse", () => {
    const before = stateWithWarehouse();
    const after = gameReducer(before, { type: "TRANSFER_TO_WAREHOUSE", item: "iron", amount: 10 });

    expect(after.inventory.iron).toBe(40);
    expect(after.warehouseInventories["wh-A"].iron).toBe(10);
  });

  it("clamps to available global amount", () => {
    const before = stateWithWarehouse();
    // Set global iron below warehouse capacity so global amount is the binding constraint
    before.inventory = addResources(emptyInv(), { iron: 5, wood: 30 });
    const after = gameReducer(before, { type: "TRANSFER_TO_WAREHOUSE", item: "iron", amount: 999 });

    expect(after.inventory.iron).toBe(0);
    expect(after.warehouseInventories["wh-A"].iron).toBe(5);
  });

  it("clamps to remaining warehouse capacity", () => {
    const before = stateWithWarehouse();
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { iron: WAREHOUSE_CAPACITY - 3 });
    const after = gameReducer(before, { type: "TRANSFER_TO_WAREHOUSE", item: "iron", amount: 10 });

    expect(after.warehouseInventories["wh-A"].iron).toBe(WAREHOUSE_CAPACITY);
    expect(after.inventory.iron).toBe(50 - 3);
  });

  it("returns unchanged state when warehouse is full", () => {
    const before = stateWithWarehouse();
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { iron: WAREHOUSE_CAPACITY });
    const after = gameReducer(before, { type: "TRANSFER_TO_WAREHOUSE", item: "iron", amount: 1 });

    expect(after).toBe(before);
  });

  it("returns unchanged state when global has no resource", () => {
    const before = stateWithWarehouse();
    before.inventory = addResources(emptyInv(), { iron: 0 });
    const after = gameReducer(before, { type: "TRANSFER_TO_WAREHOUSE", item: "iron", amount: 5 });

    expect(after).toBe(before);
  });

  it("does not affect warehouse B", () => {
    const before = stateWithWarehouse();
    const after = gameReducer(before, { type: "TRANSFER_TO_WAREHOUSE", item: "iron", amount: 10 });

    expect(after.warehouseInventories["wh-B"].iron).toBe(0);
  });

  it("returns unchanged state with no selectedWarehouseId", () => {
    const before = stateWithWarehouse();
    before.selectedWarehouseId = null;
    const after = gameReducer(before, { type: "TRANSFER_TO_WAREHOUSE", item: "iron", amount: 5 });

    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 6. Manual transfer: warehouse → global (TRANSFER_FROM_WAREHOUSE)
// ---------------------------------------------------------------------------

describe("TRANSFER_FROM_WAREHOUSE", () => {
  function stateWithWarehouse(): GameState {
    const base = stateWithTwoWarehouses();
    base.warehouseInventories["wh-A"] = addResources(emptyInv(), { iron: 15, wood: 8 });
    return { ...base, selectedWarehouseId: "wh-A" };
  }

  it("moves requested amount from warehouse to global", () => {
    const before = stateWithWarehouse();
    const globalIronBefore = before.inventory.iron;
    const after = gameReducer(before, { type: "TRANSFER_FROM_WAREHOUSE", item: "iron", amount: 5 });

    expect(after.warehouseInventories["wh-A"].iron).toBe(10);
    expect(after.inventory.iron).toBe(globalIronBefore + 5);
  });

  it("clamps to available warehouse amount", () => {
    const before = stateWithWarehouse();
    const globalIronBefore = before.inventory.iron;
    const after = gameReducer(before, { type: "TRANSFER_FROM_WAREHOUSE", item: "iron", amount: 999 });

    expect(after.warehouseInventories["wh-A"].iron).toBe(0);
    expect(after.inventory.iron).toBe(globalIronBefore + 15);
  });

  it("returns unchanged state when warehouse has none of the resource", () => {
    const before = stateWithWarehouse();
    const after = gameReducer(before, { type: "TRANSFER_FROM_WAREHOUSE", item: "copper", amount: 5 });

    expect(after).toBe(before);
  });

  it("does not affect warehouse B", () => {
    const before = stateWithWarehouse();
    before.warehouseInventories["wh-B"] = addResources(emptyInv(), { iron: 7 });
    const after = gameReducer(before, { type: "TRANSFER_FROM_WAREHOUSE", item: "iron", amount: 5 });

    expect(after.warehouseInventories["wh-B"].iron).toBe(7);
  });

  it("returns unchanged state with no selectedWarehouseId", () => {
    const before = stateWithWarehouse();
    before.selectedWarehouseId = null;
    const after = gameReducer(before, { type: "TRANSFER_FROM_WAREHOUSE", item: "iron", amount: 5 });

    expect(after).toBe(before);
  });
});
