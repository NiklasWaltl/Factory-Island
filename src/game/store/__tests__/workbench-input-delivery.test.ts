import { cellKey, createInitialState, gameReducer } from "../reducer";
import type { GameState, Inventory, PlacedAsset } from "../types";

const WB = "wb-1";
const WH = "wh-1";
const WH_NEAR = "wh-z";
const HUB = "hub-1";

function buildState(opts?: {
  warehouseWood?: number;
  globalWood?: number;
  hubWood?: number;
  mapWarehouse?: boolean;
}): GameState {
  const { warehouseWood = 0, globalWood = 0, hubWood = 0, mapWarehouse = true } = opts ?? {};
  const base = createInitialState("release");
  const workbench: PlacedAsset = { id: WB, type: "workbench", x: 10, y: 10, size: 1 };
  const warehouse: PlacedAsset = { id: WH, type: "warehouse", x: 4, y: 4, size: 2 };
  const hub: PlacedAsset = { id: HUB, type: "service_hub", x: 1, y: 1, size: 2 };
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
      ...(hubWood > 0 ? { [HUB]: hub } : {}),
    },
    cellMap: {
      [cellKey(10, 10)]: WB,
      [cellKey(4, 4)]: WH,
      [cellKey(5, 4)]: WH,
      [cellKey(4, 5)]: WH,
      [cellKey(5, 5)]: WH,
      ...(hubWood > 0
        ? {
            [cellKey(1, 1)]: HUB,
            [cellKey(2, 1)]: HUB,
            [cellKey(1, 2)]: HUB,
            [cellKey(2, 2)]: HUB,
          }
        : {}),
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
    serviceHubs: hubWood > 0
      ? {
          [HUB]: {
            inventory: { wood: hubWood, stone: 0, iron: 0, copper: 0 },
            targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
            tier: 1,
            droneIds: [],
          },
        }
      : {},
    constructionSites: {},
    starterDrone,
    drones: {
      starter: starterDrone,
    },
  };
}

