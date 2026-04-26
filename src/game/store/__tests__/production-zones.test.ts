// ============================================================
// Production Zone Tests
// ============================================================

import {
  gameReducer,
  GameState,
  GameAction,
  getZoneWarehouseIds,
  getZoneBuildingIds,
  getZoneAggregateInventory,
  getZoneItemCapacity,
  resolveBuildingSource,
  getCraftingSourceInventory,
  cleanBuildingZoneIds,
  hasStaleWarehouseAssignment,
  MAX_ZONES,
} from "../reducer";
import { WAREHOUSE_CAPACITY } from "../constants/buildings";

// ---------------------------------------------------------------------------
// Helpers: build a minimal clean state for zone testing
// ---------------------------------------------------------------------------

function emptyInv() {
  return {
    coins: 0, wood: 0, stone: 0, iron: 0, copper: 0, sapling: 0,
    ironIngot: 0, copperIngot: 0, metalPlate: 0, gear: 0,
    axe: 0, wood_pickaxe: 0, stone_pickaxe: 0,
    workbench: 0, warehouse: 0, smithy: 0, generator: 0,
    cable: 0, battery: 0, power_pole: 0, manual_assembler: 0, auto_smelter: 0,
  };
}

function makeTestState(overrides?: Partial<GameState>): GameState {
  return {
    mode: "debug",
    assets: {},
    cellMap: {},
    inventory: { ...emptyInv(), coins: 100, wood: 50, stone: 50 },
    purchasedBuildings: [],
    placedBuildings: [],
    warehousesPurchased: 0,
    warehousesPlaced: 0,
    warehouseInventories: {},
    selectedWarehouseId: null,
    cablesPlaced: 0,
    powerPolesPlaced: 0,
    selectedPowerPoleId: null,
    hotbarSlots: Array.from({ length: 9 }, () => ({ toolKind: "empty" as const, amount: 0, label: "", emoji: "" })),
    activeSlot: 0,
    smithy: { fuel: 0, iron: 0, copper: 0, selectedRecipe: "iron", processing: false, progress: 0, outputIngots: 0, outputCopperIngots: 0 },
    generator: { fuel: 0, progress: 0, running: false },
    battery: { stored: 0, capacity: 100 },
    connectedAssetIds: [],
    poweredMachineIds: [],
    openPanel: null,
    notifications: [],
    saplingGrowAt: {},
    buildMode: false,
    selectedBuildingType: null,
    selectedFloorTile: null,
    floorMap: {},
    autoMiners: {},
    conveyors: {},
    selectedAutoMinerId: null,
    autoSmelters: {},
    selectedAutoSmelterId: null,
    manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
    machinePowerRatio: {},
    energyDebugOverlay: false,
    autoDeliveryLog: [],
    buildingSourceWarehouseIds: {},
    productionZones: {},
    buildingZoneIds: {},
    selectedCraftingBuildingId: null,
    ...overrides,
  };
}

function dispatch(state: GameState, action: GameAction): GameState {
  return gameReducer(state, action);
}

// ---------------------------------------------------------------------------
// 1. Zone CRUD
// ---------------------------------------------------------------------------

