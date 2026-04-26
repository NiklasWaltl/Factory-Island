/**
 * Wood Generator Input Buffer Tests
 *
 * Verifies the wood generator behaves as the first inventory-aware building:
 *  - starts with empty local fuel buffer
 *  - only accepts wood
 *  - drones can supply wood from the hub inventory
 *  - drones can supply wood from ground drops
 *  - delivery stops at GENERATOR_MAX_FUEL (no over-delivery / no negatives)
 *  - warehouse stock alone is NOT a valid drone source
 *  - GENERATOR_TICK consumes only from the local buffer
 */

import {
  gameReducer,
  createInitialState,
  addToCollectionNodeAt,
  selectDroneTask,
  getRemainingBuildingInputDemand,
  getBuildingInputConfig,
  getBuildingInputCurrent,
  GENERATOR_MAX_FUEL,
  MAP_SHOP_POS,
  DRONE_CAPACITY,
  GENERATOR_TICKS_PER_WOOD,
} from "../reducer";
import type {
  GameState,
  PlacedAsset,
  StarterDroneState,
  GeneratorState,
  Inventory,
  CollectableItemType,
} from "../types";

const HUB_POS = { x: MAP_SHOP_POS.x + 3, y: MAP_SHOP_POS.y };

function makeGeneratorAsset(id: string, x: number, y: number): PlacedAsset {
  return { id, type: "generator", x, y, size: 2 };
}

/** Place a generator instance at (x,y) with empty local fuel buffer.
 *  `requestedRefill` controls whether drones may auto-deliver — defaults to 0
 *  (manual-refill semantics, no drone deliveries unless the player asks). */
function placeGenerator(
  state: GameState,
  id: string,
  x: number,
  y: number,
  fuel = 0,
  requestedRefill = 0,
): GameState {
  const asset = makeGeneratorAsset(id, x, y);
  const newCellMap = { ...state.cellMap };
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      newCellMap[`${x + dx},${y + dy}`] = id;
    }
  }
  const gen: GeneratorState = { fuel, progress: 0, running: false, requestedRefill };
  return {
    ...state,
    assets: { ...state.assets, [id]: asset },
    cellMap: newCellMap,
    generators: { ...state.generators, [id]: gen },
  };
}

function withDrone(state: GameState, patch: Partial<StarterDroneState>): GameState {
  const updated = { ...state.starterDrone, ...patch };
  return { ...state, starterDrone: updated, drones: { ...state.drones, starter: updated } };
}

function withHubInventory(state: GameState, hubId: string, inv: Partial<Record<CollectableItemType, number>>): GameState {
  const hub = state.serviceHubs[hubId];
  return {
    ...state,
    serviceHubs: {
      ...state.serviceHubs,
      [hubId]: { ...hub, inventory: { ...hub.inventory, ...inv } as typeof hub.inventory },
    },
  };
}

function tick(state: GameState, action: Parameters<typeof gameReducer>[1]): GameState {
  return gameReducer(state, action);
}

function runDroneUntilIdle(state: GameState, maxTicks = 200): GameState {
  let s = state;
  for (let i = 0; i < maxTicks; i++) {
    s = tick(s, { type: "DRONE_TICK" });
    if (s.starterDrone.status === "idle" && s.starterDrone.cargo === null) {
      // One more tick lets it park / pick a new task; stop here
      return s;
    }
  }
  throw new Error(`Drone did not return to idle within ${maxTicks} ticks`);
}

// ---------------------------------------------------------------------------

describe("Generator input buffer — registry", () => {
  it("registers wood as the only accepted resource with capacity 70", () => {
    const cfg = getBuildingInputConfig("generator");
    expect(cfg).not.toBeNull();
    expect(cfg!.resource).toBe("wood");
    expect(cfg!.capacity).toBe(70);
    expect(GENERATOR_MAX_FUEL).toBe(70);
  });

  it("returns null for buildings without an input buffer", () => {
    expect(getBuildingInputConfig("warehouse")).toBeNull();
    expect(getBuildingInputConfig("cable")).toBeNull();
    expect(getBuildingInputConfig("workbench")).toBeNull();
  });
});

