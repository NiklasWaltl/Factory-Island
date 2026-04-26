import { resolveOutputDestination } from "../crafting/output";
import type { CraftingJob } from "../crafting/types";
import type {
  GameState,
  Inventory,
  PlacedAsset,
  ServiceHubEntry,
  StarterDroneState,
} from "./types";

type WorkbenchTaskNodeId =
  | { kind: "input"; workbenchId: string; jobId: string; reservationId: string }
  | { kind: "output"; workbenchId: string; jobId: string };

export type DroneDropoffFallbackEvent =
  | { kind: "construction_site_missing"; targetId: string }
  | { kind: "building_target_missing"; targetId: string }
  | { kind: "hub_asset_missing"; targetId: string };

export interface ResolveDroneDropoffDecisionInput {
  drone: StarterDroneState;
  assets: Record<string, PlacedAsset>;
  serviceHubs?: Record<string, ServiceHubEntry>;
  warehouseInventories?: Record<string, Inventory>;
  crafting?: Pick<GameState, "crafting">["crafting"];
  mapShopPos: { x: number; y: number };
  getDeliveryOffset: (droneId: string) => { dx: number; dy: number };
  getDroneHomeDock: (
    drone: StarterDroneState,
    state: Pick<GameState, "assets" | "serviceHubs">,
  ) => { x: number; y: number } | null;
}

export interface DroneDropoffDecision {
  x: number;
  y: number;
  fallbackEvents?: DroneDropoffFallbackEvent[];
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

function getCraftingJobById(
  crafting: Pick<GameState, "crafting">["crafting"],
  jobId: string | null,
): CraftingJob | null {
  if (!jobId) return null;
  return crafting.jobs.find((job) => job.id === jobId) ?? null;
}

function resolveWorkbenchDeliveryDropoffDecision(
  job: CraftingJob,
  assets: Record<string, PlacedAsset>,
  warehouseInventories: Record<string, Inventory>,
  serviceHubs: Record<string, ServiceHubEntry>,
  mapShopPos: { x: number; y: number },
): { x: number; y: number } {
  const destination = resolveOutputDestination({
    source: job.inventorySource,
    stackItemId: job.output.itemId,
    warehouseInventories,
    serviceHubs,
    assets,
    preferredFromAssetId: job.workbenchId,
  });

  if (destination.kind === "warehouse") {
    const targetAsset = assets[destination.id];
    if (targetAsset?.type === "warehouse") {
      return { x: targetAsset.x, y: targetAsset.y };
    }
  }

  if (destination.kind === "hub") {
    const targetAsset = assets[destination.id];
    if (targetAsset?.type === "service_hub") {
      return { x: targetAsset.x, y: targetAsset.y };
    }
  }

  return { x: mapShopPos.x, y: mapShopPos.y };
}

export function resolveDroneDropoffDecision(
  input: ResolveDroneDropoffDecisionInput,
): DroneDropoffDecision {
  const {
    drone,
    assets,
    serviceHubs,
    warehouseInventories,
    crafting,
    mapShopPos,
    getDeliveryOffset,
    getDroneHomeDock,
  } = input;

  const fallbackEvents: DroneDropoffFallbackEvent[] = [];

  // Construction supply: target is the construction site asset + per-drone offset.
  if (drone.currentTaskType === "construction_supply" && drone.deliveryTargetId) {
    const siteAsset = assets[drone.deliveryTargetId];
    if (siteAsset) {
      const off = getDeliveryOffset(drone.droneId);
      return { x: siteAsset.x + off.dx, y: siteAsset.y + off.dy };
    }
    fallbackEvents.push({ kind: "construction_site_missing", targetId: drone.deliveryTargetId });
  }

  // Building supply: target is the building asset hosting the input buffer.
  if (drone.currentTaskType === "building_supply" && drone.deliveryTargetId) {
    const targetAsset = assets[drone.deliveryTargetId];
    if (targetAsset) {
      const off = getDeliveryOffset(drone.droneId);
      return { x: targetAsset.x + off.dx, y: targetAsset.y + off.dy };
    }
    fallbackEvents.push({ kind: "building_target_missing", targetId: drone.deliveryTargetId });
  }

  if (drone.currentTaskType === "workbench_delivery" && crafting) {
    const task = parseWorkbenchTaskNodeId(drone.targetNodeId);
    if (task?.kind === "input") {
      const workbenchAsset = assets[task.workbenchId];
      if (workbenchAsset?.type === "workbench") {
        return { x: workbenchAsset.x, y: workbenchAsset.y };
      }
    }
    const job = getCraftingJobById(crafting, drone.craftingJobId ?? task?.jobId ?? null);
    if (job) {
      return resolveWorkbenchDeliveryDropoffDecision(
        job,
        assets,
        warehouseInventories ?? {},
        serviceHubs ?? {},
        mapShopPos,
      );
    }
  }

  // Hub restock (or construction fallback): use dock slot so each drone targets its own tile.
  if (drone.hubId) {
    if (serviceHubs) {
      const dock = getDroneHomeDock(drone, { assets, serviceHubs });
      if (dock) {
        return {
          x: dock.x,
          y: dock.y,
          fallbackEvents: fallbackEvents.length > 0 ? fallbackEvents : undefined,
        };
      }
    }

    // Fallback when serviceHubs not provided (backward-compat path).
    const hubAsset = assets[drone.hubId];
    if (hubAsset) {
      return {
        x: hubAsset.x,
        y: hubAsset.y,
        fallbackEvents: fallbackEvents.length > 0 ? fallbackEvents : undefined,
      };
    }

    // Hub asset removed during flight — fall through to start module.
    fallbackEvents.push({ kind: "hub_asset_missing", targetId: drone.hubId });
  }

  // Legacy / no hub: deliver to start module.
  return {
    x: mapShopPos.x,
    y: mapShopPos.y,
    fallbackEvents: fallbackEvents.length > 0 ? fallbackEvents : undefined,
  };
}
