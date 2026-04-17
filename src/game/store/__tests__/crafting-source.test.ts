// ============================================================
// Tests – Generic CraftingSource: Smithy + Manual Assembler (per-building)
// ============================================================

import {
  gameReducer,
  createInitialState,
  addResources,
  resolveBuildingSource,
  resolveCraftingSource,
  cellKey,
  type GameState,
  type PlacedAsset,
  type Inventory,
} from "../reducer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyInv(): Inventory {
  return createInitialState("release").inventory;
}

/** State with smithy, manual_assembler, and two warehouses — all powered. */
function baseState(): GameState {
  const base = createInitialState("release");

  const sm: PlacedAsset = { id: "sm-1", type: "smithy", x: 1, y: 1, size: 2 };
  const ma: PlacedAsset = { id: "ma-1", type: "manual_assembler", x: 4, y: 1, size: 1 };
  const whA: PlacedAsset = { id: "wh-A", type: "warehouse", x: 6, y: 1, size: 2, direction: "south" };
  const whB: PlacedAsset = { id: "wh-B", type: "warehouse", x: 10, y: 1, size: 2, direction: "south" };

  const assets: Record<string, PlacedAsset> = {
    "sm-1": sm, "ma-1": ma, "wh-A": whA, "wh-B": whB,
  };
  const cellMap: Record<string, string> = {
    [cellKey(1, 1)]: "sm-1", [cellKey(2, 1)]: "sm-1", [cellKey(1, 2)]: "sm-1", [cellKey(2, 2)]: "sm-1",
    [cellKey(4, 1)]: "ma-1",
    [cellKey(6, 1)]: "wh-A", [cellKey(7, 1)]: "wh-A", [cellKey(6, 2)]: "wh-A", [cellKey(7, 2)]: "wh-A",
    [cellKey(10, 1)]: "wh-B", [cellKey(11, 1)]: "wh-B", [cellKey(10, 2)]: "wh-B", [cellKey(11, 2)]: "wh-B",
  };

  return {
    ...base,
    assets,
    cellMap,
    placedBuildings: ["smithy", "manual_assembler"],
    warehousesPlaced: 2,
    warehousesPurchased: 2,
    warehouseInventories: { "wh-A": emptyInv(), "wh-B": emptyInv() },
    connectedAssetIds: ["sm-1", "ma-1", "wh-A", "wh-B"],
    poweredMachineIds: ["sm-1", "ma-1"],
    hotbarSlots: [
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
    ],
    buildingSourceWarehouseIds: {},
    selectedCraftingBuildingId: "sm-1",
  };
}

// ---------------------------------------------------------------------------
// 1. resolveCraftingSource (low-level, generic)
// ---------------------------------------------------------------------------

describe("resolveCraftingSource", () => {
  it("returns global when warehouseId is null", () => {
    expect(resolveCraftingSource(baseState(), null)).toEqual({ kind: "global" });
  });

  it("returns warehouse for a valid warehouse", () => {
    expect(resolveCraftingSource(baseState(), "wh-A")).toEqual({ kind: "warehouse", warehouseId: "wh-A" });
  });

  it("falls back to global for non-existent id", () => {
    expect(resolveCraftingSource(baseState(), "nonexistent")).toEqual({ kind: "global" });
  });

  it("falls back to global when warehouse has no inventory", () => {
    const s = baseState();
    delete s.warehouseInventories["wh-A"];
    expect(resolveCraftingSource(s, "wh-A")).toEqual({ kind: "global" });
  });
});

// ---------------------------------------------------------------------------
// 2. SET_BUILDING_SOURCE for smithy / assembler
// ---------------------------------------------------------------------------

