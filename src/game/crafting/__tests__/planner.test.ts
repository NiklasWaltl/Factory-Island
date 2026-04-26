import { cellKey, createInitialState } from "../../store/reducer";
import type { GameState, Inventory, PlacedAsset } from "../../store/types";
import { WORKBENCH_RECIPES, type WorkbenchRecipe } from "../../simulation/recipes";
import { buildWorkbenchAutoCraftPlan } from "../planner/planner";
import { pickOutputWarehouseId, routeOutput } from "../output";
import type { CraftingInventorySource, CraftingJob, JobStatus } from "../types";

const WB = "wb-plan";
const WH = "wh-plan";

function baseState(overrides?: Partial<Inventory>): GameState {
  const base = createInitialState("release");
  const workbench: PlacedAsset = { id: WB, type: "workbench", x: 2, y: 2, size: 1 };
  const warehouse: PlacedAsset = { id: WH, type: "warehouse", x: 5, y: 5, size: 2 };
  return {
    ...base,
    assets: {
      ...base.assets,
      [WB]: workbench,
      [WH]: warehouse,
    },
    cellMap: {
      ...base.cellMap,
      [cellKey(2, 2)]: WB,
      [cellKey(5, 5)]: WH,
      [cellKey(6, 5)]: WH,
      [cellKey(5, 6)]: WH,
      [cellKey(6, 6)]: WH,
    },
    warehouseInventories: {
      [WH]: {
        ...base.inventory,
        ...(overrides ?? {}),
      },
    },
    serviceHubs: {},
    buildingSourceWarehouseIds: {
      [WB]: WH,
    },
  };
}

function warehouseSource(): CraftingInventorySource {
  return { kind: "warehouse", warehouseId: WH };
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

function makeExistingJob(opts: {
  id: string;
  recipeId: string;
  status: JobStatus;
  outputItem: "gear" | "axe";
  outputCount: number;
}): CraftingJob {
  return {
    id: opts.id,
    recipeId: opts.recipeId,
    workbenchId: WB,
    inventorySource: warehouseSource(),
    status: opts.status,
    priority: "high",
    source: "player",
    enqueuedAt: 1,
    startedAt: null,
    finishesAt: null,
    progress: 0,
    ingredients: [{ itemId: "wood", count: 2 }],
    output: { itemId: opts.outputItem, count: opts.outputCount },
    processingTime: 0,
    reservationOwnerId: opts.id,
  };
}

describe("buildWorkbenchAutoCraftPlan", () => {
  it("creates prerequisite chain in topological order", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_plan_plate",
          label: "Auto Plan Plate",
          emoji: "P",
          inputItem: "wood",
          outputItem: "metalPlate",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_plan_gear",
          label: "Auto Plan Gear",
          emoji: "G",
          inputItem: "metalPlate",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { metalPlate: 1 },
        },
        {
          key: "auto_plan_axe",
          label: "Auto Plan Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        const state = baseState({ wood: 2, metalPlate: 0, gear: 0, axe: 0 });
        const result = buildWorkbenchAutoCraftPlan({
          recipeId: "auto_plan_axe",
          source: warehouseSource(),
          warehouseInventories: state.warehouseInventories,
          serviceHubs: state.serviceHubs,
          network: state.network,
          assets: state.assets,
          existingJobs: state.crafting.jobs,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.steps).toEqual([
          { recipeId: "auto_plan_plate", count: 1, label: "Auto Plan Plate" },
          { recipeId: "auto_plan_gear", count: 1, label: "Auto Plan Gear" },
          { recipeId: "auto_plan_axe", count: 1, label: "Auto Plan Axe" },
        ]);
      },
    );
  });

  it("counts existing intermediate stock and plans only what is missing", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_plan_gear2",
          label: "Auto Plan Gear2",
          emoji: "G",
          inputItem: "metalPlate",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { metalPlate: 1 },
        },
        {
          key: "auto_plan_axe2",
          label: "Auto Plan Axe2",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        const state = baseState({ gear: 1, axe: 0 });
        const result = buildWorkbenchAutoCraftPlan({
          recipeId: "auto_plan_axe2",
          source: warehouseSource(),
          warehouseInventories: state.warehouseInventories,
          serviceHubs: state.serviceHubs,
          network: state.network,
          assets: state.assets,
          existingJobs: state.crafting.jobs,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.steps).toEqual([
          { recipeId: "auto_plan_axe2", count: 1, label: "Auto Plan Axe2" },
        ]);
      },
    );
  });

  it("aborts with POLICY_BLOCKED when a required recipe is policy-disabled", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_plan_policy_gear",
          label: "Auto Plan Policy Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_plan_policy_axe",
          label: "Auto Plan Policy Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        const state = baseState({ wood: 2, gear: 0, axe: 0 });
        const result = buildWorkbenchAutoCraftPlan({
          recipeId: "auto_plan_policy_axe",
          source: warehouseSource(),
          warehouseInventories: state.warehouseInventories,
          serviceHubs: state.serviceHubs,
          network: state.network,
          assets: state.assets,
          existingJobs: state.crafting.jobs,
          canUseRecipe: (recipeId) =>
            recipeId === "auto_plan_policy_gear"
              ? { allowed: false, reason: "manual only" }
              : { allowed: true },
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.kind).toBe("POLICY_BLOCKED");
        expect(result.error.message).toContain("manual only");
      },
    );
  });

  it("aborts with manual-missing when raw resources are missing", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_plan_plate_missing",
          label: "Auto Plan Plate Missing",
          emoji: "P",
          inputItem: "wood",
          outputItem: "metalPlate",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_plan_axe_missing",
          label: "Auto Plan Axe Missing",
          emoji: "A",
          inputItem: "metalPlate",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { metalPlate: 1 },
        },
      ],
      () => {
        const state = baseState({ wood: 0, metalPlate: 0, axe: 0 });
        const result = buildWorkbenchAutoCraftPlan({
          recipeId: "auto_plan_axe_missing",
          source: warehouseSource(),
          warehouseInventories: state.warehouseInventories,
          serviceHubs: state.serviceHubs,
          network: state.network,
          assets: state.assets,
          existingJobs: state.crafting.jobs,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.kind).toBe("MISSING_MANUAL");
      },
    );
  });

  it("aborts when ingredient is craftable but not through workbench queue", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_plan_ingot_axe",
          label: "Auto Plan Ingot Axe",
          emoji: "A",
          inputItem: "ironIngot",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { ironIngot: 1 },
        },
      ],
      () => {
        const state = baseState({ ironIngot: 0, axe: 0 });
        const result = buildWorkbenchAutoCraftPlan({
          recipeId: "auto_plan_ingot_axe",
          source: warehouseSource(),
          warehouseInventories: state.warehouseInventories,
          serviceHubs: state.serviceHubs,
          network: state.network,
          assets: state.assets,
          existingJobs: state.crafting.jobs,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.kind).toBe("MISSING_CRAFTABLE_OFF_WORKBENCH");
      },
    );
  });

  it("aborts safely on recipe cycles", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_plan_cycle_plate",
          label: "Auto Plan Cycle Plate",
          emoji: "P",
          inputItem: "gear",
          outputItem: "metalPlate",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
        {
          key: "auto_plan_cycle_gear",
          label: "Auto Plan Cycle Gear",
          emoji: "G",
          inputItem: "metalPlate",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { metalPlate: 1 },
        },
        {
          key: "auto_plan_cycle_target",
          label: "Auto Plan Cycle Target",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        const state = baseState({ gear: 0, metalPlate: 0, axe: 0 });
        const result = buildWorkbenchAutoCraftPlan({
          recipeId: "auto_plan_cycle_target",
          source: warehouseSource(),
          warehouseInventories: state.warehouseInventories,
          serviceHubs: state.serviceHubs,
          network: state.network,
          assets: state.assets,
          existingJobs: state.crafting.jobs,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.kind).toBe("RECIPE_CYCLE");
      },
    );
  });
});

