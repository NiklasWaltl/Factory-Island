// ============================================================
// Tests – Warehouse deletion robustness, nearest-warehouse reassign & stale cleanup
// ============================================================

import {
  gameReducer,
  createInitialState,
  addResources,
  resolveBuildingSource,
  resolveCraftingSource,
  cleanBuildingSourceIds,
  reassignBuildingSourceIds,
  getNearestWarehouseId,
  hasStaleWarehouseAssignment,
  cellKey,
} from "../reducer";
import type { GameState, PlacedAsset, Inventory } from "../types";

import {
  serializeState,
  deserializeState,
} from "../../simulation/save";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyInv(): Inventory {
  return createInitialState("release").inventory;
}

/**
 * Clean state: workbench + smithy + manual_assembler + two warehouses.
 * All buildings powered. No pre-existing source assignments.
 */
function fullState(): GameState {
  const base = createInitialState("release");

  const wb: PlacedAsset = { id: "wb-1", type: "workbench", x: 0, y: 0, size: 2 };
  const sm: PlacedAsset = { id: "sm-1", type: "smithy", x: 3, y: 0, size: 2 };
  const ma: PlacedAsset = { id: "ma-1", type: "manual_assembler", x: 6, y: 0, size: 2 };
  const whA: PlacedAsset = { id: "wh-A", type: "warehouse", x: 0, y: 5, size: 2, direction: "south" };
  const whB: PlacedAsset = { id: "wh-B", type: "warehouse", x: 5, y: 5, size: 2, direction: "south" };

  const assets: Record<string, PlacedAsset> = {
    "wb-1": wb, "sm-1": sm, "ma-1": ma, "wh-A": whA, "wh-B": whB,
  };
  const cellMap: Record<string, string> = {
    [cellKey(0, 0)]: "wb-1", [cellKey(1, 0)]: "wb-1", [cellKey(0, 1)]: "wb-1", [cellKey(1, 1)]: "wb-1",
    [cellKey(3, 0)]: "sm-1", [cellKey(4, 0)]: "sm-1", [cellKey(3, 1)]: "sm-1", [cellKey(4, 1)]: "sm-1",
    [cellKey(6, 0)]: "ma-1", [cellKey(7, 0)]: "ma-1", [cellKey(6, 1)]: "ma-1", [cellKey(7, 1)]: "ma-1",
    [cellKey(0, 5)]: "wh-A", [cellKey(1, 5)]: "wh-A", [cellKey(0, 6)]: "wh-A", [cellKey(1, 6)]: "wh-A",
    [cellKey(5, 5)]: "wh-B", [cellKey(6, 5)]: "wh-B", [cellKey(5, 6)]: "wh-B", [cellKey(6, 6)]: "wh-B",
  };

  return {
    ...base,
    assets,
    cellMap,
    placedBuildings: ["workbench", "smithy", "manual_assembler"],
    purchasedBuildings: ["workbench", "smithy", "manual_assembler"],
    warehousesPlaced: 2,
    warehousesPurchased: 2,
    warehouseInventories: {
      "wh-A": addResources(emptyInv(), { wood: 50, iron: 50, copper: 50, ironIngot: 50 }),
      "wh-B": addResources(emptyInv(), { wood: 30, iron: 30, copper: 30, ironIngot: 30 }),
    },
    connectedAssetIds: ["wb-1", "sm-1", "ma-1", "wh-A", "wh-B"],
    poweredMachineIds: ["wb-1", "sm-1", "ma-1"],
    hotbarSlots: [
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
      { toolKind: "empty", durability: 0, maxDurability: 0, amount: 0 },
    ],
    buildingSourceWarehouseIds: {
      "wb-1": "wh-A",
      "sm-1": "wh-A",
      "ma-1": "wh-B",
    },
    selectedCraftingBuildingId: null,
    buildMode: true,
  };
}