describe("Generator local fuel — initial state and bounds", () => {
  it("starts with an empty local fuel buffer and zero drone demand when first placed", () => {
    const base = createInitialState("release");
    const state = placeGenerator(base, "gen-1", 5, 5, 0);
    expect(state.generators["gen-1"].fuel).toBe(0);
    expect(getBuildingInputCurrent(state, "gen-1")).toBe(0);
    // Manual-refill semantics: drones do NOT deliver until the player issues a request.
    expect(getRemainingBuildingInputDemand(state, "gen-1", "wood")).toBe(0);
  });

  it("reports the requested refill amount as drone demand once the player asks for fuel", () => {
    const base = createInitialState("release");
    const state = placeGenerator(base, "gen-1", 5, 5, 0, 12);
    expect(getRemainingBuildingInputDemand(state, "gen-1", "wood")).toBe(12);
  });

  it("reports zero remaining demand for a non-wood resource (wood-only)", () => {
    const base = createInitialState("release");
    const state = placeGenerator(base, "gen-1", 5, 5, 0);
    expect(getRemainingBuildingInputDemand(state, "gen-1", "stone")).toBe(0);
    expect(getRemainingBuildingInputDemand(state, "gen-1", "iron")).toBe(0);
    expect(getRemainingBuildingInputDemand(state, "gen-1", "copper")).toBe(0);
  });

  it("reports remaining demand of 0 once the buffer reaches GENERATOR_MAX_FUEL", () => {
    const base = createInitialState("release");
    const state = placeGenerator(base, "gen-1", 5, 5, GENERATOR_MAX_FUEL);
    expect(getRemainingBuildingInputDemand(state, "gen-1", "wood")).toBe(0);
  });
});

describe("Drone task selection — building_supply candidates", () => {
  it("does NOT pick a building_supply task when the hub holds no wood and no drops exist", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 5, 5, 0);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 0, stone: 0 });
    state = withDrone(state, { tileX: HUB_POS.x, tileY: HUB_POS.y });
    const task = selectDroneTask(state);
    expect(task).toBeNull();
  });

  it("picks building_supply with hub source when the hub has wood and the generator is empty", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 5, 5, 0, GENERATOR_MAX_FUEL);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 5 });
    state = withDrone(state, { tileX: HUB_POS.x, tileY: HUB_POS.y });
    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("building_supply");
    expect(task!.deliveryTargetId).toBe("gen-1");
    expect(task!.nodeId).toBe(`hub:${hubId}:wood`);
  });

  it("picks building_supply with drop source when drops are closer / hub is empty", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 5, 5, 0, GENERATOR_MAX_FUEL);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 0 });
    // Wood drop near the generator
    state = { ...state, collectionNodes: addToCollectionNodeAt(state.collectionNodes, "wood", 6, 5, 4) };
    state = withDrone(state, { tileX: 6, tileY: 5 });
    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    // hub_restock candidates also exist for the same drop, but building_supply (200) > hub_restock (100).
    expect(task!.taskType).toBe("building_supply");
    expect(task!.deliveryTargetId).toBe("gen-1");
  });

  it("does NOT consider warehouse stock as a drone source", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 5, 5, 0);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 0 });
    // Pretend a warehouse holds wood — it must NOT enable a building_supply task.
    state = {
      ...state,
      warehouseInventories: {
        ...state.warehouseInventories,
        "wh-1": { ...({} as Inventory), wood: 50 } as Inventory,
      },
    };
    state = withDrone(state, { tileX: HUB_POS.x, tileY: HUB_POS.y });
    const task = selectDroneTask(state);
    // No collection nodes, no hub stock → no building_supply candidate (warehouse is ignored).
    if (task) {
      expect(task.taskType).not.toBe("building_supply");
    } else {
      expect(task).toBeNull();
    }
  });

  it("stops emitting building_supply candidates once capacity is reached", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 5, 5, GENERATOR_MAX_FUEL);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 50 });
    state = withDrone(state, { tileX: HUB_POS.x, tileY: HUB_POS.y });
    const task = selectDroneTask(state);
    if (task) {
      expect(task.taskType).not.toBe("building_supply");
    }
  });
});

