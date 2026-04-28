import { applyKeepStockRefills } from "../keepStockWorkflow";
import type { KeepStockWorkflowDeps } from "../keepStockWorkflow";
import type { GameState } from "../../../store/types";

function makeBaseState(overrides: Partial<GameState> = {}): GameState {
  const base = {
    inventory: {} as Record<string, number>,
    assets: {},
    network: { reservations: {}, sequence: 0, lastUpdated: 0, capabilities: {} },
    warehouseInventories: {},
    serviceHubs: {},
    crafting: { jobs: [], nextJobSeq: 1, lastError: null },
    constructionSites: {},
    notifications: { items: [], nextId: 1 },
    keepStockByWorkbench: {},
    recipeAutomationPolicies: {},
  } as unknown as GameState;
  return { ...base, ...overrides };
}

const makeDeps = (): KeepStockWorkflowDeps => ({
  KEEP_STOCK_OPEN_JOB_CAP: 2,
  KEEP_STOCK_MAX_TARGET: 999,
  resolveBuildingSource: () => ({ kind: "global" }),
  toCraftingJobInventorySource: () => ({ kind: "global" }),
  getCraftingSourceInventory: () => ({}) as never,
  isUnderConstruction: () => false,
});

describe("crafting/workflows/keepStockWorkflow", () => {
  it("returns same state instance when no keep-stock targets configured", () => {
    const state = makeBaseState();
    const result = applyKeepStockRefills(state, makeDeps());
    expect(result).toBe(state);
  });

  it("returns same state instance when keep-stock map is undefined", () => {
    const state = makeBaseState({ keepStockByWorkbench: undefined });
    const result = applyKeepStockRefills(state, makeDeps());
    expect(result).toBe(state);
  });

  it("skips disabled targets without invoking deps", () => {
    const state = makeBaseState({
      keepStockByWorkbench: {
        "wb-1": { plank: { enabled: false, amount: 5 } },
      },
    });
    const deps = makeDeps();
    const resolveSpy = jest.fn(deps.resolveBuildingSource);
    const result = applyKeepStockRefills(state, { ...deps, resolveBuildingSource: resolveSpy });
    expect(result).toBe(state);
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it("skips zero-amount targets without invoking deps", () => {
    const state = makeBaseState({
      keepStockByWorkbench: {
        "wb-1": { plank: { enabled: true, amount: 0 } },
      },
    });
    const deps = makeDeps();
    const resolveSpy = jest.fn(deps.resolveBuildingSource);
    const result = applyKeepStockRefills(state, { ...deps, resolveBuildingSource: resolveSpy });
    expect(result).toBe(state);
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it("skips targets when workbench asset is missing", () => {
    const state = makeBaseState({
      keepStockByWorkbench: {
        "wb-missing": { plank: { enabled: true, amount: 5 } },
      },
    });
    const result = applyKeepStockRefills(state, makeDeps());
    expect(result).toBe(state);
  });
});