/** State with THREE warehouses for multi-replacement tests */
function tripleWarehouseState(): GameState {
  const s = fullState();
  const whC: PlacedAsset = { id: "wh-C", type: "warehouse", x: 10, y: 5, size: 2, direction: "south" };
  return {
    ...s,
    assets: { ...s.assets, "wh-C": whC },
    cellMap: {
      ...s.cellMap,
      [cellKey(10, 5)]: "wh-C", [cellKey(11, 5)]: "wh-C",
      [cellKey(10, 6)]: "wh-C", [cellKey(11, 6)]: "wh-C",
    },
    warehousesPlaced: 3,
    warehousesPurchased: 3,
    warehouseInventories: {
      ...s.warehouseInventories,
      "wh-C": addResources(emptyInv(), { wood: 10 }),
    },
    connectedAssetIds: [...s.connectedAssetIds, "wh-C"],
  };
}

function removeWarehouse(state: GameState, warehouseId: string): GameState {
  return gameReducer(state, { type: "BUILD_REMOVE_ASSET", assetId: warehouseId });
}

// ===========================================================================
// 1. getNearestWarehouseId (used in reassign)
// ===========================================================================

describe("getNearestWarehouseId", () => {
  it("returns nearest warehouse by Manhattan distance", () => {
    const s = fullState(); // wh-A at (0,5), wh-B at (5,5)
    // wb-1 at (0,0) → dist to A=|0-0|+|0-5|=5, dist to B=|0-5|+|0-5|=10 → A
    expect(getNearestWarehouseId(s, 0, 0)).toBe("wh-A");
    // From (7,5) → dist to A=|7-0|+|5-5|=7, dist to B=|7-5|+|5-5|=2 → B
    expect(getNearestWarehouseId(s, 7, 5)).toBe("wh-B");
  });

  it("excludes specified warehouse", () => {
    const s = fullState();
    expect(getNearestWarehouseId(s, 0, 0, "wh-A")).toBe("wh-B");
  });

  it("returns null when no warehouses remain after exclusion", () => {
    const s = fullState();
    // Remove wh-B inventory so only wh-A is valid
    const s2 = { ...s, warehouseInventories: { "wh-A": s.warehouseInventories["wh-A"] } };
    expect(getNearestWarehouseId(s2, 0, 0, "wh-A")).toBeNull();
  });

  it("tie-break: lexicographically smaller ID wins at equal distance", () => {
    const s = fullState();
    // Place wh-A and wh-B equidistant from a point
    const equidist: GameState = {
      ...s,
      assets: {
        ...s.assets,
        "wh-A": { ...s.assets["wh-A"], x: 0, y: 0 },
        "wh-B": { ...s.assets["wh-B"], x: 10, y: 0 },
      },
    };
    // From (5,0): dist to A=5, dist to B=5 → "wh-A" < "wh-B" → A
    expect(getNearestWarehouseId(equidist, 5, 0)).toBe("wh-A");
  });
});

// ===========================================================================
// 2. reassignBuildingSourceIds (nearest-warehouse aware)
// ===========================================================================

describe("reassignBuildingSourceIds", () => {
  it("keeps valid entries unchanged", () => {
    const s = fullState();
    const mapping = { "wb-1": "wh-A", "sm-1": "wh-A" };
    // "delete" a non-existent warehouse → nothing changes
    expect(reassignBuildingSourceIds(mapping, s, "wh-NONE")).toEqual(mapping);
  });

  it("reassigns stale entry to nearest remaining warehouse", () => {
    const s = fullState(); // wb-1 at (0,0), wh-A at (0,5), wh-B at (5,5)
    const mapping = { "wb-1": "wh-A", "sm-1": "wh-A", "ma-1": "wh-B" };
    // Delete wh-A → wb-1 at (0,0) → nearest remaining is wh-B
    const stateAfter: GameState = {
      ...s,
      warehouseInventories: { "wh-B": s.warehouseInventories["wh-B"] },
    };
    const result = reassignBuildingSourceIds(mapping, stateAfter, "wh-A");
    expect(result["wb-1"]).toBe("wh-B");
    expect(result["sm-1"]).toBe("wh-B");
    expect(result["ma-1"]).toBe("wh-B"); // unchanged
  });

  it("drops entries when no replacement exists (→ global fallback)", () => {
    const s = fullState();
    const mapping = { "wb-1": "wh-A" };
    // Remove all warehouses
    const stateAfter: GameState = { ...s, warehouseInventories: {} };
    expect(reassignBuildingSourceIds(mapping, stateAfter, "wh-A")).toEqual({});
  });

  it("returns same reference when nothing changed", () => {
    const s = fullState();
    const mapping = { "wb-1": "wh-A" };
    expect(reassignBuildingSourceIds(mapping, s, "wh-NONE")).toBe(mapping);
  });
});