describe("Production Zones — CRUD", () => {
  test("CREATE_ZONE adds a new zone", () => {
    const s = dispatch(makeTestState(), { type: "CREATE_ZONE" });
    const zones = Object.values(s.productionZones);
    expect(zones).toHaveLength(1);
    expect(zones[0].name).toBe("Zone 1");
  });

  test("CREATE_ZONE with custom name", () => {
    const s = dispatch(makeTestState(), { type: "CREATE_ZONE", name: "Eisen-Zone" });
    expect(Object.values(s.productionZones)[0].name).toBe("Eisen-Zone");
  });

  test("CREATE_ZONE respects MAX_ZONES", () => {
    const zones: Record<string, { id: string; name: string }> = {};
    for (let i = 0; i < MAX_ZONES; i++) {
      const id = `z${i}`;
      zones[id] = { id, name: `Zone ${i}` };
    }
    const s = dispatch(makeTestState({ productionZones: zones }), { type: "CREATE_ZONE" });
    expect(Object.keys(s.productionZones)).toHaveLength(MAX_ZONES);
  });

  test("DELETE_ZONE removes zone and all building assignments", () => {
    const state = makeTestState({
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wb1: "z1", wh1: "z1", wb2: "z1" },
    });
    const s = dispatch(state, { type: "DELETE_ZONE", zoneId: "z1" });
    expect(s.productionZones).toEqual({});
    expect(s.buildingZoneIds).toEqual({});
  });

  test("DELETE_ZONE only affects the deleted zone", () => {
    const state = makeTestState({
      productionZones: { z1: { id: "z1", name: "Z1" }, z2: { id: "z2", name: "Z2" } },
      buildingZoneIds: { wb1: "z1", wb2: "z2", wh1: "z1" },
    });
    const s = dispatch(state, { type: "DELETE_ZONE", zoneId: "z1" });
    expect(Object.keys(s.productionZones)).toEqual(["z2"]);
    expect(s.buildingZoneIds).toEqual({ wb2: "z2" });
  });

  test("DELETE_ZONE with nonexistent zone is no-op", () => {
    const state = makeTestState();
    const s = dispatch(state, { type: "DELETE_ZONE", zoneId: "nope" });
    expect(s).toBe(state);
  });

  test("SET_BUILDING_ZONE assigns building to zone", () => {
    const state = makeTestState({
      assets: { wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
    });
    const s = dispatch(state, { type: "SET_BUILDING_ZONE", buildingId: "wb1", zoneId: "z1" });
    expect(s.buildingZoneIds.wb1).toBe("z1");
  });

  test("SET_BUILDING_ZONE with null removes assignment", () => {
    const state = makeTestState({
      assets: { wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wb1: "z1" },
    });
    const s = dispatch(state, { type: "SET_BUILDING_ZONE", buildingId: "wb1", zoneId: null });
    expect(s.buildingZoneIds.wb1).toBeUndefined();
  });

  test("SET_BUILDING_ZONE rejects nonexistent zone", () => {
    const state = makeTestState({
      assets: { wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } },
    });
    const s = dispatch(state, { type: "SET_BUILDING_ZONE", buildingId: "wb1", zoneId: "nope" });
    expect(s).toBe(state);
  });

  test("SET_BUILDING_ZONE rejects nonexistent building", () => {
    const state = makeTestState({
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
    });
    const s = dispatch(state, { type: "SET_BUILDING_ZONE", buildingId: "nope", zoneId: "z1" });
    expect(s).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// 2. Zone resolution
// ---------------------------------------------------------------------------

describe("Production Zones — Resolution", () => {
  test("Building in zone with warehouse resolves to zone source", () => {
    const state = makeTestState({
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 },
      },
      warehouseInventories: { wh1: emptyInv() },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wh1: "z1", wb1: "z1" },
    });
    const source = resolveBuildingSource(state, "wb1");
    expect(source).toEqual({ kind: "zone", zoneId: "z1" });
  });

  test("Building in zone WITHOUT warehouses falls back to global", () => {
    const state = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 },
      },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wb1: "z1" },
    });
    const source = resolveBuildingSource(state, "wb1");
    expect(source).toEqual({ kind: "global" });
  });

  test("Building NOT in zone falls back to legacy warehouse mapping", () => {
    const state = makeTestState({
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 },
      },
      warehouseInventories: { wh1: emptyInv() },
      buildingSourceWarehouseIds: { wb1: "wh1" },
    });
    const source = resolveBuildingSource(state, "wb1");
    expect(source).toEqual({ kind: "warehouse", warehouseId: "wh1" });
  });

  test("Building NOT in zone and no legacy mapping → global", () => {
    const state = makeTestState({
      assets: { wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 } },
    });
    const source = resolveBuildingSource(state, "wb1");
    expect(source).toEqual({ kind: "global" });
  });

  test("Building in different zone does NOT see other zone's warehouse", () => {
    const state = makeTestState({
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 },
      },
      warehouseInventories: { wh1: { ...emptyInv(), wood: 100 } },
      productionZones: {
        z1: { id: "z1", name: "Z1" },
        z2: { id: "z2", name: "Z2" },
      },
      buildingZoneIds: { wh1: "z1", wb1: "z2" },
    });
    // wb1 is in z2 which has no warehouses → falls back to global
    const source = resolveBuildingSource(state, "wb1");
    expect(source).toEqual({ kind: "global" });
  });
});

