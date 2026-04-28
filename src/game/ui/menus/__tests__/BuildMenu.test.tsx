import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  addResources,
  BUILDING_COSTS,
  createInitialState,
  hasResources,
  selectBuildMenuInventoryView,
  type GameAction,
  type GameState,
  type Inventory,
  type ServiceHubEntry,
} from "../../../store/reducer";
import { BuildMenu } from "../BuildMenu";

jest.mock("../../../assets/sprites/sprites", () => {
  const assetProxy = new Proxy(
    {},
    {
      get: (_target, prop) => String(prop),
    },
  );

  return {
    ASSET_SPRITES: assetProxy,
    FLOOR_SPRITES: assetProxy,
    GRASS_TILE_SPRITES: ["grass-tile"],
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    selectedBuildingType: null,
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

describe("BuildMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function findBuildItem(name: string): HTMLDivElement {
    const item = Array.from(container.querySelectorAll(".fi-build-item")).find((element) =>
      element.textContent?.includes(name),
    );
    if (!(item instanceof HTMLDivElement)) {
      throw new Error(`Could not find build item for ${name}`);
    }
    return item;
  }

  it("keeps buildings disabled when only a warehouse covers the cost", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const state = withWarehouse(bareState(), "wh-1", { wood: 10 });

    act(() => {
      root.render(<BuildMenu state={state} dispatch={dispatch} />);
    });

    const workbenchItem = findBuildItem("Werkbank");
    expect(workbenchItem.className).toContain("fi-build-item--disabled");
    expect(workbenchItem.textContent).toContain("Nicht genug Ressourcen");
    expect(workbenchItem.querySelector(".fi-build-cost--lacking")).not.toBeNull();

    act(() => {
      workbenchItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("enables building selection when the service hub covers the cost", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const state = withHub(bareState(), "hub-1", { wood: 5 });

    act(() => {
      root.render(<BuildMenu state={state} dispatch={dispatch} />);
    });

    const workbenchItem = findBuildItem("Werkbank");
    expect(workbenchItem.className).not.toContain("fi-build-item--disabled");
    expect(workbenchItem.textContent).toContain("Kann platziert werden");

    act(() => {
      workbenchItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "SELECT_BUILD_BUILDING",
      buildingType: "workbench",
    });
  });

  it("counts resource drops as a valid build-menu source", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const state = withDrop(bareState(), "drop-1", "wood", 5);

    act(() => {
      root.render(<BuildMenu state={state} dispatch={dispatch} />);
    });

    const workbenchItem = findBuildItem("Werkbank");
    expect(workbenchItem.className).not.toContain("fi-build-item--disabled");

    act(() => {
      workbenchItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "SELECT_BUILD_BUILDING",
      buildingType: "workbench",
    });
  });

  it("ignores global inventory even when the warehouse and player pool look full", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const state = withWarehouse(
      {
        ...bareState(),
        inventory: addResources(emptyInv(), { wood: 5 }),
      },
      "wh-1",
      { wood: 5 },
    );

    act(() => {
      root.render(<BuildMenu state={state} dispatch={dispatch} />);
    });

    const workbenchItem = findBuildItem("Werkbank");
    expect(workbenchItem.className).toContain("fi-build-item--disabled");
    expect(workbenchItem.title).toContain("Lagerhaus/global werden ignoriert");

    act(() => {
      workbenchItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps disabled-state and click affordance aligned with the build-menu source helper", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const state = withDrop(withHub(bareState(), "hub-1", { wood: 2 }), "drop-1", "wood", 3);
    const expectedAffordable = hasResources(
      selectBuildMenuInventoryView(state),
      BUILDING_COSTS.workbench as Partial<Record<keyof Inventory, number>>,
    );

    act(() => {
      root.render(<BuildMenu state={state} dispatch={dispatch} />);
    });

    const workbenchItem = findBuildItem("Werkbank");
    expect(workbenchItem.classList.contains("fi-build-item--disabled")).toBe(!expectedAffordable);

    act(() => {
      workbenchItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dispatch).toHaveBeenCalledTimes(expectedAffordable ? 1 : 0);
  });
});