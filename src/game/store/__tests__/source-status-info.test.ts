// ============================================================
// Source Status Info (View-Model) Tests
// ============================================================

import {
  gameReducer,
  GameState,
  GameAction,
  getSourceStatusInfo,
  type SourceStatusInfo,
} from "../reducer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyInv() {
  return {
    coins: 0, wood: 0, stone: 0, iron: 0, copper: 0, sapling: 0,
    ironIngot: 0, copperIngot: 0, metalPlate: 0, gear: 0,
    axe: 0, wood_pickaxe: 0, stone_pickaxe: 0,
    workbench: 0, warehouse: 0, smithy: 0, generator: 0,
    cable: 0, battery: 0, power_pole: 0, manual_assembler: 0, auto_smelter: 0, auto_assembler: 0,
  };
}

function makeTestState(overrides?: Partial<GameState>): GameState {
  return {
    mode: "debug",
    assets: {},
    cellMap: {},
    inventory: { ...emptyInv(), coins: 100, wood: 50, stone: 50, iron: 10 },
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
// 1. Source display — correct source kind
// ---------------------------------------------------------------------------

describe("SourceStatusInfo — source display", () => {
  test("null buildingId returns global source", () => {
    const info = getSourceStatusInfo(makeTestState(), null);
    expect(info.source.kind).toBe("global");
    expect(info.sourceLabel).toBe("Globaler Puffer");
  });

  test("building with no assignment returns global", () => {
    const info = getSourceStatusInfo(makeTestState(), "wb1");
    expect(info.source.kind).toBe("global");
    expect(info.fallbackReason).toBe("no_assignment");
    expect(info.reasonLabel).toContain("Keine Zone oder Lagerhaus");
  });

  test("building with legacy warehouse shows warehouse source", () => {
    const state = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } as any,
        wh1: { id: "wh1", type: "warehouse", x: 3, y: 0, size: 2 } as any,
      },
      warehouseInventories: { wh1: emptyInv() },
      buildingSourceWarehouseIds: { wb1: "wh1" },
    });
    const info = getSourceStatusInfo(state, "wb1");
    expect(info.source.kind).toBe("warehouse");
    expect(info.sourceLabel).toContain("Lagerhaus");
    expect(info.fallbackReason).toBe("no_zone");
    expect(info.reasonLabel).toContain("Einzelzuweisung");
    expect(info.legacyWarehouseId).toBe("wh1");
  });

  test("building in zone with warehouses shows zone source", () => {
    const state = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } as any,
        wh1: { id: "wh1", type: "warehouse", x: 3, y: 0, size: 2 } as any,
      },
      productionZones: { z1: { id: "z1", name: "Eisen-Zone" } },
      warehouseInventories: { wh1: emptyInv() },
      buildingZoneIds: { wb1: "z1", wh1: "z1" },
    });
    const info = getSourceStatusInfo(state, "wb1");
    expect(info.source.kind).toBe("zone");
    expect(info.sourceLabel).toContain("Eisen-Zone");
    expect(info.sourceLabel).toContain("1 Lagerhaus");
    expect(info.fallbackReason).toBe("none");
    expect(info.reasonLabel).toBe("Zone aktiv");
    expect(info.zoneWarehouseIds).toEqual(["wh1"]);
    expect(info.assignedZoneId).toBe("z1");
    expect(info.assignedZoneName).toBe("Eisen-Zone");
  });
});

// ---------------------------------------------------------------------------
// 2. Fallback communication
// ---------------------------------------------------------------------------

describe("SourceStatusInfo — fallback communication", () => {
  test("zone with no warehouses falls back to global with reason", () => {
    const state = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } as any,
      },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wb1: "z1" },
      // no warehouses in zone
    });
    const info = getSourceStatusInfo(state, "wb1");
    expect(info.source.kind).toBe("global");
    expect(info.fallbackReason).toBe("zone_no_warehouses");
    expect(info.reasonLabel).toContain("keine Lagerh\u00e4user");
  });

  test("stale legacy warehouse shows fallback to global", () => {
    const state = makeTestState({
      buildingSourceWarehouseIds: { wb1: "deleted_wh" },
      // wh not in warehouseInventories → stale
    });
    const info = getSourceStatusInfo(state, "wb1");
    expect(info.source.kind).toBe("global");
    expect(info.fallbackReason).toBe("stale_warehouse");
    expect(info.isStale).toBe(true);
    expect(info.reasonLabel).toContain("entfernt");
  });

  test("zone with warehouse + legacy wh mapping prefers zone", () => {
    const state = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } as any,
        wh1: { id: "wh1", type: "warehouse", x: 3, y: 0, size: 2 } as any,
      },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      warehouseInventories: { wh1: emptyInv() },
      buildingZoneIds: { wb1: "z1", wh1: "z1" },
      buildingSourceWarehouseIds: { wb1: "wh1" },
    });
    const info = getSourceStatusInfo(state, "wb1");
    expect(info.source.kind).toBe("zone");
    expect(info.fallbackReason).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// 3. Zone members