// ===========================================================================
// 3. cleanBuildingSourceIds (Save/Load — no reassign)
// ===========================================================================

describe("cleanBuildingSourceIds (defensive purge)", () => {
  it("keeps entries whose warehouse still exists", () => {
    const mapping = { "wb-1": "wh-A", "sm-1": "wh-B" };
    const valid = new Set(["wh-A", "wh-B"]);
    expect(cleanBuildingSourceIds(mapping, valid)).toEqual(mapping);
  });

  it("removes entries pointing to a deleted warehouse (no reassign)", () => {
    const mapping = { "wb-1": "wh-A", "sm-1": "wh-DELETED" };
    const valid = new Set(["wh-A"]);
    // cleanBuildingSourceIds does NOT reassign — it drops
    expect(cleanBuildingSourceIds(mapping, valid)).toEqual({ "wb-1": "wh-A" });
  });

  it("returns same reference when nothing changed", () => {
    const mapping = { "wb-1": "wh-A" };
    const valid = new Set(["wh-A"]);
    expect(cleanBuildingSourceIds(mapping, valid)).toBe(mapping);
  });

  it("returns empty object when all entries are stale", () => {
    const mapping = { "wb-1": "wh-X", "sm-1": "wh-Y" };
    const valid = new Set<string>();
    expect(cleanBuildingSourceIds(mapping, valid)).toEqual({});
  });

  it("handles empty mapping", () => {
    expect(cleanBuildingSourceIds({}, new Set(["wh-A"]))).toEqual({});
  });
});

// ===========================================================================
// 4. hasStaleWarehouseAssignment
// ===========================================================================

describe("hasStaleWarehouseAssignment", () => {
  it("returns false for a valid warehouse assignment", () => {
    const s = fullState();
    expect(hasStaleWarehouseAssignment(s, "wb-1")).toBe(false);
  });

  it("returns false when building has no assignment (global)", () => {
    const s = { ...fullState(), buildingSourceWarehouseIds: {} };
    expect(hasStaleWarehouseAssignment(s, "wb-1")).toBe(false);
  });

  it("returns false for null buildingId", () => {
    expect(hasStaleWarehouseAssignment(fullState(), null)).toBe(false);
  });

  it("returns true when assigned warehouse asset is missing", () => {
    const s = fullState();
    s.buildingSourceWarehouseIds = { "wb-1": "wh-GONE" };
    expect(hasStaleWarehouseAssignment(s, "wb-1")).toBe(true);
  });

  it("returns true when assigned warehouse has no inventory", () => {
    const s = fullState();
    delete s.warehouseInventories["wh-A"];
    expect(hasStaleWarehouseAssignment(s, "wb-1")).toBe(true);
  });
});

// ===========================================================================
// 5. Warehouse deletion → deterministic reassign
// ===========================================================================

