import type { GameState, StarterDroneState } from "../store/types";
import { getDroneDockOffset } from "./drone-dock-geometry";

export function getDroneDockSlotIndex(
  state: Pick<GameState, "serviceHubs">,
  hubId: string,
  droneId: string,
): number {
  const dockSlot = state.serviceHubs[hubId]?.droneIds.indexOf(droneId) ?? -1;
  return dockSlot >= 0 ? dockSlot : 0;
}

/**
 * Returns the tile position of the homeHub dock slot for a drone.
 * Returns null when the drone has no hub or the hub asset is gone.
 */
export function getDroneHomeDock(
  drone: StarterDroneState,
  state: Pick<GameState, "assets" | "serviceHubs">,
): { x: number; y: number } | null {
  if (!drone.hubId) return null;
  const hubAsset = state.assets[drone.hubId];
  if (!hubAsset) return null;
  const dockSlot = getDroneDockSlotIndex(state, drone.hubId, drone.droneId);
  const offset = getDroneDockOffset(dockSlot);
  return { x: hubAsset.x + offset.dx, y: hubAsset.y + offset.dy };
}

export function isDroneParkedAtHub(
  state: Pick<GameState, "assets" | "serviceHubs">,
  drone: StarterDroneState,
): boolean {
  const dock = getDroneHomeDock(drone, state);
  return !!dock && drone.status === "idle" && drone.tileX === dock.x && drone.tileY === dock.y;
}

export function getParkedDrones(
  state: Pick<GameState, "assets" | "serviceHubs" | "drones">,
  hubId: string,
): StarterDroneState[] {
  const hub = state.serviceHubs[hubId];
  if (!hub) return [];
  return hub.droneIds
    .map((droneId) => state.drones[droneId])
    .filter((drone): drone is StarterDroneState => !!drone)
    .filter((drone) => isDroneParkedAtHub(state, drone));
}
