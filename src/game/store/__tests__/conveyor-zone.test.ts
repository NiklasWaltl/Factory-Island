// ============================================================
// Conveyor Belts — Zone-aware Transport Tests
// ============================================================

import {
  gameReducer,
  createInitialState,
  addResources,
  cellKey,
  CONVEYOR_TILE_CAPACITY,
  WAREHOUSE_CAPACITY,
  getConveyorZone,
  areZonesTransportCompatible,
  getConveyorZoneStatus,
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

function makeConveyorAsset(id: string, x: number, y: number, dir: "east" | "west" | "north" | "south" = "east"): PlacedAsset {
  return { id, type: "conveyor", x, y, size: 1, direction: dir };
}

function makeWarehouseAsset(id: string, x = 0, y = 0): PlacedAsset {
  return { id, type: "warehouse", x, y, size: 2, direction: "south" };
}

function runTick(state: GameState): GameState {
  return gameReducer(state, { type: "LOGISTICS_TICK" } as GameAction);
}

function runTicks(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = runTick(s);
  return s;
}

// ---- Pure helper unit tests ---------------------------------------------

describe("areZonesTransportCompatible", () => {
  it("null + null → compatible (both global)", () => {
    expect(areZonesTransportCompatible(null, null)).toBe(true);
  });
  it("zone + null → compatible (one side global)", () => {
    expect(areZonesTransportCompatible("zA", null)).toBe(true);
    expect(areZonesTransportCompatible(null, "zA")).toBe(true);
  });
  it("same zone → compatible", () => {
    expect(areZonesTransportCompatible("zA", "zA")).toBe(true);
  });
  it("different zones → incompatible", () => {
    expect(areZonesTransportCompatible("zA", "zB")).toBe(false);
  });
});

describe("getConveyorZone", () => {
  it("returns null when belt has no zone assignment", () => {
    const state = makeBaseState({
      assets: { cv1: makeConveyorAsset("cv1", 0, 0) },
      conveyors: { cv1: { queue: [] } },
    });
    expect(getConveyorZone(state, "cv1")).toBeNull();
  });

  it("returns zone ID when belt is assigned to a zone", () => {
    const state = makeBaseState({
      assets: { cv1: makeConveyorAsset("cv1", 0, 0) },
      conveyors: { cv1: { queue: [] } },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { cv1: "zA" },
    });
    expect(getConveyorZone(state, "cv1")).toBe("zA");
  });
});

describe("getConveyorZoneStatus", () => {
  it("returns no conflict for unzoned belt", () => {
    const state = makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 0, 0, "east"),
        cv2: makeConveyorAsset("cv2", 1, 0, "east"),
      },
      cellMap: { [cellKey(0, 0)]: "cv1", [cellKey(1, 0)]: "cv2" },
      conveyors: { cv1: { queue: [] }, cv2: { queue: [] } },
    });
    const status = getConveyorZoneStatus(state, "cv1");
    expect(status.hasConflict).toBe(false);
    expect(status.zone).toBeNull();
  });

  it("returns conflict when belt points to different-zone target", () => {
    const state = makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 0, 0, "east"),
        cv2: makeConveyorAsset("cv2", 1, 0, "east"),
      },
      cellMap: { [cellKey(0, 0)]: "cv1", [cellKey(1, 0)]: "cv2" },
      conveyors: { cv1: { queue: [] }, cv2: { queue: [] } },
      productionZones: { zA: { id: "zA", name: "Zone A" }, zB: { id: "zB", name: "Zone B" } },
      buildingZoneIds: { cv1: "zA", cv2: "zB" },
    });
    const status = getConveyorZoneStatus(state, "cv1");
    expect(status.hasConflict).toBe(true);
    expect(status.conflictReason).toContain("Zone A");
    expect(status.conflictReason).toContain("Zone B");
  });

  it("returns no conflict when same zone on both sides", () => {
    const state = makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 0, 0, "east"),
        cv2: makeConveyorAsset("cv2", 1, 0, "east"),
      },
      cellMap: { [cellKey(0, 0)]: "cv1", [cellKey(1, 0)]: "cv2" },
      conveyors: { cv1: { queue: [] }, cv2: { queue: [] } },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { cv1: "zA", cv2: "zA" },
    });
    const status = getConveyorZoneStatus(state, "cv1");
    expect(status.hasConflict).toBe(false);
  });
});

// ---- Intra-zone transport ------------------------------------------------

