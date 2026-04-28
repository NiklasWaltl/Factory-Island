import type { CraftingJob } from "../crafting/types";
import type { GameState } from "./types";
import type { WorkbenchTaskNodeId } from "../drones/utils/drone-utils";

export function getCraftingJobById(
  crafting: Pick<GameState, "crafting">["crafting"],
  jobId: string | null,
): CraftingJob | null {
  if (!jobId) return null;
  return crafting.jobs.find((job) => job.id === jobId) ?? null;
}

export function getCraftingReservationById(
  network: Pick<GameState, "network">["network"],
  reservationId: string,
) {
  return network.reservations.find((reservation) => reservation.id === reservationId) ?? null;
}

export function parseWorkbenchTaskNodeId(
  nodeId: string | null | undefined,
): WorkbenchTaskNodeId | null {
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
