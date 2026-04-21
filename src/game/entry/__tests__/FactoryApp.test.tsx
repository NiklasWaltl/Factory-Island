import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CRAFTING_TICK_MS } from "../../store/reducer";
import FactoryGame from "../FactoryApp";

jest.mock("../../store/reducer", () => {
  const actual = jest.requireActual("../../store/reducer");

  function buildQueuedWorkbenchState() {
    const base = actual.createInitialState("release");

    return {
      ...base,
      assets: {
        ...base.assets,
        "wb-1": { id: "wb-1", type: "workbench", x: 0, y: 0, size: 1 },
        "wh-1": { id: "wh-1", type: "warehouse", x: 3, y: 3, size: 2 },
      },
      warehouseInventories: {
        "wh-1": { ...base.inventory, wood: 5 },
      },
      buildingSourceWarehouseIds: {
        "wb-1": "wh-1",
      },
      crafting: {
        ...base.crafting,
        jobs: [
          {
            id: "job-1",
            recipeId: "wood_pickaxe",
            workbenchId: "wb-1",
            inventorySource: { kind: "warehouse", warehouseId: "wh-1" },
            status: "queued",
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
  }

  return {
    ...actual,
    createInitialState: jest.fn((mode) => (
      mode === "release" ? buildQueuedWorkbenchState() : actual.createInitialState(mode)
    )),
  };
});

jest.mock("../../grid/Grid", () => ({
  Grid: () => null,
}));

jest.mock("../../ui/hud/Hotbar", () => ({
  Hotbar: () => null,
}));

jest.mock("../../ui/hud/Notifications", () => ({
  Notifications: () => null,
}));

jest.mock("../../ui/hud/AutoDeliveryFeed", () => ({
  AutoDeliveryFeed: () => null,
}));

jest.mock("../../ui/hud/ResourceBar", () => ({
  ResourceBar: ({ state }: { state: { crafting: { jobs: Array<{ status: string }> } } }) => (
    <div data-testid="job-status">{state.crafting.jobs[0]?.status ?? "none"}</div>
  ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("FactoryGame crafting scheduler", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });

  it("advances queued workbench jobs once the runtime loop is active", () => {
    act(() => {
      root.render(<FactoryGame />);
    });

    const releaseButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Release"),
    );

    expect(releaseButton).not.toBeUndefined();

    act(() => {
      releaseButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("queued");

    act(() => {
      jest.advanceTimersByTime(CRAFTING_TICK_MS);
    });

    expect(container.textContent).not.toContain("queued");
  });
});