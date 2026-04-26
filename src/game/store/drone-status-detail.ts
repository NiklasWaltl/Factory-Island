import type { GameState, StarterDroneState } from "./types";

type WorkbenchTaskNodeId =
  | { kind: "input"; workbenchId: string; jobId: string; reservationId: string }
  | { kind: "output"; workbenchId: string; jobId: string };

type CraftingJob = Pick<GameState, "crafting">["crafting"]["jobs"][number];
type NetworkReservation = Pick<GameState, "network">["network"]["reservations"][number];

export interface DroneStatusDetail {
  label: string;
  taskGoal?: string;
}

function getCraftingJobById(
  crafting: Pick<GameState, "crafting">["crafting"],
  jobId: string | null,
): CraftingJob | null {
  if (!jobId) return null;
  return crafting.jobs.find((job) => job.id === jobId) ?? null;
}

function parseWorkbenchTaskNodeId(nodeId: string | null | undefined): WorkbenchTaskNodeId | null {
  if (!nodeId) return null;

  if (nodeId.startsWith("workbench_input:")) {
    const [, workbenchId, jobId, reservationId] = nodeId.split(":");
    if (!workbenchId || !jobId || !reservationId) return null;
    return { kind: "input", workbenchId, jobId, reservationId };
  }

  if (nodeId.startsWith("workbench:")) {
    const [, workbenchId, jobId] = nodeId.split(":");
    if (!workbenchId || !jobId) return null;
    return { kind: "output", workbenchId, jobId };
  }

  return null;
}

function getCraftingReservationById(
  network: Pick<GameState, "network">["network"],
  reservationId: string,
): NetworkReservation | null {
  return network.reservations.find((reservation) => reservation.id === reservationId) ?? null;
}

/** Produce a human-readable status detail for a drone (for UI display). */
export function getDroneStatusDetail(
  state: Pick<GameState, "crafting" | "network" | "collectionNodes">,
  drone: StarterDroneState,
): DroneStatusDetail {
  switch (drone.status) {
    case "idle":
      return { label: "Bereit" };
    case "moving_to_collect": {
      // hub_dispatch: en route to hub to pick up stock
      if (drone.currentTaskType === "hub_dispatch" && drone.targetNodeId?.startsWith("hub:")) {
        const resource = drone.targetNodeId.split(":")[2];
        return { label: "Unterwegs zum Hub", taskGoal: resource ? `${resource} abholen` : undefined };
      }
      const workbenchTask = parseWorkbenchTaskNodeId(drone.targetNodeId);
      if (drone.currentTaskType === "workbench_delivery" && workbenchTask?.kind === "input") {
        const job = getCraftingJobById(state.crafting, workbenchTask.jobId);
        const reservation = getCraftingReservationById(state.network, workbenchTask.reservationId);
        return {
          label: "Unterwegs zum Lager",
          taskGoal: reservation && job ? `${reservation.amount}× ${reservation.itemId} für ${job.recipeId}` : undefined,
        };
      }
      if (drone.currentTaskType === "workbench_delivery" && drone.craftingJobId) {
        const job = getCraftingJobById(state.crafting, drone.craftingJobId);
        return {
          label: "Unterwegs zur Werkbank",
          taskGoal: job ? `${job.output.count}× ${job.output.itemId} abholen` : undefined,
        };
      }
      const node = drone.targetNodeId ? state.collectionNodes[drone.targetNodeId] : null;
      return { label: "Unterwegs zum Sammeln", taskGoal: node ? `${node.itemType} (${node.amount})` : undefined };
    }
    case "collecting":
      if (drone.currentTaskType === "workbench_delivery" && parseWorkbenchTaskNodeId(drone.targetNodeId)?.kind === "input") {
        return { label: "Holt Werkbank-Input…" };
      }
      if (drone.currentTaskType === "workbench_delivery") return { label: "Holt Werkbank-Output…" };
      if (drone.currentTaskType === "hub_dispatch") return { label: "Entnimmt Hub-Lager…" };
      return { label: "Sammelt ein…" };
    case "moving_to_dropoff":
      if (drone.currentTaskType === "workbench_delivery" && parseWorkbenchTaskNodeId(drone.targetNodeId)?.kind === "input") {
        return {
          label: "Liefert Werkbank-Input",
          taskGoal: drone.cargo ? `${drone.cargo.amount}× ${drone.cargo.itemType}` : undefined,
        };
      }
      if (drone.currentTaskType === "workbench_delivery" && drone.craftingJobId) {
        const job = getCraftingJobById(state.crafting, drone.craftingJobId);
        return {
          label: "Liefert Werkzeug aus",
          taskGoal: job ? `${job.output.count}× ${job.output.itemId}` : undefined,
        };
      }
      return { label: "Rückflug", taskGoal: drone.cargo ? `${drone.cargo.amount}× ${drone.cargo.itemType}` : undefined };
    case "depositing":
      return { label: "Liefert ab…" };
    default:
      return { label: String(drone.status) };
  }
}