describe("Intra-zone belt-to-belt transport", () => {
  function makeTwoBeltsState(sameZone: boolean): GameState {
    return makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 0, 0, "east"),
        cv2: makeConveyorAsset("cv2", 1, 0, "east"),
      },
      cellMap: { [cellKey(0, 0)]: "cv1", [cellKey(1, 0)]: "cv2" },
      connectedAssetIds: ["cv1", "cv2"],
      poweredMachineIds: ["cv1", "cv2"],
      conveyors: {
        cv1: { queue: ["iron"] },
        cv2: { queue: [] },
      },
      productionZones: {
        zA: { id: "zA", name: "Zone A" },
        zB: { id: "zB", name: "Zone B" },
      },
      buildingZoneIds: sameZone
        ? { cv1: "zA", cv2: "zA" }
        : { cv1: "zA", cv2: "zB" },
    });
  }

  it("same zone: item moves from belt A to belt B", () => {
    const state = makeTwoBeltsState(true);
    const after = runTick(state);
    expect(after.conveyors.cv1.queue).toHaveLength(0);
    expect(after.conveyors.cv2.queue).toContain("iron");
  });

  it("different zones: item stays on belt A (zone conflict block)", () => {
    const state = makeTwoBeltsState(false);
    const after = runTick(state);
    expect(after.conveyors.cv1.queue).toContain("iron");
    expect(after.conveyors.cv2.queue).toHaveLength(0);
  });

  it("belt without zone → belt with zone: item moves (backward compatible)", () => {
    const state = makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 0, 0, "east"),
        cv2: makeConveyorAsset("cv2", 1, 0, "east"),
      },
      cellMap: { [cellKey(0, 0)]: "cv1", [cellKey(1, 0)]: "cv2" },
      connectedAssetIds: ["cv1", "cv2"],
      poweredMachineIds: ["cv1", "cv2"],
      conveyors: { cv1: { queue: ["iron"] }, cv2: { queue: [] } },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { cv2: "zA" }, // cv1 has NO zone
    });
    const after = runTick(state);
    expect(after.conveyors.cv1.queue).toHaveLength(0);
    expect(after.conveyors.cv2.queue).toContain("iron");
  });

  it("belt with zone → belt without zone: item moves (backward compatible)", () => {
    const state = makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 0, 0, "east"),
        cv2: makeConveyorAsset("cv2", 1, 0, "east"),
      },
      cellMap: { [cellKey(0, 0)]: "cv1", [cellKey(1, 0)]: "cv2" },
      connectedAssetIds: ["cv1", "cv2"],
      poweredMachineIds: ["cv1", "cv2"],
      conveyors: { cv1: { queue: ["iron"] }, cv2: { queue: [] } },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { cv1: "zA" }, // cv2 has NO zone
    });
    const after = runTick(state);
    expect(after.conveyors.cv1.queue).toHaveLength(0);
    expect(after.conveyors.cv2.queue).toContain("iron");
  });

  it("both unzoned: item moves (pure backward compat)", () => {
    const state = makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 0, 0, "east"),
        cv2: makeConveyorAsset("cv2", 1, 0, "east"),
      },
      cellMap: { [cellKey(0, 0)]: "cv1", [cellKey(1, 0)]: "cv2" },
      connectedAssetIds: ["cv1", "cv2"],
      poweredMachineIds: ["cv1", "cv2"],
      conveyors: { cv1: { queue: ["iron"] }, cv2: { queue: [] } },
    });
    const after = runTick(state);
    expect(after.conveyors.cv1.queue).toHaveLength(0);
    expect(after.conveyors.cv2.queue).toContain("iron");
  });
});

// ---- Belt-to-warehouse transport ----------------------------------------

describe("Belt-to-warehouse delivery (adjacent target)", () => {
  // Warehouse at (2,0) size 2 direction "east":
  //   getWarehouseInputCell → { x: 4, y: 0, requiredDir: "west" }
  // Belt cv1 at (4,0) facing west → next tile (3,0) = inside warehouse → Case 2 fires.
  // Case 1 check: convAsset.y === wAsset.y + assetHeight(wAsset) = 0 === 0+2=2 → FALSE → Case 1 does NOT fire.
  function makeAdjacentDeliveryState(sameZone: boolean): GameState {
    const whA: PlacedAsset = { id: "whA", type: "warehouse", x: 2, y: 0, size: 2, direction: "east" };
    return makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 4, 0, "west"),
        whA,
      },
      cellMap: {
        [cellKey(4, 0)]: "cv1",
        [cellKey(2, 0)]: "whA",
        [cellKey(3, 0)]: "whA",
        [cellKey(2, 1)]: "whA",
        [cellKey(3, 1)]: "whA",
      },
      connectedAssetIds: ["cv1"],
      poweredMachineIds: ["cv1"],
      conveyors: { cv1: { queue: ["iron"] } },
      warehousesPlaced: 1,
      warehouseInventories: { whA: emptyInv() },
      productionZones: {
        zA: { id: "zA", name: "Zone A" },
        zB: { id: "zB", name: "Zone B" },
      },
      buildingZoneIds: sameZone
        ? { cv1: "zA", whA: "zA" }
        : { cv1: "zA", whA: "zB" },
    });
  }

  it("same zone: item delivered to warehouse", () => {
    const state = makeAdjacentDeliveryState(true);
    const after = runTick(state);
    expect((after.warehouseInventories.whA.iron as number)).toBe(1);
    expect(after.conveyors.cv1.queue).toHaveLength(0);
  });

  it("different zones: item blocked, warehouse unchanged", () => {
    const state = makeAdjacentDeliveryState(false);
    const after = runTick(state);
    expect((after.warehouseInventories.whA.iron as number)).toBe(0);
    expect(after.conveyors.cv1.queue).toContain("iron");
  });

  it("belt unzoned → zoned warehouse: item delivered (backward compat)", () => {
    const state = makeAdjacentDeliveryState(false);
    const noZoneBelt: GameState = {
      ...state,
      buildingZoneIds: { whA: "zA" }, // belt cv1 has NO zone → compatible with any target
    };
    const after = runTick(noZoneBelt);
    expect((after.warehouseInventories.whA.iron as number)).toBe(1);
  });
});

