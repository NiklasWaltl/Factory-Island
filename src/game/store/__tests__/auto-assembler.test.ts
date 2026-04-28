import {
  gameReducer,
  createInitialState,
  cellKey,
  type GameAction,
  type GameState,
  type Inventory,
  type PlacedAsset,
} from "../reducer";
import { getAutoAssemblerV1Recipe } from "../../simulation/recipes/AutoAssemblerV1Recipes";

function emptyInv(): Inventory {
  return createInitialState("release").inventory;
}

/** Minimal GameState stub aligned with auto-smelter conveyor tests. */
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
    hotbarSlots: Array.from({ length: 9 }, () => ({
      toolKind: "empty" as const,
      amount: 0,
      label: "",
      emoji: "",
    })),
    activeSlot: 0,
    smithy: {
      fuel: 0,
      iron: 0,
      copper: 0,
      selectedRecipe: "iron",
      processing: false,
      progress: 0,
      outputIngots: 0,
      outputCopperIngots: 0,
      buildingId: null,
    },
    generators: {},
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
    conveyorUndergroundPeers: {},
    selectedAutoMinerId: null,
    autoSmelters: {},
    selectedAutoSmelterId: null,
    autoAssemblers: {},
    selectedAutoAssemblerId: null,
    manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
    machinePowerRatio: {},
    energyDebugOverlay: false,
    autoDeliveryLog: [],
    buildingSourceWarehouseIds: {},
    productionZones: {},
    buildingZoneIds: {},
    selectedCraftingBuildingId: null,
    collectionNodes: {},
    starterDrone: createInitialState("release").starterDrone,
    drones: {},
    serviceHubs: {},
    constructionSites: {},
    network: createInitialState("release").network,
    crafting: createInitialState("release").crafting,
    keepStockByWorkbench: {},
    recipeAutomationPolicies: {},
    ...overrides,
  } as unknown as GameState;
}

function makeEastConveyor(id: string, x: number, y: number): PlacedAsset {
  return { id, type: "conveyor", x, y, size: 1, direction: "east" };
}

describe("auto-assembler V1", () => {
  it("exposes fixed V1 recipes", () => {
    expect(getAutoAssemblerV1Recipe("metal_plate")?.inputAmount).toBe(1);
    expect(getAutoAssemblerV1Recipe("gear")?.inputAmount).toBe(3);
  });

  it("pulls iron ingots from the input conveyor into the internal buffer", () => {
    const state = makeBaseState({
      assets: {
        asm1: {
          id: "asm1",
          type: "auto_assembler",
          x: 6,
          y: 6,
          size: 2,
          width: 2,
          height: 1,
          direction: "east",
          priority: 3,
        },
        cv1: makeEastConveyor("cv1", 5, 6),
      },
      cellMap: {
        [cellKey(5, 6)]: "cv1",
        [cellKey(6, 6)]: "asm1",
        [cellKey(7, 6)]: "asm1",
      },
      autoAssemblers: {
        asm1: {
          ironIngotBuffer: 0,
          processing: null,
          pendingOutput: [],
          status: "IDLE",
          selectedRecipe: "metal_plate",
        },
      },
      conveyors: { cv1: { queue: ["ironIngot", "ironIngot", "ironIngot"] } },
      machinePowerRatio: { asm1: 1, cv1: 1 },
      // Conveyor unpowered so conveyor phase does not move items off the input tile before the assembler pulls.
      poweredMachineIds: ["asm1"],
      connectedAssetIds: [],
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" } as GameAction);

    // One ingot is pulled from the belt and immediately consumed to start the 1× plate batch in the same tick.
    expect(after.autoAssemblers.asm1.ironIngotBuffer).toBe(0);
    expect(after.autoAssemblers.asm1.processing?.outputItem).toBe("metalPlate");
    expect(after.conveyors.cv1.queue.length).toBe(2);
  });

  it("does not pull input when under-powered", () => {
    const state = makeBaseState({
      assets: {
        asm1: {
          id: "asm1",
          type: "auto_assembler",
          x: 6,
          y: 6,
          size: 2,
          width: 2,
          height: 1,
          direction: "east",
          priority: 3,
        },
        cv1: makeEastConveyor("cv1", 5, 6),
      },
      cellMap: {
        [cellKey(5, 6)]: "cv1",
        [cellKey(6, 6)]: "asm1",
        [cellKey(7, 6)]: "asm1",
      },
      autoAssemblers: {
        asm1: {
          ironIngotBuffer: 0,
          processing: null,
          pendingOutput: [],
          status: "IDLE",
          selectedRecipe: "metal_plate",
        },
      },
      conveyors: { cv1: { queue: ["ironIngot"] } },
      machinePowerRatio: { asm1: 0, cv1: 1 },
      poweredMachineIds: ["cv1"],
      connectedAssetIds: ["cv1"],
    });

    const after = gameReducer(state, { type: "LOGISTICS_TICK" } as GameAction);

    expect(after.autoAssemblers.asm1.ironIngotBuffer).toBe(0);
    expect(after.autoAssemblers.asm1.status).toBe("NO_POWER");
    expect(after.conveyors.cv1.queue.length).toBe(1);
  });
});
