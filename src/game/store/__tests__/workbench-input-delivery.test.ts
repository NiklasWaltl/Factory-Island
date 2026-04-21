import {
  cellKey,
  createInitialState,
  gameReducer,
  type GameState,
  type Inventory,
  type PlacedAsset,
} from "../reducer";

const WB = "wb-1";
const WH = "wh-1";

function buildState(opts?: {
  warehouseWood?: number;
  globalWood?: number;
  mapWarehouse?: boolean;
}): GameState {
  const { warehouseWood = 0, globalWood = 0, mapWarehouse = true } = opts ?? {};
  const base = createInitialState("release");
  const workbench: PlacedAsset = { id: WB, type: "workbench", x: 10, y: 10, size: 1 };
  const warehouse: PlacedAsset = { id: WH, type: "warehouse", x: 4, y: 4, size: 2 };
  const starterDrone = {
    ...base.starterDrone,
    status: "idle" as const,
    tileX: 0,
    tileY: 0,
    targetNodeId: null,
    cargo: null,
    ticksRemaining: 0,
    hubId: null,
    currentTaskType: null,
    deliveryTargetId: null,
    craftingJobId: null,
    droneId: "starter",
  };
  const warehouseInventory: Inventory = {
    ...base.inventory,
    wood: warehouseWood,
  };

  return {
    ...base,
    assets: {
      [WB]: workbench,
      [WH]: warehouse,
    },
    cellMap: {
      [cellKey(10, 10)]: WB,
      [cellKey(4, 4)]: WH,
      [cellKey(5, 4)]: WH,
      [cellKey(4, 5)]: WH,
      [cellKey(5, 5)]: WH,
    },
    inventory: {
      ...base.inventory,
      wood: globalWood,
    },
    warehouseInventories: {
      [WH]: warehouseInventory,
    },
    buildingSourceWarehouseIds: mapWarehouse ? { [WB]: WH } : {},
    productionZones: {},
    buildingZoneIds: {},
    collectionNodes: {},
    serviceHubs: {},
    constructionSites: {},
    starterDrone,
    drones: {
      starter: starterDrone,
    },
  };
}

function enqueue(state: GameState): GameState {
  return gameReducer(state, {
    type: "JOB_ENQUEUE",
    recipeId: "wood_pickaxe",
    workbenchId: WB,
    priority: "high",
    source: "player",
  });
}

function jobTick(state: GameState, n = 1): GameState {
  let next = state;
  for (let i = 0; i < n; i++) {
    next = gameReducer(next, { type: "JOB_TICK" });
  }
  return next;
}

function droneTickUntil(
  state: GameState,
  predicate: (state: GameState) => boolean,
  maxTicks = 80,
): GameState {
  let next = state;
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(next)) return next;
    next = gameReducer(next, { type: "DRONE_TICK" });
  }
  throw new Error("Drone did not reach the expected state in time.");
}

function getJob(state: GameState) {
  const job = state.crafting.jobs[0];
  if (!job) throw new Error("Expected a workbench job.");
  return job;
}

describe("workbench input delivery", () => {
  it("does not craft directly from inventory", () => {
    let state = buildState({ warehouseWood: 0, globalWood: 5 });
    state = enqueue(state);
    state = jobTick(state);

    expect(getJob(state).status).toBe("queued");
    expect(state.inventory.wood).toBe(5);
    expect(state.warehouseInventories[WH].wood).toBe(0);
  });

  it("drone delivers reserved resources into the workbench input buffer", () => {
    let state = buildState({ warehouseWood: 5 });
    state = enqueue(state);
    state = jobTick(state);

    expect(getJob(state).status).toBe("reserved");
    expect(state.network.reservations).toHaveLength(1);

    state = droneTickUntil(
      state,
      (current) => {
        const job = getJob(current);
        return (
          (job.inputBuffer?.find((stack) => stack.itemId === "wood")?.count ?? 0) === 5 &&
          current.starterDrone.status === "idle"
        );
      },
    );

    expect(getJob(state).inputBuffer).toEqual([{ itemId: "wood", count: 5 }]);
    expect(state.network.reservations).toEqual([]);
    expect(state.warehouseInventories[WH].wood).toBe(0);
  });

  it("crafting begins only after a successful delivery", () => {
    let state = buildState({ warehouseWood: 5 });
    state = enqueue(state);
    state = jobTick(state);
    state = jobTick(state, 3);

    expect(getJob(state).status).toBe("reserved");

    state = droneTickUntil(
      state,
      (current) => (getJob(current).inputBuffer?.find((stack) => stack.itemId === "wood")?.count ?? 0) === 5,
    );

    expect(getJob(state).status).toBe("reserved");

    state = jobTick(state);
    expect(getJob(state).status).toBe("delivering");
  });

  it("does not start crafting without physical input", () => {
    let state = buildState({ warehouseWood: 5 });
    state = enqueue(state);
    state = jobTick(state);
    state = jobTick(state, 5);

    expect(getJob(state).status).toBe("reserved");
    expect(getJob(state).inputBuffer ?? []).toEqual([]);
    expect(state.warehouseInventories[WH].wood).toBe(5);
    expect(state.inventory.wood_pickaxe).toBe(0);
  });

  it("rejects the direct global fallback for workbench jobs", () => {
    let state = buildState({ globalWood: 5, mapWarehouse: false });
    state = enqueue(state);

    expect(state.crafting.jobs).toEqual([]);
    expect(state.notifications.at(-1)?.kind).toBe("error");
  });
});