// ---- Belt-to-warehouse (belt sitting ON warehouse input tile) ------------

describe("Belt-to-warehouse delivery (belt sitting on input tile)", () => {
  // cv1 at (1,4) = warehouse input tile (warehouse at (1,2), height=2, input at y=4)
  function makeDirectDeliveryState(sameZone: boolean): GameState {
    const whA: PlacedAsset = { id: "whA", type: "warehouse", x: 1, y: 2, size: 2, direction: "south" };
    return makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 1, 4, "east"), // sits on the warehouse input tile
        whA,
      },
      cellMap: {
        [cellKey(1, 2)]: "whA",
        [cellKey(2, 2)]: "whA",
        [cellKey(1, 3)]: "whA",
        [cellKey(2, 3)]: "whA",
        [cellKey(1, 4)]: "cv1",
      },
      connectedAssetIds: ["cv1"],
      poweredMachineIds: ["cv1"],
      conveyors: { cv1: { queue: ["iron"] } },
      warehousesPlaced: 1,
      warehouseInventories: { whA: emptyInv() },
      productionZones: {
        zA: { id: "zA", name: "Zone A" },
        zB: { id: "zB", name: "Zone B" },
      },
      buildingZoneIds: sameZone
        ? { cv1: "zA", whA: "zA" }
        : { cv1: "zA", whA: "zB" },
    });
  }

  it("same zone: item delivered directly to warehouse", () => {
    const state = makeDirectDeliveryState(true);
    const after = runTick(state);
    expect((after.warehouseInventories.whA.iron as number)).toBe(1);
    expect(after.conveyors.cv1.queue).toHaveLength(0);
  });

  it("different zones: item blocked on belt, warehouse unchanged", () => {
    const state = makeDirectDeliveryState(false);
    const after = runTick(state);
    expect((after.warehouseInventories.whA.iron as number)).toBe(0);
    expect(after.conveyors.cv1.queue).toContain("iron");
  });

  it("multiple ticks: item stays blocked and is never lost", () => {
    const state = makeDirectDeliveryState(false);
    const after = runTicks(state, 5);
    expect(after.conveyors.cv1.queue).toContain("iron");
    expect((after.warehouseInventories.whA.iron as number)).toBe(0);
  });
});

// ---- Belt capacity block (existing behavior untouched) ------------------

describe("Belt capacity block (existing behavior)", () => {
  it("item stays when next belt is at full capacity", () => {
    const fullQueue = Array(CONVEYOR_TILE_CAPACITY).fill("stone") as ("stone")[];
    const state = makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 0, 0, "east"),
        cv2: makeConveyorAsset("cv2", 1, 0, "east"),
      },
      cellMap: { [cellKey(0, 0)]: "cv1", [cellKey(1, 0)]: "cv2" },
      connectedAssetIds: ["cv1", "cv2"],
      poweredMachineIds: ["cv1", "cv2"],
      conveyors: {
        cv1: { queue: ["iron"] },
        cv2: { queue: fullQueue },
      },
      // Both in same zone — capacity block is unrelated to zones
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { cv1: "zA", cv2: "zA" },
    });
    const after = runTick(state);
    expect(after.conveyors.cv1.queue).toContain("iron");
    expect(after.conveyors.cv2.queue).toHaveLength(CONVEYOR_TILE_CAPACITY);
  });
});

// ---- Chain: Miner → Belt → Warehouse (same zone) -----------------------

