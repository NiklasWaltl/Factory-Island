import {
  cellKey,
  createInitialState,
  gameReducer,
  KEEP_STOCK_OPEN_JOB_CAP,
  type GameState,
  type Inventory,
  type PlacedAsset,
} from "../reducer";
import { WORKBENCH_RECIPES, type WorkbenchRecipe } from "../../simulation/recipes";
import { deserializeState, serializeState } from "../../simulation/save";

const WB = "wb-auto";
const WH = "wh-auto";

function withWorkbenchRecipes(recipes: WorkbenchRecipe[], run: () => void): void {
  const snapshot = [...WORKBENCH_RECIPES];
  WORKBENCH_RECIPES.splice(WORKBENCH_RECIPES.length, 0, ...recipes);
  try {
    run();
  } finally {
    WORKBENCH_RECIPES.splice(0, WORKBENCH_RECIPES.length, ...snapshot);
  }
}

function buildState(overrides?: Partial<Inventory>): GameState {
  const base = createInitialState("release");
  const workbench: PlacedAsset = { id: WB, type: "workbench", x: 2, y: 2, size: 1 };
  const warehouse: PlacedAsset = { id: WH, type: "warehouse", x: 6, y: 6, size: 2 };
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
      [cellKey(6, 6)]: WH,
      [cellKey(7, 6)]: WH,
      [cellKey(6, 7)]: WH,
      [cellKey(7, 7)]: WH,
    },
    warehouseInventories: {
      [WH]: {
        ...base.inventory,
        ...(overrides ?? {}),
      },
    },
    serviceHubs: {},
    selectedCraftingBuildingId: WB,
    buildingSourceWarehouseIds: {
      [WB]: WH,
    },
  };
}

