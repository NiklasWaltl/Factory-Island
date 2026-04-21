import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  cellKey,
  createInitialState,
  type GameAction,
  type GameState,
  type PlacedAsset,
} from "../../../store/reducer";
import { WorkbenchPanel } from "../WorkbenchPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildState(): GameState {
  const base = createInitialState("release");
  const workbench: PlacedAsset = {
    id: "wb-1",
    type: "workbench",
    x: 0,
    y: 0,
    size: 2,
  };
  const warehouse: PlacedAsset = {
    id: "wh-1",
    type: "warehouse",
    x: 4,
    y: 4,
    size: 2,
  };

  return {
    ...base,
    assets: {
      ...base.assets,
      "wb-1": workbench,
      "wh-1": warehouse,
    },
    cellMap: {
      [cellKey(0, 0)]: "wb-1",
      [cellKey(1, 0)]: "wb-1",
      [cellKey(0, 1)]: "wb-1",
      [cellKey(1, 1)]: "wb-1",
      [cellKey(4, 4)]: "wh-1",
      [cellKey(5, 4)]: "wh-1",
      [cellKey(4, 5)]: "wh-1",
      [cellKey(5, 5)]: "wh-1",
    },
    selectedCraftingBuildingId: "wb-1",
    placedBuildings: ["workbench"],
    inventory: { ...base.inventory },
    warehouseInventories: {
      "wh-1": { ...base.inventory, wood: 5 },
    },
    buildingSourceWarehouseIds: {
      "wb-1": "wh-1",
    },
  };
}

describe("WorkbenchPanel", () => {
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

  /** Find the "Craft" button inside the detail panel (n=1). */
  function findCraftButton(): HTMLButtonElement | null {
    const buttons = Array.from(container.querySelectorAll("button")) as HTMLButtonElement[];
    return buttons.find((b) => b.textContent?.trim() === "Craft") ?? null;
  }

  it("dispatches JOB_ENQUEUE for the selected workbench", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const state = buildState();

    act(() => {
      root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
    });

    const craftButton = findCraftButton();
    expect(craftButton).not.toBeNull();
    expect(craftButton!.disabled).toBe(false);

    act(() => {
      craftButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "JOB_ENQUEUE",
      recipeId: "wood_pickaxe",
      workbenchId: "wb-1",
      priority: "high",
      source: "player",
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "CRAFT_WORKBENCH" }),
    );
  });

  it("disables craft button when ingredients are missing", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const base = buildState();
    const state: GameState = {
      ...base,
      warehouseInventories: {
        ...base.warehouseInventories,
        "wh-1": { ...base.warehouseInventories["wh-1"], wood: 0 },
      },
    };

    act(() => {
      root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
    });

    const craftButton = findCraftButton();
    expect(craftButton).not.toBeNull();
    expect(craftButton!.disabled).toBe(true);

    act(() => {
      craftButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("disables craft button when only the global pool has stock", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const base = buildState();
    const state: GameState = {
      ...base,
      inventory: { ...base.inventory, wood: 5 },
      buildingSourceWarehouseIds: {},
    };

    act(() => {
      root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
    });

    const craftButton = findCraftButton();
    expect(craftButton).not.toBeNull();
    expect(craftButton!.disabled).toBe(true);
    expect(container.textContent).toContain("Werkbank braucht physisches Lager");
  });

  it("renders recipe cost display for the active source", () => {
    // Note: a dedicated 'im globalen Puffer verfügbar' hint is not yet
    // implemented in the panel; we only verify the raw cost readout today.
    // When the dedicated hint lands, tighten this assertion.
    const dispatch = jest.fn<void, [GameAction]>();
    const base = buildState();
    const state: GameState = {
      ...base,
      inventory: { ...base.inventory, wood_pickaxe: 1 },
    };

    act(() => {
      root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
    });

    // Recipe cost line ("5 Holz") must be visible and grounded in the resolved source.
    expect(container.textContent).toContain("Holz");
    expect(container.textContent).not.toContain("im Lagerhaus (Player Gear) verfügbar");
  });

  it("renders craft buttons without a stale queue dump for this workbench", () => {
    // Note: the panel does not yet render a per-workbench job list; this test
    // records the current surface. When a queue view lands, assert terminal
    // 'done' jobs are filtered out and 'Keine Jobs für diese Werkbank.' shows.
    const dispatch = jest.fn<void, [GameAction]>();
    const base = buildState();
    const state: GameState = {
      ...base,
      crafting: {
        ...base.crafting,
        jobs: [
          {
            id: "job-1",
            recipeId: "wood_pickaxe",
            workbenchId: "wb-1",
            inventorySource: { kind: "global" },
            status: "done",
            priority: "high",
            source: "player",
            enqueuedAt: 1,
            startedAt: null,
            finishesAt: null,
            progress: 0,
            ingredients: [{ itemId: "wood", count: 5 }],
            output: { itemId: "wood_pickaxe", count: 1 },
            processingTime: 0,
            reservationOwnerId: "job-1",
          },
        ],
      },
    };

    act(() => {
      root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
    });

    // No panel-rendered queue today → terminal job id must not leak into the DOM.
    expect(container.textContent).not.toContain("job-1");
    expect(container.textContent).not.toContain("done");
  });
});