// ---------------------------------------------------------------------------

describe("SourceStatusInfo — zone members", () => {
  test("zoneWarehouseIds and zoneBuildingIds are populated for zone source", () => {
    const state = makeTestState({
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      warehouseInventories: { wh1: emptyInv(), wh2: emptyInv() },
      buildingZoneIds: { wh1: "z1", wh2: "z1", wb1: "z1" },
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: { w: 2, h: 2 } } as any,
        wh1: { id: "wh1", type: "warehouse", x: 3, y: 0, size: { w: 2, h: 2 } } as any,
        wh2: { id: "wh2", type: "warehouse", x: 6, y: 0, size: { w: 2, h: 2 } } as any,
      },
    });
    const info = getSourceStatusInfo(state, "wb1");
    expect(info.zoneWarehouseIds).toEqual(["wh1", "wh2"]);
    expect(info.zoneBuildingIds).toEqual(["wb1"]);
  });

  test("non-zone source has empty zone member lists", () => {
    const state = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } as any,
        wh1: { id: "wh1", type: "warehouse", x: 3, y: 0, size: 2 } as any,
      },
      warehouseInventories: { wh1: emptyInv() },
      buildingSourceWarehouseIds: { wb1: "wh1" },
    });
    const info = getSourceStatusInfo(state, "wb1");
    expect(info.zoneWarehouseIds).toEqual([]);
    expect(info.zoneBuildingIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Block reasons (can be derived from source + inventory)
// ---------------------------------------------------------------------------

describe("SourceStatusInfo — block reason derivation", () => {
  test("zone_no_warehouses is reported even though building is in zone", () => {
    const state = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } as any,
      },
      productionZones: { z1: { id: "z1", name: "Zone 1" } },
      buildingZoneIds: { wb1: "z1" },
    });
    const info = getSourceStatusInfo(state, "wb1");
    expect(info.fallbackReason).toBe("zone_no_warehouses");
    expect(info.assignedZoneId).toBe("z1");
    expect(info.source.kind).toBe("global");
  });

  test("global fallback from no assignment is distinguishable", () => {
    const info = getSourceStatusInfo(makeTestState(), "wb1");
    expect(info.fallbackReason).toBe("no_assignment");
  });

  test("stale warehouse fallback is distinguishable", () => {
    const state = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } as any,
      },
      buildingSourceWarehouseIds: { wb1: "gone_wh" },
    });
    const info = getSourceStatusInfo(state, "wb1");
    expect(info.fallbackReason).toBe("stale_warehouse");
    expect(info.isStale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Regression — no change to resolver behavior
// ---------------------------------------------------------------------------

describe("SourceStatusInfo — regression", () => {
  test("resolved source matches resolveBuildingSource exactly", () => {
    // Zone source
    const s1 = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } as any,
        wh1: { id: "wh1", type: "warehouse", x: 3, y: 0, size: 2 } as any,
      },
      productionZones: { z1: { id: "z1", name: "Z" } },
      warehouseInventories: { wh1: emptyInv() },
      buildingZoneIds: { wb1: "z1", wh1: "z1" },
    });
    const info1 = getSourceStatusInfo(s1, "wb1");
    expect(info1.source).toEqual({ kind: "zone", zoneId: "z1" });

    // Warehouse source
    const s2 = makeTestState({
      assets: {
        wb1: { id: "wb1", type: "workbench", x: 0, y: 0, size: 2 } as any,
        wh1: { id: "wh1", type: "warehouse", x: 3, y: 0, size: 2 } as any,
      },
      warehouseInventories: { wh1: emptyInv() },
      buildingSourceWarehouseIds: { wb1: "wh1" },
    });
    const info2 = getSourceStatusInfo(s2, "wb1");
    expect(info2.source).toEqual({ kind: "warehouse", warehouseId: "wh1" });

    // Global source
    const info3 = getSourceStatusInfo(makeTestState(), "wb1");
    expect(info3.source).toEqual({ kind: "global" });
  });
});
