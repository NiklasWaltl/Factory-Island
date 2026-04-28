import { applyExecutionTick, applyPlanningTriggers } from "../tickPhases";
import type { ExecutionTickDeps, PlanningTriggerDeps } from "../tickPhases";
import type { GameState } from "../../store/types";

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
    drones: {},
    keepStockByWorkbench: {},
    recipeAutomationPolicies: {},
  } as unknown as GameState;
  return { ...base, ...overrides };
}

const planningDeps: PlanningTriggerDeps = {
  KEEP_STOCK_OPEN_JOB_CAP: 2,
  KEEP_STOCK_MAX_TARGET: 999,
  resolveBuildingSource: () => ({ kind: "global" }),
  toCraftingJobInventorySource: () => ({ kind: "global" }),
  getCraftingSourceInventory: () => ({}) as never,
  isUnderConstruction: () => false,
};

const executionDeps: ExecutionTickDeps = {
  isUnderConstruction: () => false,
};

describe("crafting/tickPhases architecture boundary", () => {
  it("applyPlanningTriggers returns same instance when no targets configured", () => {
    const state = makeBaseState();
    expect(applyPlanningTriggers(state, planningDeps)).toBe(state);
  });

  it("applyExecutionTick returns same instance for an empty queue", () => {
    const state = makeBaseState();
    expect(applyExecutionTick(state, executionDeps)).toBe(state);
  });

  it("applyExecutionTick never adds new jobs (architecture rule: execution does not enqueue)", () => {
    // Seed a queue with arbitrary existing jobs in non-progressing states.
    const queuedJob = {
      id: "j1",
      status: "queued",
      source: "automation",
      output: { itemId: "x", count: 1 },
      ingredients: [],
      inventorySource: { kind: "global" },
      workbenchId: "wb-1",
      priority: "normal",
    };
    const state = makeBaseState({
      crafting: {
        jobs: [queuedJob],
        nextJobSeq: 2,
        lastError: null,
      } as never,
    });
    const next = applyExecutionTick(state, executionDeps);
    expect(next.crafting.jobs.length).toBeLessThanOrEqual(state.crafting.jobs.length);
    // Execution can only mutate / drop jobs, never add brand-new ones.
    const newIds = next.crafting.jobs
      .map((j) => j.id)
      .filter((id) => !state.crafting.jobs.some((existing) => existing.id === id));
    expect(newIds).toEqual([]);
  });
});