describe("End-to-end chain: Belt → Belt → Warehouse (same zone)", () => {
  it("belt chain transports item to same-zone warehouse (sitting-on-input-tile delivery)", () => {
    // Warehouse at (5,0) size 2 direction "south" → input tile at (5,2).
    // cv3 at (5,2) facing east: Case 1 fires (belt.y === wh.y + assetHeight = 0+2=2 ✓).
    // cv2 at (4,2) facing east → cv3.
    // cv1 at (3,2) facing east → cv2.
    // All belts and warehouse in Zone A.
    const whA: PlacedAsset = { id: "whA", type: "warehouse", x: 5, y: 0, size: 2, direction: "south" };
    const state = makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 3, 2, "east"),
        cv2: makeConveyorAsset("cv2", 4, 2, "east"),
        cv3: makeConveyorAsset("cv3", 5, 2, "east"), // sits on warehouse input tile
        whA,
      },
      cellMap: {
        [cellKey(3, 2)]: "cv1",
        [cellKey(4, 2)]: "cv2",
        [cellKey(5, 2)]: "cv3",
        [cellKey(5, 0)]: "whA",
        [cellKey(6, 0)]: "whA",
        [cellKey(5, 1)]: "whA",
        [cellKey(6, 1)]: "whA",
      },
      connectedAssetIds: ["cv1", "cv2", "cv3"],
      poweredMachineIds: ["cv1", "cv2", "cv3"],
      conveyors: {
        cv1: { queue: ["iron"] },
        cv2: { queue: [] },
        cv3: { queue: [] },
      },
      warehousesPlaced: 1,
      warehouseInventories: { whA: emptyInv() },
      productionZones: { zA: { id: "zA", name: "Zone A" } },
      buildingZoneIds: { cv1: "zA", cv2: "zA", cv3: "zA", whA: "zA" },
    });

    // Tick 1: cv1 → cv2
    const s1 = runTick(state);
    expect(s1.conveyors.cv1.queue).toHaveLength(0);
    expect(s1.conveyors.cv2.queue).toContain("iron");

    // Tick 2: cv2 → cv3
    const s2 = runTick(s1);
    expect(s2.conveyors.cv2.queue).toHaveLength(0);
    expect(s2.conveyors.cv3.queue).toContain("iron");

    // Tick 3: cv3 on input tile → delivers to warehouse
    const s3 = runTick(s2);
    expect(s3.conveyors.cv3.queue).toHaveLength(0);
    expect((s3.warehouseInventories.whA.iron as number)).toBe(1);
  });
});

// ---- Inter-zone chain: cross-zone belt chain blocked -------------------

describe("Inter-zone chain: cross-zone belt blocks propagate correctly", () => {
  it("item stops at zone boundary, does not reach other-zone warehouse", () => {
    const whB: PlacedAsset = { id: "whB", type: "warehouse", x: 3, y: 0, size: 2, direction: "south" };
    const state = makeBaseState({
      assets: {
        cv1: makeConveyorAsset("cv1", 0, 0, "east"), // Zone A
        cv2: makeConveyorAsset("cv2", 1, 0, "east"), // Zone B (boundary!)
        cv3: makeConveyorAsset("cv3", 2, 0, "east"), // Zone B
        whB,
      },
      cellMap: {
        [cellKey(0, 0)]: "cv1",
        [cellKey(1, 0)]: "cv2",
        [cellKey(2, 0)]: "cv3",
        [cellKey(3, 0)]: "whB",
        [cellKey(4, 0)]: "whB",
        [cellKey(3, 1)]: "whB",
        [cellKey(4, 1)]: "whB",
      },
      connectedAssetIds: ["cv1", "cv2", "cv3"],
      poweredMachineIds: ["cv1", "cv2", "cv3"],
      conveyors: {
        cv1: { queue: ["copper"] },
        cv2: { queue: [] },
        cv3: { queue: [] },
      },
      warehousesPlaced: 1,
      warehouseInventories: { whB: emptyInv() },
      productionZones: {
        zA: { id: "zA", name: "Zone A" },
        zB: { id: "zB", name: "Zone B" },
      },
      buildingZoneIds: {
        cv1: "zA",          // Zone A
        cv2: "zB", cv3: "zB", whB: "zB", // Zone B
      },
    });

    const after = runTicks(state, 5);

    // Item must NOT reach Zone B warehouse
    expect((after.warehouseInventories.whB.copper as number)).toBe(0);
    // Item must be stuck on cv1 (blocked at zone boundary cv1→cv2)
    expect(after.conveyors.cv1.queue).toContain("copper");
    // cv2 and cv3 must be empty
    expect(after.conveyors.cv2.queue).toHaveLength(0);
    expect(after.conveyors.cv3.queue).toHaveLength(0);
  });
});
