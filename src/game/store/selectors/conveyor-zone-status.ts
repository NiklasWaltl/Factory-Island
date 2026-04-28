import { GRID_H, GRID_W } from "../../constants/grid";
import { areZonesTransportCompatible } from "../../logistics/conveyor-zone";
import type { Direction, GameState } from "../types";

export interface ConveyorZoneStatus {
  /** Zone assigned to this belt (null = unzoned / global). */
  zone: string | null;
  /** Human-readable zone name (null if unzoned). */
  zoneName: string | null;
  /** Zone of the next tile this belt is pointing at (null = unzoned or no next asset). */
  nextTileZone: string | null;
  /** True when both this belt and the next tile have differing explicit zones. */
  hasConflict: boolean;
  /** Human-readable conflict reason, or null when no conflict. */
  conflictReason: string | null;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function directionOffset(dir: Direction): [number, number] {
  switch (dir) {
    case "north": return [0, -1];
    case "south": return [0, 1];
    case "east": return [1, 0];
    case "west": return [-1, 0];
  }
}

/**
 * Derive zone/conflict status for a conveyor belt.
 * Pure function - safe to call from any UI component.
 */
export function getConveyorZoneStatus(state: GameState, conveyorId: string): ConveyorZoneStatus {
  const convAsset = state.assets[conveyorId];
  const zone = state.buildingZoneIds[conveyorId] ?? null;
  const zoneName = zone ? (state.productionZones[zone]?.name ?? zone) : null;

  let nextTileZone: string | null = null;
  let hasConflict = false;
  let conflictReason: string | null = null;

  if (convAsset) {
    const dir = convAsset.direction ?? "east";
    const nextId =
      convAsset.type === "conveyor_underground_in"
        ? state.conveyorUndergroundPeers[conveyorId] ?? null
        : (() => {
            const [ox, oy] = directionOffset(dir);
            const nextX = convAsset.x + ox;
            const nextY = convAsset.y + oy;
            if (nextX < 0 || nextX >= GRID_W || nextY < 0 || nextY >= GRID_H) return null;
            return state.cellMap[cellKey(nextX, nextY)] ?? null;
          })();
    if (nextId) {
      nextTileZone = state.buildingZoneIds[nextId] ?? null;
      if (!areZonesTransportCompatible(zone, nextTileZone)) {
        hasConflict = true;
        const thisName = zoneName ?? zone ?? "Global";
        const nextName = nextTileZone ? (state.productionZones[nextTileZone]?.name ?? nextTileZone) : "Global";
        conflictReason = `Ziel-Zone mismatch: ${thisName} → ${nextName}`;
      }
    }
  }

  return { zone, zoneName, nextTileZone, hasConflict, conflictReason };
}