// ---------------------------------------------------------------------------
// 3. Zone helpers
// ---------------------------------------------------------------------------

describe("Production Zones — Helpers", () => {
  const state = makeTestState({
    assets: {
      wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
      wh2: { id: "wh2", type: "warehouse", x: 4, y: 0, size: 2 },
      wb1: { id: "wb1", type: "workbench", x: 8, y: 0, size: 2 },
      sm1: { id: "sm1", type: "smithy", x: 12, y: 0, size: 2 },
    },
    warehouseInventories: {
      wh1: { ...emptyInv(), wood: 10, iron: 5 },
      wh2: { ...emptyInv(), wood: 8, iron: 3 },
    },
    productionZones: { z1: { id: "z1", name: "Zone 1" } },
    buildingZoneIds: { wh1: "z1", wh2: "z1", wb1: "z1", sm1: "z1" },
  });

  test("getZoneWarehouseIds returns sorted warehouse IDs", () => {
    expect(getZoneWarehouseIds(state, "z1")).toEqual(["wh1", "wh2"]);
  });

  test("getZoneBuildingIds returns sorted non-warehouse building IDs", () => {
    expect(getZoneBuildingIds(state, "z1")).toEqual(["sm1", "wb1"]);
  });

  test("getZoneAggregateInventory sums warehouse inventories", () => {
    const agg = getZoneAggregateInventory(state, "z1");
    expect(agg.wood).toBe(18);
    expect(agg.iron).toBe(8);
    expect(agg.stone).toBe(0);
  });

  test("getZoneAggregateInventory for empty zone returns empty inv", () => {
    const agg = getZoneAggregateInventory(state, "nonexistent");
    expect(agg.wood).toBe(0);
  });

  test("getZoneItemCapacity returns sum of per-warehouse capacities", () => {
    const s = { ...state, mode: "release" as const };
    expect(getZoneItemCapacity(s, "z1")).toBe(2 * WAREHOUSE_CAPACITY);
  });

  test("getZoneItemCapacity in debug mode returns Infinity", () => {
    expect(getZoneItemCapacity(state, "z1")).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// 4. Zone consumption (via applyCraftingSourceInventory)
// ---------------------------------------------------------------------------

describe("Production Zones — Consumption", () => {
  test("Consuming from zone deducts from warehouses in sorted order", () => {
    const state = makeTestState({
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wh2: { id: "wh2", type: "warehouse", x: 4, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 8, y: 0, size: 2 },
      },
      warehouseInventories: {
        wh1: { ...emptyInv(), wood: 6, iron: 3 },
        wh2: { ...emptyInv(), wood: 8, iron: 5 },
      },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wh1: "z1", wh2: "z1", wb1: "z1" },
      selectedCraftingBuildingId: "wb1",
    });

    const source = resolveBuildingSource(state, "wb1");
    expect(source.kind).toBe("zone");

    const sourceInv = getCraftingSourceInventory(state, source);
    expect(sourceInv.wood).toBe(14); // aggregated
    expect(sourceInv.iron).toBe(8);

    // Simulate consuming 10 wood and 5 iron
    const { consumeResources, applyCraftingSourceInventory } = require("../reducer");
    const newInv = consumeResources(sourceInv, { wood: 10, iron: 5 });
    const partial = applyCraftingSourceInventory(state, source, newInv);

    // wh1 (sorted first) loses wood:6→0, then wh2 loses 4 more
    expect(partial.warehouseInventories!.wh1.wood).toBe(0);
    expect(partial.warehouseInventories!.wh2.wood).toBe(4);

    // wh1 loses iron:3→0, then wh2 loses 2 more
    expect(partial.warehouseInventories!.wh1.iron).toBe(0);
    expect(partial.warehouseInventories!.wh2.iron).toBe(3);
  });

  test("Two warehouses jointly cover costs neither could alone", () => {
    const state = makeTestState({
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wh2: { id: "wh2", type: "warehouse", x: 4, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 8, y: 0, size: 2 },
      },
      warehouseInventories: {
        wh1: { ...emptyInv(), ironIngot: 3 },
        wh2: { ...emptyInv(), ironIngot: 4 },
      },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wh1: "z1", wh2: "z1", wb1: "z1" },
    });

    const source = resolveBuildingSource(state, "wb1");
    const agg = getCraftingSourceInventory(state, source);
    expect(agg.ironIngot).toBe(7);

    const { hasResources } = require("../reducer");
    expect(hasResources(agg, { ironIngot: 5 })).toBe(true);
    // Neither warehouse alone has 5
    expect(hasResources(state.warehouseInventories.wh1, { ironIngot: 5 })).toBe(false);
    expect(hasResources(state.warehouseInventories.wh2, { ironIngot: 5 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Zone output (production)
// ---------------------------------------------------------------------------

describe("Production Zones — Output", () => {
  test("Output is added to first warehouse with capacity", () => {
    const state = makeTestState({
      mode: "release",
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wh2: { id: "wh2", type: "warehouse", x: 4, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 8, y: 0, size: 2 },
      },
      warehouseInventories: {
        wh1: { ...emptyInv(), ironIngot: WAREHOUSE_CAPACITY }, // full for ironIngot
        wh2: { ...emptyInv(), ironIngot: 5 },
      },
      warehousesPlaced: 2,
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wh1: "z1", wh2: "z1", wb1: "z1" },
    });

    const source = resolveBuildingSource(state, "wb1");
    const sourceInv = getCraftingSourceInventory(state, source);

    const { addResources, applyCraftingSourceInventory } = require("../reducer");
    const newInv = addResources(sourceInv, { ironIngot: 2 });
    const partial = applyCraftingSourceInventory(state, source, newInv);

    // wh1 is full → output goes to wh2
    expect(partial.warehouseInventories!.wh1.ironIngot).toBe(WAREHOUSE_CAPACITY);
    expect(partial.warehouseInventories!.wh2.ironIngot).toBe(7);
  });

  test("Overflow goes to first warehouse when all are full", () => {
    const state = makeTestState({
      mode: "release",
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 },
      },
      warehouseInventories: {
        wh1: { ...emptyInv(), ironIngot: WAREHOUSE_CAPACITY },
      },
      warehousesPlaced: 1,
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wh1: "z1", wb1: "z1" },
    });

    const source = resolveBuildingSource(state, "wb1");
    const sourceInv = getCraftingSourceInventory(state, source);

    const { addResources, applyCraftingSourceInventory } = require("../reducer");
    const newInv = addResources(sourceInv, { ironIngot: 3 });
    const partial = applyCraftingSourceInventory(state, source, newInv);

    // Overflow goes to first warehouse
    expect(partial.warehouseInventories!.wh1.ironIngot).toBe(WAREHOUSE_CAPACITY + 3);
  });

  test("No negative inventories after zone consumption", () => {
    const state = makeTestState({
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 },
      },
      warehouseInventories: {
        wh1: { ...emptyInv(), wood: 5 },
      },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wh1: "z1", wb1: "z1" },
    });

    const source = resolveBuildingSource(state, "wb1");
    const sourceInv = getCraftingSourceInventory(state, source);

    const { consumeResources, applyCraftingSourceInventory } = require("../reducer");
    const newInv = consumeResources(sourceInv, { wood: 5 });
    const partial = applyCraftingSourceInventory(state, source, newInv);

    expect(partial.warehouseInventories!.wh1.wood).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Delete / Fallback
// ---------------------------------------------------------------------------

describe("Production Zones — Delete & Fallback", () => {
  test("Removing a warehouse cleans its zone assignment", () => {
    // Simulated via BUILD_REMOVE_ASSET logic (the cleanup at end of case)
    const state = makeTestState({
      buildMode: true,
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 },
      },
      cellMap: { "0,0": "wh1", "1,0": "wh1", "0,1": "wh1", "1,1": "wh1",
                 "4,0": "wb1", "5,0": "wb1", "4,1": "wb1", "5,1": "wb1" },
      warehouseInventories: { wh1: emptyInv() },
      warehousesPlaced: 1,
      warehousesPurchased: 1,
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wh1: "z1", wb1: "z1" },
      hotbarSlots: [{ toolKind: "building" as const, amount: 1, label: "", emoji: "" }, ...Array.from({ length: 8 }, () => ({ toolKind: "empty" as const, amount: 0, label: "", emoji: "" }))],
    });

    const s = dispatch(state, { type: "BUILD_REMOVE_ASSET", assetId: "wh1" });
    // wh1 zone assignment should be cleaned
    expect(s.buildingZoneIds.wh1).toBeUndefined();
    // wb1 remains in zone
    expect(s.buildingZoneIds.wb1).toBe("z1");
  });

  test("Zone with no remaining warehouses → building falls back to global", () => {
    const state = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 },
      },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wb1: "z1" },
    });
    // Zone z1 exists but has no warehouses
    const source = resolveBuildingSource(state, "wb1");
    expect(source).toEqual({ kind: "global" });
  });

  test("Building not assigned to any zone → global", () => {
    const state = makeTestState({
      assets: { wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
    });
    const source = resolveBuildingSource(state, "wb1");
    expect(source).toEqual({ kind: "global" });
  });
});

