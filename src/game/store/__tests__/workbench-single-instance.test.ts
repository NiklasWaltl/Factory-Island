// ============================================================
// Tests – Workbench is a single manual tool station (max 1)
// ============================================================
//
// Product rule:
//   - The player may own at most one workbench.
//   - The workbench is a manual tool-crafting station only.
//   - Tools land in the connected warehouse and are taken to the
//     hotbar manually. There is no AutoPanel and no auto-startpoint
//     attached to placement.

import {
  gameReducer,
  createInitialState,
  addResources,
  cellKey,
  type GameState,
  type PlacedAsset,
} from "../reducer";

function emptyInv() {
  return createInitialState("release").inventory;
}

/** Minimal reducer state with one warehouse and abundant build inventory. */
function buildBaselineState(): GameState {
  const base = createInitialState("release");
  const wh: PlacedAsset = {
    id: "wh-A",
    type: "warehouse",
    x: 4,
    y: 4,
    size: 2,
    direction: "south",
  };
  return {
    ...base,
    assets: { "wh-A": wh },
    cellMap: {
      [cellKey(4, 4)]: "wh-A",
      [cellKey(5, 4)]: "wh-A",
      [cellKey(4, 5)]: "wh-A",
      [cellKey(5, 5)]: "wh-A",
    },
    warehousesPlaced: 1,
    warehousesPurchased: 1,
    warehouseInventories: { "wh-A": emptyInv() },
    placedBuildings: [],
    purchasedBuildings: [],
    inventory: addResources(emptyInv(), {
      wood: 200,
      stone: 200,
      iron: 200,
      copper: 200,
      ironIngot: 200,
      copperIngot: 200,
    }),
    buildingSourceWarehouseIds: {},
  };
}

function placeWorkbench(state: GameState, x: number, y: number): GameState {
  return gameReducer(
    { ...state, selectedBuildingType: "workbench", buildMode: true },
    { type: "BUILD_PLACE_BUILDING", x, y },
  );
}

describe("Workbench is a single manual tool station", () => {
  it("places exactly one workbench when none exists", () => {
    const start = buildBaselineState();
    const after = placeWorkbench(start, 0, 0);
    const workbenches = Object.values(after.assets).filter(
      (a) => a.type === "workbench",
    );
    expect(workbenches).toHaveLength(1);
  });

  it("blocks a second workbench placement and surfaces an error notification", () => {
    const start = buildBaselineState();
    const afterFirst = placeWorkbench(start, 0, 0);
    expect(
      Object.values(afterFirst.assets).filter((a) => a.type === "workbench"),
    ).toHaveLength(1);

    const afterSecond = placeWorkbench(afterFirst, 8, 0);
    const workbenches = Object.values(afterSecond.assets).filter(
      (a) => a.type === "workbench",
    );
    expect(workbenches).toHaveLength(1);

    const lastNotification = afterSecond.notifications.at(-1);
    expect(lastNotification?.kind).toBe("error");
    expect(lastNotification?.displayName ?? "").toMatch(/nur eine Werkbank/i);
  });

  it("does not consume resources when the second placement is blocked", () => {
    const start = buildBaselineState();
    const afterFirst = placeWorkbench(start, 0, 0);
    const inventoryBefore = { ...afterFirst.inventory };

    const afterSecond = placeWorkbench(afterFirst, 8, 0);
    expect(afterSecond.inventory).toEqual(inventoryBefore);
  });

  it("placing a workbench does not enqueue any crafting jobs (no auto-startpoint)", () => {
    const start = buildBaselineState();
    const after = placeWorkbench(start, 0, 0);
    expect(after.crafting.jobs).toHaveLength(0);
  });

  it("placing a workbench does not create keep-stock targets", () => {
    const start = buildBaselineState();
    const after = placeWorkbench(start, 0, 0);
    expect(after.keepStockByWorkbench ?? {}).toEqual({});
  });
});
