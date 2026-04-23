import type { CraftingJob, CraftingInventorySource } from "../types";
import {
  areCraftingSourcesEqual,
  getGuaranteedPendingOutput,
  hasHigherPriorityKeepStockBlockers,
  isAutomationCraftingJob,
  isGuaranteedPendingCraftingJob,
  isKeepStockTrackedJob,
  isOpenCraftingJob,
} from "../jobStatus";

function makeJob(overrides: Partial<CraftingJob>): CraftingJob {
  const base: CraftingJob = {
    id: "job-1",
    recipeId: "wood_plank",
    workbenchId: "wb-1",
    inventorySource: { kind: "global" },
    status: "queued",
    priority: "normal",
    source: "automation",
    enqueuedAt: 1,
    startedAt: null,
    finishesAt: null,
    progress: 0,
    ingredients: [{ itemId: "wood", count: 1 }],
    output: { itemId: "wood_plank", count: 1 },
    processingTime: 0,
    reservationOwnerId: "job-1",
  };
  return { ...base, ...overrides };
}

describe("crafting/jobStatus", () => {
  describe("isOpenCraftingJob", () => {
    it("returns true for queued/reserved/crafting/delivering", () => {
      expect(isOpenCraftingJob("queued")).toBe(true);
      expect(isOpenCraftingJob("reserved")).toBe(true);
      expect(isOpenCraftingJob("crafting")).toBe(true);
      expect(isOpenCraftingJob("delivering")).toBe(true);
    });
    it("returns false for done/cancelled", () => {
      expect(isOpenCraftingJob("done")).toBe(false);
      expect(isOpenCraftingJob("cancelled")).toBe(false);
    });
  });

  describe("isGuaranteedPendingCraftingJob", () => {
    it("only counts reserved/crafting/delivering", () => {
      expect(isGuaranteedPendingCraftingJob("reserved")).toBe(true);
      expect(isGuaranteedPendingCraftingJob("crafting")).toBe(true);
      expect(isGuaranteedPendingCraftingJob("delivering")).toBe(true);
      expect(isGuaranteedPendingCraftingJob("queued")).toBe(false);
      expect(isGuaranteedPendingCraftingJob("done")).toBe(false);
      expect(isGuaranteedPendingCraftingJob("cancelled")).toBe(false);
    });
  });

  describe("areCraftingSourcesEqual", () => {
    it("matches global with global", () => {
      expect(areCraftingSourcesEqual({ kind: "global" }, { kind: "global" })).toBe(true);
    });
    it("matches warehouse by id", () => {
      expect(
        areCraftingSourcesEqual(
          { kind: "warehouse", warehouseId: "wh-a" },
          { kind: "warehouse", warehouseId: "wh-a" },
        ),
      ).toBe(true);
      expect(
        areCraftingSourcesEqual(
          { kind: "warehouse", warehouseId: "wh-a" },
          { kind: "warehouse", warehouseId: "wh-b" },
        ),
      ).toBe(false);
    });
    it("matches zone by id and unordered warehouse set", () => {
      const a: CraftingInventorySource = {
        kind: "zone",
        zoneId: "z1",
        warehouseIds: ["wh-a", "wh-b"],
      };
      const b: CraftingInventorySource = {
        kind: "zone",
        zoneId: "z1",
        warehouseIds: ["wh-b", "wh-a"],
      };
      expect(areCraftingSourcesEqual(a, b)).toBe(true);
    });
    it("returns false when kinds differ", () => {
      expect(
        areCraftingSourcesEqual(
          { kind: "global" },
          { kind: "warehouse", warehouseId: "wh-a" },
        ),
      ).toBe(false);
    });
  });

  describe("getGuaranteedPendingOutput", () => {
    it("aggregates only matching item, source, and pending status", () => {
      const jobs: CraftingJob[] = [
        makeJob({ id: "j1", status: "crafting", output: { itemId: "plank", count: 2 } }),
        makeJob({ id: "j2", status: "delivering", output: { itemId: "plank", count: 1 } }),
        makeJob({ id: "j3", status: "queued", output: { itemId: "plank", count: 9 } }),
        makeJob({ id: "j4", status: "done", output: { itemId: "plank", count: 9 } }),
        makeJob({ id: "j5", status: "crafting", output: { itemId: "other", count: 9 } }),
        makeJob({
          id: "j6",
          status: "crafting",
          inventorySource: { kind: "warehouse", warehouseId: "wh-a" },
          output: { itemId: "plank", count: 4 },
        }),
      ];
      expect(getGuaranteedPendingOutput(jobs, { kind: "global" }, "plank")).toBe(3);
    });
  });

  describe("isAutomationCraftingJob (Reducer-Semantik)", () => {
    it("true for open automation jobs regardless of keep-stock target", () => {
      expect(isAutomationCraftingJob(makeJob({ source: "automation", status: "crafting" }))).toBe(true);
      expect(isAutomationCraftingJob(makeJob({ source: "automation", status: "queued" }))).toBe(true);
    });
    it("false for player jobs and for closed jobs", () => {
      expect(isAutomationCraftingJob(makeJob({ source: "player", status: "crafting" }))).toBe(false);
      expect(isAutomationCraftingJob(makeJob({ source: "automation", status: "done" }))).toBe(false);
      expect(isAutomationCraftingJob(makeJob({ source: "automation", status: "cancelled" }))).toBe(false);
    });
  });

  describe("isKeepStockTrackedJob (UI-Semantik)", () => {
    it("requires automation source AND configured/enabled keep-stock target", () => {
      const job = makeJob({ source: "automation", workbenchId: "wb-1", recipeId: "plank" });
      const stateWith = {
        keepStockByWorkbench: { "wb-1": { plank: { enabled: true, amount: 5 } } },
      };
      const stateMissingTarget = {
        keepStockByWorkbench: { "wb-1": { other: { enabled: true, amount: 5 } } },
      };
      const stateDisabled = {
        keepStockByWorkbench: { "wb-1": { plank: { enabled: false, amount: 5 } } },
      };
      const stateZeroAmount = {
        keepStockByWorkbench: { "wb-1": { plank: { enabled: true, amount: 0 } } },
      };
      expect(isKeepStockTrackedJob(stateWith, job)).toBe(true);
      expect(isKeepStockTrackedJob(stateMissingTarget, job)).toBe(false);
      expect(isKeepStockTrackedJob(stateDisabled, job)).toBe(false);
      expect(isKeepStockTrackedJob(stateZeroAmount, job)).toBe(false);
    });
    it("does NOT enforce open status (display also covers done jobs)", () => {
      const state = {
        keepStockByWorkbench: { "wb-1": { plank: { enabled: true, amount: 5 } } },
      };
      const doneJob = makeJob({
        source: "automation",
        workbenchId: "wb-1",
        recipeId: "plank",
        status: "done",
      });
      expect(isKeepStockTrackedJob(state, doneJob)).toBe(true);
    });
    it("never matches player-source jobs", () => {
      const state = {
        keepStockByWorkbench: { "wb-1": { plank: { enabled: true, amount: 5 } } },
      };
      const playerJob = makeJob({ source: "player", workbenchId: "wb-1", recipeId: "plank" });
      expect(isKeepStockTrackedJob(state, playerJob)).toBe(false);
    });
  });

  describe("semantic separation (Reducer vs UI)", () => {
    it("isAutomationCraftingJob and isKeepStockTrackedJob are NOT interchangeable", () => {
      // Automation job WITHOUT a keep-stock target: counts for reducer cap, not for UI.
      const job = makeJob({ source: "automation", workbenchId: "wb-1", recipeId: "plank", status: "crafting" });
      const stateNoTarget = { keepStockByWorkbench: {} };
      expect(isAutomationCraftingJob(job)).toBe(true);
      expect(isKeepStockTrackedJob(stateNoTarget, job)).toBe(false);
    });
  });

  describe("hasHigherPriorityKeepStockBlockers", () => {
    const emptyState = {
      crafting: { jobs: [] as CraftingJob[] },
      constructionSites: {} as Record<string, { remaining: Record<string, number | undefined> }>,
      serviceHubs: {} as Record<string, { pendingUpgrade?: unknown }>,
    };
    it("false on empty state", () => {
      expect(hasHigherPriorityKeepStockBlockers(emptyState)).toBe(false);
    });
    it("true when an open player crafting job exists", () => {
      expect(
        hasHigherPriorityKeepStockBlockers({
          ...emptyState,
          crafting: { jobs: [makeJob({ source: "player", status: "crafting" })] },
        }),
      ).toBe(true);
    });
    it("ignores closed player jobs", () => {
      expect(
        hasHigherPriorityKeepStockBlockers({
          ...emptyState,
          crafting: { jobs: [makeJob({ source: "player", status: "done" })] },
        }),
      ).toBe(false);
    });
    it("true on open construction sites", () => {
      expect(
        hasHigherPriorityKeepStockBlockers({
          ...emptyState,
          constructionSites: { s1: { remaining: { wood: 3 } } },
        }),
      ).toBe(true);
    });
    it("ignores fully delivered construction sites", () => {
      expect(
        hasHigherPriorityKeepStockBlockers({
          ...emptyState,
          constructionSites: { s1: { remaining: { wood: 0 } } },
        }),
      ).toBe(false);
    });
    it("true on pending hub upgrade", () => {
      expect(
        hasHigherPriorityKeepStockBlockers({
          ...emptyState,
          serviceHubs: { h1: { pendingUpgrade: { wood: 5 } } },
        }),
      ).toBe(true);
    });
  });
});