// ---------------------------------------------------------------------------
// 7. cleanBuildingZoneIds (Save/Load)
// ---------------------------------------------------------------------------

describe("Production Zones — cleanBuildingZoneIds", () => {
  test("removes entries for deleted buildings", () => {
    const result = cleanBuildingZoneIds(
      { wb1: "z1", wb2: "z1" },
      new Set(["wb1"]),
      new Set(["z1"]),
    );
    expect(result).toEqual({ wb1: "z1" });
  });

  test("removes entries for deleted zones", () => {
    const result = cleanBuildingZoneIds(
      { wb1: "z1", wb2: "z2" },
      new Set(["wb1", "wb2"]),
      new Set(["z2"]),
    );
    expect(result).toEqual({ wb2: "z2" });
  });

  test("returns same ref when nothing changed", () => {
    const mapping = { wb1: "z1" };
    const result = cleanBuildingZoneIds(
      mapping,
      new Set(["wb1"]),
      new Set(["z1"]),
    );
    expect(result).toBe(mapping);
  });

  test("handles empty mapping", () => {
    const result = cleanBuildingZoneIds({}, new Set(), new Set());
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 8. Regression: legacy behavior unaffected
// ---------------------------------------------------------------------------

describe("Production Zones — Regression", () => {
  test("Global source still works without zones", () => {
    const state = makeTestState({
      assets: { wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } },
    });
    const source = resolveBuildingSource(state, "wb1");
    expect(source).toEqual({ kind: "global" });
    const inv = getCraftingSourceInventory(state, source);
    expect(inv.wood).toBe(50);
  });

  test("Legacy per-building warehouse assignment still works", () => {
    const state = makeTestState({
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 4, y: 0, size: 2 },
      },
      warehouseInventories: { wh1: { ...emptyInv(), wood: 15 } },
      buildingSourceWarehouseIds: { wb1: "wh1" },
    });
    const source = resolveBuildingSource(state, "wb1");
    expect(source).toEqual({ kind: "warehouse", warehouseId: "wh1" });
    const inv = getCraftingSourceInventory(state, source);
    expect(inv.wood).toBe(15);
  });

  test("Zone overrides legacy per-building mapping when present", () => {
    const state = makeTestState({
      assets: {
        wh1: { id: "wh1", type: "warehouse", x: 0, y: 0, size: 2 },
        wh2: { id: "wh2", type: "warehouse", x: 4, y: 0, size: 2 },
        wb1: { id: "wb1", type: "workbench", x: 8, y: 0, size: 2 },
      },
      warehouseInventories: {
        wh1: { ...emptyInv(), wood: 10 },
        wh2: { ...emptyInv(), wood: 20 },
      },
      buildingSourceWarehouseIds: { wb1: "wh1" },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wh2: "z1", wb1: "z1" },
    });
    const source = resolveBuildingSource(state, "wb1");
    // Zone z1 has wh2 → zone takes priority over legacy wh1
    expect(source).toEqual({ kind: "zone", zoneId: "z1" });
    const inv = getCraftingSourceInventory(state, source);
    expect(inv.wood).toBe(20); // only wh2 is in zone
  });

  test("hasStaleWarehouseAssignment still works for legacy mappings", () => {
    const state = makeTestState({
      assets: { wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } },
      buildingSourceWarehouseIds: { wb1: "deleted-wh" },
    });
    expect(hasStaleWarehouseAssignment(state, "wb1")).toBe(true);
  });
});
