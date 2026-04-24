import type { CraftingJob } from "../../crafting/types";
import type {
  CollectableItemType,
  DroneTaskType,
  GameState,
  StarterDroneState,
} from "../../store/types";
import type { DroneSelectionCandidate } from "./types";

export interface WorkbenchInputCandidateConstants {
  stickyBonus: number;
}

interface WorkbenchInputReservation {
  id: string;
  itemId: CraftingJob["ingredients"][number]["itemId"];
  amount: number;
}

export interface WorkbenchInputCandidateDeps {
  hasCompleteWorkbenchInput: (job: CraftingJob) => boolean;
  isCollectableCraftingItem: (
    itemId: CraftingJob["ingredients"][number]["itemId"],
  ) => itemId is CollectableItemType;
  getWorkbenchJobInputAmount: (
    job: CraftingJob,
    itemId: CraftingJob["ingredients"][number]["itemId"],
  ) => number;
  getAssignedWorkbenchInputDroneCount: (
    state: Pick<GameState, "drones">,
    reservationId: string,
    excludeDroneId?: string,
  ) => number;
  resolveWorkbenchInputPickup: (
    state: Pick<GameState, "assets" | "warehouseInventories" | "serviceHubs" | "network">,
    job: CraftingJob,
    reservation: WorkbenchInputReservation,
  ) => { x: number; y: number; sourceKind: "warehouse" | "hub"; sourceId: string } | null;
  scoreDroneTask: (
    taskType: DroneTaskType,
    droneX: number,
    droneY: number,
    nodeX: number,
    nodeY: number,
    bonuses?: { role?: number; sticky?: number; urgency?: number; demand?: number; spread?: number },
  ) => number;
}

export function gatherWorkbenchInputCandidates(
  state: Pick<GameState, "assets" | "warehouseInventories" | "serviceHubs" | "network" | "crafting" | "drones">,
  drone: Pick<StarterDroneState, "droneId" | "tileX" | "tileY" | "targetNodeId">,
  constants: WorkbenchInputCandidateConstants,
  deps: WorkbenchInputCandidateDeps,
): DroneSelectionCandidate[] {
  const candidates: DroneSelectionCandidate[] = [];

  for (const job of state.crafting.jobs) {
    if (job.status !== "reserved") continue;
    if (job.inventorySource.kind === "global") continue;
    if (deps.hasCompleteWorkbenchInput(job)) continue;
    for (const reservation of state.network.reservations) {
      if (reservation.ownerKind !== "crafting_job" || reservation.ownerId !== job.reservationOwnerId) continue;
      if (!deps.isCollectableCraftingItem(reservation.itemId)) continue;
      if (deps.getWorkbenchJobInputAmount(job, reservation.itemId) >= reservation.amount) continue;
      if (deps.getAssignedWorkbenchInputDroneCount(state, reservation.id, drone.droneId) > 0) continue;
      const pickup = deps.resolveWorkbenchInputPickup(state, job, reservation);
      if (!pickup) continue;
      const syntheticNodeId = `workbench_input:${job.workbenchId}:${job.id}:${reservation.id}`;
      const stickyBonus = drone.targetNodeId === syntheticNodeId ? constants.stickyBonus : 0;
      candidates.push({
        taskType: "workbench_delivery",
        nodeId: syntheticNodeId,
        deliveryTargetId: job.workbenchId,
        score: deps.scoreDroneTask("workbench_delivery", drone.tileX, drone.tileY, pickup.x, pickup.y, {
          sticky: stickyBonus,
        }),
        _roleBonus: 0,
        _stickyBonus: stickyBonus,
        _urgencyBonus: 0,
        _demandBonus: 0,
        _spreadPenalty: 0,
      });
    }
  }

  return candidates;
}