describe("Full delivery round-trip — hub source", () => {
  it("drone moves wood from hub inventory into the generator's local buffer", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 8, 5, 0, GENERATOR_MAX_FUEL);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 6 });
    state = withDrone(state, { tileX: HUB_POS.x, tileY: HUB_POS.y, status: "idle" });

    state = runDroneUntilIdle(state);

    // Hub lost up to DRONE_CAPACITY; generator gained the same amount.
    const expectedTransfer = Math.min(DRONE_CAPACITY, 6);
    expect(state.serviceHubs[hubId].inventory.wood).toBe(6 - expectedTransfer);
    expect(state.generators["gen-1"].fuel).toBe(expectedTransfer);
    expect(state.generators["gen-1"].fuel).toBeLessThanOrEqual(GENERATOR_MAX_FUEL);
  });

  it("never overfills past GENERATOR_MAX_FUEL even with abundant hub stock", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 8, 5, GENERATOR_MAX_FUEL - 2, GENERATOR_MAX_FUEL);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 50 });
    state = withDrone(state, { tileX: HUB_POS.x, tileY: HUB_POS.y, status: "idle" });

    state = runDroneUntilIdle(state);

    // Only 2 units of demand existed; drone may not exceed the cap.
    expect(state.generators["gen-1"].fuel).toBe(GENERATOR_MAX_FUEL);
    expect(state.serviceHubs[hubId].inventory.wood).toBe(48); // 50 − 2
  });
});

describe("Full delivery round-trip — drop source", () => {
  it("drone collects wood drop and deposits it into the generator's local buffer", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 8, 5, 0, GENERATOR_MAX_FUEL);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 0, stone: 0 });
    state = { ...state, collectionNodes: addToCollectionNodeAt(state.collectionNodes, "wood", 7, 5, 3) };
    state = withDrone(state, { tileX: 7, tileY: 5, status: "idle" });

    state = runDroneUntilIdle(state);

    expect(state.generators["gen-1"].fuel).toBe(3);
    // Drop was consumed; hub did NOT receive the wood (drone went straight to building).
    expect(state.serviceHubs[hubId].inventory.wood).toBe(0);
  });
});

describe("Generator consumption — local buffer only", () => {
  it("GENERATOR_TICK draws from the local fuel buffer, not from global / warehouse / hub", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 5, 5, 5);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 99 });
    // Pre-fill global and a warehouse with wood — none of these may shrink.
    state = {
      ...state,
      inventory: { ...state.inventory, wood: 99 },
      warehouseInventories: {
        ...state.warehouseInventories,
        "wh-1": { ...({} as Inventory), wood: 99 } as Inventory,
      },
      generators: { ...state.generators, "gen-1": { fuel: 5, progress: 0, running: true } },
    };

    // Run enough ticks to consume one wood from the local buffer.
    for (let i = 0; i < GENERATOR_TICKS_PER_WOOD; i++) {
      state = tick(state, { type: "GENERATOR_TICK" });
    }

    expect(state.generators["gen-1"].fuel).toBe(4);
    expect(state.inventory.wood).toBe(99);
    expect(state.serviceHubs[hubId].inventory.wood).toBe(99);
    expect(state.warehouseInventories["wh-1"].wood).toBe(99);
  });

  it("stops running when the local buffer hits 0, even if other sources have wood", () => {
    let state = createInitialState("release");
    state = placeGenerator(state, "gen-1", 5, 5, 1);
    const hubId = state.starterDrone.hubId!;
    state = withHubInventory(state, hubId, { wood: 50 });
    state = {
      ...state,
      generators: { ...state.generators, "gen-1": { fuel: 1, progress: 0, running: true } },
    };

    for (let i = 0; i < GENERATOR_TICKS_PER_WOOD + 1; i++) {
      state = tick(state, { type: "GENERATOR_TICK" });
    }

    expect(state.generators["gen-1"].fuel).toBe(0);
    expect(state.generators["gen-1"].running).toBe(false);
  });
});
