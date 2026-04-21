// ============================================================
// Crafting Tick Scheduler — tests (Step 3)
// ============================================================

import {
  createInitialState,
  gameReducer,
  type GameState,
  type Inventory,
  type PlacedAsset,
} from "../../store/reducer";

const WB_A = "wb-A";
const WB_B = "wb-B";
const WH = "wh-test";

function buildState(opts: {
  wood?: number;
  stone?: number;
  workbenches?: string[];
}): GameState {
  const base = createInitialState("release");
  const woodAmount = opts.wood ?? 0;
  const stoneAmount = opts.stone ?? 0;
  const wbs = opts.workbenches ?? [WB_A];

  const newAssets: Record<string, PlacedAsset> = { ...base.assets };
  for (const id of wbs) {
    newAssets[id] = { id, type: "workbench", x: 0, y: 0, size: 1 };
  }

  const wh: PlacedAsset = { id: WH, type: "warehouse", x: 5, y: 5, size: 2 };
  newAssets[WH] = wh;
  const wInv: Inventory = { ...base.inventory, wood: woodAmount, stone: stoneAmount };

  return {
    ...base,
    assets: newAssets,
    warehouseInventories: { [WH]: wInv },
    inventory: { ...base.inventory },
    buildingSourceWarehouseIds: Object.fromEntries(wbs.map((id) => [id, WH])),
  };
}

function enqueue(
  state: GameState,
  recipeId: string,
  workbenchId: string,
  source: "player" | "automation" = "player",
  priority?: "high" | "normal" | "low",
): GameState {
  return gameReducer(state, {
    type: "JOB_ENQUEUE",
    recipeId,
    workbenchId,
    source,
    priority,
  });
}

function tick(state: GameState, n = 1): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = gameReducer(s, { type: "JOB_TICK" });
  return s;
}

function providePhysicalInput(state: GameState, jobId: string): GameState {
  return {
    ...state,
    network: { ...state.network, reservations: [] },
    crafting: {
      ...state.crafting,
      jobs: state.crafting.jobs.map((job) =>
        job.id === jobId
          ? { ...job, inputBuffer: [...job.ingredients] }
          : job,
      ),
    },
  };
}

describe("createInitialState seeds an empty crafting queue", () => {
  it("crafting slice exists and is empty", () => {
    const s = createInitialState("release");
    expect(s.crafting).toBeDefined();
    expect(s.crafting.jobs).toEqual([]);
    expect(s.crafting.nextJobSeq).toBe(1);
  });
});

describe("single-job lifecycle", () => {
  it("queued -> reserved in one tick and waits for delivered input", () => {
    let s = buildState({ wood: 5 });
    s = enqueue(s, "wood_pickaxe", WB_A);

    s = tick(s);

    expect(s.crafting.jobs[0].status).toBe("reserved");
    expect(s.network.reservations).toHaveLength(1);
    expect(s.warehouseInventories[WH].wood).toBe(5);
    expect(s.crafting.jobs[0].inputBuffer ?? []).toEqual([]);
  });

  it("queued job stays queued when ingredients are missing", () => {
    let s = buildState({ wood: 0 });
    s = enqueue(s, "wood_pickaxe", WB_A);
    s = tick(s, 5);
    expect(s.crafting.jobs[0].status).toBe("queued");
    expect(s.network.reservations).toEqual([]);
  });

  it("reserved job starts once its physical input buffer is full", () => {
    let s = buildState({ wood: 5 });
    s = enqueue(s, "wood_pickaxe", WB_A);
    s = tick(s);
    s = providePhysicalInput(s, "job-1");

    s = tick(s);

    expect(s.crafting.jobs[0].status).toBe("delivering");
    expect(s.warehouseInventories[WH].wood_pickaxe).toBe(0);
    expect(s.inventory.wood_pickaxe).toBe(0);
  });
});