describe("Warehouse deletion reassign", () => {
  it("reassigns affected buildings to the remaining warehouse when A is deleted", () => {
    const before = fullState();
    // wb-1 → wh-A, sm-1 → wh-A, ma-1 → wh-B
    const after = removeWarehouse(before, "wh-A");

    // wb-1 and sm-1 pointed to wh-A → reassigned to wh-B (only remaining)
    expect(after.buildingSourceWarehouseIds["wb-1"]).toBe("wh-B");
    expect(after.buildingSourceWarehouseIds["sm-1"]).toBe("wh-B");
    // ma-1 already on wh-B → unchanged
    expect(after.buildingSourceWarehouseIds["ma-1"]).toBe("wh-B");
  });

  it("reassigns affected buildings when B is deleted", () => {
    const before = fullState();
    const after = removeWarehouse(before, "wh-B");

    // ma-1 pointed to wh-B → reassigned to wh-A (only remaining)
    expect(after.buildingSourceWarehouseIds["ma-1"]).toBe("wh-A");
    // wb-1 and sm-1 already on wh-A → unchanged
    expect(after.buildingSourceWarehouseIds["wb-1"]).toBe("wh-A");
    expect(after.buildingSourceWarehouseIds["sm-1"]).toBe("wh-A");
  });

  it("reassigned buildings resolve to the replacement warehouse", () => {
    const before = fullState();
    const after = removeWarehouse(before, "wh-A");

    expect(resolveBuildingSource(after, "wb-1")).toEqual({ kind: "warehouse", warehouseId: "wh-B" });
    expect(resolveBuildingSource(after, "sm-1")).toEqual({ kind: "warehouse", warehouseId: "wh-B" });
    expect(resolveBuildingSource(after, "ma-1")).toEqual({ kind: "warehouse", warehouseId: "wh-B" });
  });

  it("warehouseInventories entry is removed", () => {
    const before = fullState();
    const after = removeWarehouse(before, "wh-A");
    expect(after.warehouseInventories["wh-A"]).toBeUndefined();
    expect(after.warehouseInventories["wh-B"]).toBeDefined();
  });

  it("deleting BOTH warehouses leaves all buildings on global", () => {
    const s = fullState();
    const after1 = removeWarehouse(s, "wh-A");
    const after2 = removeWarehouse(after1, "wh-B");

    // No warehouses left → entries dropped → global
    expect(Object.keys(after2.buildingSourceWarehouseIds)).toHaveLength(0);
    expect(resolveBuildingSource(after2, "wb-1")).toEqual({ kind: "global" });
    expect(resolveBuildingSource(after2, "sm-1")).toEqual({ kind: "global" });
    expect(resolveBuildingSource(after2, "ma-1")).toEqual({ kind: "global" });
  });

  it("other buildings with valid assignments are NOT touched", () => {
    const before = fullState();
    // ma-1 → wh-B, delete wh-A → ma-1 should stay wh-B
    const after = removeWarehouse(before, "wh-A");
    expect(after.buildingSourceWarehouseIds["ma-1"]).toBe("wh-B");
  });
});

// ===========================================================================
// 6. Multiple remaining warehouses → nearest-warehouse pick
// ===========================================================================

describe("Multiple remaining warehouses", () => {
  // tripleWarehouseState: wb-1@(0,0) sm-1@(3,0) ma-1@(6,0)
  //   wh-A@(0,5) wh-B@(5,5) wh-C@(10,5)

  it("reassigns to nearest remaining warehouse by Manhattan distance", () => {
    const s = tripleWarehouseState();
    // Delete wh-A. Remaining: wh-B@(5,5), wh-C@(10,5)
    // wb-1@(0,0) → wh-B:10, wh-C:15 → wh-B
    // sm-1@(3,0) → wh-B:7, wh-C:12 → wh-B
    const after = removeWarehouse(s, "wh-A");
    expect(after.buildingSourceWarehouseIds["wb-1"]).toBe("wh-B");
    expect(after.buildingSourceWarehouseIds["sm-1"]).toBe("wh-B");
  });

  it("reassign is deterministic (same result on repeated calls)", () => {
    const s = tripleWarehouseState();
    const after1 = removeWarehouse(s, "wh-A");
    const after2 = removeWarehouse(s, "wh-A");
    expect(after1.buildingSourceWarehouseIds).toEqual(after2.buildingSourceWarehouseIds);
  });

  it("picks nearest warehouse per building (different buildings may get different replacements)", () => {
    const s = tripleWarehouseState();
    // Delete wh-B@(5,5). Remaining: wh-A@(0,5), wh-C@(10,5)
    // ma-1@(6,0) → wh-A:|6|+|5|=11, wh-C:|4|+|5|=9 → wh-C (nearest)
    const after = removeWarehouse(s, "wh-B");
    expect(after.buildingSourceWarehouseIds["ma-1"]).toBe("wh-C");
    // wb-1 and sm-1 still on wh-A (untouched, were not on wh-B)
    expect(after.buildingSourceWarehouseIds["wb-1"]).toBe("wh-A");
    expect(after.buildingSourceWarehouseIds["sm-1"]).toBe("wh-A");
  });
});

