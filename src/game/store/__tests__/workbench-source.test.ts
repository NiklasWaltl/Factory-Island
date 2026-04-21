// ============================================================
// Tests – Workbench Resource Source (per-building, global vs. warehouse)
// ============================================================

import {
  gameReducer,
  createInitialState,
  addResources,
  resolveBuildingSource,
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

/**
 * Build a state with two workbenches + two warehouses.
 * Both workbenches are powered.
 */
function stateWithWorkbenches(): GameState {
  const base = createInitialState("release");

  const wb1: PlacedAsset = { id: "wb-1", type: "workbench", x: 3, y: 3, size: 2 };
  const wb2: PlacedAsset = { id: "wb-2", type: "workbench", x: 7, y: 3, size: 2 };
  const whA: PlacedAsset = { id: "wh-A", type: "warehouse", x: 5, y: 5, size: 2, direction: "south" };
  const whB: PlacedAsset = { id: "wh-B", type: "warehouse", x: 10, y: 5, size: 2, direction: "south" };

  const assets: Record<string, PlacedAsset> = {
    "wb-1": wb1, "wb-2": wb2, "wh-A": whA, "wh-B": whB,
  };
  const cellMap: Record<string, string> = {
    [cellKey(3, 3)]: "wb-1", [cellKey(4, 3)]: "wb-1", [cellKey(3, 4)]: "wb-1", [cellKey(4, 4)]: "wb-1",
    [cellKey(7, 3)]: "wb-2", [cellKey(8, 3)]: "wb-2", [cellKey(7, 4)]: "wb-2", [cellKey(8, 4)]: "wb-2",
    [cellKey(5, 5)]: "wh-A", [cellKey(6, 5)]: "wh-A", [cellKey(5, 6)]: "wh-A", [cellKey(6, 6)]: "wh-A",
    [cellKey(10, 5)]: "wh-B", [cellKey(11, 5)]: "wh-B", [cellKey(10, 6)]: "wh-B", [cellKey(11, 6)]: "wh-B",
  };

  return {
    ...base,
    assets,
    cellMap,
    placedBuildings: ["workbench"],
    warehousesPlaced: 2,
    warehousesPurchased: 2,
    warehouseInventories: { "wh-A": emptyInv(), "wh-B": emptyInv() },
    connectedAssetIds: ["wb-1", "wb-2", "wh-A", "wh-B"],
    poweredMachineIds: ["wb-1", "wb-2"],
    hotbarSlots: [
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
    ],
    buildingSourceWarehouseIds: {},
    selectedCraftingBuildingId: "wb-1",
  };
}

// ---------------------------------------------------------------------------
// 1. resolveBuildingSource
// ---------------------------------------------------------------------------

describe("resolveBuildingSource", () => {
  it("returns global when no mapping exists", () => {
    const state = stateWithWorkbenches();
    expect(resolveBuildingSource(state, "wb-1")).toEqual({ kind: "global" });
  });

  it("returns warehouse when a valid mapping exists", () => {
    const state = { ...stateWithWorkbenches(), buildingSourceWarehouseIds: { "wb-1": "wh-A" } };
    expect(resolveBuildingSource(state, "wb-1")).toEqual({ kind: "warehouse", warehouseId: "wh-A" });
  });

  it("falls back to global when assigned warehouse ID has no asset", () => {
    const state = { ...stateWithWorkbenches(), buildingSourceWarehouseIds: { "wb-1": "nonexistent" } };
    expect(resolveBuildingSource(state, "wb-1")).toEqual({ kind: "global" });
  });

  it("falls back to global when assigned warehouse has no inventory entry", () => {
    const state = stateWithWorkbenches();
    state.buildingSourceWarehouseIds = { "wb-1": "wh-A" };
    delete state.warehouseInventories["wh-A"];
    expect(resolveBuildingSource(state, "wb-1")).toEqual({ kind: "global" });
  });

  it("returns global when buildingId is null", () => {
    expect(resolveBuildingSource(stateWithWorkbenches(), null)).toEqual({ kind: "global" });
  });
});

// ---------------------------------------------------------------------------
// 2. SET_BUILDING_SOURCE action
// ---------------------------------------------------------------------------

describe("SET_BUILDING_SOURCE (workbench)", () => {
  it("sets a valid warehouse for a building", () => {
    const before = stateWithWorkbenches();
    const after = gameReducer(before, { type: "SET_BUILDING_SOURCE", buildingId: "wb-1", warehouseId: "wh-A" });
    expect(after.buildingSourceWarehouseIds["wb-1"]).toBe("wh-A");
  });

  it("resets to global (removes mapping)", () => {
    const before = { ...stateWithWorkbenches(), buildingSourceWarehouseIds: { "wb-1": "wh-A" } };
    const after = gameReducer(before, { type: "SET_BUILDING_SOURCE", buildingId: "wb-1", warehouseId: null });
    expect(after.buildingSourceWarehouseIds["wb-1"]).toBeUndefined();
  });

  it("rejects an invalid warehouse ID", () => {
    const before = stateWithWorkbenches();
    const after = gameReducer(before, { type: "SET_BUILDING_SOURCE", buildingId: "wb-1", warehouseId: "nonexistent" });
    expect(after).toBe(before);
  });

  it("rejects when building itself is invalid", () => {
    const before = stateWithWorkbenches();
    const after = gameReducer(before, { type: "SET_BUILDING_SOURCE", buildingId: "bogus", warehouseId: "wh-A" });
    expect(after).toBe(before);
  });
});


// ---------------------------------------------------------------------------
// 3. CRAFT_WORKBENCH - deprecated action
// ---------------------------------------------------------------------------
// The synchronous CRAFT_WORKBENCH reducer case is a no-op (see reducer.ts).
// Crafting now flows through the queue (ENQUEUE / CRAFT_TICK), which has its
// own dedicated tests in src/game/crafting/__tests__/. Source resolution is
// covered by the resolveBuildingSource describe above, so we only assert the
// deprecation contract here.

describe("CRAFT_WORKBENCH (deprecated) - no-op contract", () => {
  it("returns the same state reference", () => {
    const before = stateWithWorkbenches();
    before.inventory = addResources(emptyInv(), { wood: 20 });
    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after).toBe(before);
  });
});

