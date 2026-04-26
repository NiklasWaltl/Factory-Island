import type { GameState, Inventory, ServiceHubEntry } from "../types";
import {
  addResources,
  createInitialState,
  hasResources,
  selectBuildMenuInventoryView,
} from "../reducer";

function emptyInv(): Inventory {
  const inv = createInitialState("release").inventory;
  for (const key of Object.keys(inv) as (keyof Inventory)[]) {
    (inv as unknown as Record<string, number>)[key] = 0;
  }
  return inv;
}

function bareState(): GameState {
  const state = createInitialState("release");
  return {
    ...state,
    inventory: emptyInv(),
    warehouseInventories: {},
    serviceHubs: {},
    collectionNodes: {},
  };
}

function withWarehouse(state: GameState, id: string, inv: Partial<Inventory>): GameState {
  return {
    ...state,
    warehouseInventories: {
      ...state.warehouseInventories,
      [id]: addResources(emptyInv(), inv),
    },
  };
}

function withHub(
  state: GameState,
  id: string,
  inv: Partial<Record<"wood" | "stone" | "iron" | "copper", number>>,
): GameState {
  const hub: ServiceHubEntry = {
    inventory: { wood: 0, stone: 0, iron: 0, copper: 0, ...inv },
    targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
    tier: 1,
    droneIds: [],
  };
  return { ...state, serviceHubs: { ...state.serviceHubs, [id]: hub } };
}

function withDrop(
  state: GameState,
  id: string,
  itemType: "wood" | "stone" | "iron" | "copper",
  amount: number,
): GameState {
  return {
    ...state,
    collectionNodes: {
      ...state.collectionNodes,
      [id]: {
        id,
        itemType,
        amount,
        tileX: 0,
        tileY: 0,
        collectable: true,
        createdAt: 0,
        reservedByDroneId: null,
      },
    },
  };
}

describe("selectBuildMenuInventoryView", () => {
  it("does not count warehouse stock toward build-menu affordability", () => {
    const state = withWarehouse(bareState(), "wh-1", { wood: 10 });
    const view = selectBuildMenuInventoryView(state);

    expect(view.wood).toBe(0);
    expect(hasResources(view, { wood: 5 })).toBe(false);
  });

  it("counts service hub inventory toward build-menu affordability", () => {
    const state = withHub(bareState(), "hub-1", { wood: 5, stone: 2 });
    const view = selectBuildMenuInventoryView(state);

    expect(view.wood).toBe(5);
    expect(view.stone).toBe(2);
    expect(hasResources(view, { wood: 5 })).toBe(true);
  });

  it("counts collection-node drops toward build-menu affordability", () => {
    const state = withDrop(bareState(), "drop-1", "wood", 5);
    const view = selectBuildMenuInventoryView(state);

    expect(view.wood).toBe(5);
    expect(hasResources(view, { wood: 5 })).toBe(true);
  });

  it("ignores global inventory and warehouses when only those sources have stock", () => {
    const state = withWarehouse(
      {
        ...bareState(),
        inventory: addResources(emptyInv(), { wood: 7 }),
      },
      "wh-1",
      { wood: 9 },
    );
    const view = selectBuildMenuInventoryView(state);

    expect(view.wood).toBe(0);
    expect(hasResources(view, { wood: 5 })).toBe(false);
  });
});