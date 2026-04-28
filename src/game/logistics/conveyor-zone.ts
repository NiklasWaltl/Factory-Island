import type { GameState } from "../store/types";

export function getConveyorZone(state: GameState, assetId: string): string | null {
  return state.buildingZoneIds[assetId] ?? null;
}

export function areZonesTransportCompatible(fromZone: string | null, toZone: string | null): boolean {
  // Legacy rule: null is "global" and can connect to/from any zone.
  if (!fromZone || !toZone) return true;
  return fromZone === toZone;
}