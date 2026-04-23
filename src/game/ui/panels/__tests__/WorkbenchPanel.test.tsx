import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  cellKey,
  createInitialState,
  type GameAction,
  type GameState,
  type PlacedAsset,
} from "../../../store/reducer";
import { WORKBENCH_RECIPES, type WorkbenchRecipe } from "../../../simulation/recipes";
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

function withWorkbenchRecipes(recipes: WorkbenchRecipe[], run: () => void): void {
  const snapshot = [...WORKBENCH_RECIPES];
  WORKBENCH_RECIPES.splice(WORKBENCH_RECIPES.length, 0, ...recipes);
  try {
    run();
  } finally {
    WORKBENCH_RECIPES.splice(0, WORKBENCH_RECIPES.length, ...snapshot);
  }
}

function makeQueuedGearJob(recipeId: string) {
  return {
    id: `queued-${recipeId}`,
    recipeId,
    workbenchId: "wb-1",
    inventorySource: { kind: "warehouse", warehouseId: "wh-1" } as const,
    status: "queued" as const,
    priority: "high" as const,
    source: "player" as const,
    enqueuedAt: 1,
    startedAt: null,
    finishesAt: null,
    progress: 0,
    ingredients: [{ itemId: "wood" as const, count: 2 }],
    output: { itemId: "gear" as const, count: 1 },
    processingTime: 0,
    reservationOwnerId: `queued-${recipeId}`,
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

  function findButtonByText(label: string): HTMLButtonElement | null {
    const buttons = Array.from(container.querySelectorAll("button")) as HTMLButtonElement[];
    return buttons.find((b) => b.textContent?.trim() === label) ?? null;
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

  it("shows auto-craft preview and dispatches prerequisite request", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_ui_gear",
          label: "Auto UI Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_ui_axe",
          label: "Auto UI Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        const dispatch = jest.fn<void, [GameAction]>();
        const base = buildState();
        const state: GameState = {
          ...base,
          warehouseInventories: {
            ...base.warehouseInventories,
            "wh-1": { ...base.warehouseInventories["wh-1"], wood: 2, gear: 0, axe: 0 },
          },
        };

        act(() => {
          root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
        });

        const autoButton = findButtonByText("Auto-Craft Vorprodukte");
        expect(autoButton).not.toBeNull();
        expect(autoButton!.disabled).toBe(false);

        act(() => {
          autoButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.textContent).toContain("Planvorschau");
        const confirm = findButtonByText("Plan in Queue legen");
        expect(confirm).not.toBeNull();

        act(() => {
          confirm!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(dispatch).toHaveBeenCalledWith({
          type: "CRAFT_REQUEST_WITH_PREREQUISITES",
          recipeId: "auto_ui_axe",
          workbenchId: "wb-1",
          source: "player",
          priority: "high",
          amount: 1,
          // Sum of step counts from the preview (1x gear + 1x axe), forwarded
          // by R2's confirm flow so the reducer can detect divergence (G1).
          expectedStepCount: 2,
        });
      },
    );
  });

  it("Schritt 8 Fixes - R2: confirm double-click dispatches only once", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_ui_fix_r2_gear",
          label: "Auto UI Fix R2 Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_ui_fix_r2_axe",
          label: "Auto UI Fix R2 Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        jest.useFakeTimers();
        try {
          const dispatch = jest.fn<void, [GameAction]>();
          const base = buildState();
          const state: GameState = {
            ...base,
            warehouseInventories: {
              ...base.warehouseInventories,
              "wh-1": { ...base.warehouseInventories["wh-1"], wood: 2, gear: 0, axe: 0 },
            },
          };

          // Setup: preview available and confirm CTA visible.
          act(() => {
            root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
          });
          const autoButton = findButtonByText("Auto-Craft Vorprodukte");
          expect(autoButton).not.toBeNull();

          act(() => {
            autoButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          });
          expect(container.textContent).toContain("Plan wird gegen aktuellen Lagerstand neu berechnet.");

          const confirm = findButtonByText("Plan in Queue legen");
          expect(confirm).not.toBeNull();

          // Action: two immediate clicks on the same confirm CTA.
          act(() => {
            confirm!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            confirm!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          });

          // Assertion: second click has no effect.
          expect(dispatch).toHaveBeenCalledTimes(1);
          expect(dispatch).toHaveBeenCalledWith({
            type: "CRAFT_REQUEST_WITH_PREREQUISITES",
            recipeId: "auto_ui_fix_r2_axe",
            workbenchId: "wb-1",
            source: "player",
            priority: "high",
            amount: 1,
            expectedStepCount: 2,
          });

          act(() => {
            jest.runOnlyPendingTimers();
          });
        } finally {
          jest.useRealTimers();
        }
      },
    );
  });

  it("Schritt 8 Fixes - R1+R2: queued sibling output ignored in preview and confirm still single-dispatch", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_ui_fix_combo_gear",
          label: "Auto UI Fix Combo Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_ui_fix_combo_axe",
          label: "Auto UI Fix Combo Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        jest.useFakeTimers();
        try {
          const dispatch = jest.fn<void, [GameAction]>();
          const base = buildState();
          const state: GameState = {
            ...base,
            warehouseInventories: {
              ...base.warehouseInventories,
              "wh-1": { ...base.warehouseInventories["wh-1"], wood: 4, gear: 0, axe: 0 },
            },
            crafting: {
              ...base.crafting,
              jobs: [makeQueuedGearJob("auto_ui_fix_combo_gear")],
            },
          };

          // Setup: one queued gear job exists (must be ignored for preview crediting).
          act(() => {
            root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
          });

          const autoButton = findButtonByText("Auto-Craft Vorprodukte");
          expect(autoButton).not.toBeNull();
          act(() => {
            autoButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          });

          // Assertion (R1): preview still includes prerequisite gear.
          expect(container.textContent).toContain("Planvorschau");
          expect(container.textContent).toContain("1x Auto UI Fix Combo Gear");
          expect(container.textContent).toContain("1x Auto UI Fix Combo Axe");

          const confirm = findButtonByText("Plan in Queue legen");
          expect(confirm).not.toBeNull();

          // Action (R2): double-click confirm.
          act(() => {
            confirm!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            confirm!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          });

          // Assertion: one dispatch only, with expectedStepCount from preview.
          expect(dispatch).toHaveBeenCalledTimes(1);
          expect(dispatch).toHaveBeenCalledWith({
            type: "CRAFT_REQUEST_WITH_PREREQUISITES",
            recipeId: "auto_ui_fix_combo_axe",
            workbenchId: "wb-1",
            source: "player",
            priority: "high",
            amount: 1,
            expectedStepCount: 2,
          });

          act(() => {
            jest.runOnlyPendingTimers();
          });
        } finally {
          jest.useRealTimers();
        }
      },
    );
  });

  it("enables craft button when warehouse is empty but fallback hub has enough stock", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const base = buildState();
    const hubId = base.starterDrone.hubId;
    expect(hubId).toBeTruthy();
    if (!hubId) return;

    const state: GameState = {
      ...base,
      warehouseInventories: {
        ...base.warehouseInventories,
        "wh-1": { ...base.warehouseInventories["wh-1"], wood: 0 },
      },
      serviceHubs: {
        ...base.serviceHubs,
        [hubId]: {
          ...base.serviceHubs[hubId],
          inventory: {
            ...base.serviceHubs[hubId].inventory,
            wood: 5,
          },
        },
      },
    };

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

  it("dispatches keep-in-stock toggle for the active recipe", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const state = buildState();

    act(() => {
      root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
    });

    const keepStockLabel = Array.from(container.querySelectorAll("label")).find(
      (label) => label.textContent?.includes("Zielbestand"),
    );
    const checkbox = keepStockLabel?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();

    act(() => {
      checkbox!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_KEEP_STOCK_TARGET",
      workbenchId: "wb-1",
      recipeId: "wood_pickaxe",
      amount: 1,
      enabled: true,
    });
  });

  it("renders keep-in-stock progress when target is enabled", () => {
    const dispatch = jest.fn<void, [GameAction]>();
    const base = buildState();
    const state: GameState = {
      ...base,
      keepStockByWorkbench: {
        "wb-1": {
          wood_pickaxe: { enabled: true, amount: 2 },
        },
      },
      crafting: {
        ...base.crafting,
        jobs: [
          {
            id: "keep-stock-pending",
            recipeId: "wood_pickaxe",
            workbenchId: "wb-1",
            inventorySource: { kind: "warehouse", warehouseId: "wh-1" },
            status: "queued",
            priority: "normal",
            source: "automation",
            enqueuedAt: 1,
            startedAt: null,
            finishesAt: null,
            progress: 0,
            ingredients: [{ itemId: "wood", count: 5 }],
            output: { itemId: "wood_pickaxe", count: 1 },
            processingTime: 0,
            reservationOwnerId: "keep-stock-pending",
          },
        ],
      },
    };

    act(() => {
      root.render(<WorkbenchPanel state={state} dispatch={dispatch} />);
    });

    expect(container.textContent).toContain("Auffüllen aktiv");
  });
});