describe("scheduling rules", () => {
  it("does not start any reserved workbench job without physical input", () => {
    let s = buildState({ wood: 50 });
    s = enqueue(s, "wood_pickaxe", WB_A, "automation", "low");
    s = enqueue(s, "wood_pickaxe", WB_A, "automation", "normal");
    s = enqueue(s, "wood_pickaxe", WB_A, "player", "high");

    s = tick(s);

    expect(s.crafting.jobs.map((job) => job.status)).toEqual([
      "reserved",
      "reserved",
      "reserved",
    ]);
  });

  it("limits each workbench to at most one active job once input is ready", () => {
    let s = buildState({ wood: 50, stone: 50 });
    s = enqueue(s, "wood_pickaxe", WB_A);
    s = enqueue(s, "stone_pickaxe", WB_A);
    s = tick(s);
    s = providePhysicalInput(s, "job-1");
    s = providePhysicalInput(s, "job-2");

    s = tick(s);

    const active = s.crafting.jobs.filter((job) => job.status === "crafting" || job.status === "delivering");
    expect(active).toHaveLength(1);
  });

  it("two workbenches can start independently once each input buffer is ready", () => {
    let s = buildState({ wood: 10, workbenches: [WB_A, WB_B] });
    s = enqueue(s, "wood_pickaxe", WB_A);
    s = enqueue(s, "wood_pickaxe", WB_B);
    s = tick(s);
    s = providePhysicalInput(s, "job-1");
    s = providePhysicalInput(s, "job-2");

    s = tick(s);

    expect(s.crafting.jobs[0].status).toBe("delivering");
    expect(s.crafting.jobs[1].status).toBe("delivering");
  });
});

describe("cancel releases reservations", () => {
  it("cancelling a reserved job frees its reservations", () => {
    let s = buildState({ wood: 5 });
    s = enqueue(s, "wood_pickaxe", WB_A);
    s = tick(s);

    expect(s.network.reservations).toHaveLength(1);

    s = gameReducer(s, { type: "JOB_CANCEL", jobId: "job-1" });
    expect(s.crafting.jobs[0].status).toBe("cancelled");
    expect(s.network.reservations).toEqual([]);
    expect(s.warehouseInventories[WH].wood).toBe(5);
  });

  it("cancelling a queued job touches no reservations", () => {
    let s = buildState({ wood: 5 });
    s = enqueue(s, "wood_pickaxe", WB_A);
    s = gameReducer(s, { type: "JOB_CANCEL", jobId: "job-1" });
    expect(s.crafting.jobs[0].status).toBe("cancelled");
    expect(s.network.reservations).toEqual([]);
    expect(s.warehouseInventories[WH].wood).toBe(5);
  });
});

describe("output handoff", () => {
  it("keeps the finished output pending until a drone delivers it", () => {
    let s = buildState({ wood: 5 });
    s = enqueue(s, "wood_pickaxe", WB_A);
    s = tick(s);
    s = providePhysicalInput(s, "job-1");
    s = tick(s);

    expect(s.crafting.jobs[0].status).toBe("delivering");
    expect(s.warehouseInventories[WH].wood_pickaxe).toBe(0);
    expect(s.inventory.wood_pickaxe).toBe(0);
  });

  it("does not enqueue when only the global fallback has stock", () => {
    let s = buildState({ wood: 0 });
    s = {
      ...s,
      inventory: { ...s.inventory, wood: 5 },
      buildingSourceWarehouseIds: {},
    };

    s = enqueue(s, "wood_pickaxe", WB_A);

    expect(s.crafting.jobs).toEqual([]);
    expect(s.notifications.at(-1)?.kind).toBe("error");
  });
});

describe("workbench destroyed while job reserved", () => {
  it("cancels the job and releases reservations", () => {
    let s = buildState({ wood: 5 });
    s = enqueue(s, "wood_pickaxe", WB_A);
    s = tick(s);
    const { [WB_A]: _wb, ...remainingAssets } = s.assets;
    void _wb;
    s = { ...s, assets: remainingAssets };

    s = tick(s);
    expect(s.crafting.jobs[0].status).toBe("cancelled");
    expect(s.network.reservations).toEqual([]);
    expect(s.warehouseInventories[WH].wood).toBe(5);
  });
});