describe("CRAFT_REQUEST_WITH_PREREQUISITES", () => {
  it("enqueues prerequisite jobs before target recipe", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_reducer_gear",
          label: "Auto Reducer Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_reducer_axe",
          label: "Auto Reducer Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        const start = buildState({ wood: 2, gear: 0, axe: 0 });
        const next = gameReducer(start, {
          type: "CRAFT_REQUEST_WITH_PREREQUISITES",
          recipeId: "auto_reducer_axe",
          workbenchId: WB,
          source: "player",
          priority: "high",
        });

        expect(next.crafting.jobs.map((job) => job.recipeId)).toEqual([
          "auto_reducer_gear",
          "auto_reducer_axe",
        ]);
      },
    );
  });

  it("does NOT credit queued sibling jobs (R1: only reserved/crafting/delivering count)", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_reducer_gear_existing",
          label: "Auto Reducer Gear Existing",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_reducer_axe_existing",
          label: "Auto Reducer Axe Existing",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        // Provide enough wood for two gear jobs so the planner is allowed to
        // schedule another gear even though one is already queued. Queued has
        // no reservation, therefore the planner must NOT treat its output as
        // guaranteed and must replan the prerequisite.
        const start = buildState({ wood: 4, gear: 0, axe: 0 });
        const withExisting = gameReducer(start, {
          type: "JOB_ENQUEUE",
          recipeId: "auto_reducer_gear_existing",
          workbenchId: WB,
          source: "player",
          priority: "high",
        });

        const next = gameReducer(withExisting, {
          type: "CRAFT_REQUEST_WITH_PREREQUISITES",
          recipeId: "auto_reducer_axe_existing",
          workbenchId: WB,
          source: "player",
          priority: "high",
        });

        expect(next.crafting.jobs.map((job) => job.recipeId)).toEqual([
          "auto_reducer_gear_existing",
          "auto_reducer_gear_existing",
          "auto_reducer_axe_existing",
        ]);
      },
    );
  });

  it("emits divergence notice when expectedStepCount differs from planned (G1)", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_g1_gear",
          label: "Auto G1 Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_g1_axe",
          label: "Auto G1 Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        const start = buildState({ wood: 2, gear: 0, axe: 0 });
        // UI preview claimed 5 steps; reducer will compute 2 → divergence.
        const next = gameReducer(start, {
          type: "CRAFT_REQUEST_WITH_PREREQUISITES",
          recipeId: "auto_g1_axe",
          workbenchId: WB,
          source: "player",
          priority: "high",
          expectedStepCount: 5,
        });

        expect(next.crafting.jobs.map((j) => j.recipeId)).toEqual([
          "auto_g1_gear",
          "auto_g1_axe",
        ]);
        const last = next.notifications.at(-1);
        expect(last?.kind).toBe("error");
        expect(last?.displayName).toContain("Auto-Craft-Plan an aktuellen Bestand angepasst");
      },
    );
  });

  it("aborts with notification when manual resources are still missing", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_reducer_plate_missing",
          label: "Auto Reducer Plate Missing",
          emoji: "P",
          inputItem: "wood",
          outputItem: "metalPlate",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 3 },
        },
        {
          key: "auto_reducer_axe_missing",
          label: "Auto Reducer Axe Missing",
          emoji: "A",
          inputItem: "metalPlate",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { metalPlate: 1 },
        },
      ],
      () => {
        const start = buildState({ wood: 0, metalPlate: 0, axe: 0 });
        const next = gameReducer(start, {
          type: "CRAFT_REQUEST_WITH_PREREQUISITES",
          recipeId: "auto_reducer_axe_missing",
          workbenchId: WB,
          source: "player",
          priority: "high",
        });

        expect(next.crafting.jobs).toHaveLength(0);
        expect(next.notifications.at(-1)?.kind).toBe("error");
      },
    );
  });

  it("blocks auto-craft planning when auto-craft policy is disabled for recipe", () => {
    let state = buildState({ wood: 20, wood_pickaxe: 0 });
    state = gameReducer(state, {
      type: "SET_RECIPE_AUTOMATION_POLICY",
      recipeId: "wood_pickaxe",
      patch: { autoCraftAllowed: false },
    });

    const next = gameReducer(state, {
      type: "CRAFT_REQUEST_WITH_PREREQUISITES",
      recipeId: "wood_pickaxe",
      workbenchId: WB,
      source: "player",
      priority: "high",
    });

    expect(next.crafting.jobs).toHaveLength(0);
    expect(next.notifications.at(-1)?.displayName).toContain("auto-craft disabled");
  });

  it("manual-only recipe still allows direct manual JOB_ENQUEUE", () => {
    let state = buildState({ wood: 20, wood_pickaxe: 0 });
    state = gameReducer(state, {
      type: "SET_RECIPE_AUTOMATION_POLICY",
      recipeId: "wood_pickaxe",
      patch: { manualOnly: true },
    });

    const blockedAutoPlan = gameReducer(state, {
      type: "CRAFT_REQUEST_WITH_PREREQUISITES",
      recipeId: "wood_pickaxe",
      workbenchId: WB,
      source: "player",
      priority: "high",
    });
    expect(blockedAutoPlan.crafting.jobs).toHaveLength(0);
    expect(blockedAutoPlan.notifications.at(-1)?.displayName).toContain("manual only");

    const manualEnqueue = gameReducer(state, {
      type: "JOB_ENQUEUE",
      recipeId: "wood_pickaxe",
      workbenchId: WB,
      source: "player",
      priority: "high",
    });
    expect(manualEnqueue.crafting.jobs).toHaveLength(1);
    expect(manualEnqueue.crafting.jobs[0].recipeId).toBe("wood_pickaxe");
    expect(manualEnqueue.crafting.jobs[0].source).toBe("player");
  });
});

