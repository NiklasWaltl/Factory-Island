import { hasCompleteWorkbenchInput } from "../../crafting/workbench-input-complete";
import { isCollectableCraftingItem } from "../../crafting/workbench-input-buffer";
import { isUnderConstruction } from "../../store/asset-status";
import { resolveWorkbenchInputPickup } from "../../store/workbench-input-pickup";
import { getBuildingInputTargets } from "../../buildings/building-input-targets";
import {
  getAvailableHubDispatchSupply,
  getNearbyWarehousesForDispatch,
} from "../dispatch-supply";
import type { GameState, StarterDroneState, DroneTaskType } from "../../store/types";
import {
  selectDroneTask as selectDroneTaskDecision,
  type SelectDroneTaskDeps,
} from "./select-drone-task";

const SELECT_DRONE_TASK_DEPS: SelectDroneTaskDeps = {
  getAvailableHubDispatchSupply,
  getNearbyWarehousesForDispatch,
  getBuildingInputTargets,
  isUnderConstruction,
  hasCompleteWorkbenchInput,
  isCollectableCraftingItem,
  resolveWorkbenchInputPickup,
};

export function selectDroneTask(
  state: GameState,
  droneOverride?: StarterDroneState,
): { taskType: DroneTaskType; nodeId: string; deliveryTargetId: string } | null {
  return selectDroneTaskDecision(state, droneOverride, SELECT_DRONE_TASK_DEPS);
}
