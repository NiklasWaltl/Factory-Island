// ============================================================
// Tests – Auto-assign nearest warehouse source on building placement
// ============================================================

import {
  gameReducer,
  createInitialState,
  addResources,
  getNearestWarehouseId,
  manhattanDist,
  BUILDINGS_WITH_DEFAULT_SOURCE,
  BUILDING_COSTS,
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
 * Returns a minimal state with one warehouse placed and enough resources to
 * place any crafting building. No crafting buildings placed yet.
 */
function stateWithOneWarehouse(): GameState {
  const base = createInitialState("release");

  const whA: PlacedAsset = { id: "wh-A", type: "warehouse", x: 5, y: 5, size: 2, direction: "south" };
  const assets: Record<string, PlacedAsset> = { "wh-A": whA };
  const cellMap: Record<string, string> = {
    [cellKey(5, 5)]: "wh-A", [cellKey(6, 5)]: "wh-A",
    [cellKey(5, 6)]: "wh-A", [cellKey(6, 6)]: "wh-A",
  };

  return {
    ...base,
    assets,
    cellMap,
    warehousesPlaced: 1,
    warehousesPurchased: 1,
    warehouseInventories: { "wh-A": emptyInv() },
    placedBuildings: [],
    purchasedBuildings: [],
    inventory: addResources(emptyInv(), {
      wood: 200, stone: 200, iron: 200, copper: 200,
      ironIngot: 200, copperIngot: 200,
    }),
    buildingSourceWarehouseIds: {},
  };
}

/** State with two warehouses. */
function stateWithTwoWarehouses(): GameState {
  const s = stateWithOneWarehouse();
  const whB: PlacedAsset = { id: "wh-B", type: "warehouse", x: 10, y: 5, size: 2, direction: "south" };
  return {
    ...s,
    assets: { ...s.assets, "wh-B": whB },
    cellMap: {
      ...s.cellMap,
      [cellKey(10, 5)]: "wh-B", [cellKey(11, 5)]: "wh-B",
      [cellKey(10, 6)]: "wh-B", [cellKey(11, 6)]: "wh-B",
    },
    warehousesPlaced: 2,
    warehousesPurchased: 2,
    warehouseInventories: { ...s.warehouseInventories, "wh-B": emptyInv() },
    placedBuildings: [],
    purchasedBuildings: [],
  };
}

/** State with no warehouse — clean state with no pre-existing assets. */
function stateWithNoWarehouse(): GameState {
  const base = createInitialState("release");
  return {
    ...base,
    assets: {},
    cellMap: {},
    warehousesPlaced: 0,
    warehousesPurchased: 0,
    warehouseInventories: {},
    placedBuildings: [],
    purchasedBuildings: [],
    connectedAssetIds: [],
    inventory: addResources(emptyInv(), {
      wood: 200, stone: 200, iron: 200, copper: 200,
      ironIngot: 200, copperIngot: 200,
    }),
    buildingSourceWarehouseIds: {},
  };
}

/** Place a building via the reducer and return the new state. */
function placeBuildingAt(state: GameState, buildingType: string, x: number, y: number): GameState {
  return gameReducer(
    { ...state, selectedBuildingType: buildingType, buildMode: true },
    { type: "BUILD_PLACE_BUILDING", x, y },
  );
}

/** Find the asset ID of the newly placed building by type (excluding pre-existing ones). */
function findNewAssetId(before: GameState, after: GameState, type: string): string | undefined {
  const oldIds = new Set(Object.keys(before.assets));
  return Object.keys(after.assets).find((id) => !oldIds.has(id) && after.assets[id].type === type);
}

// ---------------------------------------------------------------------------
// 1. manhattanDist & getNearestWarehouseId helpers
// ---------------------------------------------------------------------------

describe("manhattanDist", () => {
  it("returns 0 for same position", () => {
    expect(manhattanDist(5, 5, 5, 5)).toBe(0);
  });
  it("returns correct Manhattan distance", () => {
    expect(manhattanDist(0, 0, 3, 4)).toBe(7);
    expect(manhattanDist(1, 2, 4, 6)).toBe(7);
  });
});

describe("getNearestWarehouseId", () => {
  it("returns the only warehouse when one exists", () => {
    const s = stateWithOneWarehouse(); // wh-A at (5,5)
    expect(getNearestWarehouseId(s, 0, 0)).toBe("wh-A");
  });

  it("returns null when no warehouses exist", () => {
    const s = stateWithNoWarehouse();
    expect(getNearestWarehouseId(s, 0, 0)).toBeNull();
  });

  it("returns the closer warehouse", () => {
    const s = stateWithTwoWarehouses(); // wh-A at (5,5), wh-B at (10,5)
    // (0,0) → wh-A: |0-5|+|0-5|=10, wh-B: |0-10|+|0-5|=15 → A
    expect(getNearestWarehouseId(s, 0, 0)).toBe("wh-A");
    // (12,5) → wh-A: |12-5|+|5-5|=7, wh-B: |12-10|+|5-5|=2 → B
    expect(getNearestWarehouseId(s, 12, 5)).toBe("wh-B");
  });

  it("uses lexicographic tie-break at equal distance", () => {
    const s = stateWithTwoWarehouses(); // wh-A at (5,5), wh-B at (10,5)
    // Midpoint (7,5): wh-A: |7-5|=2, wh-B: |7-10|=3 → not equal
    // Need equal distance: (7,5) dist to A=2+0=2, dist to B=3+0=3 not equal
    // Better: place at exact equidistant point
    // wh-A at (5,5), wh-B at (10,5). dist from (7,4): A=|7-5|+|4-5|=3, B=|7-10|+|4-5|=4 → not equal
    // wh-A at (5,5), wh-B at (10,5). Let's use same y: (7.5,5) → need integer grid
    // dist from (8,5): A=3, B=2 → B wins (not tie)
    // Actually for tie we need a custom state:
    const custom: GameState = {
      ...s,
      assets: {
        ...s.assets,
        "wh-A": { ...s.assets["wh-A"], x: 0, y: 0 },
        "wh-B": { ...s.assets["wh-B"], x: 10, y: 0 },
      },
    };
    // From (5,0): dist to A=5, dist to B=5 → tie → "wh-A" < "wh-B" → A wins
    expect(getNearestWarehouseId(custom, 5, 0)).toBe("wh-A");
  });

  it("respects excludeId", () => {
    const s = stateWithTwoWarehouses(); // wh-A at (5,5), wh-B at (10,5)
    // (0,0) is closer to wh-A, but exclude wh-A → wh-B
    expect(getNearestWarehouseId(s, 0, 0, "wh-A")).toBe("wh-B");
  });

  it("returns null when all warehouses are excluded", () => {
    const s = stateWithOneWarehouse();
    expect(getNearestWarehouseId(s, 0, 0, "wh-A")).toBeNull();
  });

  it("is deterministic across repeated calls", () => {
    const s = stateWithTwoWarehouses();
    const a = getNearestWarehouseId(s, 3, 3);
    const b = getNearestWarehouseId(s, 3, 3);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 2. Placement WITH warehouse → auto-assigns
// ---------------------------------------------------------------------------

describe("Auto-assign on placement (warehouse exists)", () => {
  it("workbench gets nearest warehouse on placement", () => {
    const before = stateWithOneWarehouse(); // wh-A at (5,5)
    const after = placeBuildingAt(before, "workbench", 0, 0);

    const wbId = findNewAssetId(before, after, "workbench");
    expect(wbId).toBeDefined();
    expect(after.buildingSourceWarehouseIds[wbId!]).toBe("wh-A");
  });

  it("smithy gets nearest warehouse on placement", () => {
    const before = stateWithOneWarehouse();
    const after = placeBuildingAt(before, "smithy", 0, 0);

    const smId = findNewAssetId(before, after, "smithy");
    expect(smId).toBeDefined();
    expect(after.buildingSourceWarehouseIds[smId!]).toBe("wh-A");
  });

  it("manual_assembler gets nearest warehouse on placement", () => {
    const before = stateWithOneWarehouse();
    const after = placeBuildingAt(before, "manual_assembler", 0, 0);

    const maId = findNewAssetId(before, after, "manual_assembler");
    expect(maId).toBeDefined();
    expect(after.buildingSourceWarehouseIds[maId!]).toBe("wh-A");
  });

  it("picks the nearer warehouse when two exist", () => {
    const before = stateWithTwoWarehouses(); // wh-A at (5,5), wh-B at (10,5)
    // Place near wh-B
    const after = placeBuildingAt(before, "workbench", 12, 5);

    const wbId = findNewAssetId(before, after, "workbench");
    expect(wbId).toBeDefined();
    expect(after.buildingSourceWarehouseIds[wbId!]).toBe("wh-B");
  });

  it("picks wh-A when placement is closer to A", () => {
    const before = stateWithTwoWarehouses(); // wh-A at (5,5), wh-B at (10,5)
    // Place at (0,0) → dist to A=10, dist to B=15 → A wins
    const after = placeBuildingAt(before, "smithy", 0, 0);

    const smId = findNewAssetId(before, after, "smithy");
    expect(smId).toBeDefined();
    expect(after.buildingSourceWarehouseIds[smId!]).toBe("wh-A");
  });

  it("does not overwrite existing mappings for other buildings", () => {
    const before = stateWithOneWarehouse();
    // Pre-assign some other building to wh-A
    before.buildingSourceWarehouseIds = { "existing-id": "wh-A" };

    const after = placeBuildingAt(before, "workbench", 0, 0);
    // Old mapping preserved
    expect(after.buildingSourceWarehouseIds["existing-id"]).toBe("wh-A");
    // New workbench also assigned
    const wbId = findNewAssetId(before, after, "workbench");
    expect(after.buildingSourceWarehouseIds[wbId!]).toBe("wh-A");
  });
});

// ---------------------------------------------------------------------------
// 3. Placement WITHOUT warehouse → stays global
// ---------------------------------------------------------------------------

describe("Auto-assign on placement (no warehouse)", () => {
  it("workbench stays global when no warehouse exists", () => {
    const before = stateWithNoWarehouse();
    const after = placeBuildingAt(before, "workbench", 0, 0);

    const wbId = findNewAssetId(before, after, "workbench");
    expect(wbId).toBeDefined();
    expect(after.buildingSourceWarehouseIds[wbId!]).toBeUndefined();
  });

  it("smithy stays global when no warehouse exists", () => {
    const before = stateWithNoWarehouse();
    const after = placeBuildingAt(before, "smithy", 0, 0);

    const smId = findNewAssetId(before, after, "smithy");
    expect(smId).toBeDefined();
    expect(after.buildingSourceWarehouseIds[smId!]).toBeUndefined();
  });

  it("manual_assembler stays global when no warehouse exists", () => {
    const before = stateWithNoWarehouse();
    const after = placeBuildingAt(before, "manual_assembler", 0, 0);

    const maId = findNewAssetId(before, after, "manual_assembler");
    expect(maId).toBeDefined();
    expect(after.buildingSourceWarehouseIds[maId!]).toBeUndefined();
  });

  it("no error and consistent state when no warehouse", () => {
    const before = stateWithNoWarehouse();
    const after = placeBuildingAt(before, "workbench", 0, 0);

    expect(after.notifications.length).toBe(before.notifications.length);
    expect(typeof after.buildingSourceWarehouseIds).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// 4. Non-crafting buildings are NOT auto-assigned
// ---------------------------------------------------------------------------

describe("Non-crafting buildings unaffected", () => {
  it("warehouse placement does not create a source mapping for itself", () => {
    const before = stateWithNoWarehouse();
    const after = gameReducer(
      { ...before, selectedBuildingType: "warehouse", buildMode: true },
      { type: "BUILD_PLACE_BUILDING", x: 0, y: 0, direction: "south" },
    );

    const whId = findNewAssetId(before, after, "warehouse");
    expect(whId).toBeDefined();
    expect(after.buildingSourceWarehouseIds[whId!]).toBeUndefined();
  });

  it("generator placement does not create a source mapping", () => {
    // Generator requires stone floor — place floor first
    const before = stateWithOneWarehouse();
    before.floorMap = {
      [cellKey(0, 0)]: "stone_floor",
      [cellKey(1, 0)]: "stone_floor",
      [cellKey(0, 1)]: "stone_floor",
      [cellKey(1, 1)]: "stone_floor",
    };

    const after = placeBuildingAt(before, "generator", 0, 0);
    const genId = findNewAssetId(before, after, "generator");
    if (genId) {
      expect(after.buildingSourceWarehouseIds[genId]).toBeUndefined();
    }
  });

  it("cable placement does not create a source mapping", () => {
    const before = stateWithOneWarehouse();
    const after = placeBuildingAt(before, "cable", 0, 0);
    const cId = findNewAssetId(before, after, "cable");
    if (cId) {
      expect(after.buildingSourceWarehouseIds[cId]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Manual override still works after auto-assign
// ---------------------------------------------------------------------------

describe("Manual override after auto-assign", () => {
  it("auto-assigned source can be changed to a different warehouse", () => {
    const before = stateWithTwoWarehouses(); // wh-A at (5,5), wh-B at (10,5)
    // Place near wh-A → auto-assigns wh-A
    const after = placeBuildingAt(before, "workbench", 0, 0);

    const wbId = findNewAssetId(before, after, "workbench")!;
    expect(after.buildingSourceWarehouseIds[wbId]).toBe("wh-A");

    // Manually switch to wh-B
    const changed = gameReducer(after, { type: "SET_BUILDING_SOURCE", buildingId: wbId, warehouseId: "wh-B" });
    expect(changed.buildingSourceWarehouseIds[wbId]).toBe("wh-B");
  });

  it("auto-assigned source can be reset to global", () => {
    const before = stateWithOneWarehouse();
    const after = placeBuildingAt(before, "smithy", 0, 0);

    const smId = findNewAssetId(before, after, "smithy")!;
    expect(after.buildingSourceWarehouseIds[smId]).toBe("wh-A");

    const reset = gameReducer(after, { type: "SET_BUILDING_SOURCE", buildingId: smId, warehouseId: null });
    expect(reset.buildingSourceWarehouseIds[smId]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. BUILDINGS_WITH_DEFAULT_SOURCE set is correct
// ---------------------------------------------------------------------------

describe("BUILDINGS_WITH_DEFAULT_SOURCE", () => {
  it("contains exactly workbench, smithy, manual_assembler, auto_smelter, auto_miner", () => {
    expect(BUILDINGS_WITH_DEFAULT_SOURCE.has("workbench")).toBe(true);
    expect(BUILDINGS_WITH_DEFAULT_SOURCE.has("smithy")).toBe(true);
    expect(BUILDINGS_WITH_DEFAULT_SOURCE.has("manual_assembler")).toBe(true);
    expect(BUILDINGS_WITH_DEFAULT_SOURCE.has("auto_smelter")).toBe(true);
    expect(BUILDINGS_WITH_DEFAULT_SOURCE.has("auto_miner")).toBe(true);
    expect(BUILDINGS_WITH_DEFAULT_SOURCE.size).toBe(5);
  });
});
