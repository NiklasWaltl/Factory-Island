// ============================================================
// Crafting tick phase split (Planning vs Execution)
// ------------------------------------------------------------
// JOB_TICK is intentionally split into two clearly named phases so
// the architectural rule is visible in code:
//
//   1. applyPlanningTriggers(state)
//      The ONLY place in the JOB_TICK pipeline allowed to enqueue
//      new automation jobs. Today this means: run keep-in-stock
//      refills. If a future feature ever needs another auto-start
//      mechanism, it joins here — never inside the execution
//      phase, never inside conveyor / drone / smelter ticks.
//
//   2. applyExecutionTick(state)
//      Progresses *existing* crafting jobs through their state
//      machine (queued -> reserved -> crafting -> delivering ->
//      done). MUST NOT create new demand. MUST NOT enqueue new
//      jobs.
//
// Reducer wiring (JOB_TICK case) reduces to:
//   applyExecutionTick(applyPlanningTriggers(state, planningDeps),
//                      executionDeps);
//
// Keeping each phase in its own function (rather than a single
// fused JOB_TICK body) makes the boundary statically testable
// (see __tests__/tickPhases.test.ts) and prevents future drift.
// ============================================================

import { applyKeepStockRefills } from "./workflows/keepStockWorkflow";
import type { KeepStockWorkflowDeps } from "./workflows/keepStockWorkflow";
import { tickCraftingJobs } from "./tick";
import type { GameState, Inventory, ServiceHubEntry } from "../store/types";

/**
 * Dependencies for the planning phase. Currently identical to the
 * keep-stock workflow deps; if additional planning triggers are ever
 * added they share this dependency surface.
 */
export type PlanningTriggerDeps = KeepStockWorkflowDeps;

export interface ExecutionTickDeps {
  readonly isUnderConstruction: (state: GameState, assetId: string) => boolean;
  readonly now?: () => number;
}

/**
 * Planning phase. Authoritative, single entry point that may add new
 * automation crafting jobs in response to standing player intent
 * (currently: keep-in-stock targets).
 *
 * Pure: returns the same state instance when no planning trigger
 * fires.
 */
export function applyPlanningTriggers(
  state: GameState,
  deps: PlanningTriggerDeps,
): GameState {
  return applyKeepStockRefills(state, deps);
}

/**
 * Execution phase. Progresses existing crafting jobs through their
 * state machine. MUST NOT enqueue new jobs.
 *
 * Pure: returns the same state instance when nothing changed.
 */
export function applyExecutionTick(
  state: GameState,
  deps: ExecutionTickDeps,
): GameState {
  const readyWorkbenchIds = new Set(
    Object.values(state.assets)
      .filter(
        (asset) =>
          asset.type === "workbench" && !deps.isUnderConstruction(state, asset.id),
      )
      .map((asset) => asset.id),
  );

  const out = tickCraftingJobs({
    warehouseInventories: state.warehouseInventories,
    globalInventory: state.inventory,
    serviceHubs: state.serviceHubs,
    network: state.network,
    crafting: state.crafting,
    assets: state.assets,
    readyWorkbenchIds,
    now: (deps.now ?? Date.now)(),
  });

  if (
    out.warehouseInventories === state.warehouseInventories &&
    out.globalInventory === state.inventory &&
    out.serviceHubs === state.serviceHubs &&
    out.network === state.network &&
    out.crafting === state.crafting
  ) {
    return state;
  }

  return {
    ...state,
    warehouseInventories: out.warehouseInventories as Record<string, Inventory>,
    inventory: out.globalInventory,
    serviceHubs: out.serviceHubs as Record<string, ServiceHubEntry>,
    network: out.network,
    crafting: out.crafting,
  };
}
