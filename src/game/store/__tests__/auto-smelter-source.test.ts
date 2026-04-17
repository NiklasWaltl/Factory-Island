// ============================================================
// Auto Smelter — Source / Zone Integration Tests
// ============================================================

import {
  gameReducer,
  createInitialState,
  addResources,
  cellKey,
  WAREHOUSE_CAPACITY,
  getSourceStatusInfo,
  type AutoSmelterEntry,
  type GameAction,
  type GameState,
  type Inventory,
  type PlacedAsset,
} from "../reducer";

function emptyInv(): Inventory {
  return createInitialState("release").inventory;
}

function makeSmelterEntry(recipe: "iron" | "copper" = "iron"): AutoSmelterEntry {
  return {
    inputBuffer: [],
    processing: null,
    pendingOutput: [],
    status: "IDLE",
    lastRecipeInput: null,
    lastRecipeOutput: null,
    throughputEvents: [],
    selectedRecipe: recipe,
  };
}

function makeBaseState(overrides?: Partial<GameState>): GameState {
  return {
    mode: "release",
    assets: {},
    cellMap: {},
    inventory: emptyInv(),
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

function runTicks(state: GameState, ticks: number): GameState {
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    s = gameReducer(s, { type: "LOGISTICS_TICK" } as GameAction);
  }
  return s;
}

function makeSmelterAsset(id: string, x = 6, y = 6): PlacedAsset {
  return { id, type: "auto_smelter", x, y, size: 2, width: 2, height: 1, direction: "east" };
}

function makeWarehouseAsset(id: string, x = 0, y = 0): PlacedAsset {
  return { id, type: "warehouse", x, y, size: 2, direction: "south" };
}

describe("Auto Smelter source integration", () => {
  test("Zone input: smelter consumes zone warehouse input and starts processing", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        whA: makeWarehouseAsset("whA", 1, 1),
      },
      cellMap: {
        [cellKey(6, 6)]: "sm1",
        [cellKey(7, 6)]: "sm1",
        [cellKey(1, 1)]: "whA",
        [cellKey(2, 1)]: "whA",
        [cellKey(1, 2)]: "whA",
        [cellKey(2, 2)]: "whA",
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1"],
      warehousesPlaced: 1,
      warehouseInventories: {
        whA: addResources(emptyInv(), { iron: 5 }),
      },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { sm1: "zA", whA: "zA" },
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.warehouseInventories.whA.iron).toBe(0);
    expect(after.autoSmelters.sm1.processing).not.toBeNull();
    expect(after.inventory.iron).toBe(0);
  });

  test("Zonenisolation: smelter in Zone A does not consume from Zone B", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        whA: makeWarehouseAsset("whA", 1, 1),
        whB: makeWarehouseAsset("whB", 10, 1),
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1"],
      warehousesPlaced: 2,
      warehouseInventories: {
        whA: addResources(emptyInv(), { iron: 5 }),
        whB: addResources(emptyInv(), { iron: 50 }),
      },
      productionZones: {
        zA: { id: "zA", name: "Zone A" },
        zB: { id: "zB", name: "Zone B" },
      },
      buildingZoneIds: { sm1: "zA", whA: "zA", whB: "zB" },
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.warehouseInventories.whA.iron).toBe(0);
    expect(after.warehouseInventories.whB.iron).toBe(50);
  });

  test("Fallback: no zone -> legacy warehouse is used", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        wh1: makeWarehouseAsset("wh1", 1, 1),
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1"],
      warehousesPlaced: 1,
      inventory: addResources(emptyInv(), { iron: 100 }),
      warehouseInventories: {
        wh1: addResources(emptyInv(), { iron: 5 }),
      },
      buildingSourceWarehouseIds: { sm1: "wh1" },
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.warehouseInventories.wh1.iron).toBe(0);
    expect(after.inventory.iron).toBe(100);
  });

  test("Fallback: no zone and no legacy -> global is used", () => {
    const state = makeBaseState({
      assets: { sm1: makeSmelterAsset("sm1") },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1"],
      inventory: addResources(emptyInv(), { iron: 5 }),
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.inventory.iron).toBe(0);
    expect(after.autoSmelters.sm1.processing).not.toBeNull();
  });

  test("Output: smelter writes output into zone warehouse", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        whA: makeWarehouseAsset("whA", 1, 1),
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1"],
      warehousesPlaced: 1,
      warehouseInventories: {
        whA: addResources(emptyInv(), { iron: 5 }),
      },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { sm1: "zA", whA: "zA" },
    });

    const after = runTicks(state, 11);

    expect(after.warehouseInventories.whA.ironIngot).toBe(1);
    expect(after.autoSmelters.sm1.pendingOutput).toEqual([]);
  });

  test("Output blocked when zone target has no capacity", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        whA: makeWarehouseAsset("whA", 1, 1),
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1"],
      warehousesPlaced: 1,
      warehouseInventories: {
        whA: addResources(emptyInv(), { iron: 5, ironIngot: WAREHOUSE_CAPACITY }),
      },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { sm1: "zA", whA: "zA" },
    });

    const after = runTicks(state, 11);

    expect(after.warehouseInventories.whA.ironIngot).toBe(WAREHOUSE_CAPACITY);
    expect(after.autoSmelters.sm1.pendingOutput.length).toBe(1);
    expect(after.autoSmelters.sm1.status).toBe("OUTPUT_BLOCKED");
  });

  test("Zone ohne Lagerhäuser: fallbackReason is visible and global fallback is used", () => {
    const state = makeBaseState({
      assets: { sm1: makeSmelterAsset("sm1") },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1"],
      inventory: addResources(emptyInv(), { iron: 5 }),
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { sm1: "zA" },
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });
    const info = getSourceStatusInfo(after, "sm1");

    expect(info.fallbackReason).toBe("zone_no_warehouses");
    expect(after.inventory.iron).toBe(0);
  });
});
