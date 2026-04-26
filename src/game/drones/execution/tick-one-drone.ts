import type { CraftingJob } from "../../crafting/types";
import type {
  CollectableItemType,
  DroneTaskType,
  GameNotification,
  GameState,
  Inventory,
  PlacedAsset,
  ServiceHubEntry,
  ServiceHubInventory,
  StarterDroneState,
} from "../../store/types";
import type { SelectedDroneTask } from "../selection/select-drone-task";
import type {
  FinalizeWorkbenchDeliveryFn,
  FinalizeWorkbenchInputDeliveryFn,
} from "./workbench-finalizers";
import type {
  TickOneDroneDebugLog,
  WorkbenchReservation,
  WorkbenchTaskNodeId,
} from "../utils/drone-utils";
import {
  handleIdleStatus,
  handleReturningToDockStatus,
} from "./drone-task-transition";
import {
  handleMovingToCollectStatus,
  handleMovingToDropoffStatus,
} from "./drone-movement";
import {
  handleCollectingStatus,
  handleDepositingStatus,
} from "./drone-finalization";

export interface TickOneDroneDeps {
  applyDroneUpdate: (
    state: GameState,
    droneId: string,
    updated: StarterDroneState,
  ) => GameState;
  createEmptyHubInventory: () => ServiceHubInventory;
  createDefaultProtoHubTargetStock: () => Record<CollectableItemType, number>;
  selectDroneTask: (
    state: GameState,
    droneOverride?: StarterDroneState,
  ) => SelectedDroneTask | null;
  getDroneHomeDock: (
    drone: StarterDroneState,
    state: Pick<GameState, "assets" | "serviceHubs">,
  ) => { x: number; y: number } | null;
  parseWorkbenchTaskNodeId: (
    nodeId: string | null | undefined,
  ) => WorkbenchTaskNodeId | null;
  getCraftingJobById: (
    crafting: Pick<GameState, "crafting">["crafting"],
    jobId: string | null,
  ) => CraftingJob | null;
  getCraftingReservationById: (
    network: Pick<GameState, "network">["network"],
    reservationId: string,
  ) => WorkbenchReservation | null;
  resolveWorkbenchInputPickup: (
    state: Pick<
      GameState,
      "assets" | "warehouseInventories" | "serviceHubs" | "network"
    >,
    job: CraftingJob,
    reservation: WorkbenchReservation,
  ) => { x: number; y: number; sourceKind: "warehouse" | "hub"; sourceId: string } | null;
  finalizeWorkbenchDelivery: FinalizeWorkbenchDeliveryFn;
  moveDroneToward: (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    maxStep: number,
  ) => { x: number; y: number };
  nudgeAwayFromDrones: (
    nextX: number,
    nextY: number,
    toX: number,
    toY: number,
    allDrones: Record<string, StarterDroneState>,
    selfId: string,
  ) => { x: number; y: number };
  commitWorkbenchInputReservation: (
    state: GameState,
    job: CraftingJob,
    reservationId: string,
  ) => {
    nextState: GameState;
    itemType: CollectableItemType;
    amount: number;
    sourceKind: "warehouse" | "hub";
    sourceId: string;
  } | null;
  resolveDroneDropoff: (
    drone: StarterDroneState,
    assets: Record<string, PlacedAsset>,
    serviceHubs?: Record<string, ServiceHubEntry>,
    warehouseInventories?: Record<string, Inventory>,
    crafting?: Pick<GameState, "crafting">["crafting"],
  ) => { x: number; y: number };
  addResources: (
    inv: Inventory,
    items: Partial<Record<keyof Inventory, number>>,
  ) => Inventory;
  makeId: () => string;
  addNotification: (
    notifications: GameNotification[],
    resource: string,
    amount: number,
  ) => GameNotification[];
  syncDrones: (state: GameState) => GameState;
  isHubUpgradeDeliverySatisfied: (
    hub: ServiceHubEntry | undefined | null,
  ) => boolean;
  finalizeWorkbenchInputDelivery: FinalizeWorkbenchInputDeliveryFn;
  debugLog: TickOneDroneDebugLog;
}

export function tickOneDrone(
  state: GameState,
  droneId: string,
  deps: TickOneDroneDeps,
): GameState {
  const drone = state.drones[droneId];
  if (!drone) return state;

  switch (drone.status) {
    case "idle":
      return handleIdleStatus(state, droneId, drone, deps);

    case "moving_to_collect":
      return handleMovingToCollectStatus(state, droneId, drone, deps);

    case "collecting":
      return handleCollectingStatus(state, droneId, drone, deps);

    case "moving_to_dropoff":
      return handleMovingToDropoffStatus(state, droneId, drone, deps);

    case "depositing":
      return handleDepositingStatus(state, droneId, drone, deps);

    case "returning_to_dock":
      return handleReturningToDockStatus(state, droneId, drone, deps);

    default:
      return state;
  }
}
