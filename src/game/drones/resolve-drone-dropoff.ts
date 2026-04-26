import { debugLog } from "../debug/debugLogger";
import { DELIVERY_OFFSETS } from "../store/constants/drone-config";
import { MAP_SHOP_POS } from "../store/constants/map-layout";
import {
  resolveDroneDropoffDecision,
  type DroneDropoffFallbackEvent,
} from "../store/drone-dropoff-decision";
import type {
  GameState,
  Inventory,
  PlacedAsset,
  ServiceHubEntry,
  StarterDroneState,
} from "../store/types";
import { getDroneHomeDock } from "./drone-dock";

/**
 * Deterministic delivery slot index for a drone, derived from its droneId.
 * Stable as long as droneId is constant (which it is — see StarterDroneState.droneId).
 */
function droneDeliverySlot(droneId: string): number {
  let h = 0;
  for (let i = 0; i < droneId.length; i++) {
    h = (h * 31 + droneId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % DELIVERY_OFFSETS.length;
}

function logDroneDropoffFallbackEvent(event: DroneDropoffFallbackEvent): void {
  if (event.kind === "construction_site_missing") {
    debugLog.inventory(`[Drone] Construction site asset ${event.targetId} gone — falling back`);
    return;
  }

  if (event.kind === "building_target_missing") {
    debugLog.inventory(`[Drone] Building input target ${event.targetId} gone — falling back`);
    return;
  }

  debugLog.inventory(`[Drone] Hub asset ${event.targetId} gone — falling back to start module`);
}

/**
 * Resolve the dropoff position for a drone based on its current task.
 *
 * - construction_supply → construction site asset position + per-drone delivery offset
 * - workbench_delivery → resolved storage destination for the finished job
 * - hub_restock → hub dock slot position derived from the hub's droneIds order
 * - fallback (no hub) → MAP_SHOP_POS
 *
 * The `serviceHubs` parameter enables per-drone dock-slot targeting for hub restock.
 * Omitting it falls back to the hub top-left corner (safe for legacy / tests).
 */
export function resolveDroneDropoff(
  drone: StarterDroneState,
  assets: Record<string, PlacedAsset>,
  serviceHubs?: Record<string, ServiceHubEntry>,
  warehouseInventories?: Record<string, Inventory>,
  crafting?: Pick<GameState, "crafting">["crafting"],
): { x: number; y: number } {
  const decision = resolveDroneDropoffDecision({
    drone,
    assets,
    serviceHubs,
    warehouseInventories,
    crafting,
    mapShopPos: MAP_SHOP_POS,
    getDeliveryOffset: (droneId) => DELIVERY_OFFSETS[droneDeliverySlot(droneId)],
    getDroneHomeDock,
  });

  for (const fallbackEvent of decision.fallbackEvents ?? []) {
    logDroneDropoffFallbackEvent(fallbackEvent);
  }

  return { x: decision.x, y: decision.y };
}
