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

  return {
    ...base,
    assets: {
      ...base.assets,
      "wb-1": workbench,
    },
    cellMap: {
      ...base.cellMap,
      [cellKey(0, 0)]: "wb-1",
      [cellKey(1, 0)]: "wb-1",
      [cellKey(0, 1)]: "wb-1",
      [cellKey(1, 1)]: "wb-1",
    },
    selectedCraftingBuildingId: "wb-1",
    placedBuildings: ["workbench"],
    inventory: { ...base.inventory, wood: 5 },
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
  });

  it("disables craft button when ingredients are missing", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const base = buildState();
    const state: GameState = { ...base, inventory: { ...base.inventory, wood: 0 } };

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

  it("shows global player gear availability as global buffer, not warehouse", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const base = buildState();
    const state: GameState = {
      ...base,
      inventory: { ...base.inventory, wood_pickaxe: 1 },
    };

    act(() => {
      root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
    });

    expect(container.textContent).toContain("im globalen Puffer verfügbar");
    expect(container.textContent).not.toContain("im Lagerhaus (Player Gear) verfügbar");
  });

  it("does not show terminal done jobs in the active queue", () => {
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

    expect(container.textContent).toContain("Keine Jobs für diese Werkbank.");
    expect(container.textContent).not.toContain("job-1");
    expect(container.textContent).not.toContain("done");
  });
});