describe("SET_BUILDING_SOURCE (smithy)", () => {
  it("sets a valid warehouse", () => {
    const after = gameReducer(baseState(), { type: "SET_BUILDING_SOURCE", buildingId: "sm-1", warehouseId: "wh-A" });
    expect(after.buildingSourceWarehouseIds["sm-1"]).toBe("wh-A");
  });

  it("resets to global (removes mapping)", () => {
    const s = { ...baseState(), buildingSourceWarehouseIds: { "sm-1": "wh-A" } };
    const after = gameReducer(s, { type: "SET_BUILDING_SOURCE", buildingId: "sm-1", warehouseId: null });
    expect(after.buildingSourceWarehouseIds["sm-1"]).toBeUndefined();
  });

  it("ignores unknown warehouse", () => {
    const before = baseState();
    const after = gameReducer(before, { type: "SET_BUILDING_SOURCE", buildingId: "sm-1", warehouseId: "bogus" });
    expect(after).toBe(before);
  });
});

describe("SET_BUILDING_SOURCE (assembler)", () => {
  it("sets a valid warehouse", () => {
    const after = gameReducer(baseState(), { type: "SET_BUILDING_SOURCE", buildingId: "ma-1", warehouseId: "wh-B" });
    expect(after.buildingSourceWarehouseIds["ma-1"]).toBe("wh-B");
  });

  it("resets to global (removes mapping)", () => {
    const s = { ...baseState(), buildingSourceWarehouseIds: { "ma-1": "wh-B" } };
    const after = gameReducer(s, { type: "SET_BUILDING_SOURCE", buildingId: "ma-1", warehouseId: null });
    expect(after.buildingSourceWarehouseIds["ma-1"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Smithy — global source (default behaviour, must be unchanged)
// ---------------------------------------------------------------------------

describe("Smithy with global source", () => {
  it("SMITHY_ADD_FUEL consumes from global inventory", () => {
    const s = { ...baseState(), inventory: addResources(emptyInv(), { wood: 10 }) };
    const after = gameReducer(s, { type: "SMITHY_ADD_FUEL", amount: 3 });
    expect(after.inventory.wood).toBe(7);
    expect(after.smithy.fuel).toBe(3);
  });

  it("SMITHY_ADD_IRON consumes from global inventory", () => {
    const s = { ...baseState(), inventory: addResources(emptyInv(), { iron: 10 }) };
    const after = gameReducer(s, { type: "SMITHY_ADD_IRON", amount: 5 });
    expect(after.inventory.iron).toBe(5);
    expect(after.smithy.iron).toBe(5);
  });

  it("SMITHY_ADD_COPPER consumes from global inventory", () => {
    const s = { ...baseState(), inventory: addResources(emptyInv(), { copper: 8 }) };
    const after = gameReducer(s, { type: "SMITHY_ADD_COPPER", amount: 5 });
    expect(after.inventory.copper).toBe(3);
    expect(after.smithy.copper).toBe(5);
  });

  it("SMITHY_WITHDRAW deposits to global inventory", () => {
    const s = {
      ...baseState(),
      smithy: { ...baseState().smithy, outputIngots: 3, outputCopperIngots: 2 },
    };
    const after = gameReducer(s, { type: "SMITHY_WITHDRAW" });
    expect(after.inventory.ironIngot).toBe(3);
    expect(after.inventory.copperIngot).toBe(2);
    expect(after.smithy.outputIngots).toBe(0);
    expect(after.smithy.outputCopperIngots).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Smithy — warehouse source (per-building)
// ---------------------------------------------------------------------------

describe("Smithy with warehouse source", () => {
  function smithyWarehouse(): GameState {
    const s = baseState();
    s.buildingSourceWarehouseIds = { "sm-1": "wh-A" };
    s.selectedCraftingBuildingId = "sm-1";
    s.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 10, iron: 10, copper: 10 });
    return s;
  }

  it("ADD_FUEL consumes from warehouse", () => {
    const after = gameReducer(smithyWarehouse(), { type: "SMITHY_ADD_FUEL", amount: 3 });
    expect(after.warehouseInventories["wh-A"].wood).toBe(7);
    expect(after.inventory.wood).toBe(0);
    expect(after.smithy.fuel).toBe(3);
  });

  it("ADD_IRON consumes from warehouse", () => {
    const after = gameReducer(smithyWarehouse(), { type: "SMITHY_ADD_IRON", amount: 5 });
    expect(after.warehouseInventories["wh-A"].iron).toBe(5);
    expect(after.inventory.iron).toBe(0);
    expect(after.smithy.iron).toBe(5);
  });

  it("ADD_COPPER consumes from warehouse", () => {
    const after = gameReducer(smithyWarehouse(), { type: "SMITHY_ADD_COPPER", amount: 5 });
    expect(after.warehouseInventories["wh-A"].copper).toBe(5);
    expect(after.inventory.copper).toBe(0);
    expect(after.smithy.copper).toBe(5);
  });

  it("WITHDRAW deposits to warehouse", () => {
    const s = smithyWarehouse();
    s.smithy = { ...s.smithy, outputIngots: 2, outputCopperIngots: 1 };
    const after = gameReducer(s, { type: "SMITHY_WITHDRAW" });
    expect(after.warehouseInventories["wh-A"].ironIngot).toBe(2);
    expect(after.warehouseInventories["wh-A"].copperIngot).toBe(1);
    expect(after.inventory.ironIngot).toBe(0);
    expect(after.inventory.copperIngot).toBe(0);
  });

  it("ADD_FUEL clamps to available warehouse wood", () => {
    const s = baseState();
    s.buildingSourceWarehouseIds = { "sm-1": "wh-A" };
    s.selectedCraftingBuildingId = "sm-1";
    s.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 2 });
    const after = gameReducer(s, { type: "SMITHY_ADD_FUEL", amount: 5 });
    expect(after.smithy.fuel).toBe(2);
    expect(after.warehouseInventories["wh-A"].wood).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Manual Assembler — global source
// ---------------------------------------------------------------------------

describe("Manual Assembler with global source", () => {
  it("START consumes from global inventory", () => {
    const s = { ...baseState(), selectedCraftingBuildingId: "ma-1" as string | null };
    s.inventory = addResources(emptyInv(), { ironIngot: 5 });
    const after = gameReducer(s, { type: "MANUAL_ASSEMBLER_START", recipe: "metal_plate" });
    expect(after.inventory.ironIngot).toBe(4);
    expect(after.manualAssembler.processing).toBe(true);
    expect(after.manualAssembler.buildingId).toBe("ma-1");
  });

  it("START fails when not enough resources", () => {
    const s = { ...baseState(), selectedCraftingBuildingId: "ma-1" as string | null };
    s.inventory = addResources(emptyInv(), { ironIngot: 0 });
    const after = gameReducer(s, { type: "MANUAL_ASSEMBLER_START", recipe: "metal_plate" });
    expect(after.manualAssembler.processing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Manual Assembler — warehouse source (per-building)
// ---------------------------------------------------------------------------

describe("Manual Assembler with warehouse source", () => {
  function assemblerWarehouse(): GameState {
    const s = baseState();
    s.buildingSourceWarehouseIds = { "ma-1": "wh-B" };
    s.selectedCraftingBuildingId = "ma-1";
    s.warehouseInventories["wh-B"] = addResources(emptyInv(), { ironIngot: 5, metalPlate: 5 });
    return s;
  }

  it("START consumes from warehouse", () => {
    const after = gameReducer(assemblerWarehouse(), { type: "MANUAL_ASSEMBLER_START", recipe: "metal_plate" });
    expect(after.warehouseInventories["wh-B"].ironIngot).toBe(4);
    expect(after.inventory.ironIngot).toBe(0);
    expect(after.manualAssembler.processing).toBe(true);
    expect(after.manualAssembler.buildingId).toBe("ma-1");
  });

  it("START fails when warehouse has insufficient resources", () => {
    const s = assemblerWarehouse();
    s.warehouseInventories["wh-B"] = addResources(emptyInv(), { ironIngot: 0 });
    const after = gameReducer(s, { type: "MANUAL_ASSEMBLER_START", recipe: "metal_plate" });
    expect(after.manualAssembler.processing).toBe(false);
  });

  it("TICK produces into warehouse (via stored buildingId)", () => {
    const s = assemblerWarehouse();
    s.manualAssembler = { processing: true, recipe: "metal_plate", progress: 0.99, buildingId: "ma-1" };
    const after = gameReducer(s, { type: "MANUAL_ASSEMBLER_TICK" });
    expect(after.warehouseInventories["wh-B"].metalPlate).toBe(6); // 5 + 1
    expect(after.inventory.metalPlate).toBe(0);
    expect(after.manualAssembler.processing).toBe(false);
    expect(after.manualAssembler.buildingId).toBeNull();
  });

  it("TICK uses buildingId from manualAssembler state, not selectedCraftingBuildingId", () => {
    const s = assemblerWarehouse();
    s.manualAssembler = { processing: true, recipe: "metal_plate", progress: 0.99, buildingId: "ma-1" };
    // Simulate user having opened a different panel while assembler was running
    s.selectedCraftingBuildingId = "sm-1";
    const after = gameReducer(s, { type: "MANUAL_ASSEMBLER_TICK" });
    // Output should still go to ma-1's warehouse (wh-B), not the smithy's source
    expect(after.warehouseInventories["wh-B"].metalPlate).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 7. Per-building isolation: different buildings, different sources
// ---------------------------------------------------------------------------

describe("Per-building isolation (cross-type)", () => {
  it("smithy uses wh-A, assembler uses wh-B independently", () => {
    const s = baseState();
    s.buildingSourceWarehouseIds = { "sm-1": "wh-A", "ma-1": "wh-B" };

    // Verify resolver resolves independently
    expect(resolveBuildingSource(s, "sm-1")).toEqual({ kind: "warehouse", warehouseId: "wh-A" });
    expect(resolveBuildingSource(s, "ma-1")).toEqual({ kind: "warehouse", warehouseId: "wh-B" });
  });

  it("changing smithy source does not affect assembler source", () => {
    const s = { ...baseState(), buildingSourceWarehouseIds: { "sm-1": "wh-A", "ma-1": "wh-B" } };
    const after = gameReducer(s, { type: "SET_BUILDING_SOURCE", buildingId: "sm-1", warehouseId: null });
    expect(after.buildingSourceWarehouseIds["sm-1"]).toBeUndefined();
    expect(after.buildingSourceWarehouseIds["ma-1"]).toBe("wh-B");
  });
});

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------

describe("CraftingSource edge cases", () => {
  it("Smithy ADD with zero amount is no-op", () => {
    const s = { ...baseState(), inventory: addResources(emptyInv(), { wood: 10 }) };
    const after = gameReducer(s, { type: "SMITHY_ADD_FUEL", amount: 0 });
    expect(after).toBe(s);
  });

  it("Smithy WITHDRAW with nothing is no-op", () => {
    const s = baseState();
    const after = gameReducer(s, { type: "SMITHY_WITHDRAW" });
    expect(after).toBe(s);
  });

  it("Assembler falls back to global when assigned warehouse disappears", () => {
    const s = baseState();
    s.buildingSourceWarehouseIds = { "ma-1": "wh-A" };
    s.selectedCraftingBuildingId = "ma-1";
    delete s.assets["wh-A"];
    delete s.warehouseInventories["wh-A"];
    s.inventory = addResources(emptyInv(), { ironIngot: 5 });
    const after = gameReducer(s, { type: "MANUAL_ASSEMBLER_START", recipe: "metal_plate" });
    expect(after.inventory.ironIngot).toBe(4);
    expect(after.manualAssembler.processing).toBe(true);
  });

  it("ManualAssembler buildingId resets to null on completion", () => {
    const s = baseState();
    s.manualAssembler = { processing: true, recipe: "metal_plate", progress: 0.99, buildingId: "ma-1" };
    const after = gameReducer(s, { type: "MANUAL_ASSEMBLER_TICK" });
    expect(after.manualAssembler.buildingId).toBeNull();
  });
});