// ===========================================================================
// 7. No replacement available → global fallback
// ===========================================================================

describe("No replacement warehouse available", () => {
  it("single warehouse deleted → global fallback", () => {
    const s = fullState();
    // Remove wh-B from state so only wh-A exists, then delete wh-A
    delete s.assets["wh-B"];
    delete s.warehouseInventories["wh-B"];
    s.warehousesPlaced = 1;
    s.warehousesPurchased = 1;
    s.buildingSourceWarehouseIds = { "wb-1": "wh-A", "sm-1": "wh-A" };
    // Remove wh-B from cellMap
    const cleanCellMap = { ...s.cellMap };
    delete cleanCellMap[cellKey(5, 5)];
    delete cleanCellMap[cellKey(6, 5)];
    delete cleanCellMap[cellKey(5, 6)];
    delete cleanCellMap[cellKey(6, 6)];
    s.cellMap = cleanCellMap;

    const after = removeWarehouse(s, "wh-A");
    expect(Object.keys(after.buildingSourceWarehouseIds)).toHaveLength(0);
    expect(resolveBuildingSource(after, "wb-1")).toEqual({ kind: "global" });
    expect(resolveBuildingSource(after, "sm-1")).toEqual({ kind: "global" });
  });

  it("mapping is clean after global fallback (no stale refs)", () => {
    const s = fullState();
    const after1 = removeWarehouse(s, "wh-A");
    const after2 = removeWarehouse(after1, "wh-B");
    // No entry should reference a non-existent warehouse
    for (const whId of Object.values(after2.buildingSourceWarehouseIds)) {
      expect(after2.warehouseInventories[whId]).toBeDefined();
    }
  });
});

// ===========================================================================
// 8. Resolver fallback for stale references (runtime safety)
// ===========================================================================

describe("Resolver fallback for stale references", () => {
  it("resolveBuildingSource returns global for stale warehouse ID", () => {
    const s = fullState();
    s.buildingSourceWarehouseIds = { "wb-1": "wh-NONEXISTENT" };
    expect(resolveBuildingSource(s, "wb-1")).toEqual({ kind: "global" });
  });

  it("resolveCraftingSource returns global for missing asset", () => {
    const s = fullState();
    expect(resolveCraftingSource(s, "wh-NONEXISTENT")).toEqual({ kind: "global" });
  });

  it("resolveCraftingSource returns global when inventory entry missing", () => {
    const s = fullState();
    delete s.warehouseInventories["wh-A"];
    expect(resolveCraftingSource(s, "wh-A")).toEqual({ kind: "global" });
  });

  it("stale reference resolves to global (CRAFT_WORKBENCH itself is a deprecated no-op)", () => {
    const s = fullState();
    s.buildingSourceWarehouseIds = { "wb-1": "wh-NONEXISTENT" };
    s.selectedCraftingBuildingId = "wb-1";
    s.inventory = addResources(emptyInv(), { wood: 20 });

    // Resolver must expose the stale ref as global fallback.
    expect(resolveBuildingSource(s, "wb-1")).toEqual({ kind: "global" });
    // CRAFT_WORKBENCH is deprecated (queue-based crafting owns this flow now) - no-op.
    const after = gameReducer(s, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after).toBe(s);
  });
});

