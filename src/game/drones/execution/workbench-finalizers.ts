import type { routeOutput as RouteOutputFn } from "../../crafting/output";
import type { CraftingJob } from "../../crafting/types";
import type {
  DroneCargoItem,
  GameNotification,
  GameState,
  Inventory,
  ServiceHubEntry,
  StarterDroneState,
} from "../../store/types";

export type WorkbenchInputTask = {
  kind: "input";
  workbenchId: string;
  jobId: string;
  reservationId: string;
};

export type FinalizeWorkbenchDeliveryFn = (
  state: GameState,
  droneId: string,
  jobId: string | null,
  idleDrone: StarterDroneState,
) => GameState;

export type FinalizeWorkbenchInputDeliveryFn = (
  state: GameState,
  droneId: string,
  task: WorkbenchInputTask,
  idleDrone: StarterDroneState,
) => GameState;

interface WorkbenchFinalizerDebugLog {
  general: (message: string) => void;
  inventory: (message: string) => void;
}

export interface FinalizerDeps {
  applyDroneUpdate: (state: GameState, droneId: string, updated: StarterDroneState) => GameState;
  getCraftingJobById: (crafting: Pick<GameState, "crafting">["crafting"], jobId: string | null) => CraftingJob | null;
  addWorkbenchInputToJob: (job: CraftingJob, stack: CraftingJob["ingredients"][number]) => CraftingJob;
  addResources: (inv: Inventory, items: Partial<Record<keyof Inventory, number>>) => Inventory;
  addNotification: (notifications: GameNotification[], resource: string, amount: number) => GameNotification[];
  routeOutput: typeof RouteOutputFn;
  debugLog: WorkbenchFinalizerDebugLog;
}

export function finalizeWorkbenchDelivery(
  state: GameState,
  droneId: string,
  jobId: string | null,
  idleDrone: StarterDroneState,
  deps: FinalizerDeps,
): GameState {
  const job = deps.getCraftingJobById(state.crafting, jobId);
  if (!job || job.status !== "delivering") {
    return deps.applyDroneUpdate(state, droneId, idleDrone);
  }

  const routed = deps.routeOutput({
    warehouseInventories: state.warehouseInventories,
    globalInventory: state.inventory,
    serviceHubs: state.serviceHubs,
    assets: state.assets,
    preferredFromAssetId: job.workbenchId,
    stack: job.output,
    source: job.inventorySource,
  });

  if (import.meta.env.DEV) {
    const destinationLabel = routed.destination.kind === "global"
      ? "global"
      : `${routed.destination.kind}:${routed.destination.id}`;
    deps.debugLog.general(
      `Job ${job.id} delivered: ${job.output.count}x ${job.output.itemId} -> ${destinationLabel}`,
    );
  }

  return deps.applyDroneUpdate(
    {
      ...state,
      warehouseInventories: routed.warehouseInventories as Record<string, Inventory>,
      inventory: routed.globalInventory,
      serviceHubs: routed.serviceHubs as Record<string, ServiceHubEntry>,
      crafting: {
        ...state.crafting,
        jobs: state.crafting.jobs.map((entry) => (entry.id === job.id ? { ...entry, status: "done" } : entry)),
      },
      notifications: deps.addNotification(state.notifications, job.output.itemId, job.output.count),
    },
    droneId,
    idleDrone,
  );
}

function routeWorkbenchInputCargoBack(
  state: GameState,
  job: CraftingJob | null,
  cargo: DroneCargoItem,
  deps: FinalizerDeps,
): GameState {
  if (!job) {
    return {
      ...state,
      inventory: deps.addResources(state.inventory, { [cargo.itemType]: cargo.amount }),
    };
  }

  const routed = deps.routeOutput({
    warehouseInventories: state.warehouseInventories,
    globalInventory: state.inventory,
    serviceHubs: state.serviceHubs,
    assets: state.assets,
    preferredFromAssetId: job.workbenchId,
    stack: { itemId: cargo.itemType, count: cargo.amount },
    source: job.inventorySource,
  });

  return {
    ...state,
    warehouseInventories: routed.warehouseInventories as Record<string, Inventory>,
    inventory: routed.globalInventory,
    serviceHubs: routed.serviceHubs as Record<string, ServiceHubEntry>,
  };
}

export function finalizeWorkbenchInputDelivery(
  state: GameState,
  droneId: string,
  task: WorkbenchInputTask,
  idleDrone: StarterDroneState,
  deps: FinalizerDeps,
): GameState {
  const drone = state.drones[droneId];
  const cargo = drone?.cargo;
  if (!cargo) {
    return deps.applyDroneUpdate(state, droneId, idleDrone);
  }

  const job = deps.getCraftingJobById(state.crafting, task.jobId);
  if (
    !job ||
    job.status !== "reserved" ||
    job.workbenchId !== task.workbenchId ||
    state.assets[job.workbenchId]?.type !== "workbench"
  ) {
    return deps.applyDroneUpdate(
      routeWorkbenchInputCargoBack(state, job, cargo, deps),
      droneId,
      idleDrone,
    );
  }

  const nextCrafting = {
    ...state.crafting,
    jobs: state.crafting.jobs.map((entry) =>
      entry.id === job.id
        ? deps.addWorkbenchInputToJob(entry, { itemId: cargo.itemType, count: cargo.amount })
        : entry,
    ),
  };

  if (import.meta.env.DEV) {
    deps.debugLog.inventory(
      `[Drone] workbench_input: delivered ${cargo.amount}x ${cargo.itemType} to ${job.workbenchId} for job ${job.id}`,
    );
  }

  return deps.applyDroneUpdate(
    { ...state, crafting: nextCrafting },
    droneId,
    idleDrone,
  );
}
