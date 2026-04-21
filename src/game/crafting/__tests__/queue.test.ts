// ============================================================
// Crafting Queue helpers — tests (Step 3)
// ============================================================

import {
  cancelJob,
  enqueueJob,
  getActiveCraftingJob,
  getJobsForWorkbench,
  isWorkbenchBusy,
  recipeIngredientsToStacks,
  sortByPriorityFifo,
  assertTransition,
  createEmptyCraftingQueue,
} from "../queue";
import type { CraftingJob } from "../types";
import type { PlacedAsset } from "../../store/reducer";
import { WORKBENCH_RECIPES } from "../../simulation/recipes";

const WB_ID = "wb-1";

function workbench(id: string = WB_ID): PlacedAsset {
  return { id, type: "workbench", x: 0, y: 0, size: 1 };
}

function assets(...wbs: PlacedAsset[]): Record<string, PlacedAsset> {
  return Object.fromEntries(wbs.map((wb) => [wb.id, wb]));
}

// ---------------------------------------------------------------------------
// Recipe ingredient conversion
// ---------------------------------------------------------------------------

describe("recipeIngredientsToStacks", () => {
  it("converts wood_pickaxe recipe costs to a single ItemStack", () => {
    const recipe = WORKBENCH_RECIPES.find((r) => r.key === "wood_pickaxe")!;
    const stacks = recipeIngredientsToStacks(recipe);
    expect(stacks).toEqual([{ itemId: "wood", count: 5 }]);
  });
});

// ---------------------------------------------------------------------------
// enqueueJob
// ---------------------------------------------------------------------------

