import { debugLog } from "../../debug/debugLogger";
import { routeOutput } from "../../crafting/output";
import { addWorkbenchInputToJob } from "../../crafting/workbench-input-buffer";
import { addNotification } from "../../store/notifications";
import { addResources } from "../../store/inventory-ops";
import { getCraftingJobById } from "../../store/workbench-task-utils";
import { applyDroneUpdate } from "../drone-state-helpers";
import type { GameState, StarterDroneState } from "../../store/types";
import {
  finalizeWorkbenchDelivery as finalizeWorkbenchDeliveryInner,
  finalizeWorkbenchInputDelivery as finalizeWorkbenchInputDeliveryInner,
  type FinalizerDeps,
  type WorkbenchInputTask,
} from "./workbench-finalizers";

const FINALIZER_DEPS: FinalizerDeps = {
  applyDroneUpdate,
  getCraftingJobById,
  addWorkbenchInputToJob,
  addResources,
  addNotification,
  routeOutput,
  debugLog,
};

export function finalizeWorkbenchDelivery(
  state: GameState,
  droneId: string,
  jobId: string | null,
  idleDrone: StarterDroneState,
): GameState {
  return finalizeWorkbenchDeliveryInner(state, droneId, jobId, idleDrone, FINALIZER_DEPS);
}

export function finalizeWorkbenchInputDelivery(
  state: GameState,
  droneId: string,
  task: WorkbenchInputTask,
  idleDrone: StarterDroneState,
): GameState {
  return finalizeWorkbenchInputDeliveryInner(state, droneId, task, idleDrone, FINALIZER_DEPS);
}
