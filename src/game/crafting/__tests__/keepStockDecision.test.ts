import {
  evaluateKeepStockTarget,
  type KeepStockEvaluationDeps,
  type KeepStockTargetConfig,
} from "../policies/keepStockDecision";
import type { CraftingJob } from "../types";
import type { GameState } from "../../store/types";

function makeBaseState(overrides: Partial<GameState> = {}): GameState {
  const base = {
    inventory: {} as Record<string, number>,
    assets: {
      "wb-1": { id: "wb-1", type: "workbench", x: 0, y: 0 },
    } as unknown as GameState["assets"],
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

function makeDeps(
  overrides: Partial<KeepStockEvaluationDeps> = {},
): KeepStockEvaluationDeps {
  return {
    KEEP_STOCK_OPEN_JOB_CAP: 2,
    KEEP_STOCK_MAX_TARGET: 999,
    resolveBuildingSource: () => ({ kind: "warehouse", warehouseId: "wh-1" }),
    toCraftingJobInventorySource: (_s, src) =>
      src.kind === "warehouse"
        ? { kind: "warehouse", warehouseId: src.warehouseId }
        : { kind: "global" },
    getCraftingSourceInventory: () => ({}) as never,
    isUnderConstruction: () => false,
    ...overrides,
  };
}

const RECIPE_ID = "wood_pickaxe";
const OUTPUT_ITEM = "wood_pickaxe";

function configFor(
  amount: number,
  enabled = true,
): KeepStockTargetConfig {
  return {
    workbenchId: "wb-1",
    recipeId: RECIPE_ID,
    target: { enabled, amount },
  };
}

describe("crafting/keepStockDecision.evaluateKeepStockTarget", () => {
  it("skips with code=disabled when target.enabled is false", () => {
    const state = makeBaseState();
    const result = evaluateKeepStockTarget(state, configFor(5, false), makeDeps());
    expect(result.kind).toBe("skip");
    if (result.kind === "skip") expect(result.code).toBe("disabled");
  });

  it("skips with code=disabled when amount is zero", () => {
    const state = makeBaseState();
    const result = evaluateKeepStockTarget(state, configFor(0, true), makeDeps());
    expect(result.kind).toBe("skip");
    if (result.kind === "skip") expect(result.code).toBe("disabled");
  });

  it("skips with code=policyBlocked when manualOnly policy applies", () => {
    const state = makeBaseState({
      recipeAutomationPolicies: { [RECIPE_ID]: { manualOnly: true } },
    });
    const result = evaluateKeepStockTarget(state, configFor(5), makeDeps());
    expect(result.kind).toBe("skip");
    if (result.kind === "skip") {
      expect(result.code).toBe("policyBlocked");
      expect(result.rawReason).toBe("manual only");
    }
  });

  it("skips with code=higherPriorityBlockers when an open player job exists", () => {
    const playerJob = {
      id: "j1",
      status: "queued",
      source: "player",
      output: { itemId: OUTPUT_ITEM, count: 1 },
      ingredients: [],
      inventorySource: { kind: "global" },
    } as unknown as CraftingJob;
    const state = makeBaseState({
      crafting: { jobs: [playerJob], nextJobSeq: 2, lastError: null } as never,
    });
    const result = evaluateKeepStockTarget(state, configFor(5), makeDeps());
    expect(result.kind).toBe("skip");
    if (result.kind === "skip") expect(result.code).toBe("higherPriorityBlockers");
  });

  it("skips with code=workbenchMissing when workbench asset is gone", () => {
    const state = makeBaseState({ assets: {} as never });
    const result = evaluateKeepStockTarget(state, configFor(5), makeDeps());
    expect(result.kind).toBe("skip");
    if (result.kind === "skip") expect(result.code).toBe("workbenchMissing");
  });

  it("skips with code=underConstruction when isUnderConstruction returns true", () => {
    const state = makeBaseState();
    const result = evaluateKeepStockTarget(
      state,
      configFor(5),
      makeDeps({ isUnderConstruction: () => true }),
    );
    expect(result.kind).toBe("skip");
    if (result.kind === "skip") expect(result.code).toBe("underConstruction");
  });

  it("skips with code=capReached when open automation jobs >= cap", () => {
    const automationJob = (id: string) =>
      ({
        id,
        status: "crafting",
        source: "automation",
        output: { itemId: "other", count: 1 },
        ingredients: [],
        inventorySource: { kind: "global" },
      }) as unknown as CraftingJob;
    const state = makeBaseState({
      crafting: {
        jobs: [automationJob("j1"), automationJob("j2")],
        nextJobSeq: 3,
        lastError: null,
      } as never,
    });
    const result = evaluateKeepStockTarget(state, configFor(5), makeDeps());
    expect(result.kind).toBe("skip");
    if (result.kind === "skip") expect(result.code).toBe("capReached");
  });

  it("skips with code=recipeMissing when recipe id is unknown", () => {
    const state = makeBaseState();
    const cfg: KeepStockTargetConfig = {
      workbenchId: "wb-1",
      recipeId: "no_such_recipe",
      target: { enabled: true, amount: 5 },
    };
    const result = evaluateKeepStockTarget(state, cfg, makeDeps());
    expect(result.kind).toBe("skip");
    if (result.kind === "skip") expect(result.code).toBe("recipeMissing");
  });

  it("skips with code=noPhysicalSource when source resolves to global", () => {
    const state = makeBaseState();
    const result = evaluateKeepStockTarget(
      state,
      configFor(5),
      makeDeps({ resolveBuildingSource: () => ({ kind: "global" }) }),
    );
    expect(result.kind).toBe("skip");
    if (result.kind === "skip") expect(result.code).toBe("noPhysicalSource");
  });

  it("returns satisfied when projected stock >= target", () => {
    const state = makeBaseState();
    const result = evaluateKeepStockTarget(
      state,
      configFor(2),
      makeDeps({
        getCraftingSourceInventory: () => ({ [OUTPUT_ITEM]: 5 }) as never,
      }),
    );
    expect(result.kind).toBe("satisfied");
  });

  it("returns enqueue with craftsNeeded when stock is below target", () => {
    const state = makeBaseState();
    const result = evaluateKeepStockTarget(
      state,
      configFor(5),
      makeDeps({ getCraftingSourceInventory: () => ({}) as never }),
    );
    expect(result.kind).toBe("enqueue");
    if (result.kind === "enqueue") {
      expect(result.craftsNeeded).toBe(5);
      expect(result.ctx.recipe.outputItem).toBe(OUTPUT_ITEM);
    }
  });

  it("clamps target amount via KEEP_STOCK_MAX_TARGET", () => {
    const state = makeBaseState();
    const result = evaluateKeepStockTarget(
      state,
      configFor(10_000),
      makeDeps({ KEEP_STOCK_MAX_TARGET: 50 }),
    );
    expect(result.kind === "skip" ? result.targetAmount : result.ctx.targetAmount).toBe(50);
  });
});
