// ============================================================
// Auto Miner — Source / Zone Integration Tests
// ============================================================

import {
  gameReducer,
  createInitialState,
  addResources,
  cellKey,
  AUTO_MINER_PRODUCE_TICKS,
  WAREHOUSE_CAPACITY,
  getSourceStatusInfo,
  type AutoMinerEntry,
  type GameAction,
  type GameState,
  type Inventory,
  type PlacedAsset,
} from "../reducer";

function emptyInv(): Inventory {
  return createInitialState("release").inventory;
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

function makeMinerEntry(resource: "stone" | "iron" | "copper" = "iron"): AutoMinerEntry {
  return {
    depositId: "dep1",
    resource,
    // Start at max progress so the miner is ready to output on the first tick.
    progress: AUTO_MINER_PRODUCE_TICKS,
  };
}

function makeMinerAsset(id: string, x = 5, y = 5): PlacedAsset {
  // Direction "east" — adjacent output tile would be (x+1, y), but zone-aware path
  // does not require an adjacent warehouse, so the tile can be empty.
  return { id, type: "auto_miner", x, y, size: 1, direction: "east" };
}

function makeWarehouseAsset(id: string, x = 0, y = 0): PlacedAsset {
  return { id, type: "warehouse", x, y, size: 2, direction: "south" };
}

function runTicks(state: GameState, ticks: number): GameState {
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    s = gameReducer(s, { type: "LOGISTICS_TICK" } as GameAction);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Auto Miner source integration", () => {
  // ---- Zone Input / Output ------------------------------------------------

  test("Zone output: miner writes iron into zone warehouse", () => {
    const state = makeBaseState({
      assets: {
        mn1: makeMinerAsset("mn1"),
        whA: makeWarehouseAsset("whA", 1, 1),
      },
      cellMap: {
        [cellKey(5, 5)]: "mn1",
        [cellKey(1, 1)]: "whA",
        [cellKey(2, 1)]: "whA",
        [cellKey(1, 2)]: "whA",
        [cellKey(2, 2)]: "whA",
      },
      autoMiners: { mn1: makeMinerEntry("iron") },
      machinePowerRatio: { mn1: 1 },
      connectedAssetIds: ["mn1"],
      warehousesPlaced: 1,
      warehouseInventories: { whA: emptyInv() },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { mn1: "zA", whA: "zA" },
    });

    const after = runTicks(state, 1);

    // Zone warehouse must have received the iron
    expect((after.warehouseInventories.whA.iron as number)).toBe(1);
    // Miner progress must have reset
    expect(after.autoMiners.mn1.progress).toBe(0);
    // Global inventory must be unchanged
    expect((after.inventory.iron as number)).toBe(0);
  });

  // ---- Zone Isolation -----------------------------------------------------

  test("Zone isolation: miner in Zone A does not write to Zone B warehouse", () => {
    const state = makeBaseState({
      assets: {
        mn1: makeMinerAsset("mn1"),
        whA: makeWarehouseAsset("whA", 1, 1),
        whB: makeWarehouseAsset("whB", 10, 1),
      },
      cellMap: {
        [cellKey(5, 5)]: "mn1",
        [cellKey(1, 1)]: "whA",
        [cellKey(2, 1)]: "whA",
        [cellKey(1, 2)]: "whA",
        [cellKey(2, 2)]: "whA",
        [cellKey(10, 1)]: "whB",
        [cellKey(11, 1)]: "whB",
        [cellKey(10, 2)]: "whB",
        [cellKey(11, 2)]: "whB",
      },
      autoMiners: { mn1: makeMinerEntry("iron") },
      machinePowerRatio: { mn1: 1 },
      connectedAssetIds: ["mn1"],
      warehousesPlaced: 2,
      warehouseInventories: { whA: emptyInv(), whB: emptyInv() },
      productionZones: {
        zA: { id: "zA", name: "Zone A" },
        zB: { id: "zB", name: "Zone B" },
      },
      buildingZoneIds: { mn1: "zA", whA: "zA", whB: "zB" },
    });

    const after = runTicks(state, 1);

    expect((after.warehouseInventories.whA.iron as number)).toBe(1);
    expect((after.warehouseInventories.whB.iron as number)).toBe(0);
  });

  // ---- Fallback: Legacy Warehouse ------------------------------------------

  test("Fallback: no zone → legacy warehouse receives iron", () => {
    const state = makeBaseState({
      assets: {
        mn1: makeMinerAsset("mn1"),
        whA: makeWarehouseAsset("whA", 1, 1),
      },
      cellMap: {
        [cellKey(5, 5)]: "mn1",
        [cellKey(1, 1)]: "whA",
        [cellKey(2, 1)]: "whA",
        [cellKey(1, 2)]: "whA",
        [cellKey(2, 2)]: "whA",
      },
      autoMiners: { mn1: makeMinerEntry("iron") },
      machinePowerRatio: { mn1: 1 },
      connectedAssetIds: ["mn1"],
      warehousesPlaced: 1,
      warehouseInventories: { whA: emptyInv() },
      buildingSourceWarehouseIds: { mn1: "whA" },
      // No zone assignment
    });

    const after = runTicks(state, 1);

    expect((after.warehouseInventories.whA.iron as number)).toBe(1);
    expect((after.inventory.iron as number)).toBe(0);
  });

  // ---- Fallback: Global ---------------------------------------------------

  test("Fallback: no zone, no legacy warehouse → global inventory receives iron", () => {
    const state = makeBaseState({
      assets: { mn1: makeMinerAsset("mn1") },
      cellMap: { [cellKey(5, 5)]: "mn1" },
      autoMiners: { mn1: makeMinerEntry("iron") },
      machinePowerRatio: { mn1: 1 },
      connectedAssetIds: ["mn1"],
      // No warehouses, no zone, no legacy assignment → global
    });

    const after = runTicks(state, 1);

    expect((after.inventory.iron as number)).toBe(1);
    expect(after.autoMiners.mn1.progress).toBe(0);
  });

  // ---- Capacity / Block ---------------------------------------------------

  test("Output blocked when zone warehouse is full", () => {
    const fullWhInv = addResources(emptyInv(), { iron: WAREHOUSE_CAPACITY });
    const state = makeBaseState({
      assets: {
        mn1: makeMinerAsset("mn1"),
        whA: makeWarehouseAsset("whA", 1, 1),
      },
      cellMap: {
        [cellKey(5, 5)]: "mn1",
        [cellKey(1, 1)]: "whA",
        [cellKey(2, 1)]: "whA",
        [cellKey(1, 2)]: "whA",
        [cellKey(2, 2)]: "whA",
      },
      autoMiners: { mn1: makeMinerEntry("iron") },
      machinePowerRatio: { mn1: 1 },
      connectedAssetIds: ["mn1"],
      warehousesPlaced: 1,
      warehouseInventories: { whA: fullWhInv },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { mn1: "zA", whA: "zA" },
    });

    const after = runTicks(state, 1);

    // Warehouse stays at capacity — no item added
    expect((after.warehouseInventories.whA.iron as number)).toBe(WAREHOUSE_CAPACITY);
    // Miner stays blocked at max progress — no item lost
    expect(after.autoMiners.mn1.progress).toBe(AUTO_MINER_PRODUCE_TICKS);
    // Global inventory untouched
    expect((after.inventory.iron as number)).toBe(0);
  });

  test("No item lost when all targets are at capacity", () => {
    const state = makeBaseState({
      assets: { mn1: makeMinerAsset("mn1") },
      cellMap: { [cellKey(5, 5)]: "mn1" },
      autoMiners: { mn1: makeMinerEntry("iron") },
      machinePowerRatio: { mn1: 1 },
      connectedAssetIds: ["mn1"],
      // Global inventory at capacity
      inventory: addResources(emptyInv(), { iron: 999_999 }),
    });

    const after = runTicks(state, 3);

    // Progress stays blocked — no negative inventory, no items dropped
    expect(after.autoMiners.mn1.progress).toBe(AUTO_MINER_PRODUCE_TICKS);
    // Iron count must not decrease
    const ironBefore = (state.inventory.iron as number);
    const ironAfter = (after.inventory.iron as number);
    expect(ironAfter).toBeGreaterThanOrEqual(ironBefore);
  });

  // ---- Zone ohne Warehouses (Fallback-Transparenz) -----------------------

  test("Zone ohne Lagerhäuser: fallbackReason = zone_no_warehouses, global fallback used", () => {
    const state = makeBaseState({
      assets: { mn1: makeMinerAsset("mn1") },
      cellMap: { [cellKey(5, 5)]: "mn1" },
      autoMiners: { mn1: makeMinerEntry("iron") },
      machinePowerRatio: { mn1: 1 },
      connectedAssetIds: ["mn1"],
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { mn1: "zA" },
      // Zone A has NO warehouses → should fall back to global
    });

    const sourceInfo = getSourceStatusInfo(state, "mn1");
    expect(sourceInfo.fallbackReason).toBe("zone_no_warehouses");

    const after = runTicks(state, 1);

    // Fell back to global inventory
    expect((after.inventory.iron as number)).toBe(1);
  });

  // ---- Conveyor path unaffected ------------------------------------------

  test("Adjacent conveyor still receives output (physical belt path unchanged)", () => {
    // Miner at (5,5) facing east → adjacent tile (6,5) has a conveyor
    const state = makeBaseState({
      assets: {
        mn1: makeMinerAsset("mn1", 5, 5),
        cv1: { id: "cv1", type: "conveyor", x: 6, y: 5, size: 1, direction: "east" } as PlacedAsset,
      },
      cellMap: {
        [cellKey(5, 5)]: "mn1",
        [cellKey(6, 5)]: "cv1",
      },
      autoMiners: { mn1: makeMinerEntry("iron") },
      machinePowerRatio: { mn1: 1 },
      connectedAssetIds: ["mn1", "cv1"],
      poweredMachineIds: ["cv1"],
      conveyors: { cv1: { queue: [] } },
      // No zone or source assignment — but conveyor path takes priority
    });

    const after = runTicks(state, 1);

    // Item must be on the conveyor
    expect(after.conveyors.cv1.queue).toContain("iron");
    // Progress reset
    expect(after.autoMiners.mn1.progress).toBe(0);
    // Global inventory untouched
    expect((after.inventory.iron as number)).toBe(0);
  });

  // Characterization test: documents that the Priority-2 source-fallback path
  // emits exactly one AutoDelivery log entry with sourceType "auto_miner".
  // Pairs with the equivalent test for the auto-smelter source-fallback.
  test("Source-Fallback (Zone): emits AutoDelivery log entry with sourceType auto_miner", () => {
    const state = makeBaseState({
      assets: {
        mn1: makeMinerAsset("mn1"),
        whA: makeWarehouseAsset("whA", 1, 1),
      },
      cellMap: {
        [cellKey(5, 5)]: "mn1",
        [cellKey(1, 1)]: "whA",
        [cellKey(2, 1)]: "whA",
        [cellKey(1, 2)]: "whA",
        [cellKey(2, 2)]: "whA",
      },
      autoMiners: { mn1: makeMinerEntry("iron") },
      machinePowerRatio: { mn1: 1 },
      connectedAssetIds: ["mn1"],
      warehousesPlaced: 1,
      warehouseInventories: { whA: emptyInv() },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { mn1: "zA", whA: "zA" },
    });

    const after = runTicks(state, 1);

    expect(after.autoDeliveryLog.length).toBeGreaterThan(0);
    const last = after.autoDeliveryLog[after.autoDeliveryLog.length - 1];
    expect(last.sourceType).toBe("auto_miner");
    expect(last.sourceId).toBe("mn1");
    expect(last.resource).toBe("iron");
    expect(last.warehouseId).toBe("whA");
  });
});
