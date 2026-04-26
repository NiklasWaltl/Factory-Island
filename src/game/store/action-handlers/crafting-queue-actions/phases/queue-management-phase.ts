import {
  cancelJob as craftingCancelJob,
  moveJob as craftingMoveJob,
  setJobPriority as craftingSetJobPriority,
} from "../../../../crafting/queue";
import {
  applyPlanningTriggers,
  applyExecutionTick,
} from "../../../../crafting/tickPhases";
import { releaseJobReservations } from "../../../../crafting/tick";
import type { GameAction } from "../../../reducer";
import type { GameState } from "../../../types";
import type { CraftingQueueActionDeps } from "../deps";

type QueueManagementAction = Extract<
  GameAction,
  {
    type: "JOB_CANCEL" | "JOB_MOVE" | "JOB_SET_PRIORITY" | "JOB_TICK";
  }
>;

type JobCancelAction = Extract<QueueManagementAction, { type: "JOB_CANCEL" }>;
type JobMoveAction = Extract<QueueManagementAction, { type: "JOB_MOVE" }>;
type JobSetPriorityAction = Extract<QueueManagementAction, { type: "JOB_SET_PRIORITY" }>;
type JobTickAction = Extract<QueueManagementAction, { type: "JOB_TICK" }>;

export interface QueueManagementContext {
  state: GameState;
  action: QueueManagementAction;
  deps: CraftingQueueActionDeps;
}

type JobCancelContext = Omit<QueueManagementContext, "action"> & {
  action: JobCancelAction;
};

type JobMoveContext = Omit<QueueManagementContext, "action"> & {
  action: JobMoveAction;
};

type JobSetPriorityContext = Omit<QueueManagementContext, "action"> & {
  action: JobSetPriorityAction;
};

type JobTickContext = Omit<QueueManagementContext, "action"> & {
  action: JobTickAction;
};

export function runJobCancelPhase(
  ctx: JobCancelContext,
): GameState {
  const { state, action } = ctx;

  const r = craftingCancelJob(state.crafting, action.jobId);
  if (!r.ok) {
    return { ...state, crafting: r.queue };
  }
  // If the cancelled job held reservations, release them. We use the
  // pre-cancellation status because `releaseJobReservations` keys off
  // the status to decide whether reservations could exist.
  const jobBefore = { ...r.job, status: r.previousStatus };
  const nextNetwork = releaseJobReservations(state.network, jobBefore);
  return { ...state, crafting: r.queue, network: nextNetwork };
}

export function runJobMovePhase(
  ctx: JobMoveContext,
): GameState {
  const { state, action } = ctx;

  const r = craftingMoveJob(state.crafting, action.jobId, action.direction);
  if (r.queue === state.crafting) return state;
  return { ...state, crafting: r.queue };
}

export function runJobSetPriorityPhase(
  ctx: JobSetPriorityContext,
): GameState {
  const { state, action } = ctx;

  const r = craftingSetJobPriority(state.crafting, action.jobId, action.priority);
  if (r.queue === state.crafting) return state;
  return { ...state, crafting: r.queue };
}

export function runJobTickPhase(
  ctx: JobTickContext,
): GameState {
  const { state, deps } = ctx;

  // Architecture rule: JOB_TICK is split into two clearly named
  // phases (see crafting/tickPhases.ts).
  //   1. Planning — ONLY layer allowed to enqueue automation jobs
  //      (currently keep-in-stock refills).
  //   2. Execution — progresses existing jobs; never enqueues new
  //      demand.
  const planned = applyPlanningTriggers(state, deps.planningTriggerDeps);
  return applyExecutionTick(planned, deps.executionTickDeps);
}

export function runQueueManagementPhase(
  ctx: QueueManagementContext,
): GameState {
  switch (ctx.action.type) {
    case "JOB_CANCEL":
      return runJobCancelPhase({
        state: ctx.state,
        action: ctx.action,
        deps: ctx.deps,
      });
    case "JOB_MOVE":
      return runJobMovePhase({
        state: ctx.state,
        action: ctx.action,
        deps: ctx.deps,
      });
    case "JOB_SET_PRIORITY":
      return runJobSetPriorityPhase({
        state: ctx.state,
        action: ctx.action,
        deps: ctx.deps,
      });
    case "JOB_TICK":
      return runJobTickPhase({
        state: ctx.state,
        action: ctx.action,
        deps: ctx.deps,
      });
    default: {
      const _exhaustive: never = ctx.action;
      return ctx.state;
    }
  }
}