describe("Schritt 8 Fixes - reducer", () => {
  it("G1: stale preview count is adjusted by reducer plan and emits notice", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_fix_g1_gear",
          label: "Auto Fix G1 Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_fix_g1_axe",
          label: "Auto Fix G1 Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        // Setup: state shifted after preview (reserved gear job exists now).
        const start = buildState({ wood: 2, gear: 0, axe: 0 });
        const shifted: GameState = {
          ...start,
          crafting: {
            ...start.crafting,
            jobs: [
              {
                id: "job-reserved-gear",
                recipeId: "auto_fix_g1_gear",
                workbenchId: WB,
                inventorySource: { kind: "warehouse", warehouseId: WH },
                status: "reserved",
                priority: "high",
                source: "player",
                enqueuedAt: 1,
                startedAt: null,
                finishesAt: null,
                progress: 0,
                ingredients: [{ itemId: "wood", count: 2 }],
                output: { itemId: "gear", count: 1 },
                processingTime: 0,
                reservationOwnerId: "job-reserved-gear",
              },
            ],
          },
        };

        // Action: confirm with stale preview expectation (2 steps from T1).
        const next = gameReducer(shifted, {
          type: "CRAFT_REQUEST_WITH_PREREQUISITES",
          recipeId: "auto_fix_g1_axe",
          workbenchId: WB,
          source: "player",
          priority: "high",
          expectedStepCount: 2,
        });

        // Assertion: reducer enqueues adjusted plan (axe only) + emits divergence notice.
        const gearJobs = next.crafting.jobs.filter((j) => j.recipeId === "auto_fix_g1_gear");
        const axeJobs = next.crafting.jobs.filter((j) => j.recipeId === "auto_fix_g1_axe");
        expect(gearJobs).toHaveLength(1);
        expect(axeJobs).toHaveLength(1);
        expect(next.notifications.at(-1)?.displayName).toContain(
          "Auto-Craft-Plan an aktuellen Bestand angepasst",
        );
      },
    );
  });

  it("R1: queued-output-ignore behavior survives save/load (no phantom credits)", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_fix_save_gear",
          label: "Auto Fix Save Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_fix_save_axe",
          label: "Auto Fix Save Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        // Setup: existing queued gear job + enough wood to replan gear.
        const start = buildState({ wood: 4, gear: 0, axe: 0 });
        const withQueued = gameReducer(start, {
          type: "JOB_ENQUEUE",
          recipeId: "auto_fix_save_gear",
          workbenchId: WB,
          source: "player",
          priority: "high",
        });
        const planned = gameReducer(withQueued, {
          type: "CRAFT_REQUEST_WITH_PREREQUISITES",
          recipeId: "auto_fix_save_axe",
          workbenchId: WB,
          source: "player",
          priority: "high",
        });

        // Action: save + load + request again.
        const loaded = deserializeState(serializeState(planned));
        const afterReload = gameReducer(loaded, {
          type: "CRAFT_REQUEST_WITH_PREREQUISITES",
          recipeId: "auto_fix_save_axe",
          workbenchId: WB,
          source: "player",
          priority: "high",
        });

        // Assertion: after reload still ignores queued output (adds gear+axe tail).
        const tail = afterReload.crafting.jobs.slice(-2).map((j) => j.recipeId);
        expect(tail).toEqual(["auto_fix_save_gear", "auto_fix_save_axe"]);
      },
    );
  });

  it("G3/G4 edge: amount > 1 stays deterministic and expands into stable single-job order", () => {
    withWorkbenchRecipes(
      [
        {
          key: "auto_fix_multi_gear",
          label: "Auto Fix Multi Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
        {
          key: "auto_fix_multi_axe",
          label: "Auto Fix Multi Axe",
          emoji: "A",
          inputItem: "gear",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { gear: 1 },
        },
      ],
      () => {
        // Setup: enough material for 3 complete crafts.
        const start = buildState({ wood: 6, gear: 0, axe: 0 });

        // Action: request amount=3.
        const next = gameReducer(start, {
          type: "CRAFT_REQUEST_WITH_PREREQUISITES",
          recipeId: "auto_fix_multi_axe",
          workbenchId: WB,
          source: "player",
          priority: "high",
          amount: 3,
        });

        // Assertion: deterministic stable order, no batching side-effects.
        expect(next.crafting.jobs.map((j) => j.recipeId)).toEqual([
          "auto_fix_multi_gear",
          "auto_fix_multi_gear",
          "auto_fix_multi_gear",
          "auto_fix_multi_axe",
          "auto_fix_multi_axe",
          "auto_fix_multi_axe",
        ]);
      },
    );
  });
});

