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
// 3. CRAFT_WORKBENCH with global source (unchanged behavior)
// ---------------------------------------------------------------------------

describe("CRAFT_WORKBENCH – global source", () => {
  it("consumes from global inventory and produces into hotbar", () => {
    const before = stateWithWorkbenches();
    before.inventory = addResources(emptyInv(), { wood: 20 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after.inventory.wood).toBe(15);
    expect(after.hotbarSlots.some((s) => s.toolKind === "wood_pickaxe" && s.amount >= 1)).toBe(true);
  });

  it("does not touch warehouse inventories when source is global", () => {
    const before = stateWithWorkbenches();
    before.inventory = addResources(emptyInv(), { wood: 20 });
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 99 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after.warehouseInventories["wh-A"].wood).toBe(99);
    expect(after.inventory.wood).toBe(15);
  });

  it("blocks crafting when global resources insufficient", () => {
    const before = stateWithWorkbenches();
    before.inventory = addResources(emptyInv(), { wood: 2 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 4. CRAFT_WORKBENCH with warehouse source
// ---------------------------------------------------------------------------

describe("CRAFT_WORKBENCH – warehouse source", () => {
  it("consumes from assigned warehouse, not global", () => {
    const before = stateWithWorkbenches();
    before.buildingSourceWarehouseIds = { "wb-1": "wh-A" };
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 10 });
    before.inventory = addResources(emptyInv(), { wood: 50 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after.warehouseInventories["wh-A"].wood).toBe(5);
    expect(after.inventory.wood).toBe(50);
    expect(after.hotbarSlots.some((s) => s.toolKind === "wood_pickaxe" && s.amount >= 1)).toBe(true);
  });

  it("blocks crafting when warehouse has insufficient resources", () => {
    const before = stateWithWorkbenches();
    before.buildingSourceWarehouseIds = { "wb-1": "wh-A" };
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 2 });
    before.inventory = addResources(emptyInv(), { wood: 999 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after).toBe(before);
  });

  it("does not affect warehouse B when crafting from warehouse A", () => {
    const before = stateWithWorkbenches();
    before.buildingSourceWarehouseIds = { "wb-1": "wh-A" };
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 10 });
    before.warehouseInventories["wh-B"] = addResources(emptyInv(), { wood: 7 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after.warehouseInventories["wh-B"].wood).toBe(7);
    expect(after.warehouseInventories["wh-A"].wood).toBe(5);
  });

  it("falls back to global when assigned warehouse is invalid", () => {
    const before = stateWithWorkbenches();
    before.buildingSourceWarehouseIds = { "wb-1": "nonexistent" };
    before.inventory = addResources(emptyInv(), { wood: 20 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after.inventory.wood).toBe(15);
  });

  it("produces non-tool output into the warehouse source", () => {
    const before = stateWithWorkbenches();
    before.buildingSourceWarehouseIds = { "wb-1": "wh-A" };
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 10 });
    before.hotbarSlots = before.hotbarSlots.map(() => ({
      toolKind: "axe" as const,
      durability: 100,
      maxDurability: 100,
      amount: 99,
    }));

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after.warehouseInventories["wh-A"].wood_pickaxe).toBe(1);
    expect(after.warehouseInventories["wh-A"].wood).toBe(5);
    expect(after.inventory.wood_pickaxe).toBe(before.inventory.wood_pickaxe);
  });
});

// ---------------------------------------------------------------------------
// 5. Per-building isolation: two workbenches, different sources
// ---------------------------------------------------------------------------

describe("Per-building isolation (workbench)", () => {
  it("wb-1 uses warehouse A, wb-2 uses global", () => {
    const s = stateWithWorkbenches();
    s.buildingSourceWarehouseIds = { "wb-1": "wh-A" };
    s.selectedCraftingBuildingId = "wb-1";
    s.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 10 });
    s.inventory = addResources(emptyInv(), { wood: 50 });

    const afterWb1 = gameReducer(s, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(afterWb1.warehouseInventories["wh-A"].wood).toBe(5);
    expect(afterWb1.inventory.wood).toBe(50);

    const s2 = { ...afterWb1, selectedCraftingBuildingId: "wb-2" };
    const afterWb2 = gameReducer(s2, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(afterWb2.inventory.wood).toBe(45);
    expect(afterWb2.warehouseInventories["wh-A"].wood).toBe(5);
  });

  it("wb-1 and wb-2 use different warehouses", () => {
    const s = stateWithWorkbenches();
    s.buildingSourceWarehouseIds = { "wb-1": "wh-A", "wb-2": "wh-B" };
    s.selectedCraftingBuildingId = "wb-1";
    s.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 10 });
    s.warehouseInventories["wh-B"] = addResources(emptyInv(), { wood: 20 });

    const afterWb1 = gameReducer(s, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(afterWb1.warehouseInventories["wh-A"].wood).toBe(5);
    expect(afterWb1.warehouseInventories["wh-B"].wood).toBe(20);

    const s2 = { ...afterWb1, selectedCraftingBuildingId: "wb-2" };
    const afterWb2 = gameReducer(s2, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(afterWb2.warehouseInventories["wh-A"].wood).toBe(5);
    expect(afterWb2.warehouseInventories["wh-B"].wood).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases / invariants
// ---------------------------------------------------------------------------

describe("CRAFT_WORKBENCH – edge cases", () => {
  it("no negative values after crafting from warehouse", () => {
    const before = stateWithWorkbenches();
    before.buildingSourceWarehouseIds = { "wb-1": "wh-A" };
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 5 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    for (const val of Object.values(after.warehouseInventories["wh-A"])) {
      expect(val as number).toBeGreaterThanOrEqual(0);
    }
  });

  it("crafting blocked when workbench has no power", () => {
    const before = stateWithWorkbenches();
    before.poweredMachineIds = [];
    before.inventory = addResources(emptyInv(), { wood: 999 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after.inventory.wood).toBe(999);
    expect(after.notifications.length).toBeGreaterThan(before.notifications.length);
  });

  it("multi-resource recipe (stone_pickaxe) works from warehouse", () => {
    const before = stateWithWorkbenches();
    before.buildingSourceWarehouseIds = { "wb-1": "wh-A" };
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 10, stone: 5 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "stone_pickaxe" });
    expect(after.warehouseInventories["wh-A"].wood).toBe(0);
    expect(after.warehouseInventories["wh-A"].stone).toBe(0);
    expect(after.hotbarSlots.some((s) => s.toolKind === "stone_pickaxe" && s.amount >= 1)).toBe(true);
  });

  it("multi-resource recipe blocks if one resource is missing in warehouse", () => {
    const before = stateWithWorkbenches();
    before.buildingSourceWarehouseIds = { "wb-1": "wh-A" };
    before.warehouseInventories["wh-A"] = addResources(emptyInv(), { wood: 10, stone: 2 });

    const after = gameReducer(before, { type: "CRAFT_WORKBENCH", recipeKey: "stone_pickaxe" });
    expect(after).toBe(before);
  });
});