describe("Schritt 8 Fixes - planner", () => {
  it("R1: ignores queued output and replans prerequisite", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_fix_r1_gear",
          label: "Auto Fix R1 Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_fix_r1_axe",
          label: "Auto Fix R1 Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        // Setup: queued gear job exists but has no reservation lock yet.
        const state = baseState({ wood: 4, gear: 0, axe: 0 });
        const queuedJob = makeExistingJob({
          id: "job-queued-gear",
          recipeId: "auto_fix_r1_gear",
          status: "queued",
          outputItem: "gear",
          outputCount: 1,
        });

        // Action: build auto-craft plan for axe.
        const result = buildWorkbenchAutoCraftPlan({
          recipeId: "auto_fix_r1_axe",
          source: warehouseSource(),
          warehouseInventories: state.warehouseInventories,
          serviceHubs: state.serviceHubs,
          network: state.network,
          assets: state.assets,
          existingJobs: [queuedJob],
        });

        // Assertion: queued output is ignored -> prerequisite gear is still planned.
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.steps).toEqual([
          { recipeId: "auto_fix_r1_gear", count: 1, label: "Auto Fix R1 Gear" },
          { recipeId: "auto_fix_r1_axe", count: 1, label: "Auto Fix R1 Axe" },
        ]);
      },
    );
  });

  it("R1: credits reserved/crafting/delivering output and only plans remainder", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_fix_r1_active_gear",
          label: "Auto Fix R1 Active Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_fix_r1_active_axe",
          label: "Auto Fix R1 Active Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        // Setup: one future gear output already in a committed lifecycle state.
        const state = baseState({ wood: 2, gear: 0, axe: 0 });
        const statuses: ReadonlyArray<JobStatus> = ["reserved", "crafting", "delivering"];

        for (const status of statuses) {
          const existing = makeExistingJob({
            id: `job-${status}-gear`,
            recipeId: "auto_fix_r1_active_gear",
            status,
            outputItem: "gear",
            outputCount: 1,
          });

          // Action: build plan with one active committed gear-producing job.
          const result = buildWorkbenchAutoCraftPlan({
            recipeId: "auto_fix_r1_active_axe",
            source: warehouseSource(),
            warehouseInventories: state.warehouseInventories,
            serviceHubs: state.serviceHubs,
            network: state.network,
            assets: state.assets,
            existingJobs: [existing],
          });

          // Assertion: no additional gear plan, only the target axe.
          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          expect(result.steps).toEqual([
            { recipeId: "auto_fix_r1_active_axe", count: 1, label: "Auto Fix R1 Active Axe" },
          ]);
        }
      },
    );
  });

  it("G2: planner destination selection matches routeOutput destination", () => {
    const base = createInitialState("release");
    const warehouseInventories = {
      "wh-z": { ...base.inventory },
      "wh-a": { ...base.inventory },
    };
    const source: CraftingInventorySource = {
      kind: "zone",
      zoneId: "zone-g2",
      warehouseIds: ["wh-z", "wh-a"],
    };

    // Action: resolve destination through both paths.
    const plannerPick = pickOutputWarehouseId(source, warehouseInventories);
    const routed = routeOutput({
      warehouseInventories,
      globalInventory: { ...base.inventory },
      stack: { itemId: "gear", count: 1 },
      source,
    });

    // Assertion: both resolve to the same warehouse id deterministically.
    expect(plannerPick).toBe("wh-a");
    expect(routed.destination).toEqual({ kind: "warehouse", id: "wh-a" });
  });

  it("Step 9: prefers nearest zone warehouse when producer context is provided", () => {
    const base = createInitialState("release");
    const warehouseInventories = {
      "wh-a": { ...base.inventory },
      "wh-z": { ...base.inventory },
    };
    const assets: Record<string, PlacedAsset> = {
      ...base.assets,
      wbLocal: { id: "wbLocal", type: "workbench", x: 20, y: 20, size: 1 },
      "wh-a": { id: "wh-a", type: "warehouse", x: 2, y: 2, size: 2 },
      "wh-z": { id: "wh-z", type: "warehouse", x: 19, y: 20, size: 2 },
    };
    const source: CraftingInventorySource = {
      kind: "zone",
      zoneId: "zone-local",
      warehouseIds: ["wh-a", "wh-z"],
    };

    const picked = pickOutputWarehouseId(source, warehouseInventories, {
      assets,
      preferredFromAssetId: "wbLocal",
    });

    expect(picked).toBe("wh-z");
  });

  it("Step 9: falls back to nearest hub for collectable output when warehouse destination is gone", () => {
    const base = createInitialState("release");
    const hubId = "hub-route";
    const serviceHubs = {
      [hubId]: {
        inventory: { wood: 2, stone: 0, iron: 0, copper: 0 },
        targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
        tier: 1 as const,
        droneIds: [],
      },
    };
    const assets: Record<string, PlacedAsset> = {
      ...base.assets,
      wbLocal: { id: "wbLocal", type: "workbench", x: 12, y: 12, size: 1 },
      [hubId]: { id: hubId, type: "service_hub", x: 11, y: 12, size: 2 },
    };

    const routed = routeOutput({
      warehouseInventories: {},
      globalInventory: { ...base.inventory },
      serviceHubs,
      assets,
      preferredFromAssetId: "wbLocal",
      stack: { itemId: "wood", count: 3 },
      source: { kind: "warehouse", warehouseId: "wh-missing" },
    });

    expect(routed.destination).toEqual({ kind: "hub", id: hubId });
    expect(routed.serviceHubs[hubId].inventory.wood).toBe(5);
    expect(routed.globalInventory.wood).toBe(base.inventory.wood);
  });

  it("Step 9: player gear never falls back into hub inventory", () => {
    const base = createInitialState("release");
    const hubId = "hub-route";
    const serviceHubs = {
      [hubId]: {
        inventory: { wood: 10, stone: 0, iron: 0, copper: 0 },
        targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
        tier: 1 as const,
        droneIds: [],
      },
    };
    const assets: Record<string, PlacedAsset> = {
      ...base.assets,
      wbLocal: { id: "wbLocal", type: "workbench", x: 12, y: 12, size: 1 },
      [hubId]: { id: hubId, type: "service_hub", x: 11, y: 12, size: 2 },
    };

    const routed = routeOutput({
      warehouseInventories: {},
      globalInventory: { ...base.inventory },
      serviceHubs,
      assets,
      preferredFromAssetId: "wbLocal",
      stack: { itemId: "wood_pickaxe", count: 1 },
      source: { kind: "warehouse", warehouseId: "wh-missing" },
    });

    expect(routed.destination).toEqual({ kind: "global" });
    expect(routed.serviceHubs[hubId].inventory.wood).toBe(10);
    expect(routed.globalInventory.wood_pickaxe).toBe(base.inventory.wood_pickaxe + 1);
  });
});