describe("enqueueJob", () => {
  it("creates a queued job with snapshotted recipe data", () => {
    const r = enqueueJob(createEmptyCraftingQueue(), {
      recipeId: "wood_pickaxe",
      workbenchId: WB_ID,
      source: "player",
      inventorySource: { kind: "warehouse", warehouseId: "wh-1" },
      assets: assets(workbench()),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.job.id).toBe("job-1");
    expect(r.job.status).toBe("queued");
    expect(r.job.priority).toBe("high"); // player default
    expect(r.job.enqueuedAt).toBe(1);
    expect(r.job.inventorySource).toEqual({ kind: "warehouse", warehouseId: "wh-1" });
    expect(r.job.ingredients).toEqual([{ itemId: "wood", count: 5 }]);
    expect(r.job.output).toEqual({ itemId: "wood_pickaxe", count: 1 });
    expect(r.queue.nextJobSeq).toBe(2);
  });

  it("rejects unknown recipe", () => {
    const r = enqueueJob(createEmptyCraftingQueue(), {
      recipeId: "ghost_recipe",
      workbenchId: WB_ID,
      source: "player",
      inventorySource: { kind: "global" },
      assets: assets(workbench()),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("UNKNOWN_RECIPE");
    expect(r.queue.lastError?.kind).toBe("UNKNOWN_RECIPE");
  });

  it("rejects unknown / non-workbench asset", () => {
    const r1 = enqueueJob(createEmptyCraftingQueue(), {
      recipeId: "wood_pickaxe",
      workbenchId: "ghost",
      source: "player",
      inventorySource: { kind: "global" },
      assets: assets(workbench()),
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.kind).toBe("UNKNOWN_WORKBENCH");

    const tree: PlacedAsset = { id: "t1", type: "tree", x: 1, y: 1, size: 1 };
    const r2 = enqueueJob(createEmptyCraftingQueue(), {
      recipeId: "wood_pickaxe",
      workbenchId: "t1",
      source: "player",
      inventorySource: { kind: "global" },
      assets: { t1: tree },
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.kind).toBe("UNKNOWN_WORKBENCH");
  });

  it("automation jobs default to normal priority", () => {
    const r = enqueueJob(createEmptyCraftingQueue(), {
      recipeId: "wood_pickaxe",
      workbenchId: WB_ID,
      source: "automation",
      inventorySource: { kind: "global" },
      assets: assets(workbench()),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.job.priority).toBe("normal");
  });

  it("explicit priority override wins", () => {
    const r = enqueueJob(createEmptyCraftingQueue(), {
      recipeId: "wood_pickaxe",
      workbenchId: WB_ID,
      source: "automation",
      priority: "low",
      inventorySource: { kind: "global" },
      assets: assets(workbench()),
    });
    if (r.ok) expect(r.job.priority).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// cancelJob
// ---------------------------------------------------------------------------

describe("cancelJob", () => {
  it("cancels a queued job and reports previousStatus", () => {
    const e = enqueueJob(createEmptyCraftingQueue(), {
      recipeId: "wood_pickaxe",
      workbenchId: WB_ID,
      source: "player",
      inventorySource: { kind: "global" },
      assets: assets(workbench()),
    });
    if (!e.ok) throw new Error("setup");
    const c = cancelJob(e.queue, "job-1");
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.previousStatus).toBe("queued");
    expect(c.job.status).toBe("cancelled");
    expect(c.queue.jobs[0].status).toBe("cancelled");
  });

  it("rejects cancel on terminal job", () => {
    const e = enqueueJob(createEmptyCraftingQueue(), {
      recipeId: "wood_pickaxe",
      workbenchId: WB_ID,
      source: "player",
      inventorySource: { kind: "global" },
      assets: assets(workbench()),
    });
    if (!e.ok) throw new Error("setup");
    const first = cancelJob(e.queue, "job-1");
    if (!first.ok) throw new Error("setup");
    const second = cancelJob(first.queue, "job-1");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.kind).toBe("INVALID_TRANSITION");
  });

  it("rejects cancel on unknown job", () => {
    const c = cancelJob(createEmptyCraftingQueue(), "nope");
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error.kind).toBe("UNKNOWN_JOB");
  });
});

// ---------------------------------------------------------------------------
// State machine guard
// ---------------------------------------------------------------------------

describe("assertTransition", () => {
  it("allows known transitions", () => {
    expect(() => assertTransition("queued", "reserved")).not.toThrow();
    expect(() => assertTransition("reserved", "crafting")).not.toThrow();
    expect(() => assertTransition("crafting", "delivering")).not.toThrow();
    expect(() => assertTransition("delivering", "done")).not.toThrow();
    expect(() => assertTransition("queued", "cancelled")).not.toThrow();
  });
  it("throws on invalid transitions", () => {
    expect(() => assertTransition("queued", "crafting")).toThrow(/Invalid status transition/);
    expect(() => assertTransition("crafting", "done")).toThrow(/Invalid status transition/);
    expect(() => assertTransition("done", "crafting")).toThrow();
    expect(() => assertTransition("cancelled", "queued")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Sorting + selectors
// ---------------------------------------------------------------------------

function fakeJob(over: Partial<CraftingJob>): CraftingJob {
  return {
    id: "j",
    recipeId: "r",
    workbenchId: WB_ID,
    inventorySource: { kind: "global" },
    status: "queued",
    priority: "normal",
    source: "automation",
    enqueuedAt: 1,
    startedAt: null,
    finishesAt: null,
    progress: 0,
    ingredients: [],
    output: { itemId: "wood", count: 1 },
    processingTime: 0,
    reservationOwnerId: "j",
    ...over,
  };
}

describe("sortByPriorityFifo", () => {
  it("orders by priority then enqueuedAt", () => {
    const sorted = sortByPriorityFifo([
      fakeJob({ id: "a", priority: "low", enqueuedAt: 1 }),
      fakeJob({ id: "b", priority: "high", enqueuedAt: 5 }),
      fakeJob({ id: "c", priority: "normal", enqueuedAt: 2 }),
      fakeJob({ id: "d", priority: "high", enqueuedAt: 3 }),
    ]);
    expect(sorted.map((j) => j.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("is stable for equal priority + enqueuedAt", () => {
    const sorted = sortByPriorityFifo([
      fakeJob({ id: "a", priority: "high", enqueuedAt: 1 }),
      fakeJob({ id: "b", priority: "high", enqueuedAt: 2 }),
      fakeJob({ id: "c", priority: "high", enqueuedAt: 3 }),
    ]);
    expect(sorted.map((j) => j.id)).toEqual(["a", "b", "c"]);
  });
});

describe("workbench selectors", () => {
  it("getJobsForWorkbench filters correctly", () => {
    const queue = {
      jobs: [
        fakeJob({ id: "x1", workbenchId: "wb-A" }),
        fakeJob({ id: "x2", workbenchId: "wb-B" }),
        fakeJob({ id: "x3", workbenchId: "wb-A" }),
      ],
      nextJobSeq: 4,
      lastError: null,
    };
    expect(getJobsForWorkbench(queue, "wb-A").map((j) => j.id)).toEqual(["x1", "x3"]);
  });

  it("isWorkbenchBusy stays true for `crafting` and `delivering`", () => {
    const queue = {
      jobs: [
        fakeJob({ id: "x1", workbenchId: "wb-A", status: "reserved" }),
      ],
      nextJobSeq: 2,
      lastError: null,
    };
    expect(isWorkbenchBusy(queue, "wb-A")).toBe(false);
    queue.jobs[0] = fakeJob({ id: "x1", workbenchId: "wb-A", status: "crafting" });
    expect(isWorkbenchBusy(queue, "wb-A")).toBe(true);
    expect(getActiveCraftingJob(queue, "wb-A")?.id).toBe("x1");
    queue.jobs[0] = fakeJob({ id: "x1", workbenchId: "wb-A", status: "delivering" });
    expect(isWorkbenchBusy(queue, "wb-A")).toBe(true);
    expect(getActiveCraftingJob(queue, "wb-A")?.id).toBe("x1");
  });
});
