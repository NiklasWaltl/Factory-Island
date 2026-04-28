// ============================================================
// Auto-Smelter — Conveyor Input Integration Tests
// ------------------------------------------------------------
// Verifies that the auto-smelter feeds its input buffer
// EXCLUSIVELY from an adjacent input conveyor, and never from
// the global / zone / legacy warehouse inventory.
// ============================================================

import {
  gameReducer,
  createInitialState,
  addResources,
  cellKey,
  AUTO_SMELTER_BUFFER_CAPACITY,
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
  } as unknown as GameState;
}

function runTicks(state: GameState, ticks: number): GameState {
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    s = gameReducer(s, { type: "LOGISTICS_TICK" } as GameAction);
  }
  return s;
}

// 2x1 smelter at (6,6) facing east → input cell = (5,6), output cell = (8,6).
function makeSmelterAsset(id: string, x = 6, y = 6): PlacedAsset {
  return { id, type: "auto_smelter", x, y, size: 2, width: 2, height: 1, direction: "east" };
}

function makeEastConveyor(id: string, x: number, y: number): PlacedAsset {
  return { id, type: "conveyor", x, y, size: 1, direction: "east" };
}

describe("Auto-Smelter conveyor input", () => {
  test("does NOT consume from global inventory when no input conveyor is connected", () => {
    const state = makeBaseState({
      assets: { sm1: makeSmelterAsset("sm1") },
      cellMap: {
        [cellKey(6, 6)]: "sm1",
        [cellKey(7, 6)]: "sm1",
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1"],
      inventory: addResources(emptyInv(), { iron: 50 }),
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.inventory.iron).toBe(50);
    expect(after.autoSmelters.sm1.inputBuffer.length).toBe(0);
    expect(after.autoSmelters.sm1.processing).toBeNull();
  });

  test("does NOT consume from zone warehouse when no input conveyor is connected", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        whA: { id: "whA", type: "warehouse", x: 1, y: 1, size: 2, direction: "south" } as PlacedAsset,
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
      warehouseInventories: { whA: addResources(emptyInv(), { iron: 50 }) },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { sm1: "zA", whA: "zA" },
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.warehouseInventories.whA.iron).toBe(50);
    expect(after.autoSmelters.sm1.inputBuffer.length).toBe(0);
    expect(after.autoSmelters.sm1.processing).toBeNull();
  });

  test("consumes 1 item from adjacent input conveyor per tick", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        cv1: makeEastConveyor("cv1", 5, 6),
      },
      cellMap: {
        [cellKey(5, 6)]: "cv1",
        [cellKey(6, 6)]: "sm1",
        [cellKey(7, 6)]: "sm1",
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      conveyors: { cv1: { queue: ["iron"] } },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1", "cv1"],
      connectedAssetIds: ["cv1"],
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.autoSmelters.sm1.inputBuffer).toEqual(["iron"]);
    expect(after.conveyors.cv1.queue).toEqual([]);
  });

  test("starts processing once buffer holds recipe.inputAmount matching items", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
      },
      cellMap: {
        [cellKey(6, 6)]: "sm1",
        [cellKey(7, 6)]: "sm1",
      },
      autoSmelters: {
        sm1: { ...makeSmelterEntry("iron"), inputBuffer: ["iron", "iron", "iron", "iron", "iron"] },
      },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1"],
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.autoSmelters.sm1.inputBuffer).toEqual([]);
    expect(after.autoSmelters.sm1.processing).not.toBeNull();
    expect(after.autoSmelters.sm1.processing?.inputItem).toBe("iron");
  });

  test("rejects items that do not match the selected recipe input", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        cv1: makeEastConveyor("cv1", 5, 6),
      },
      cellMap: {
        [cellKey(5, 6)]: "cv1",
        [cellKey(6, 6)]: "sm1",
        [cellKey(7, 6)]: "sm1",
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      conveyors: { cv1: { queue: ["copper"] } },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1", "cv1"],
      connectedAssetIds: ["cv1"],
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.autoSmelters.sm1.inputBuffer).toEqual([]);
    expect(after.conveyors.cv1.queue).toEqual(["copper"]);
  });

  test("rejects conveyor delivery from a side-cell that is not the input cell", () => {
    // Conveyor sits BELOW the smelter (not on the east-facing input cell).
    // Even though it points at the smelter, delivery must be rejected.
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        // Conveyor at (6,7) facing north → next cell (6,6) belongs to smelter.
        cv1: { id: "cv1", type: "conveyor", x: 6, y: 7, size: 1, direction: "north" } as PlacedAsset,
      },
      cellMap: {
        [cellKey(6, 6)]: "sm1",
        [cellKey(7, 6)]: "sm1",
        [cellKey(6, 7)]: "cv1",
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      conveyors: { cv1: { queue: ["iron"] } },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1", "cv1"],
      connectedAssetIds: ["cv1"],
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.autoSmelters.sm1.inputBuffer).toEqual([]);
    expect(after.conveyors.cv1.queue).toEqual(["iron"]);
  });

  test("buffer caps at AUTO_SMELTER_BUFFER_CAPACITY", () => {
    const fullBuffer = Array(AUTO_SMELTER_BUFFER_CAPACITY).fill("iron") as ("iron" | "copper")[];
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        cv1: makeEastConveyor("cv1", 5, 6),
      },
      cellMap: {
        [cellKey(5, 6)]: "cv1",
        [cellKey(6, 6)]: "sm1",
        [cellKey(7, 6)]: "sm1",
      },
      autoSmelters: {
        sm1: { ...makeSmelterEntry("iron"), inputBuffer: fullBuffer.slice() },
      },
      conveyors: { cv1: { queue: ["iron"] } },
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1", "cv1"],
      connectedAssetIds: ["cv1"],
    });

    // Single tick: buffer is already full AND has enough items to consume a batch.
    // The smelter will start processing first, freeing the buffer; then the conveyor
    // item is accepted into the freed slot. Either order is acceptable as long as
    // the conveyor item is not silently dropped or duplicated.
    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    const totalIron =
      after.autoSmelters.sm1.inputBuffer.filter((it) => it === "iron").length +
      after.conveyors.cv1.queue.filter((it) => it === "iron").length +
      (after.autoSmelters.sm1.processing ? 5 : 0);
    expect(totalIron).toBe(AUTO_SMELTER_BUFFER_CAPACITY + 1);
  });

  test("two smelters only consume from their own connected conveyor", () => {
    // sm1 at (6,6) east-facing → input (5,6).  sm2 at (12,6) east-facing → input (11,6).
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1", 6, 6),
        sm2: makeSmelterAsset("sm2", 12, 6),
        cv1: makeEastConveyor("cv1", 5, 6),
        cv2: makeEastConveyor("cv2", 11, 6),
      },
      cellMap: {
        [cellKey(5, 6)]: "cv1",
        [cellKey(6, 6)]: "sm1",
        [cellKey(7, 6)]: "sm1",
        [cellKey(11, 6)]: "cv2",
        [cellKey(12, 6)]: "sm2",
        [cellKey(13, 6)]: "sm2",
      },
      autoSmelters: {
        sm1: makeSmelterEntry("iron"),
        sm2: makeSmelterEntry("iron"),
      },
      conveyors: {
        cv1: { queue: ["iron"] },
        cv2: { queue: ["iron"] },
      },
      machinePowerRatio: { sm1: 1, sm2: 1 },
      poweredMachineIds: ["sm1", "sm2", "cv1", "cv2"],
      connectedAssetIds: ["cv1", "cv2"],
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" });

    expect(after.autoSmelters.sm1.inputBuffer).toEqual(["iron"]);
    expect(after.autoSmelters.sm2.inputBuffer).toEqual(["iron"]);
    expect(after.conveyors.cv1.queue).toEqual([]);
    expect(after.conveyors.cv2.queue).toEqual([]);
  });

  test("end-to-end: 5 conveyor deliveries → batch processed → output ingot produced", () => {
    const state = makeBaseState({
      assets: {
        sm1: makeSmelterAsset("sm1"),
        cv1: makeEastConveyor("cv1", 5, 6),
      },
      cellMap: {
        [cellKey(5, 6)]: "cv1",
        [cellKey(6, 6)]: "sm1",
        [cellKey(7, 6)]: "sm1",
      },
      autoSmelters: { sm1: makeSmelterEntry("iron") },
      // Pre-fill the smelter's buffer so we don't need to simulate 5 separate
      // re-supplies through a single conveyor tile.
      machinePowerRatio: { sm1: 1 },
      poweredMachineIds: ["sm1", "cv1"],
      connectedAssetIds: ["cv1"],
      conveyors: { cv1: { queue: ["iron", "iron", "iron", "iron", "iron"] } },
    });

    // Conveyor tile capacity is 5; simulate enough ticks for the smelter to drain
    // 5 items, run a 5s recipe, and emit output to source-fallback.
    const after = runTicks(state, 60);

    // Five iron consumed, at least one ingot produced and written to source fallback.
    expect(after.inventory.ironIngot).toBeGreaterThan(0);
  });
});