describe("Keep-in-Stock", () => {
  it("enqueues refill jobs when stock is below target", () => {
    withWorkbenchRecipes(
      [
        {
          key: "keep_stock_gear",
          label: "Keep Stock Gear",
          emoji: "G",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
      ],
      () => {
        let state = buildState({ wood: 10, gear: 0 });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_gear",
          amount: 1,
          enabled: true,
        });

        const next = gameReducer(state, { type: "JOB_TICK" });

        expect(next.crafting.jobs.map((job) => job.recipeId)).toEqual(["keep_stock_gear"]);
        expect(next.crafting.jobs.every((job) => job.source === "automation")).toBe(true);
      },
    );
  });

  it("does not enqueue refill when stock already meets target", () => {
    withWorkbenchRecipes(
      [
        {
          key: "keep_stock_enough",
          label: "Keep Stock Enough",
          emoji: "E",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
      ],
      () => {
        let state = buildState({ wood: 10, gear: 2 });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_enough",
          amount: 2,
          enabled: true,
        });

        const next = gameReducer(state, { type: "JOB_TICK" });
        expect(next.crafting.jobs).toHaveLength(0);
      },
    );
  });

  it("does not enqueue keep-stock refill when policy disables keep-in-stock", () => {
    let state = buildState({ wood: 20, wood_pickaxe: 0 });
    state = gameReducer(state, {
      type: "SET_KEEP_STOCK_TARGET",
      workbenchId: WB,
      recipeId: "wood_pickaxe",
      amount: 2,
      enabled: true,
    });
    state = gameReducer(state, {
      type: "SET_RECIPE_AUTOMATION_POLICY",
      recipeId: "wood_pickaxe",
      patch: { keepInStockAllowed: false },
    });

    const next = gameReducer(state, { type: "JOB_TICK" });
    expect(next.crafting.jobs).toHaveLength(0);
  });

  it("suppresses duplicate refill while pending output already exists", () => {
    withWorkbenchRecipes(
      [
        {
          key: "keep_stock_no_dupe",
          label: "Keep Stock No Dupe",
          emoji: "D",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
      ],
      () => {
        let state = buildState({ wood: 10, gear: 0 });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_no_dupe",
          amount: 1,
          enabled: true,
        });

        const afterFirstTick = gameReducer(state, { type: "JOB_TICK" });
        const afterSecondTick = gameReducer(afterFirstTick, { type: "JOB_TICK" });

        expect(afterFirstTick.crafting.jobs).toHaveLength(1);
        expect(afterSecondTick.crafting.jobs).toHaveLength(1);
      },
    );
  });

  it("skips keep-stock enqueue while higher-priority player jobs are pending", () => {
    withWorkbenchRecipes(
      [
        {
          key: "keep_stock_blocked",
          label: "Keep Stock Blocked",
          emoji: "B",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
      ],
      () => {
        let state = buildState({ wood: 10, gear: 0 });
        state = gameReducer(state, {
          type: "JOB_ENQUEUE",
          recipeId: "keep_stock_blocked",
          workbenchId: WB,
          source: "player",
          priority: "high",
        });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_blocked",
          amount: 1,
          enabled: true,
        });

        const next = gameReducer(state, { type: "JOB_TICK" });
        const recipeJobs = next.crafting.jobs.filter((job) => job.recipeId === "keep_stock_blocked");

        expect(recipeJobs.filter((job) => job.source === "automation")).toHaveLength(0);
        expect(recipeJobs.filter((job) => job.source === "player")).toHaveLength(1);
      },
    );
  });

  it("still treats reserved/crafting/delivering output as guaranteed pending stock", () => {
    withWorkbenchRecipes(
      [
        {
          key: "keep_stock_active_pending",
          label: "Keep Stock Active Pending",
          emoji: "P",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
      ],
      () => {
        const statuses = ["reserved", "crafting", "delivering"] as const;

        for (const status of statuses) {
          const start = buildState({ wood: 10, gear: 0 });
          let state: GameState = {
            ...start,
            crafting: {
              ...start.crafting,
              jobs: [
                {
                  id: `pending-${status}`,
                  recipeId: "keep_stock_active_pending",
                  workbenchId: WB,
                  inventorySource: { kind: "warehouse", warehouseId: WH },
                  status,
                  priority: "normal",
                  source: "automation",
                  enqueuedAt: 1,
                  startedAt: null,
                  finishesAt: null,
                  progress: 0,
                  ingredients: [{ itemId: "wood", count: 2 }],
                  output: { itemId: "gear", count: 1 },
                  processingTime: 0,
                  reservationOwnerId: `pending-${status}`,
                },
              ],
              nextJobSeq: 2,
            },
          };

          state = gameReducer(state, {
            type: "SET_KEEP_STOCK_TARGET",
            workbenchId: WB,
            recipeId: "keep_stock_active_pending",
            amount: 1,
            enabled: true,
          });

          const next = gameReducer(state, { type: "JOB_TICK" });
          const recipeJobs = next.crafting.jobs.filter(
            (job) => job.recipeId === "keep_stock_active_pending",
          );

          expect(recipeJobs).toHaveLength(1);
          expect(recipeJobs.filter((job) => job.source === "automation")).toHaveLength(1);
        }
      },
    );
  });

  it("does not enqueue duplicate refill for the same output item when one is already active", () => {
    withWorkbenchRecipes(
      [
        {
          key: "keep_stock_same_item",
          label: "Keep Stock Same Item",
          emoji: "I",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
      ],
      () => {
        let state = buildState({ wood: 10, gear: 0 });
        state = gameReducer(state, {
          type: "JOB_ENQUEUE",
          recipeId: "keep_stock_same_item",
          workbenchId: WB,
          source: "automation",
          priority: "normal",
        });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_same_item",
          amount: 2,
          enabled: true,
        });

        const next = gameReducer(state, { type: "JOB_TICK" });
        const recipeJobs = next.crafting.jobs.filter((job) => job.recipeId === "keep_stock_same_item");

        expect(recipeJobs.filter((job) => job.source === "automation")).toHaveLength(1);
      },
    );
  });

  it("skips unsupported recipe config without enqueueing jobs", () => {
    const state = gameReducer(
      gameReducer(buildState({ wood: 10 }), {
        type: "SET_KEEP_STOCK_TARGET",
        workbenchId: WB,
        recipeId: "missing_recipe_id",
        amount: 3,
        enabled: true,
      }),
      { type: "JOB_TICK" },
    );

    expect(state.crafting.jobs).toHaveLength(0);
  });

  it("persists keep-stock settings through save/load", () => {
    withWorkbenchRecipes(
      [
        {
          key: "keep_stock_save",
          label: "Keep Stock Save",
          emoji: "S",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 2 },
        },
      ],
      () => {
        const configured = gameReducer(buildState({ wood: 10 }), {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_save",
          amount: 3,
          enabled: true,
        });

        const loaded = deserializeState(serializeState(configured));
        expect(loaded.keepStockByWorkbench?.[WB]?.keep_stock_save).toEqual({
          enabled: true,
          amount: 3,
        });
      },
    );
  });

  it("evaluates multiple configured targets deterministically", () => {
    withWorkbenchRecipes(
      [
        {
          key: "keep_stock_det_b",
          label: "Keep Stock Deterministic B",
          emoji: "B",
          inputItem: "wood",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 1 },
        },
        {
          key: "keep_stock_det_a",
          label: "Keep Stock Deterministic A",
          emoji: "A",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 1 },
        },
      ],
      () => {
        let state = buildState({ wood: 10, gear: 0, axe: 0 });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_det_b",
          amount: 1,
          enabled: true,
        });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_det_a",
          amount: 1,
          enabled: true,
        });

        const next = gameReducer(state, { type: "JOB_TICK" });
        expect(next.crafting.jobs.map((job) => job.recipeId)).toEqual([
          "keep_stock_det_a",
          "keep_stock_det_b",
        ]);
      },
    );
  });

  it("respects the global keep-stock open-job cap", () => {
    withWorkbenchRecipes(
      [
        {
          key: "keep_stock_cap_a",
          label: "Keep Stock Cap A",
          emoji: "A",
          inputItem: "wood",
          outputItem: "gear",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 1 },
        },
        {
          key: "keep_stock_cap_b",
          label: "Keep Stock Cap B",
          emoji: "B",
          inputItem: "wood",
          outputItem: "axe",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 1 },
        },
        {
          key: "keep_stock_cap_c",
          label: "Keep Stock Cap C",
          emoji: "C",
          inputItem: "wood",
          outputItem: "wood_pickaxe",
          processingTime: 0,
          outputAmount: 1,
          costs: { wood: 1 },
        },
      ],
      () => {
        let state = buildState({ wood: 20, gear: 0, axe: 0, wood_pickaxe: 0 });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_cap_a",
          amount: 1,
          enabled: true,
        });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_cap_b",
          amount: 1,
          enabled: true,
        });
        state = gameReducer(state, {
          type: "SET_KEEP_STOCK_TARGET",
          workbenchId: WB,
          recipeId: "keep_stock_cap_c",
          amount: 1,
          enabled: true,
        });

        const next = gameReducer(state, { type: "JOB_TICK" });
        const openKeepStockJobs = next.crafting.jobs.filter(
          (job) => job.source === "automation" && job.status !== "done" && job.status !== "cancelled",
        );

        expect(openKeepStockJobs).toHaveLength(KEEP_STOCK_OPEN_JOB_CAP);
      },
    );
  });
});