// ===========================================================================
// 9. Save/Load — defensive global fallback (NO reassign)
// ===========================================================================

describe("Save/Load with stale references (no reassign)", () => {
  it("deserializeState purges stale refs without reassigning", () => {
    const s = fullState();
    const save = serializeState(s);
    // Simulate stale: remove warehouse from save but keep the mapping
    delete save.warehouseInventories["wh-A"];
    save.warehousesPlaced = 1;
    const loaded = deserializeState(save);

    // Stale references to wh-A should be PURGED (not reassigned)
    expect(loaded.buildingSourceWarehouseIds["wb-1"]).toBeUndefined();
    expect(loaded.buildingSourceWarehouseIds["sm-1"]).toBeUndefined();
    // Valid reference to wh-B survives
    expect(loaded.buildingSourceWarehouseIds["ma-1"]).toBe("wh-B");
  });

  it("old save without buildingSourceWarehouseIds loads fine", () => {
    const s = fullState();
    const save = serializeState(s);
    delete (save as Record<string, unknown>).buildingSourceWarehouseIds;
    const loaded = deserializeState(save);

    expect(loaded.buildingSourceWarehouseIds).toEqual({});
    expect(resolveBuildingSource(loaded, "wb-1")).toEqual({ kind: "global" });
  });

  it("save/load round-trip preserves valid mappings", () => {
    const s = fullState();
    const save = serializeState(s);
    const loaded = deserializeState(save);
    expect(loaded.buildingSourceWarehouseIds).toEqual(s.buildingSourceWarehouseIds);
  });

  it("loaded state with stale refs still allows crafting", () => {
    const s = fullState();
    s.buildingSourceWarehouseIds = { "wb-1": "wh-GONE" };
    const save = serializeState(s);
    const loaded = deserializeState(save);

    expect(loaded.buildingSourceWarehouseIds["wb-1"]).toBeUndefined();
    expect(resolveBuildingSource(loaded, "wb-1")).toEqual({ kind: "global" });
  });
});

// ===========================================================================
// 10. Regression: valid assignments unaffected
// ===========================================================================

describe("Regression: valid assignments unaffected", () => {
  it("resolveBuildingSource returns global when mapping is empty", () => {
    const s = fullState();
    s.buildingSourceWarehouseIds = {};
    expect(resolveBuildingSource(s, "wb-1")).toEqual({ kind: "global" });
    // CRAFT_WORKBENCH remains a deprecated no-op - state identity preserved.
    const after = gameReducer({ ...s, selectedCraftingBuildingId: "wb-1" }, { type: "CRAFT_WORKBENCH", recipeKey: "wood_pickaxe" });
    expect(after.inventory.wood).toBe(s.inventory.wood);
  });

  it("resolveBuildingSource returns warehouse when mapping is valid", () => {
    const s = fullState();
    expect(resolveBuildingSource(s, "wb-1")).toEqual({ kind: "warehouse", warehouseId: "wh-A" });
  });

  it("manual SET_BUILDING_SOURCE still works after reassign", () => {
    const s = fullState();
    const after1 = removeWarehouse(s, "wh-A");
    // wb-1 is now on wh-B (reassigned), manually override to global
    const after2 = gameReducer(after1, { type: "SET_BUILDING_SOURCE", buildingId: "wb-1", warehouseId: null });
    expect(after2.buildingSourceWarehouseIds["wb-1"]).toBeUndefined();
    expect(resolveBuildingSource(after2, "wb-1")).toEqual({ kind: "global" });
  });

  it("reassigned warehouse is reflected in resolveBuildingSource", () => {
    const s = fullState();
    const after = removeWarehouse(s, "wh-A");
    // wb-1 was on wh-A; after deletion it should be reassigned to wh-B.
    expect(resolveBuildingSource(after, "wb-1")).toEqual({ kind: "warehouse", warehouseId: "wh-B" });
  });
});
