import {
  cellKey,
  createInitialState,
  gameReducer,
  type GameState,
  type Inventory,
  type PlacedAsset,
} from "../../../store/reducer";
import { buildProductionTransparency } from "../productionTransparency";

const WB = "wb-ui";
const WH = "wh-ui";

function buildState(overrides?: Partial<Inventory>): GameState {
  const base = createInitialState("release");
  const workbench: PlacedAsset = { id: WB, type: "workbench", x: 4, y: 4, size: 1 };
  const warehouse: PlacedAsset = { id: WH, type: "warehouse", x: 8, y: 8, size: 2 };

  return {
    ...base,
    assets: {
      ...base.assets,
      [WB]: workbench,
      [WH]: warehouse,
    },
    cellMap: {
      ...base.cellMap,
      [cellKey(4, 4)]: WB,
      [cellKey(8, 8)]: WH,
      [cellKey(9, 8)]: WH,
      [cellKey(8, 9)]: WH,
      [cellKey(9, 9)]: WH,
    },
    warehouseInventories: {
      [WH]: {
        ...base.inventory,
        ...(overrides ?? {}),
      },
    },
    buildingSourceWarehouseIds: {
      [WB]: WH,
    },
  };
}

describe("productionTransparency", () => {
  it("shows construction entries", () => {
    let state = buildState({ wood: 0 });
    state = {
      ...state,
      assets: {
        ...state.assets,
        "build-1": { id: "build-1", type: "warehouse", x: 12, y: 12, size: 2 },
      },
      constructionSites: {
        ...state.constructionSites,
        "build-1": {
          buildingType: "warehouse",
          remaining: { wood: 4 },
        },
      },
    };

    const snapshot = buildProductionTransparency(state);
    const row = snapshot.jobs.find((entry) => entry.type === "construction");

    expect(row).toBeDefined();
    expect(row?.targetLabel).toContain("build-1");
  });

  it("shows upgrade entries", () => {
    let state = buildState({ wood: 0 });
    state = {
      ...state,
      assets: {
        ...state.assets,
        "hub-up": { id: "hub-up", type: "service_hub", x: 14, y: 14, size: 2 },
      },
      serviceHubs: {
        ...state.serviceHubs,
        "hub-up": {
          inventory: { wood: 0, stone: 0, iron: 0, copper: 0 },
          targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
          tier: 1,
          droneIds: [],
          pendingUpgrade: { wood: 20 },
        },
      },
      constructionSites: {
        ...state.constructionSites,
        "hub-up": {
          buildingType: "service_hub",
          remaining: { wood: 4 },
        },
      },
    };

    const snapshot = buildProductionTransparency(state);
    const row = snapshot.jobs.find((entry) => entry.type === "upgrade");

    expect(row).toBeDefined();
    expect(row?.targetLabel).toContain("hub-up");
  });

  it("shows keep-in-stock target rows", () => {
    let state = buildState({ wood: 20, wood_pickaxe: 0 });
    state = gameReducer(state, {
      type: "SET_KEEP_STOCK_TARGET",
      workbenchId: WB,
      recipeId: "wood_pickaxe",
      amount: 2,
      enabled: true,
    });

    const snapshot = buildProductionTransparency(state);
    const row = snapshot.keepStock.find((entry) => entry.recipeId === "wood_pickaxe");

    expect(row).toBeDefined();
    expect(row?.targetAmount).toBe(2);
  });

  it("shows a waiting reason for queued jobs", () => {
    let state = buildState({ wood: 0 });
    state = gameReducer(state, {
      type: "JOB_ENQUEUE",
      recipeId: "wood_pickaxe",
      workbenchId: WB,
      source: "player",
      priority: "high",
    });

    const snapshot = buildProductionTransparency(state);
    const row = snapshot.jobs.find((entry) => entry.type === "player-craft" && entry.status === "queued");

    expect(row).toBeDefined();
    expect(row?.reason).toContain("wartet");
  });

  it("shows keep-in-stock skip reason when higher-priority jobs are open", () => {
    let state = buildState({ wood: 20, wood_pickaxe: 0 });
    state = gameReducer(state, {
      type: "JOB_ENQUEUE",
      recipeId: "wood_pickaxe",
      workbenchId: WB,
      source: "player",
      priority: "high",
    });
    state = gameReducer(state, {
      type: "SET_KEEP_STOCK_TARGET",
      workbenchId: WB,
      recipeId: "wood_pickaxe",
      amount: 2,
      enabled: true,
    });

    const snapshot = buildProductionTransparency(state);
    const row = snapshot.keepStock.find((entry) => entry.recipeId === "wood_pickaxe");

    expect(row).toBeDefined();
    expect(row?.decision).toBe("skip");
    expect(row?.decisionReason).toContain("hoeher priorisierte Jobs offen");
  });

  it("shows keep-in-stock policy skip reason", () => {
    let state = buildState({ wood: 20, wood_pickaxe: 0 });
    state = gameReducer(state, {
      type: "SET_KEEP_STOCK_TARGET",
      workbenchId: WB,
      recipeId: "wood_pickaxe",
      amount: 2,
      enabled: true,
    });
    state = gameReducer(state, {
      type: "SET_RECIPE_AUTOMATION_POLICY",
      recipeId: "wood_pickaxe",
      patch: { keepInStockAllowed: false },
    });

    const snapshot = buildProductionTransparency(state);
    const row = snapshot.keepStock.find((entry) => entry.recipeId === "wood_pickaxe");

    expect(row).toBeDefined();
    expect(row?.decision).toBe("skip");
    expect(row?.decisionReason).toContain("keep-in-stock disabled");
  });
});