function withLocalZoneWarehouses(
  state: GameState,
  opts?: { farWood?: number; nearWood?: number },
): GameState {
  const farWood = opts?.farWood ?? 5;
  const nearWood = opts?.nearWood ?? 5;
  const nearWarehouse: PlacedAsset = { id: WH_NEAR, type: "warehouse", x: 11, y: 10, size: 2 };
  const farInventory: Inventory = {
    ...(state.warehouseInventories[WH] ?? ({ ...state.inventory } as Inventory)),
    wood: farWood,
  };
  const nearInventory: Inventory = {
    ...state.inventory,
    wood: nearWood,
  };

  return {
    ...state,
    assets: {
      ...state.assets,
      [WH_NEAR]: nearWarehouse,
    },
    cellMap: {
      ...state.cellMap,
      [cellKey(11, 10)]: WH_NEAR,
      [cellKey(12, 10)]: WH_NEAR,
      [cellKey(11, 11)]: WH_NEAR,
      [cellKey(12, 11)]: WH_NEAR,
    },
    warehouseInventories: {
      ...state.warehouseInventories,
      [WH]: farInventory,
      [WH_NEAR]: nearInventory,
    },
    buildingSourceWarehouseIds: {},
    productionZones: {
      z1: { id: "z1", name: "Zone 1" },
    },
    buildingZoneIds: {
      [WB]: "z1",
      [WH]: "z1",
      [WH_NEAR]: "z1",
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

function getReservedAmountForOwnerItem(
  state: GameState,
  ownerId: string,
  itemId: string,
): number {
  return state.network.reservations.reduce((sum, reservation) => {
    if (reservation.ownerKind !== "crafting_job") return sum;
    if (reservation.ownerId !== ownerId) return sum;
    if (reservation.itemId !== itemId) return sum;
    return sum + reservation.amount;
  }, 0);
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

  it("keeps reservation sums consistent from reserve to committed input delivery", () => {
    let state = buildState({ warehouseWood: 5 });
    state = enqueue(state);
    state = jobTick(state);

    const reservedJob = getJob(state);
    const requiredWood =
      reservedJob.ingredients.find((ingredient) => ingredient.itemId === "wood")?.count ?? 0;

    expect(reservedJob.status).toBe("reserved");
    expect(requiredWood).toBeGreaterThan(0);
    expect(state.network.reservations.every((reservation) => reservation.amount > 0)).toBe(true);
    expect(getReservedAmountForOwnerItem(state, reservedJob.reservationOwnerId, "wood")).toBe(requiredWood);

    const warehouseWoodBeforeCommit = state.warehouseInventories[WH].wood;

    state = droneTickUntil(
      state,
      (current) => {
        const deliveredWood =
          getJob(current).inputBuffer?.find((stack) => stack.itemId === "wood")?.count ?? 0;
        return deliveredWood === requiredWood && current.starterDrone.status === "idle";
      },
    );

    expect(getReservedAmountForOwnerItem(state, reservedJob.reservationOwnerId, "wood")).toBe(0);
    expect(state.warehouseInventories[WH].wood).toBe(warehouseWoodBeforeCommit - requiredWood);
    expect(state.network.reservations).toEqual([]);
  });

  it("does not double-debit stock after input reservation commit", () => {
    let state = buildState({ warehouseWood: 5 });
    state = enqueue(state);
    state = jobTick(state);

    const requiredWood =
      getJob(state).ingredients.find((ingredient) => ingredient.itemId === "wood")?.count ?? 0;

    state = droneTickUntil(
      state,
      (current) => {
        const deliveredWood =
          getJob(current).inputBuffer?.find((stack) => stack.itemId === "wood")?.count ?? 0;
        return deliveredWood === requiredWood && current.starterDrone.status === "idle";
      },
    );

    const committedWarehouseWood = state.warehouseInventories[WH].wood;
    const committedBufferWood =
      getJob(state).inputBuffer?.find((stack) => stack.itemId === "wood")?.count ?? 0;

    state = gameReducer(state, { type: "DRONE_TICK" });
    state = gameReducer(state, { type: "DRONE_TICK" });

    expect(state.warehouseInventories[WH].wood).toBe(committedWarehouseWood);
    expect(
      getJob(state).inputBuffer?.find((stack) => stack.itemId === "wood")?.count ?? 0,
    ).toBe(committedBufferWood);
    expect(state.network.reservations).toEqual([]);
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

  it("reserves and delivers from hub fallback when warehouse is empty", () => {
    let state = buildState({ warehouseWood: 0, hubWood: 5 });
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
    expect(state.warehouseInventories[WH].wood).toBe(0);
    expect(state.serviceHubs[HUB].inventory.wood).toBe(0);
  });

  it("uses hub fallback as full source when warehouse has only a partial amount (no split pickup)", () => {
    let state = buildState({ warehouseWood: 2, hubWood: 10 });
    state = enqueue(state);
    state = jobTick(state);

    expect(getJob(state).status).toBe("reserved");

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
    // No split-pickup in MVP: warehouse remains untouched because it cannot fulfill 5 alone.
    expect(state.warehouseInventories[WH].wood).toBe(2);
    expect(state.serviceHubs[HUB].inventory.wood).toBe(5);
  });

  it("prefers nearest zone warehouse for workbench input pickup", () => {
    let state = buildState({ warehouseWood: 5, mapWarehouse: false });
    state = withLocalZoneWarehouses(state, { farWood: 5, nearWood: 5 });
    state = enqueue(state);
    state = jobTick(state);

    expect(getJob(state).status).toBe("reserved");

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

    expect(state.warehouseInventories[WH].wood).toBe(5);
    expect(state.warehouseInventories[WH_NEAR].wood).toBe(0);
  });

  it("routes finished workbench output back to the nearest zone warehouse", () => {
    let state = buildState({ warehouseWood: 5, mapWarehouse: false });
    state = withLocalZoneWarehouses(state, { farWood: 5, nearWood: 5 });
    state = enqueue(state);
    state = jobTick(state);

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

    state = jobTick(state);
    expect(getJob(state).status).toBe("delivering");

    state = droneTickUntil(
      state,
      (current) => getJob(current).status === "done" && current.starterDrone.status === "idle",
      120,
    );

    expect(state.warehouseInventories[WH_NEAR].wood_pickaxe).toBe(1);
    expect(state.warehouseInventories[WH].wood_pickaxe).toBe(0);
  });
});
